/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const registrations = app.findCollectionByNameOrId("registrations");
  registrations.fields.add(
    new DateField({ name: "pictorial_date" }),
    new JSONField({ name: "package_snapshot", hidden: true }),
  );
  app.save(registrations);

  // Keep the package identity if a catalog entry is later deleted. Older
  // registrations still derive the charge from their saved bill.
  app.db().newQuery(`
    UPDATE registrations AS r
    SET package_snapshot = json_object('id', p.id, 'code', p.code, 'name', p.name, 'configuredAmount', p.amount)
    FROM packages AS p WHERE p.id = r.package
  `).execute();
}, (app) => {
  const registrations = app.findCollectionByNameOrId("registrations");
  registrations.fields.removeByName("pictorial_date");
  registrations.fields.removeByName("package_snapshot");
  app.save(registrations);
});
