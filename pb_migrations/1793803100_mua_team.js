/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const settings = app.findCollectionByNameOrId("studio_settings");
  settings.fields.add(
    new TextField({ name: "mua_parent_id", hidden: true }),
    new BoolField({ name: "mua_parent_accepts_clients", hidden: true }),
  );
  app.save(settings);

  const history = new Collection({ name: "mua_assignment_events", type: "base",
    listRule: "@request.auth.role = 'admin' && @request.auth.disabled = false",
    viewRule: "@request.auth.role = 'admin' && @request.auth.disabled = false",
  });
  history.fields.add(
    new TextField({ name: "job_id", required: true }),
    new TextField({ name: "job_order", required: true }),
    new TextField({ name: "artist_id", required: true }),
    new TextField({ name: "artist_name", required: true }),
    new TextField({ name: "previous_artist_id" }),
    new TextField({ name: "actor_id", required: true }),
    new TextField({ name: "actor_name", required: true }),
    new SelectField({ name: "action", values: ["assign", "reassign", "start", "release", "complete"], required: true }),
    new NumberField({ name: "version", min: 0, onlyInt: true }),
    new AutodateField({ name: "created", onCreate: true }),
  );
  history.addIndex("idx_mua_assignment_job", false, "job_id, created", "");
  app.save(history);
}, (app) => {
  app.delete(app.findCollectionByNameOrId("mua_assignment_events"));
  const settings = app.findCollectionByNameOrId("studio_settings");
  settings.fields.removeByName("mua_parent_id");
  settings.fields.removeByName("mua_parent_accepts_clients");
  app.save(settings);
});
