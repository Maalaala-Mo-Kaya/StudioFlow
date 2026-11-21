/// <reference path="../pb_data/types.d.ts" />

/**
 * PocketBase hooks for confirmed payments and deliverable release.
 * Compatible with PocketBase v0.23+ / 0.41.x hook middleware pattern (e.next()).
 */

onRecordEnrich((e) => {
  e.next();
  require(__hooks + "/studio_numbering.js").exposeNumbers(e.record);
}, "registrations");

onRecordCreate((e) => {
  const app = e.app;
  let reg;
  // Validate and update the job order in the same transaction as the receipt.
  app.runInTransaction((tx) => {
    e.app = tx;
    try {
      const ledgerRules = require(__hooks + "/studio_ledger.js");
      const regId = e.record.getString("registration");
      const amount = e.record.getFloat("amount");
      const paymentType = e.record.getString("payment_type");
      const paymentMethod = e.record.getString("payment_method");
      // A new payment is always a real, completed payment. Voids happen later, through the void route.
      e.record.set("status", "completed");
      e.record.set("voided_at", "");
      e.record.set("voided_by", "");
      e.record.set("void_reason", "");
      const status = "completed";

      if (!regId) throw new BadRequestError("A job order is required.");
      tx.db().newQuery("UPDATE registrations SET id = id WHERE id = {:id}").bind({ id: regId }).execute();
      reg = tx.findRecordById("registrations", regId);
      if (reg.getString("deleted_by_id")) throw new ApiError(409, "This registration was deleted and cannot accept payment.");
      if (reg.getString("status") === "cancelled") {
        throw new BadRequestError("This job order is cancelled. Restore it before collecting payment.");
      }
      const totalCentavos = Math.round(reg.getFloat("total_amount") * 100);
      // Remaining balance counts refunds; the collection-mode rule looks at payments received.
      const current = ledgerRules.ledger(tx, reg);
      const paidCentavos = current.paid;
      const remainingCentavos = current.balance;
      const amountCentavos = Math.round(amount * 100);

      const discountSettlement = paymentType !== "initial" && amountCentavos === remainingCentavos && remainingCentavos % 100 !== 0
        && !!require(__hooks + "/studio_workflow.js").json(reg, "revenue_discount");
      if (!Number.isFinite(amount) || (discountSettlement
        ? amountCentavos <= 0 || Math.abs(amount * 100 - amountCentavos) > 1e-6
        : !Number.isInteger(amount) || amountCentavos < 100)) {
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
        if (!Number.isFinite(tenderedCentavos) || tenderedCentavos < amountCentavos) {
          throw new BadRequestError("Cash received must cover the payment amount.");
        }
        if (tenderedCentavos > amountCentavos + 10000000) throw new BadRequestError("Cash received looks wrong. Check the amount.");
        e.record.set("cash_tendered", tenderedCentavos / 100);
        e.record.set("change_amount", (tenderedCentavos - amountCentavos) / 100);
      } else {
        e.record.set("cash_tendered", 0);
        e.record.set("change_amount", 0);
      }

      // Printed on the receipts. The server owns these; client values are ignored.
      e.record.set("balance_before", remainingCentavos / 100);
      e.record.set("balance_after", (remainingCentavos - (status === "completed" ? amountCentavos : 0)) / 100);
      e.record.set("client_key", e.record.getString("client_key").trim());
      const last = new DynamicModel({ n: 0 });
      tx.db().newQuery(
        "SELECT COALESCE(MAX(CAST(SUBSTR(receipt_no, 4) AS INTEGER)), 0) AS n FROM payments WHERE receipt_no GLOB 'OR-[0-9]*'"
      ).one(last);
      e.record.set("receipt_no", "OR-" + String(last.n + 1).padStart(6, "0"));

      e.next();
      const totals = ledgerRules.ledger(tx, reg);
      ledgerRules.applyTotals(reg, totals);
      if (totals.net > 0 && reg.getString("status") === "pending_payment") reg.set("status", "paid");
      const numbering = require(__hooks + "/studio_numbering.js");
      const newlyNumbered = numbering.issueJobOrder(tx, reg);
      numbering.handoffToPhotography(tx, reg);
      const cashier = e.record.getString("cashier_name");
      if (status === "completed" && cashier && !reg.getString("prepared_by")) reg.set("prepared_by", cashier);
      // First payment: the client's photo folder is named now (<job no>_<Last>_<First>).
      require(__hooks + "/studio_photo_storage.js").assignFolder(tx, reg, newlyNumbered);
      tx.save(reg);
    } finally {
      e.app = app;
    }
  });

  // Create the folder on disk (also retried on later payments if the photo drive was offline).
  try {
    const storage = require(__hooks + "/studio_photo_storage.js");
    const path = reg.getString("photo_folder");
    if (path) storage.provision(path);
  } catch (dirErr) {
    console.log("Pictorial directory creation notice:", dirErr);
  }
}, "payments");

