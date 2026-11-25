/// <reference path="../pb_data/types.d.ts" />

// - registrations.photo_notes: the chooser's note for each selected photo, for the editor
//   ([{ path, name, note }], keyed by the photo's path after the selection was saved). Server-owned:
//   written only by the chooser confirm route (studio_photo_selection.js).
// - studio_settings.chooser_unlimited: Admin → DEV CON override. While on, the chooser may select
//   any number of photos, ignoring the package's photo selection limit.
migrate((app) => {
  const orders = app.findCollectionByNameOrId("registrations");
  if (!orders.fields.getByName("photo_notes")) orders.fields.add(new JSONField({ name: "photo_notes" }));
  app.save(orders);
  const settings = app.findCollectionByNameOrId("studio_settings");
  if (!settings.fields.getByName("chooser_unlimited")) settings.fields.add(new BoolField({ name: "chooser_unlimited" }));
  app.save(settings);
}, (app) => {
  const orders = app.findCollectionByNameOrId("registrations");
  orders.fields.removeByName("photo_notes");
  app.save(orders);
  const settings = app.findCollectionByNameOrId("studio_settings");
  settings.fields.removeByName("chooser_unlimited");
  app.save(settings);
});
