/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const registrations = app.findCollectionByNameOrId("registrations");
  registrations.fields.add(new DateField({ name: "queue_issued_at" }));
  app.save(registrations);

  // Seed high-water marks before issuing new numbers. Keep counters even when
  // a numbered record is cancelled or removed.
  app.db().newQuery(`CREATE TABLE studio_number_sequences (
    scope TEXT PRIMARY KEY NOT NULL, last_number INTEGER NOT NULL
  )`).execute();
  app.db().newQuery(`INSERT INTO studio_number_sequences
    SELECT 'job_order', COALESCE(MAX(CAST(job_order_no AS INTEGER)), 0)
    FROM registrations WHERE job_order_no GLOB '[0-9]*'`).execute();
  app.db().newQuery(`UPDATE registrations SET queue_issued_at = created WHERE queue_number > 0`).execute();
  app.db().newQuery(`INSERT INTO studio_number_sequences
    SELECT 'queue:' || date(queue_issued_at, '+8 hours'), MAX(queue_number)
    FROM registrations WHERE queue_number > 0 AND date(queue_issued_at, '+8 hours') IS NOT NULL
    GROUP BY date(queue_issued_at, '+8 hours')`).execute();

  const addOns = app.findCollectionByNameOrId("add_ons");
  addOns.fields.add(new BoolField({ name: "default_when_no_mua" }));
  for (const kind of ["school", "walkin"]) {
    addOns.addIndex("idx_addon_default_" + kind, true, "default_when_no_mua",
      `is_active = 1 AND default_when_no_mua = 1 AND client_kind IN ('', 'both', '${kind}')`);
  }
  app.save(addOns);
}, (app) => {
  const addOns = app.findCollectionByNameOrId("add_ons");
  for (const kind of ["school", "walkin"]) addOns.removeIndex("idx_addon_default_" + kind);
  addOns.fields.removeByName("default_when_no_mua");
  app.save(addOns);
  const registrations = app.findCollectionByNameOrId("registrations");
  registrations.fields.removeByName("queue_issued_at");
  app.save(registrations);
  app.db().newQuery("DROP TABLE studio_number_sequences").execute();
});
