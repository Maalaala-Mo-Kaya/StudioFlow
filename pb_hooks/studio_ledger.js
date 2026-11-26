/// <reference path="../pb_data/types.d.ts" />

// Shared money rules for a job order (load with require(__hooks + "/studio_ledger.js") inside a handler).
// Counted payments are "completed" (or empty, from old data). Voided and the old "refunded" status are not.
// Refunds are separate records; net paid = counted payments − refunds.

const cents = (amount) => Math.round((Number(amount) || 0) * 100);

function canEditDiscount(registration) {
  return registration.getString("status") === "pending_payment"
    && cents(registration.getFloat("paid_amount")) + cents(registration.getFloat("refunded_amount")) === 0;
}

function assertDiscountEditable(registration) {
  if (!canEditDiscount(registration)) {
    throw new ApiError(409, "Discounts can only be changed before the first payment on an unpaid order.");
  }
}

/** Totals for one job order, in centavos. */
function ledger(app, registration) {
  const id = registration.id;
  const paid = app.findRecordsByFilter("payments",
    "registration = {:id} && (status = 'completed' || status = '')", "", 0, 0, { id })
    .reduce((sum, payment) => sum + cents(payment.getFloat("amount")), 0);
  const refunded = app.findRecordsByFilter("refunds", "registration = {:id}", "", 0, 0, { id })
    .reduce((sum, refund) => sum + cents(refund.getFloat("amount")), 0);
  const total = cents(registration.getFloat("total_amount"));
  const net = paid - refunded;
  return { total, paid, refunded, net, balance: Math.max(0, total - net), overpaid: Math.max(0, net - total) };
}

/**
 * Most that can be refunded now: a cancelled order can return everything still held;
 * an active order only what was paid beyond its total.
 */
function refundable(registration, totals) {
  return registration.getString("status") === "cancelled" ? Math.max(0, totals.net) : totals.overpaid;
}

/** Writes paid / balance / payment status on the job order from its payments and refunds (caller saves). */
function applyTotals(registration, totals) {
  registration.set("paid_amount", totals.net / 100);
  registration.set("refunded_amount", totals.refunded / 100);
  // A cancelled job order owes nothing; Restore recalculates the real balance.
  registration.set("balance", registration.getString("status") === "cancelled" ? 0 : totals.balance / 100);
  const credit = require(__hooks + "/studio_workflow.js").json(registration, "revenue_discount");
  const settled = totals.net + (credit?.studio || 0) + (credit?.mua || 0);
  registration.set("payment_status", settled <= 0 ? "unpaid" : totals.balance === 0 ? "fully_paid" : "downpayment");
}

/** Next number in a sequence such as OR-000123 or RF-000004. */
function nextNumber(app, collection, field, prefix) {
  const last = new DynamicModel({ n: 0 });
  app.db().newQuery(
    `SELECT COALESCE(MAX(CAST(SUBSTR(${field}, ${prefix.length + 1}) AS INTEGER)), 0) AS n FROM ${collection} WHERE ${field} GLOB '${prefix}[0-9]*'`
  ).one(last);
  return prefix + String(last.n + 1).padStart(6, "0");
}

/** The name recorded for who did something. */
function actorName(account) {
  return account.getString("name") || account.getString("username") || account.id;
}

/** A required reason for a void, refund or cancellation (3–500 characters). */
function readReason(value) {
  const reason = String(value ?? "").trim().replace(/\s+/g, " ");
  if (reason.length < 3) throw new BadRequestError("Write the reason (at least 3 characters).");
  if (reason.length > 500) throw new BadRequestError("The reason is too long (500 characters at most).");
  return reason;
}

module.exports = { actorName, applyTotals, assertDiscountEditable, canEditDiscount, cents, ledger, nextNumber, readReason, refundable };
