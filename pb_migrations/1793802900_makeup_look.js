/// <reference path="../pb_data/types.d.ts" />

// Preferred makeup look, asked at the kiosk when the order includes makeup / grooming,
// so the MUA knows what the client wants (instead of guessing from gender).
// - registrations.makeup_look: "full" | "light" | "grooming" (empty = not asked / older order)
// - registrations.makeup_look_note: optional client note ("no lipstick", allergies, ...)
// - studio_settings.makeup_look_school / makeup_look_walkin: ask it for that type of client
// - organizations.makeup_look_off / session_types.makeup_look_off: don't ask for this school / session
// Checked in registration_validation.pb.js; shown on the MUA queue (studio_stations.pb.js).
migrate((app) => {
  const registrations = app.findCollectionByNameOrId("registrations");
  registrations.fields.add(
    new TextField({ name: "makeup_look", max: 20 }),
    new TextField({ name: "makeup_look_note", max: 200 }),
  );
  app.save(registrations);

  const settings = app.findCollectionByNameOrId("studio_settings");
  settings.fields.add(new BoolField({ name: "makeup_look_school" }), new BoolField({ name: "makeup_look_walkin" }));
  app.save(settings);
  app.db().newQuery("UPDATE studio_settings SET makeup_look_school = TRUE, makeup_look_walkin = TRUE").execute();

  for (const name of ["organizations", "session_types"]) {
    const collection = app.findCollectionByNameOrId(name);
    collection.fields.add(new BoolField({ name: "makeup_look_off" }));
    app.save(collection);
  }
}, (app) => {
  const registrations = app.findCollectionByNameOrId("registrations");
  registrations.fields.removeByName("makeup_look");
  registrations.fields.removeByName("makeup_look_note");
  app.save(registrations);
  const settings = app.findCollectionByNameOrId("studio_settings");
  settings.fields.removeByName("makeup_look_school");
  settings.fields.removeByName("makeup_look_walkin");
  app.save(settings);
  for (const name of ["organizations", "session_types"]) {
    const collection = app.findCollectionByNameOrId(name);
    collection.fields.removeByName("makeup_look_off");
    app.save(collection);
  }
});
