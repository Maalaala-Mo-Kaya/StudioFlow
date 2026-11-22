/// <reference path="../pb_data/types.d.ts" />

routerAdd("GET", "/api/studioflow/student-excel", (e) => {
  if (e.auth.getString("role") !== "admin" || e.auth.getBool("disabled")) {
    throw new ForbiddenError("Only administrators can export student financial reports.");
  }

  const readCatalog = (tx, collection) => tx.findAllRecords(collection).map((record) => ({
    id: record.id,
    code: record.getString("code"),
    name: record.getString("name"),
    amount: record.getFloat("amount"),
    active: record.getBool("is_active"),
  }));
  const readJson = (record, field) => {
    try {
      const value = JSON.parse(record.getString(field) || "null");
      return typeof value === "string" ? JSON.parse(value) : value;
    } catch (_) {
      return null;
    }
  };
  const cents = (amount) => Math.round(amount * 100);
  const classifyLevel = (name) => {
    const key = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (key === "college") return "college";
    if (/^(?:senior high(?: school)?(?: shs)?|shs)(?: (?:grade )?(?:11|12))?$/.test(key)) return "shs";
    // Any other level (Elementary, Graduate School, ...) gets its own sheet, keyed by its name.
    return key ? key.toUpperCase() : "OTHER";
  };

  let packages, addOns, registrations, payments, refunds;
  // Read all collections in a single transaction so both sheets share a snapshot.
  e.app.runInTransaction((tx) => {
    packages = readCatalog(tx, "packages");
    addOns = readCatalog(tx, "add_ons");
    const levelRecords = tx.findAllRecords("levels");
    const levels = new Map(levelRecords.map((record) => [record.id, classifyLevel(record.getString("name"))]));
    const levelNames = new Map(levelRecords.map((record) => [record.id, record.getString("name").trim()]));
    const schools = new Map(tx.findAllRecords("organizations").map((record) =>
      [record.id, { name: record.getString("name"), code: record.getString("code") }]));
    const courses = new Map(tx.findAllRecords("courses").map((record) => [record.id, record.getString("code")]));
    const sessions = new Map(tx.findAllRecords("session_types").map((record) =>
      [record.id, record.getString("code") || record.getString("name")]));

    registrations = tx.findRecordsByFilter("registrations", "deleted_by_id = ''", "job_order_no,id", 0, 0).map((record) => {
      // Walk-ins get their own sheet; their "course" column shows the session type.
      const walkin = record.getString("client_kind") === "walkin";
      // A student whose level is missing still appears (under OTHER), so totals are never short.
      const level = walkin ? "walkin" : levels.get(record.getString("level")) || "OTHER";
      const school = walkin ? null : schools.get(record.getString("organization"));
      const cancelled = record.getString("status") === "cancelled";
      return {
        id: record.id,
        level,
        levelName: walkin ? "Walk-in" : levelNames.get(record.getString("level")) || "Other",
        schoolId: walkin ? "__walkin" : record.getString("organization"),
        schoolName: walkin ? "Walk-in clients" : school?.name || "Removed school",
        schoolCode: walkin ? "WALK-IN" : school?.code || "",
        cancelled,
        // Who cancelled, when and why: listed on the CANCELLED sheet.
        cancellation: cancelled ? {
          at: record.getString("cancelled_at"),
          by: record.getString("cancelled_by"),
          reason: record.getString("cancel_reason"),
          statusBefore: record.getString("status_before_cancel"),
        } : null,
        created: record.getString("created"),
        jobOrder: record.getString("job_order_no"),
        date: record.getString("pictorial_date") || (walkin ? record.getString("event_date") : ""),
        course: walkin ? sessions.get(record.getString("session_type")) || "" : courses.get(record.getString("course")) || "",
        name: [record.getString("family_name") + ",", record.getString("given_name"), record.getString("middle_name")]
          .filter(Boolean).join(" "),
        packageId: record.getString("package"),
        packageSnapshot: readJson(record, "package_snapshot"),
        addOns: readJson(record, "add_ons"),
        due: cents(record.getFloat("total_amount")),
        otherFees: cents(record.getFloat("other_fees")),
        revenueTerms: readJson(record, "revenue_terms"),
        discount: readJson(record, "revenue_discount"),
      };
    });
    refunds = tx.findAllRecords("refunds").map((record) => ({
      registration: record.getString("registration"),
      amount: cents(record.getFloat("amount")),
    }));
    payments = tx.findAllRecords("payments").map((record) => ({
      registration: record.getString("registration"),
      type: record.getString("payment_type"),
      status: record.getString("status"),
      amount: cents(record.getFloat("amount")),
    }));
  });

  const paymentsByRegistration = new Map();
  for (const payment of payments) {
    // A refund or void marks the original transaction as reversed in the ledger.
    if (payment.status && payment.status !== "completed") continue;
    const totals = paymentsByRegistration.get(payment.registration) || { full: 0, additional: 0, down: 0, refunded: 0 };
    if (payment.type === "full" || payment.type === "balance_settlement") totals.full += payment.amount;
    else if (payment.type === "initial") totals.down += payment.amount;
    else totals.additional += payment.amount;
    paymentsByRegistration.set(payment.registration, totals);
  }
  // Money given back (refunds) is shown in its own column and taken off the total paid.
  for (const refund of refunds) {
    const totals = paymentsByRegistration.get(refund.registration) || { full: 0, additional: 0, down: 0, refunded: 0 };
    totals.refunded += refund.amount;
    paymentsByRegistration.set(refund.registration, totals);
  }

  const packagesById = new Map(packages.map((item) => [item.id, item]));
  const addOnsById = new Map(addOns.map((item) => [item.id, item]));
  const packageColumns = new Map(packages.filter((item) => item.active).map((item) => [item.id, item]));
  const addOnColumns = new Map(addOns.filter((item) => item.active).map((item) => [item.id, item]));
  const rows = registrations.map((record) => {
    const charges = new Map();
    let addOnTotal = 0;
    for (const item of Array.isArray(record.addOns) ? record.addOns : []) {
      if (typeof item?.name !== "string" || !Number.isFinite(item.amount)) continue;
      let id = item.id;
      if (!id) {
        // Old snapshots predate add-on IDs. Only use an unambiguous catalog match.
        const matches = addOns.filter((entry) => item.code ? entry.code === item.code : entry.name === item.name);
        id = matches.length === 1 ? matches[0].id : "legacy:" + JSON.stringify([item.code || "", item.name]);
      }
      const quantity = Number.isInteger(item.quantity) && item.quantity > 0 ? item.quantity : 1;
      const amount = cents(item.amount) * quantity;
      addOnTotal += amount;
      charges.set(id, (charges.get(id) || 0) + amount);
      if (!addOnColumns.has(id)) {
        addOnColumns.set(id, addOnsById.get(id) || { id, code: item.code || "", name: item.name, amount: item.amount });
      }
    }

    const snapshot = record.packageSnapshot;
    const packageId = record.packageId || snapshot?.id || "";
    const pkg = packagesById.get(packageId);
    const hasSnapshot = snapshot?.id === packageId;
    const discount = (record.discount?.studio || 0) + (record.discount?.mua || 0);
    const packageAmount = hasSnapshot && Number.isFinite(snapshot.amount)
      ? cents(snapshot.amount)
      : record.due + discount - record.otherFees - addOnTotal;
    if (packageId && !packageColumns.has(packageId)) {
      packageColumns.set(packageId, pkg || {
        id: packageId,
        code: hasSnapshot ? snapshot.code : "",
        name: (hasSnapshot && snapshot.name) || "Historical package " + packageId,
        amount: (hasSnapshot ? snapshot.configuredAmount ?? snapshot.amount : undefined) ?? packageAmount / 100,
      });
    }
    return {
      id: record.id,
      level: record.level,
      levelName: record.levelName,
      schoolId: record.schoolId,
      schoolName: record.schoolName,
      schoolCode: record.schoolCode,
      cancelled: record.cancelled,
      cancellation: record.cancellation,
      created: record.created,
      jobOrder: record.jobOrder,
      date: record.date,
      course: record.course,
      name: record.name,
      packageId,
      packageCode: pkg?.code || (hasSnapshot ? snapshot.code : ""),
      packageAmount,
      addOns: Object.fromEntries(charges),
      otherFees: record.otherFees,
      discount,
      // "10% · Loyal client" for the DISCOUNT cell's note in the Overall Excel.
      discountNote: discount ? [record.discount?.fixed ? "Fixed amount" : record.discount?.percentage !== undefined && record.discount?.percentage !== null ? Number(Number(record.discount.percentage).toFixed(2)) + "%" : "",
        record.discount?.reason || "", record.discount?.by ? "by " + record.discount.by : ""].filter(Boolean).join(" · ") : "",
      revenueTerms: record.revenueTerms,
      due: record.due,
      payments: paymentsByRegistration.get(record.id) || { full: 0, additional: 0, down: 0, refunded: 0 },
    };
  });

  const sortColumns = (columns) => [...columns.values()].sort((a, b) =>
    (a.code || a.name).localeCompare(b.code || b.name) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  // MUA pages: what each artist earned on these orders and the shared MUA charges (studio_mua_payouts.js).
  const mua = require(__hooks + "/studio_mua_payouts.js").ordersReport(e.app, registrations.map((record) => record.id));
  e.response.header().set("Cache-Control", "no-store");
  return e.json(200, {
    packages: sortColumns(packageColumns),
    addOns: sortColumns(addOnColumns),
    rows,
    mua,
  });
}, $apis.requireAuth("users"));
