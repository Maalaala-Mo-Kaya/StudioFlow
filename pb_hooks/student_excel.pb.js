/// <reference path="../pb_data/types.d.ts" />

routerAdd("GET", "/api/studioflow/student-excel", (e) => {
  if (e.auth.getString("role") !== "admin") {
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
    return "";
  };

  let packages, addOns, registrations, payments;
  // Read all collections in a single transaction so both sheets share a snapshot.
  e.app.runInTransaction((tx) => {
    packages = readCatalog(tx, "packages");
    addOns = readCatalog(tx, "add_ons");
    const levels = new Map(tx.findAllRecords("levels").map((record) =>
      [record.id, classifyLevel(record.getString("name"))]));
    const courses = new Map(tx.findAllRecords("courses").map((record) => [record.id, record.getString("code")]));

    registrations = tx.findRecordsByFilter("registrations", "", "job_order_no,id", 0, 0).flatMap((record) => {
      const level = levels.get(record.getString("level"));
      if (!level) return [];
      return [{
        id: record.id,
        level,
        jobOrder: record.getString("job_order_no"),
        date: record.getString("pictorial_date"),
        course: courses.get(record.getString("course")) || "",
        name: [record.getString("family_name") + ",", record.getString("given_name"), record.getString("middle_name")]
          .filter(Boolean).join(" "),
        packageId: record.getString("package"),
        packageSnapshot: readJson(record, "package_snapshot"),
        addOns: readJson(record, "add_ons"),
        due: cents(record.getFloat("total_amount")),
        otherFees: cents(record.getFloat("other_fees")),
      }];
    });
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
    if (payment.status === "refunded" || payment.status === "voided") continue;
    const totals = paymentsByRegistration.get(payment.registration) || { full: 0, additional: 0, down: 0 };
    if (payment.type === "full" || payment.type === "balance_settlement") totals.full += payment.amount;
    else if (payment.type === "initial") totals.down += payment.amount;
    else totals.additional += payment.amount;
    paymentsByRegistration.set(payment.registration, totals);
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
    const packageAmount = hasSnapshot && Number.isFinite(snapshot.amount)
      ? cents(snapshot.amount)
      : record.due - record.otherFees - addOnTotal;
    if (packageId && !packageColumns.has(packageId)) {
      packageColumns.set(packageId, pkg || {
        id: packageId,
        code: hasSnapshot ? snapshot.code : "",
        name: (hasSnapshot && snapshot.name) || "Historical package " + packageId,
        amount: (hasSnapshot ? snapshot.configuredAmount ?? snapshot.amount : undefined) ?? packageAmount / 100,
      });
    }
    return {
      level: record.level,
      jobOrder: record.jobOrder,
      date: record.date,
      course: record.course,
      name: record.name,
      packageId,
      packageCode: pkg?.code || (hasSnapshot ? snapshot.code : ""),
      packageAmount,
      addOns: Object.fromEntries(charges),
      due: record.due,
      payments: paymentsByRegistration.get(record.id) || { full: 0, additional: 0, down: 0 },
    };
  });

  const sortColumns = (columns) => [...columns.values()].sort((a, b) =>
    (a.code || a.name).localeCompare(b.code || b.name) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  e.response.header().set("Cache-Control", "no-store");
  return e.json(200, {
    packages: sortColumns(packageColumns),
    addOns: sortColumns(addOnColumns),
    rows,
  });
}, $apis.requireAuth("users"));
