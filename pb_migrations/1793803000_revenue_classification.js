/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  for (const name of ["packages", "add_ons"]) {
    const catalog = app.findCollectionByNameOrId(name);
    catalog.fields.add(new SelectField({ name: "revenue_category", values: ["studio", "mua"] }));
    // PocketBase's required NumberField treats zero as blank, but zero is a valid catalog price.
    catalog.fields.getByName("amount").required = false;
    app.save(catalog);
    // Existing catalog records deliberately need review. No current classification is
    // copied into past sales, and makeup routing flags don't establish ownership.
  }
  const orders = app.findCollectionByNameOrId("registrations");
  orders.fields.getByName("package_snapshot").hidden = false;
  orders.fields.add(
    new JSONField({ name: "revenue_terms" }),
    new JSONField({ name: "revenue_review" }),
    new JSONField({ name: "revenue_discount" }),
  );
  app.save(orders);
}, (app) => {
  for (const name of ["packages", "add_ons"]) {
    const catalog = app.findCollectionByNameOrId(name);
    catalog.fields.removeByName("revenue_category");
    catalog.fields.getByName("amount").required = true;
    app.save(catalog);
  }
  const orders = app.findCollectionByNameOrId("registrations");
  orders.fields.getByName("package_snapshot").hidden = true;
  for (const name of ["revenue_terms", "revenue_review", "revenue_discount"]) orders.fields.removeByName(name);
  app.save(orders);
});
