/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const registrations = app.findCollectionByNameOrId("registrations");
  registrations.fields.add(new NumberField({ name: "makeup_version", min: 0, onlyInt: true, hidden: true }));
  app.save(registrations);
}, (app) => {
  const registrations = app.findCollectionByNameOrId("registrations");
  registrations.fields.removeByName("makeup_version");
  app.save(registrations);
});
