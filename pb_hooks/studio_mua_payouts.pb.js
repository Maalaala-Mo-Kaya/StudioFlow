/// <reference path="../pb_data/types.d.ts" />

// MUA payouts (rules in studio_mua_payouts.js). Admin only. Recording a payout is optional: the payout
// sheets work without it, and a payout marks the artist's unpaid lines in the period as paid
// (MP-000001…) so they are not paid twice. A payout entered by mistake is voided with a reason (kept on
// record, its lines become unpaid again); payouts are never deleted.

routerAdd("GET", "/api/studioflow/mua-payouts", (e) => {
  const workflow = require(__hooks + "/studio_workflow.js");
  const payouts = require(__hooks + "/studio_mua_payouts.js");
  workflow.staff(e.app, e.auth, ["admin"]);
  const query = e.request.url.query();
  const from = query.get("from");
  const to = query.get("to");
  if (!payouts.validDay(from) || !payouts.validDay(to) || from > to) {
    throw new BadRequestError("Choose a valid period (From on or before To).");
  }
  let report;
  e.app.runInTransaction((tx) => { report = payouts.periodReport(tx, from, to); });
  e.response.header().set("Cache-Control", "private, no-store");
  return e.json(200, report);
}, $apis.requireAuth("users"));

routerAdd("POST", "/api/studioflow/mua-payouts", (e) => {
  const workflow = require(__hooks + "/studio_workflow.js");
  const payouts = require(__hooks + "/studio_mua_payouts.js");
  const ledger = require(__hooks + "/studio_ledger.js");
  workflow.staff(e.app, e.auth, ["admin"]);
  const body = e.requestInfo().body || {};
  const artistId = String(body.artistId || "");
  const from = String(body.from || "");
  const to = String(body.to || "");
  if (!artistId || !payouts.validDay(from) || !payouts.validDay(to) || from > to) {
    throw new BadRequestError("Choose the artist and a valid period.");
  }
  const note = String(body.note ?? "").trim().replace(/\s+/g, " ").slice(0, 300);
  let saved;
  e.app.runInTransaction((tx) => {
    // Every unpaid line of this artist in the period that has a verified amount.
    const logs = tx.findRecordsByFilter("mua_completions",
      "artist_id = {:artistId} && local_date >= {:from} && local_date <= {:to} && payout_id = ''",
      "local_date,completed_at,id", 0, 0, { artistId, from, to });
    const lines = [];
    let total = 0;
    for (const log of logs) {
      const { amount, review } = payouts.earned(log);
      if (review || amount <= 0) continue;
      total += amount;
      lines.push({ completionId: log.id, date: log.getString("local_date"), jobOrder: log.getString("job_order"),
        client: log.getString("student_name"), service: log.getString("service_name"), earned: amount / 100 });
    }
    if (!lines.length) throw new BadRequestError("This artist has nothing unpaid with a verified amount in that period.");
    const record = new Record(tx.findCollectionByNameOrId("mua_payouts"));
    record.set("payout_no", ledger.nextNumber(tx, "mua_payouts", "payout_no", "MP-"));
    record.set("artist_id", artistId);
    record.set("artist_name", logs[0].getString("artist_name"));
    record.set("period_from", from);
    record.set("period_to", to);
    record.set("amount", total / 100);
    record.set("lines", lines);
    record.set("note", note);
    record.set("paid_by", ledger.actorName(e.auth));
    record.set("paid_at", new Date().toISOString());
    tx.save(record);
    for (const log of logs) {
      if (!lines.some((line) => line.completionId === log.id)) continue;
      log.set("payout_id", record.id);
      tx.save(log);
    }
    saved = payouts.payoutSummary(record);
  });
  return e.json(200, saved);
}, $apis.requireAuth("users"));

routerAdd("POST", "/api/studioflow/mua-payouts/{id}/void", (e) => {
  const workflow = require(__hooks + "/studio_workflow.js");
  const payouts = require(__hooks + "/studio_mua_payouts.js");
  const ledger = require(__hooks + "/studio_ledger.js");
  workflow.staff(e.app, e.auth, ["admin"]);
  const reason = ledger.readReason((e.requestInfo().body || {}).reason);
  let saved;
  e.app.runInTransaction((tx) => {
    const record = tx.findRecordById("mua_payouts", e.request.pathValue("id"));
    if (record.getString("voided_at")) throw new BadRequestError("This payout was already voided.");
    record.set("voided_at", new Date().toISOString());
    record.set("voided_by", ledger.actorName(e.auth));
    record.set("void_reason", reason);
    tx.save(record);
    for (const log of tx.findRecordsByFilter("mua_completions", "payout_id = {:id}", "", 0, 0, { id: record.id })) {
      log.set("payout_id", "");
      tx.save(log);
    }
    saved = payouts.payoutSummary(record);
  });
  return e.json(200, saved);
}, $apis.requireAuth("users"));
