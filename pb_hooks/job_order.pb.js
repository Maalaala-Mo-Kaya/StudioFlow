/// <reference path="../pb_data/types.d.ts" />

/**
 * PocketBase Hook: Auto-generate Job Order Numbers, daily FCFS Queue numbers,
 * and automatically generate deterministic C:\StudioFlow_Photos
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

  const storage = require(__hooks + "/studio_photo_storage.js");
  storage.setFolder(e.record, storage.pathFor(e.app, e.record) + "_" + (e.record.id || $security.randomString(15)));

  // Must call e.next() to proceed with the DB INSERT
  return e.next();
}, "registrations");

onRecordAfterCreateSuccess((e) => {
  e.next();
  try {
    const storage = require(__hooks + "/studio_photo_storage.js");
    storage.provision(e.record.getString("photo_folder"));
  } catch (error) {
    console.log("Pictorial directory creation notice:", error);
  }
}, "registrations");

onRecordCreate((e) => {
  const app = e.app;
  let reg;
  // Validate and update the job order in the same transaction as the receipt.
  app.runInTransaction((tx) => {
    e.app = tx;
    try {
      const regId = e.record.getString("registration");
      const amount = e.record.getFloat("amount");
      const paymentType = e.record.getString("payment_type");
      const paymentMethod = e.record.getString("payment_method");
      const status = e.record.getString("status") || "completed";
      e.record.set("status", status);

      if (!regId) throw new BadRequestError("A job order is required.");
      if (!e.record.getString("receipt_no").trim()) throw new BadRequestError("A receipt number is required.");
      if (!["completed", "voided", "refunded"].includes(status)) {
        throw new BadRequestError("Invalid payment transaction status.");
      }
      reg = tx.findRecordById("registrations", regId);
      const totalCentavos = Math.round(reg.getFloat("total_amount") * 100);
      const existing = tx.findRecordsByFilter("payments",
        "registration = {:registration} && (status = 'completed' || status = '')", "", 0, 0, {
          registration: regId,
        });
      const paidCentavos = existing.reduce((sum, payment) => sum + Math.round(payment.getFloat("amount") * 100), 0);
      const remainingCentavos = Math.max(0, totalCentavos - paidCentavos);
      const amountCentavos = Math.round(amount * 100);

      if (!Number.isFinite(amount) || !Number.isInteger(amount) || amountCentavos < 100) {
        throw new BadRequestError("Payment must be a positive whole-peso amount of at least ₱1.");
      }
      if (!["full", "initial", "additional"].includes(paymentType)) throw new BadRequestError("Invalid collection mode.");
      if (paidCentavos > 0 && paymentType !== "additional") {
        throw new BadRequestError("Only Additional Payment is available after a successful payment.");
      }
      if (amountCentavos > remainingCentavos) throw new BadRequestError("Payment exceeds the current remaining balance.");
      if (paymentType === "full" && amountCentavos !== remainingCentavos) {
        throw new BadRequestError("Full settlement must equal the current remaining balance.");
      }
      if (paymentType === "initial" && amountCentavos !== Math.min(remainingCentavos, Math.round(totalCentavos / 200) * 100)) {
        throw new BadRequestError("Downpayment must equal exactly 50% of the total job amount.");
      }
      if (paymentMethod === "cash") {
        const tenderedCentavos = Math.round(e.record.getFloat("cash_tendered") * 100);
        if (tenderedCentavos < amountCentavos) throw new BadRequestError("Cash tendered must cover the payment amount.");
        e.record.set("change_amount", (tenderedCentavos - amountCentavos) / 100);
      } else {
        e.record.set("cash_tendered", 0);
        e.record.set("change_amount", 0);
      }

      e.next();
      const newPaid = paidCentavos + (status === "completed" ? amountCentavos : 0);
      const newBalance = Math.max(0, totalCentavos - newPaid);
      reg.set("paid_amount", newPaid / 100);
      reg.set("balance", newBalance / 100);
      reg.set("payment_status", newBalance === 0 ? "fully_paid" : newPaid > 0 ? "downpayment" : "unpaid");
      if (newPaid > 0 && reg.getString("status") === "pending_payment") reg.set("status", "paid");
      const cashier = e.record.getString("cashier_name");
      if (status === "completed" && cashier && !reg.getString("prepared_by")) reg.set("prepared_by", cashier);
      tx.save(reg);
    } finally {
      e.app = app;
    }
  });

  // Retry directory provisioning after payment if storage was offline during registration.
  try {
    const storage = require(__hooks + "/studio_photo_storage.js");
    const path = reg.getString("photo_folder");
    if (path) storage.provision(path);
  } catch (dirErr) {
    console.log("Pictorial directory creation notice:", dirErr);
  }
}, "payments");

// Keep the job-order totals synchronized when an administrator voids or refunds
// an existing transaction. The payment row remains in place for the audit trail.
onRecordUpdate((e) => {
  const status = e.record.getString("status") || "completed";
  if (!["completed", "voided", "refunded"].includes(status)) {
    throw new BadRequestError("Invalid payment transaction status.");
  }

  const app = e.app;
  app.runInTransaction((tx) => {
    e.app = tx;
    try {
      e.next();
      const regId = e.record.getString("registration");
      if (!regId) return;

      const reg = tx.findRecordById("registrations", regId);
      const records = tx.findRecordsByFilter("payments",
        "registration = {:registration} && (status = 'completed' || status = '')", "", 0, 0, {
          registration: regId,
        });
      const paid = records.reduce((sum, payment) => sum + Math.round(payment.getFloat("amount") * 100), 0);
      const balance = Math.max(0, Math.round(reg.getFloat("total_amount") * 100) - paid);
      reg.set("paid_amount", paid / 100);
      reg.set("balance", balance / 100);
      reg.set("payment_status", paid <= 0 ? "unpaid" : balance === 0 ? "fully_paid" : "downpayment");
      tx.save(reg);
    } finally {
      e.app = app;
    }
  });
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