// A saved payment never changes, except that it can be voided once (with who, when and why),
// through POST /api/studioflow/payments/:id/void. A void is permanent. The row stays for the audit trail.
onRecordUpdate((e) => {
  const before = e.record.original();
  const beforeStatus = before.getString("status") || "completed";
  const status = e.record.getString("status") || "completed";
  // Printed receipt facts and the cashier's remarks never change after the payment is saved.
  for (const field of ["registration", "amount", "payment_type", "payment_method", "cash_tendered", "change_amount",
    "receipt_no", "client_key", "balance_before", "balance_after", "remarks", "cashier_name", "cashier_id"]) {
    if (String(e.record.get(field)) !== String(before.get(field))) {
      throw new BadRequestError("A saved payment can't be changed. Void it and record a new payment instead.");
    }
  }
  if (status !== beforeStatus) {
    if (beforeStatus !== "completed" || status !== "voided") {
      throw new BadRequestError("A voided or refunded payment can't be restored. Record a new payment instead.");
    }
    if (!e.record.getString("void_reason").trim() || !e.record.getString("voided_by").trim()) {
      throw new BadRequestError("A void needs a reason and the name of the person voiding.");
    }
  } else {
    for (const field of ["voided_at", "voided_by", "void_reason"]) {
      if (String(e.record.get(field)) !== String(before.get(field))) {
        throw new BadRequestError("The void details of a payment can't be changed.");
      }
    }
  }

  const app = e.app;
  app.runInTransaction((tx) => {
    e.app = tx;
    try {
      e.next();
      const regId = e.record.getString("registration");
      if (!regId) return;
      const ledgerRules = require(__hooks + "/studio_ledger.js");
      const reg = tx.findRecordById("registrations", regId);
      ledgerRules.applyTotals(reg, ledgerRules.ledger(tx, reg));
      tx.save(reg);
    } finally {
      e.app = app;
    }
  });
}, "payments");

// Payments and refunds are permanent records (a void keeps the payment, marked voided).
onRecordDelete(() => {
  throw new BadRequestError("Payments can't be deleted. Void the payment instead, so the receipt number stays on record.");
}, "payments");
onRecordDelete(() => {
  throw new BadRequestError("Refunds can't be deleted.");
}, "refunds");

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

  // Production gate: an order can only be handed over once it was photographed and
  // marked ready (main status Completed / Ready for Pickup, or framing Framed / Ready).
  // Checked against the saved state, so readiness must be recorded before release.
  const before = e.record.original();
  const releasing = (status === "released" && before.getString("status") !== "released")
    || (framingStatus === "released" && before.getString("framing_status") !== "released");
  if (releasing) {
    // Every release goes through the cashier's Release step: the whole order is
    // released at once and the person who claimed it is recorded.
    if (status !== "released" || !e.record.getString("claimed_by").trim()) {
      throw new BadRequestError("Release the order from the cashier's Release button so the person claiming it is recorded.");
    }
    const ready = before.getString("status") !== "cancelled" && before.getBool("shoot_completed")
      && (["completed", "ready_for_pickup"].includes(before.getString("status"))
        || ["framed", "ready_for_pickup"].includes(before.getString("framing_status")));
    if (!ready) {
      throw new BadRequestError("This order is not ready for release yet. An admin must mark its production Ready for Pickup first (Admin → Production & Pickup).");
    }
  }

  return e.next();
}, "registrations");
