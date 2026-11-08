/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const registrations = app.findCollectionByNameOrId("registrations");
  registrations.fields.getByName("mobile_number").required = false;
  app.save(registrations);
}, (app) => {
  const registrations = app.findCollectionByNameOrId("registrations");
  registrations.fields.getByName("mobile_number").required = true;
  app.save(registrations);
});
