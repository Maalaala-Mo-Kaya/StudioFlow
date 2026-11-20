const { addOnCents, cents, savedAddOns } = require(__hooks + "/studio_pricing.js");
const { json } = require(__hooks + "/studio_workflow.js");
const { actorName, readReason } = require(__hooks + "/studio_ledger.js");

function terms(record, subtotal) {
  const packageLine = json(record, "package_snapshot");
  const addOns = savedAddOns(record);
  const fees = cents(record.getFloat("other_fees"));
  const packageAmount = subtotal - addOnCents(addOns) - fees;
  const result = { studio: fees, mua: 0, unallocated: 0 };
  for (const [category, amount] of [[packageLine?.revenue_category, packageAmount],
    ...addOns.map((item) => [item.revenue_category, cents(item.amount)])]) {
    const key = category === "studio" || category === "mua" ? category : "unallocated";
    result[key] += amount;
  }
  // Inconsistent legacy line items need documentary review of the whole subtotal.
  return Object.values(result).some((value) => value < 0)
    ? { studio: 0, mua: 0, unallocated: subtotal }
    : result;
}

function changes(e, original, subtotal, itemsChanged, record = e.record, body = e.requestInfo().body || {}) {
  const hasReview = Object.hasOwn(body, "review_mua_amount");
  const hasDiscount = Object.hasOwn(body, "order_discount");
  const admin = e.hasSuperuserAuth() || e.auth?.getString("role") === "admin";
  if (hasReview && !admin) throw new ForbiddenError("Only administrators can review revenue.");
  if (hasDiscount && !admin && e.auth?.getString("role") !== "cashier") throw new ForbiddenError("Only cashiers and administrators can grant discounts.");
  let review = itemsChanged ? null : json(original, "revenue_review");
  let charges = terms(record, subtotal);
  const savedTerms = json(original, "revenue_terms");
  const previousDiscount = json(original, "revenue_discount");
  if (charges.unallocated > 0 && savedTerms && savedTerms.unallocated === 0
    && savedTerms.studio + savedTerms.mua + (previousDiscount?.studio || 0) + (previousDiscount?.mua || 0) === subtotal) {
    charges = {
      studio: savedTerms.studio + (previousDiscount?.studio || 0),
      mua: savedTerms.mua + (previousDiscount?.mua || 0),
      unallocated: 0,
    };
  }
  const actor = () => e.auth ? actorName(e.auth) : "Superuser";
  if (hasReview) {
    if (charges.unallocated <= 0) throw new BadRequestError("This order has no charges that need review.");
    const amount = body.review_mua_amount;
    const mua = typeof amount === "number" ? cents(amount) : -1;
    if (!Number.isFinite(amount) || mua < charges.mua || mua > charges.mua + charges.unallocated) {
      throw new BadRequestError("Enter a verified MUA subtotal within the unclassified charges.");
    }
    review = { mua, reason: readReason(body.review_revenue_reason), by: actor(), at: new Date().toISOString() };
  }
  if (review) charges = { studio: subtotal - review.mua, mua: review.mua, unallocated: 0 };

  let discount = json(original, "revenue_discount");
  if (hasDiscount) {
    let values = body.order_discount;
    const percentage = values?.percentage;
    if (percentage !== undefined) {
      if (!Number.isInteger(percentage) || percentage < 0 || percentage > 100 || (percentage > 0 && charges.unallocated)) {
        throw new BadRequestError("Enter a whole percentage from 0 to 100 on an order with classified charges.");
      }
      const credit = (charge) => Math.round(charge * percentage / 100) / 100;
      values = { ...values, studio: credit(charges.studio), mua: percentage === 0 ? 0 : (previousDiscount?.mua || 0) };
    }
    if (!values || !Number.isFinite(values.studio) || !Number.isFinite(values.mua)
      || values.studio < 0 || values.mua < 0) {
      throw new BadRequestError("Enter nonnegative whole-peso discounts for Studio and MUA.");
    }
    const { studio, mua } = values;
    discount = studio || mua ? {
      studio: cents(studio), mua: cents(mua), percentage: percentage ?? (subtotal ? (cents(studio) + cents(mua)) * 100 / subtotal : 0),
      reason: readReason(values.reason), by: actor(), byId: e.auth?.id || "", at: new Date().toISOString(),
    } : null;
  }
  if (hasDiscount && body.order_discount?.percentage !== undefined && (discount?.studio || 0) + (discount?.mua || 0) >
    Math.max(0, subtotal - cents(original.getFloat("paid_amount")))) {
    throw new BadRequestError("Discount credit cannot exceed the original charges still unpaid.");
  }
  if ((discount?.studio || 0) > charges.studio || (discount?.mua || 0) > charges.mua) {
    throw new BadRequestError("Each discount must fit the verified charges in its category. Review or adjust the discount first.");
  }
  record.set("revenue_review", review);
  record.set("revenue_discount", discount);
  record.set("revenue_terms", {
    ...charges,
    studio: charges.studio - (discount?.studio || 0),
    mua: charges.mua - (discount?.mua || 0),
  });
  return subtotal - (discount?.studio || 0) - (discount?.mua || 0);
}

module.exports = { changes, terms };
