/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const registrations = app.findCollectionByNameOrId("registrations");
  registrations.fields.add(new TextField({ name: "kiosk_request_id", max: 36, hidden: true }));
  registrations.addIndex("idx_registration_kiosk_request", true, "kiosk_request_id", "kiosk_request_id != ''");
  app.save(registrations);
}, (app) => {
  const registrations = app.findCollectionByNameOrId("registrations");
  registrations.removeIndex("idx_registration_kiosk_request");
  registrations.fields.removeByName("kiosk_request_id");
  app.save(registrations);
});
