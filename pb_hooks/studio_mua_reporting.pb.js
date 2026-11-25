/// <reference path="../pb_data/types.d.ts" />

routerAdd("GET", "/api/studioflow/mua-performance", (e) => {
  const workflow = require(__hooks + "/studio_workflow.js");
  const reporting = require(__hooks + "/studio_mua_reporting.js");
  workflow.staff(e.app, e.auth, ["admin"]);
  const today = reporting.studioDate(Date.now());
  const date = e.request.url.query().get("date") || today;
  const instant = new Date(date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(instant.getTime())
    || instant.toISOString().slice(0, 10) !== date) {
    throw new BadRequestError("Choose a valid report date.");
  }
  // Read counters, names, and details from one database snapshot.
  let report;
  e.app.runInTransaction((tx) => { report = reporting.dailyReport(tx, date, today, true); });
  e.response.header().set("Cache-Control", "private, no-store");
  return e.json(200, report);
}, $apis.requireAuth("users"));

routerAdd("GET", "/api/studioflow/mua-export", (e) => {
  const workflow = require(__hooks + "/studio_workflow.js");
  const reporting = require(__hooks + "/studio_mua_reporting.js");
  const payouts = require(__hooks + "/studio_mua_payouts.js");
  workflow.staff(e.app, e.auth, ["admin"]);
  const query = e.request.url.query();
  const from = query.get("from");
  const to = query.get("to");
  const today = reporting.studioDate(Date.now());
  if (!payouts.validDay(from) || !payouts.validDay(to) || from > to || to > today) {
    throw new BadRequestError("Choose a valid MUA report period ending on or before today.");
  }
  let data;
  e.app.runInTransaction((tx) => {
    data = {
      performance: reporting.periodReport(tx, from, to, today, true),
      payouts: payouts.periodReport(tx, from, to),
    };
  });
  e.response.header().set("Cache-Control", "private, no-store");
  return e.json(200, data);
}, $apis.requireAuth("users"));

function validateCatalogService(e) {
  const record = e.record;
  if ("mua_service_types" in (e.requestInfo().body || {})) {
    throw new BadRequestError("Historical service types are archived. Use the catalog item’s MUA service setting.");
  }
  if (record.getBool("requires_mua") && record.getString("revenue_category") !== "mua") {
    const original = record.original();
    // Keep old studio bundles and unclassified add-ons working until staff
    // explicitly resolve the flag or correct the classification.
    const legacy = original.getBool("requires_mua")
      && original.getString("revenue_category") === record.getString("revenue_category");
    if (!legacy) throw new BadRequestError("An MUA service must use Other Payment — MUA. Price only the MUA service on that item.");
  }
  return e.next();
}
onRecordCreateRequest(validateCatalogService, "packages", "add_ons");
onRecordUpdateRequest(validateCatalogService, "packages", "add_ons");

routerAdd("POST", "/api/studioflow/mua-completions/{id}/adjustments", (e) => {
  const workflow = require(__hooks + "/studio_workflow.js");
  const earnings = require(__hooks + "/studio_mua_earnings.js");
  const ledger = require(__hooks + "/studio_ledger.js");
  const body = e.requestInfo().body || {};
  const id = e.request.pathValue("id");
  const kind = body.kind;
  const amount = body.amount;
  const clientKey = String(body.clientKey || "");
  const reason = ledger.readReason(body.reason);
  const reference = String(body.reference || "").trim();
  if (!["refund", "void", "correction"].includes(kind) || !/^[a-zA-Z0-9-]{8,64}$/.test(clientKey)
    || reference.length > 100 || !Number.isSafeInteger(amount) || (kind === "correction" ? amount === 0 : amount > 0)) {
    throw new BadRequestError("Enter a valid earnings adjustment in centavos.");
  }

  let saved;
  e.app.runInTransaction((tx) => {
    const account = workflow.staff(tx, e.auth, ["admin"]);
    const lock = tx.db().newQuery("UPDATE mua_completions SET id = id WHERE id = {:id}").bind({ id }).execute();
    if (!lock.rowsAffected()) throw new NotFoundError("Completion not found.");
    const log = tx.findRecordById("mua_completions", id);
    const existing = earnings.adjustmentsFor(log);
    const duplicate = existing.find((entry) => entry.clientKey === clientKey);
    if (duplicate) {
      if (duplicate.amount !== amount || duplicate.kind !== kind || duplicate.reference !== reference || duplicate.reason !== reason) {
        throw new ApiError(409, "That adjustment was already saved with different details.");
      }
      saved = duplicate;
      return;
    }

    const jobId = log.getString("job_id");
    if (kind !== "correction") {
      const events = earnings.financialEvents(tx, jobId);
      const event = events.find((item) => item.kind === kind && item.reference === reference);
      if (!event) throw new BadRequestError("Select a refund or void recorded for this job order.");
      const matchesEvent = (entry) => entry.kind === kind && entry.reference === reference;
      if (existing.some(matchesEvent)) throw new ApiError(409, "This refund or void was already reviewed for this service.");
      const related = tx.findRecordsByFilter("mua_completions", "job_id = {:jobId}", "", 0, 0, { jobId });
      const allocated = related.flatMap(earnings.adjustmentsFor).filter(matchesEvent)
        .reduce((total, entry) => total - entry.amount, 0);
      if (allocated - amount > event.amount) throw new BadRequestError("The total reduction exceeds the refund or void amount.");
    }
    const basis = earnings.basisFor(log);
    const after = basis.earned + existing.reduce((sum, entry) => sum + entry.amount, 0) + amount;
    const limit = basis.kind === "price" ? basis.unit * basis.quantity : basis.limit;
    if (!Number.isSafeInteger(after) || after < 0 || (limit !== undefined && after > limit)) {
      throw new BadRequestError("Net earnings must be nonnegative and within the verified service price.");
    }
    saved = { kind, amount, reference, reason, clientKey, by: ledger.actorName(account), actorId: account.id, at: new Date().toISOString() };
    log.set("earnings_adjustments", [...existing, saved]);
    tx.save(log);
  });
  require(__hooks + "/studio_station_events.js").notify(e.app);
  return e.json(200, saved);
}, $apis.requireAuth("users"));
