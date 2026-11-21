/// <reference path="../pb_data/types.d.ts" />

// Voids, refunds, cancellations and restores. Admin only; each records who, when and why.
// - Void: a payment recorded by mistake (the money was not really received). Permanent.
// - Refund: money given back, recorded on the day it is given back. The payment stays as it was.
// - Cancel: the job order stops (no payments, no queue); money already received stays until refunded.
// - Restore: returns a cancelled job order to the status it had before it was cancelled.

routerAdd("POST", "/api/studioflow/registrations/{id}/discount", (e) => {
  const workflow = require(__hooks + "/studio_workflow.js");
  const ledger = require(__hooks + "/studio_ledger.js");
  const numbering = require(__hooks + "/studio_numbering.js");
  const storage = require(__hooks + "/studio_photo_storage.js");
  const body = e.requestInfo().body || {};
  if (!Number.isInteger(body.percentage)) throw new BadRequestError("Enter a whole discount percentage.");
  const saved = workflow.withRegistration(e.app, e.request.pathValue("id"), (tx, reg) => {
    const actor = workflow.staff(tx, e.auth, ["cashier", "admin"]);
    const status = reg.getString("status");
    if (["cancelled", "released"].includes(status)) throw new ApiError(409, "This order is closed.");
    const previous = workflow.json(reg, "revenue_discount");
    const reason = body.percentage === 0 ? "Discount removed" : ledger.readReason(body.reason);
    if ((!previous && body.percentage === 0) ||
      (previous?.percentage === body.percentage && previous.reason === reason)) return reg;
    const subtotal = ledger.cents(reg.getFloat("total_amount")) + (previous?.studio || 0) + (previous?.mua || 0);
    const total = require(__hooks + "/studio_revenue.js").changes(e, reg, subtotal, false, reg,
      { order_discount: { percentage: body.percentage, reason } });
    reg.set("total_amount", total / 100);
    ledger.applyTotals(reg, ledger.ledger(tx, reg));
    let numbered = false;
    if (status === "pending_payment" && workflow.paymentEligible(reg)) {
      reg.set("status", "paid");
      numbered = numbering.issueJobOrder(tx, reg);
      reg.set("prepared_by", ledger.actorName(actor));
    } else if (status === "paid" && !workflow.paymentEligible(reg)) {
      reg.set("status", "pending_payment");
      reg.set("queue_number", 0);
      reg.set("queue_issued_at", "");
    }
    numbering.handoffToPhotography(tx, reg);
    if (numbered) storage.assignFolder(tx, reg, true);
    tx.save(reg);
    return reg;
  });
  try {
    if (saved.getString("photo_folder")) storage.provision(saved.getString("photo_folder"));
  } catch (error) { console.log("Pictorial directory creation notice:", error); }
  numbering.exposeNumbers(saved);
  return e.json(200, saved);
}, $apis.requireAuth("users"));

routerAdd("POST", "/api/studioflow/payments/{id}/void", (e) => {
  const workflow = require(__hooks + "/studio_workflow.js");
  const ledgerRules = require(__hooks + "/studio_ledger.js");
  const body = e.requestInfo().body || {};
  const reason = ledgerRules.readReason(body.reason);
  let saved;
  e.app.runInTransaction((tx) => {
    const account = workflow.staff(tx, e.auth, ["admin"]);
    let payment;
    try { payment = tx.findRecordById("payments", e.request.pathValue("id")); } catch (_) { throw new NotFoundError("Payment not found."); }
    const status = payment.getString("status") || "completed";
    if (status === "voided") throw new ApiError(409, "This payment is already voided.");
    if (status !== "completed") throw new ApiError(409, "Only a completed payment can be voided.");
    const reg = tx.findRecordById("registrations", payment.getString("registration"));
    if (reg.getString("status") === "released") {
      throw new ApiError(409, "This order was already released to the client. A payment of a released order can't be voided; record a refund if money was given back.");
    }
    const totals = ledgerRules.ledger(tx, reg);
    if (totals.net - ledgerRules.cents(payment.getFloat("amount")) < 0) {
      throw new ApiError(409, "Refunds were already given for this job order. Voiding this payment would leave more refunded than paid.");
    }
    payment.set("status", "voided");
    payment.set("voided_at", new DateTime());
    payment.set("voided_by", ledgerRules.actorName(account));
    payment.set("void_reason", reason);
    tx.save(payment);
    saved = payment;
  });
  require(__hooks + "/studio_station_events.js").notify(e.app);
  return e.json(200, saved);
}, $apis.requireAuth("users"));

