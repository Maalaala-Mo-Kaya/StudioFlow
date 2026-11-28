// Call inside the same write transaction as the payment or queue handoff.
function next(app, scope) {
  const value = new DynamicModel({ last_number: 0 });
  app.db().newQuery(`INSERT INTO studio_number_sequences (scope, last_number) VALUES ({:scope}, 1)
    ON CONFLICT(scope) DO UPDATE SET last_number = last_number + 1 RETURNING last_number`)
    .bind({ scope }).one(value);
  return value.last_number;
}

function issueJobOrder(app, record) {
  if (record.getString("job_order_no")) return false;
  record.set("job_order_no", String(next(app, "job_order")).padStart(5, "0"));
  return true;
}

function handoffToPhotography(app, record, timestamp = new Date().toISOString()) {
  // MUA station off (DEV CON): makeup or grooming is skipped and the client goes to the photographers.
  require(__hooks + "/studio_mua_station.js").skipIfOff(app, record);
  if (record.getInt("queue_number") || !record.getString("job_order_no")
    || record.getString("status") !== "paid" || !require(__hooks + "/studio_workflow.js").paymentEligible(record)) return;
  const state = record.getString("makeup_state");
  if (state !== "completed" && (state || record.getString("makeup_service"))) return;

  const day = new Date(Date.parse(timestamp) + 8 * 3600000).toISOString().slice(0, 10);
  record.set("queue_number", next(app, "queue:" + day));
  record.set("queue_issued_at", timestamp);
}

// PocketBase scalar fields store empty strings and zeroes. Expose absent
// numbers as null in API responses without changing storage or existing indexes.
function exposeNumbers(record) {
  if (!record.getString("job_order_no")) record.setRaw("job_order_no", null);
  if (!record.getInt("queue_number")) record.setRaw("queue_number", null);
}

module.exports = { exposeNumbers, handoffToPhotography, issueJobOrder };
