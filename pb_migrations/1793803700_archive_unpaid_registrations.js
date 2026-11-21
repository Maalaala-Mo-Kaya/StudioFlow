/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const registrations = app.findCollectionByNameOrId("registrations");
  // The cancelled status and existing cancellation fields retain the archived form
  // and its audit details. This field distinguishes a deletion from a cancellation.
  registrations.fields.add(
    new TextField({ name: "deleted_by_id", hidden: true }),
    new BoolField({ name: "had_discount_credit", hidden: true }),
  );
  for (const rule of ["listRule", "viewRule", "updateRule"]) {
    registrations[rule] = "(" + registrations[rule] + ") && deleted_by_id = ''";
  }
  app.save(registrations);
  const payments = app.findCollectionByNameOrId("payments");
  payments.addIndex("idx_payments_registration", false, "registration", "");
  app.save(payments);
}, (app) => {
  const registrations = app.findCollectionByNameOrId("registrations");
  for (const rule of ["listRule", "viewRule", "updateRule"]) {
    registrations[rule] = registrations[rule].replace(/^\((.*)\) && deleted_by_id = ''$/, "$1");
  }
  registrations.fields.removeByName("deleted_by_id");
  registrations.fields.removeByName("had_discount_credit");
  app.save(registrations);
  const payments = app.findCollectionByNameOrId("payments");
  payments.removeIndex("idx_payments_registration");
  app.save(payments);
});
