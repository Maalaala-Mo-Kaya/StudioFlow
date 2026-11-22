/// <reference path="../pb_data/types.d.ts" />

// MUA payouts (pb_hooks/studio_mua_payouts.js):
// - mua_payouts: a recorded payment from the studio to one makeup artist for a period (MP-000001…),
//   with the lines it covered. Admin read-only through the API; written by the payout routes only.
// - mua_completions.payout_id: the payout that paid a completion ('' = unpaid).
// - Shared MUA charges (the automatic Wardrobe add-on) are no longer an MUA queue step. Clients who
//   were waiting at the MUA station only for that go to the photo queue now.
migrate((app) => {
  const admin = "@request.auth.role = 'admin' && @request.auth.disabled = false";
  const payouts = new Collection({ name: "mua_payouts", type: "base",
    listRule: admin, viewRule: admin, createRule: null, updateRule: null, deleteRule: null });
  payouts.fields.add(
    new TextField({ name: "payout_no", required: true, max: 20 }),
    new TextField({ name: "artist_id", required: true, max: 30 }),
    new TextField({ name: "artist_name", max: 120 }),
    new TextField({ name: "period_from", max: 10 }),
    new TextField({ name: "period_to", max: 10 }),
    new NumberField({ name: "amount" }),
    new JSONField({ name: "lines" }),
    new TextField({ name: "note", max: 300 }),
    new TextField({ name: "paid_by", max: 120 }),
    new TextField({ name: "paid_at", max: 40 }),
    new TextField({ name: "voided_at", max: 40 }),
    new TextField({ name: "voided_by", max: 120 }),
    new TextField({ name: "void_reason", max: 500 }),
    new AutodateField({ name: "created", onCreate: true }),
    new AutodateField({ name: "updated", onCreate: true, onUpdate: true }),
  );
  payouts.addIndex("idx_mua_payouts_no", true, "`payout_no`", "");
  app.save(payouts);

  const completions = app.findCollectionByNameOrId("mua_completions");
  if (!completions.fields.getByName("payout_id")) completions.fields.add(new TextField({ name: "payout_id", max: 30 }));
  completions.addIndex("idx_mua_completions_payout", false, "`payout_id`", "");
  app.save(completions);

  // Waiting only for the automatic (shared) add-on: straight to photography.
  const numbering = require(__hooks + "/studio_numbering.js");
  for (const job of app.findRecordsByFilter("registrations", "makeup_service != '' && makeup_state != 'completed'", "", 0, 0)) {
    let services;
    try { services = JSON.parse(job.getString("makeup_services") || "[]"); } catch (_) { services = []; }
    if (!Array.isArray(services) || !services.length || !services.every((service) => service?.defaultService)) continue;
    job.set("makeup_services", []);
    job.set("makeup_service", "");
    job.set("makeup_state", "");
    job.set("makeup_artist", "");
    numbering.handoffToPhotography(app, job);
    app.save(job);
  }
}, (app) => {
  const completions = app.findCollectionByNameOrId("mua_completions");
  completions.removeIndex("idx_mua_completions_payout");
  completions.fields.removeByName("payout_id");
  app.save(completions);
  app.delete(app.findCollectionByNameOrId("mua_payouts"));
});
