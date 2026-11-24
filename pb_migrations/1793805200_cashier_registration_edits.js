/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const admin = "@request.auth.role = 'admin' && @request.auth.disabled = false";
  const edits = new Collection({ name: "cashier_registration_edits", type: "base", listRule: admin, viewRule: admin });
  edits.fields.add(
    new TextField({ name: "registration", required: true }),
    new TextField({ name: "actor_id", required: true }),
    new TextField({ name: "actor_name", required: true }),
    new TextField({ name: "role", required: true }),
    new JSONField({ name: "changes", required: true, maxSize: 2000000 }),
    new AutodateField({ name: "created", onCreate: true }),
  );
  edits.addIndex("idx_cashier_registration_edits_client", false, "registration, created", "");
  app.save(edits);
}, (app) => {
  const edits = app.findCollectionByNameOrId("cashier_registration_edits");
  if (app.countRecords(edits.name)) throw new Error("Retain the cashier registration edit history before removing this migration.");
  app.delete(edits);
});
