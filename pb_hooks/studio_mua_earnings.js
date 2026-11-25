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
  // The artist earns the full sold price: discounts come out of the Studio charges only,
  // and the studio pays the MUA team whatever discount the client was given.
  return (source) => {
    const key = serviceKey(source);
    const line = lines.find((item) => serviceKey(item) === key);
    const quantity = line?.quantity || 1;
    if (!line || line.revenue_category !== "mua") {
      return { kind: "review", quantity, earned: 0, ...(line ? { limit: line.gross } : {}),
        reviewReason: !line ? "No verified purchased service price." : "The sold item has no separately priced MUA charge." };
    }
    return { kind: "price", quantity, unit: cents(line.amount), earned: line.gross };
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
