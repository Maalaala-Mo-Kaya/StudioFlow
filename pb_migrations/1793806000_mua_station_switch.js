/// <reference path="../pb_data/types.d.ts" />

// Admin → DEV CON: the MUA station can be turned off.
// - studio_settings.mua_station_off: while on, paid clients with makeup or grooming skip the MUA
//   queue and go straight to the photographers (studio_mua_station.js). The money is unchanged.
// - registrations.makeup_skipped: server-owned; the client's MUA services were not done through the
//   MUA station, so no artist is credited. MUA Payouts lists them with the shared MUA money.
migrate((app) => {
  const settings = app.findCollectionByNameOrId("studio_settings");
  if (!settings.fields.getByName("mua_station_off")) settings.fields.add(new BoolField({ name: "mua_station_off" }));
  app.save(settings);
  const registrations = app.findCollectionByNameOrId("registrations");
  if (!registrations.fields.getByName("makeup_skipped")) registrations.fields.add(new BoolField({ name: "makeup_skipped" }));
  app.save(registrations);
}, (app) => {
  const registrations = app.findCollectionByNameOrId("registrations");
  registrations.fields.removeByName("makeup_skipped");
  app.save(registrations);
  const settings = app.findCollectionByNameOrId("studio_settings");
  settings.fields.removeByName("mua_station_off");
  app.save(settings);
});
