/// <reference path="../pb_data/types.d.ts" />

/**
 * PocketBase Hook: Auto-generate Job Order Numbers, daily FCFS Queue numbers,
 * calculate amounts, and automatically generate deterministic C:\StudioFlow_Photos
 * directories (T042 / AC021) on registration and payment creation.
 * Compatible with PocketBase v0.23+ / 0.41.x hook middleware pattern (e.next()).
 */

onRecordCreate((e) => {
  // 1. Auto-generate sequential 5-digit Job Order Number if not provided
  if (!e.record.get("job_order_no")) {
    try {
      const records = e.app.findRecordsByFilter(
        "registrations",
        "job_order_no != ''",
        "-job_order_no",
        1,
        0
      );
      let nextNum = 1; // Base starting number starting at 00001
      if (records.length > 0) {
        const lastNo = records[0].getString("job_order_no");
        const parsed = parseInt(lastNo, 10);
        if (!isNaN(parsed) && parsed >= nextNum) {
          nextNum = parsed + 1;
        }
      }
      e.record.set("job_order_no", String(nextNum).padStart(5, "0"));
    } catch (_) {
      e.record.set("job_order_no", String(Date.now()).slice(-5));
    }
  }

  // 2. Assign daily FCFS Queue Number
  if (!e.record.getInt("queue_number")) {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const records = e.app.findRecordsByFilter(
        "registrations",
        `created >= '${today} 00:00:00'`,
        "-queue_number",
        1,
        0
      );
      const nextQueue =
        records.length > 0 && records[0].getInt("queue_number") > 0
          ? records[0].getInt("queue_number") + 1
          : 1;
      e.record.set("queue_number", nextQueue);
    } catch (_) {
      e.record.set("queue_number", 1);
    }
  }

  // 3. Set default statuses
  if (!e.record.getString("status")) {
    e.record.set("status", "pending_payment");
  }
  if (!e.record.getString("payment_status")) {
    e.record.set("payment_status", "unpaid");
  }

  // 4. Calculate total amount if package is set
  const packageId = e.record.getString("package");
  let packageAmount = 0;
  if (packageId) {
    try {
      const pkg = e.app.findRecordById("packages", packageId);
      if (pkg) packageAmount = pkg.getFloat("amount");
    } catch (_) {}
  }

  const otherFees = e.record.getFloat("other_fees") || 0;
  let addOnsTotal = 0;
  const addOns = e.record.get("add_ons");
  if (Array.isArray(addOns)) {
    for (const item of addOns) {
      if (item && typeof item.amount === "number") {
        addOnsTotal += item.amount;
      }
    }
  }

  const total = packageAmount + otherFees + addOnsTotal;
  e.record.set("total_amount", total);

  const paid = e.record.getFloat("paid_amount") || 0;
  e.record.set("balance", Math.max(0, total - paid));

  // Auto-create pictorial directory on Windows C: storage (T042)
  try {
    const basePath = "C:\\StudioFlow_Photos";
    let orgCode = "ORGANIZATION";
    const orgId = e.record.getString("organization");
    if (orgId) {
      try {
        const org = e.app.findRecordById("organizations", orgId);
        if (org) orgCode = org.getString("code") || org.getString("name") || "ORGANIZATION";
      } catch (_) {}
    }

    let courseCode = "COURSE";
    const courseId = e.record.getString("course");
    if (courseId) {
      try {
        const course = e.app.findRecordById("courses", courseId);
        if (course) courseCode = course.getString("code") || course.getString("name") || "COURSE";
      } catch (_) {}
    }

    const joNo = e.record.getString("job_order_no") || "JO";
    const fName = e.record.getString("family_name") || "STUDENT";
    const gName = e.record.getString("given_name") || "";

    const clean = (s) => (s ? String(s).replace(/\.\./g, "").replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").trim() : "");
    const folderName = `${clean(joNo)}_${clean(fName)}_${clean(gName)}`.replace(/_+$/, "");
    const fullPath = `${basePath}\\${clean(orgCode)}\\${clean(courseCode)}\\${folderName}`;

    if (typeof $os !== "undefined" && $os && $os.mkdirAll) {
      $os.mkdirAll(fullPath, 511);
    }
  } catch (dirErr) {
    console.log("Pictorial directory creation notice:", dirErr);
  }

  // Must call e.next() to proceed with the DB INSERT
  return e.next();
}, "registrations");

onRecordCreate((e) => {
  const regId = e.record.getString("registration");
  const amount = e.record.getFloat("amount");

  // Call e.next() so payment is written to DB first
  const res = e.next();

  if (regId && amount > 0) {
    try {
      const reg = e.app.findRecordById("registrations", regId);
      if (reg) {
        const currentPaid = reg.getFloat("paid_amount") || 0;
        const total = reg.getFloat("total_amount") || 0;
        const newPaid = currentPaid + amount;
        const newBalance = Math.max(0, total - newPaid);

        reg.set("paid_amount", newPaid);
        reg.set("balance", newBalance);

        if (newBalance <= 0) {
          reg.set("payment_status", "fully_paid");
        } else {
          reg.set("payment_status", "downpayment");
        }

        // Push into paid shooting queue if it was pending
        if (reg.getString("status") === "pending_payment") {
          reg.set("status", "paid");
        }

        const cashier = e.record.getString("cashier_name");
        if (cashier && !reg.getString("prepared_by")) {
          reg.set("prepared_by", cashier);
        }

        e.app.save(reg);

        // Guarantee folder exists on Windows C: storage
        try {
          const basePath = "C:\\StudioFlow_Photos";
          let orgCode = "ORGANIZATION";
          const orgId = reg.getString("organization");
          if (orgId) {
            try {
              const org = e.app.findRecordById("organizations", orgId);
              if (org) orgCode = org.getString("code") || org.getString("name") || "ORGANIZATION";
            } catch (_) {}
          }

          let courseCode = "COURSE";
          const courseId = reg.getString("course");
          if (courseId) {
            try {
              const course = e.app.findRecordById("courses", courseId);
              if (course) courseCode = course.getString("code") || course.getString("name") || "COURSE";
            } catch (_) {}
          }

          const joNo = reg.getString("job_order_no") || "JO";
          const fName = reg.getString("family_name") || "STUDENT";
          const gName = reg.getString("given_name") || "";

          const clean = (s) => (s ? String(s).replace(/\.\./g, "").replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").trim() : "");
          const folderName = `${clean(joNo)}_${clean(fName)}_${clean(gName)}`.replace(/_+$/, "");
          const fullPath = `${basePath}\\${clean(orgCode)}\\${clean(courseCode)}\\${folderName}`;

          if (typeof $os !== "undefined" && $os && $os.mkdirAll) {
            $os.mkdirAll(fullPath, 511);
          }
        } catch (dirErr) {
          console.log("Pictorial directory creation notice:", dirErr);
        }
      }
    } catch (err) {
      console.error("Failed to update registration payment stats:", err);
    }
  }

  return res;
}, "payments");

/**
 * T048 & AC022: Enforce Full-Settlement Deliverable Release Rule
 * Any remaining balance blocks deliverable release, including through direct API requests.
 */
onRecordUpdate((e) => {
  const status = e.record.getString("status");
  const framingStatus = e.record.getString("framing_status");
  const balance = e.record.getFloat("balance");

  if ((status === "released" || framingStatus === "released") && balance > 0) {
    throw new BadRequestError(
      `Deliverable cannot be released with an outstanding balance of ₱${balance.toFixed(2)}. Full settlement is required before release (AC022/T048).`
    );
  }

  return e.next();
}, "registrations");
