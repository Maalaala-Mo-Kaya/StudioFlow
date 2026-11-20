const { cents, savedAddOns } = require(__hooks + "/studio_pricing.js");
const { json } = require(__hooks + "/studio_workflow.js");

function serviceKey(source) {
  return source.id && ["package", "add_on"].includes(source.source)
    ? source.source + ":" + source.id
    : source.source;
}

function purchasedEarnings(job) {
  const packageLine = json(job, "package_snapshot");
  const purchased = [
    ...(packageLine ? [{ ...packageLine, source: "package", quantity: 1 }] : []),
    ...savedAddOns(job).map((item) => ({ ...item, source: "add_on" })),
  ];
  const lines = purchased.filter((item) => item.id && Number.isFinite(item.amount)).map((item) => {
    const quantity = Number.isSafeInteger(item.quantity) && item.quantity > 0 ? item.quantity : 1;
    return { ...item, quantity, gross: cents(item.amount) * quantity };
  });
  const eligible = lines.filter((line) => line.revenue_category === "mua");
  const total = eligible.reduce((sum, line) => sum + line.gross, 0);
  const discount = json(job, "revenue_discount");
  // Existing discounts are per revenue category. Allocate proportionally to
  // every priced MUA line (including non-service charges) in sold-line order.
  // Cumulative rounding keeps the allocated centavos equal to the discount.
  const muaDiscount = discount?.mua || 0;
  const review = json(job, "revenue_review");
  let running = 0;
  let allocated = 0;
  const amounts = new Map();
  for (const line of eligible) {
    running += line.gross;
    const next = total ? Math.round(muaDiscount * running / total) : 0;
    amounts.set(serviceKey(line), next - allocated);
    allocated = next;
  }
  return (source) => {
    const key = serviceKey(source);
    const line = lines.find((item) => serviceKey(item) === key);
    const quantity = line?.quantity || 1;
    if (!line || line.revenue_category !== "mua" || (muaDiscount && (review || muaDiscount > total))) {
      return { kind: "review", quantity, earned: 0, ...(line ? { limit: line.gross } : {}),
        reviewReason: !line ? "No verified purchased service price."
          : line.revenue_category !== "mua" ? "The sold item has no separately priced MUA charge."
          : "The order discount needs a verified allocation to this service." };
    }
    const reduction = amounts.get(key) || 0;
    return {
      kind: "price", quantity, unit: cents(line.amount), earned: line.gross - reduction,
      ...(reduction ? { discount: { amount: reduction, reason: discount.reason, by: discount.by, at: discount.at } } : {}),
    };
  };
}

function basisFor(log) {
  return json(log, "earnings_basis") ?? { kind: "historical", quantity: 1, earned: cents(log.getFloat("payout_rate")) };
}

function adjustmentsFor(log) {
  return json(log, "earnings_adjustments") ?? [];
}

function financialEvents(app, jobId) {
  const events = [];
  for (const [collection, filter, numberField, kind] of [
    ["payments", " && status = 'voided'", "receipt_no", "void"], ["refunds", "", "refund_no", "refund"],
  ]) {
    for (const event of app.findRecordsByFilter(collection, "registration = {:jobId}" + filter, "", 0, 0, { jobId })) {
      events.push({ kind, reference: event.getString(numberField) || event.id, amount: cents(event.getFloat("amount")) });
    }
  }
  return events;
}

module.exports = { adjustmentsFor, basisFor, financialEvents, purchasedEarnings, serviceKey };
