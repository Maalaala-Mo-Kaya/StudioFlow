/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const payments = app.findCollectionByNameOrId("payments");
  payments.fields.add(new TextField({ name: "status" }));
  app.save(payments);
  app.db().newQuery("UPDATE payments SET status = 'completed' WHERE status = '' OR status IS NULL").execute();
}, (app) => {
  const payments = app.findCollectionByNameOrId("payments");
  payments.fields.removeByName("status");
  app.save(payments);
});
