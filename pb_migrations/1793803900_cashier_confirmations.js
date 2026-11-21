/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const admin = "@request.auth.role = 'admin' && @request.auth.disabled = false";
  const confirmations = new Collection({
    name: "cashier_confirmations", type: "base", listRule: admin, viewRule: admin,
  });
  confirmations.fields.add(
    new TextField({ name: "client_key", required: true, max: 64 }),
    new TextField({ name: "registration", required: true }),
    new TextField({ name: "actor_id", required: true }),
    new TextField({ name: "actor_name", required: true }),
    new TextField({ name: "payment_id" }),
    new TextField({ name: "request_hash", required: true }),
    new JSONField({ name: "discount_before" }),
    new JSONField({ name: "discount_after" }),
    new AutodateField({ name: "created", onCreate: true }),
  );
  confirmations.addIndex("idx_cashier_confirmations_key", true, "client_key", "");
  confirmations.addIndex("idx_cashier_confirmations_job", false, "registration, created", "");
  app.save(confirmations);

  const payments = app.findCollectionByNameOrId("payments");
  payments.fields.add(new JSONField({ name: "discount_snapshot" }));
  app.save(payments);
}, (app) => {
  const confirmations = app.findCollectionByNameOrId("cashier_confirmations");
  if (app.countRecords(confirmations.name)) throw new Error("Retain the cashier confirmation audit history before removing this migration.");
  app.delete(confirmations);
  const payments = app.findCollectionByNameOrId("payments");
  payments.fields.removeByName("discount_snapshot");
  app.save(payments);
});