routerAdd("POST", "/api/studioflow/refunds", (e) => {
  const workflow = require(__hooks + "/studio_workflow.js");
  const ledgerRules = require(__hooks + "/studio_ledger.js");
  const body = e.requestInfo().body || {};
  const reason = ledgerRules.readReason(body.reason);
  const method = String(body.method || "");
  if (!["cash", "gcash", "maya", "card"].includes(method)) throw new BadRequestError("Choose how the money is given back.");
  const amount = Number(body.amount);
  const amountCentavos = Math.round(amount * 100);
  if (!Number.isFinite(amount) || amountCentavos < 1 || Math.abs(amount * 100 - amountCentavos) > 1e-6) {
    throw new BadRequestError("Enter the refund amount in pesos (up to 2 decimals).");
  }
  const clientKey = String(body.clientKey || "").trim().slice(0, 64);
  let saved;
  e.app.runInTransaction((tx) => {
    const account = workflow.staff(tx, e.auth, ["admin"]);
    if (clientKey) {
      // A retried request returns the refund already saved instead of refunding twice.
      const [existing] = tx.findRecordsByFilter("refunds", "client_key = {:key}", "", 1, 0, { key: clientKey });
      if (existing) { saved = existing; return; }
    }
    let reg;
    try { reg = tx.findRecordById("registrations", String(body.registrationId || "")); } catch (_) { throw new NotFoundError("Job order not found."); }
    const totals = ledgerRules.ledger(tx, reg);
    const limit = ledgerRules.refundable(reg, totals);
    if (limit <= 0) {
      throw new ApiError(409, reg.getString("status") === "cancelled"
        ? "Nothing left to refund on this cancelled job order."
        : "Nothing to refund: the client has not paid more than the job order total. Cancel the job order first to refund a payment.");
    }
    if (amountCentavos > limit) throw new ApiError(409, `At most ₱${(limit / 100).toFixed(2)} can be refunded on this job order.`);
    const refund = new Record(tx.findCollectionByNameOrId("refunds"), {
      registration: reg.id, amount: amountCentavos / 100, method, reason, client_key: clientKey,
      refund_no: ledgerRules.nextNumber(tx, "refunds", "refund_no", "RF-"),
      refunded_by: ledgerRules.actorName(account), refunded_by_id: account.id,
    });
    tx.save(refund);
    ledgerRules.applyTotals(reg, ledgerRules.ledger(tx, reg));
    tx.save(reg);
    saved = refund;
  });
  require(__hooks + "/studio_station_events.js").notify(e.app);
  return e.json(200, saved);
}, $apis.requireAuth("users"));

// The client's on-screen signature on a refund slip: proof the money was received. Saved once, never replaced.
routerAdd("POST", "/api/studioflow/refunds/{id}/signature", (e) => {
  const workflow = require(__hooks + "/studio_workflow.js");
  const ledgerRules = require(__hooks + "/studio_ledger.js");
  let files = [];
  try { files = e.findUploadedFiles("signature") || []; } catch (_) { files = []; }
  if (!files.length || !files[0]) throw new BadRequestError("The client's signature is missing.");
  let saved;
  e.app.runInTransaction((tx) => {
    const account = workflow.staff(tx, e.auth, ["admin"]);
    let refund;
    try { refund = tx.findRecordById("refunds", e.request.pathValue("id")); } catch (_) { throw new NotFoundError("Refund not found."); }
    if (refund.getString("signature")) throw new ApiError(409, "The client already signed this refund. A signature can't be replaced.");
    refund.set("signature", files[0]);
    refund.set("signed_at", new DateTime());
    refund.set("signed_witness", ledgerRules.actorName(account));
    tx.save(refund);
    saved = refund;
  });
  require(__hooks + "/studio_station_events.js").notify(e.app);
  return e.json(200, saved);
}, $apis.requireAuth("users"), $apis.bodyLimit(3 << 20));

routerAdd("POST", "/api/studioflow/registrations/{id}/cancel", (e) => {
  const workflow = require(__hooks + "/studio_workflow.js");
  const ledgerRules = require(__hooks + "/studio_ledger.js");
  const reason = ledgerRules.readReason((e.requestInfo().body || {}).reason);
  const saved = workflow.withRegistration(e.app, e.request.pathValue("id"), (tx, reg) => {
    const account = workflow.staff(tx, e.auth, ["admin"]);
    const status = reg.getString("status");
    if (status === "cancelled") throw new ApiError(409, "This job order is already cancelled.");
    if (status === "released") throw new ApiError(409, "This order was already released to the client and can't be cancelled.");
    if (workflow.json(reg, "photo_pending")) throw new ApiError(409, "Finish the photo selection transfer before cancelling this job order.");
    reg.set("status_before_cancel", status);
    reg.set("status", "cancelled");
    reg.set("cancelled_at", new DateTime());
    reg.set("cancelled_by", ledgerRules.actorName(account));
    reg.set("cancel_reason", reason);
    ledgerRules.applyTotals(reg, ledgerRules.ledger(tx, reg));
    tx.save(reg);
    require(__hooks + "/studio_numbering.js").exposeNumbers(reg);
    return reg;
  });
  require(__hooks + "/studio_station_events.js").notify(e.app);
  return e.json(200, saved);
}, $apis.requireAuth("users"));

routerAdd("POST", "/api/studioflow/registrations/{id}/restore", (e) => {
  const workflow = require(__hooks + "/studio_workflow.js");
  const ledgerRules = require(__hooks + "/studio_ledger.js");
  const saved = workflow.withRegistration(e.app, e.request.pathValue("id"), (tx, reg) => {
    const account = workflow.staff(tx, e.auth, ["admin"]);
    if (reg.getString("status") !== "cancelled") throw new ApiError(409, "This job order is not cancelled.");
    const totals = ledgerRules.ledger(tx, reg);
    // Orders cancelled before this feature have no saved status: they return to Paid or Pending Payment.
    const previous = reg.getString("status_before_cancel");
    let target = previous && previous !== "cancelled" && previous !== "released"
      ? previous : totals.net > 0 ? "paid" : "pending_payment";
    // Fully refunded before the shoot: nothing is held any more, so it is waiting for payment again, not Paid.
    ledgerRules.applyTotals(reg, totals);
    if (target === "paid" && !workflow.paymentEligible(reg)) target = "pending_payment";
    if (workflow.finishedShoot.includes(target)) reg.set("shoot_completed", true);
    reg.set("status", target);
    reg.set("restored_at", new DateTime());
    reg.set("restored_by", ledgerRules.actorName(account));
    ledgerRules.applyTotals(reg, totals);
    require(__hooks + "/studio_numbering.js").handoffToPhotography(tx, reg);
    tx.save(reg);
    require(__hooks + "/studio_numbering.js").exposeNumbers(reg);
    return reg;
  });
  require(__hooks + "/studio_station_events.js").notify(e.app);
  return e.json(200, saved);
}, $apis.requireAuth("users"));
