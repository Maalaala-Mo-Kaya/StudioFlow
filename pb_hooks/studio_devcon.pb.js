/// <reference path="../pb_data/types.d.ts" />

// Admin → DEV CON (rules in studio_devcon.js). Admin only; the wipe also needs the admin's own
// password and the typed confirmation phrase.

routerAdd("GET", "/api/studioflow/devcon/summary", (e) => {
  require(__hooks + "/studio_workflow.js").staff(e.app, e.auth, ["admin"]);
  e.response.header().set("Cache-Control", "private, no-store");
  return e.json(200, require(__hooks + "/studio_devcon.js").summary(e.app));
}, $apis.requireAuth("users"));

// Chooser photo limit override: { on: true | false }. While on, the chooser may select any number
// of photos (the package's photo selection limit is ignored).
routerAdd("POST", "/api/studioflow/devcon/chooser-override", (e) => {
  const account = require(__hooks + "/studio_workflow.js").staff(e.app, e.auth, ["admin"]);
  const on = (e.requestInfo().body || {}).on;
  if (typeof on !== "boolean") throw new BadRequestError("Send on: true or false.");
  const settings = e.app.findRecordsByFilter("studio_settings", "key = 'main'", "", 1, 0)[0];
  if (!settings) throw new NotFoundError("Studio settings were not found. Restart the server so the latest update is applied.");
  settings.set("chooser_unlimited", on);
  e.app.save(settings);
  e.app.logger().info("DEV CON: chooser photo limit override " + (on ? "ON" : "OFF"), "by", account.getString("username"));
  require(__hooks + "/studio_station_events.js").notify(e.app);
  return e.json(200, { chooserUnlimited: on });
}, $apis.requireAuth("users"));

routerAdd("POST", "/api/studioflow/devcon/wipe-clients", (e) => {
  const devcon = require(__hooks + "/studio_devcon.js");
  const account = require(__hooks + "/studio_workflow.js").staff(e.app, e.auth, ["admin"]);
  const body = e.requestInfo().body || {};
  const password = typeof body.password === "string" ? body.password : "";
  if (!password || !account.validatePassword(password)) {
    e.app.logger().warn("DEV CON: wrong admin password", "by", account.getString("username"));
    throw new BadRequestError("Wrong admin password. Nothing was deleted.");
  }
  if (String(body.confirm || "").trim() !== devcon.confirmPhrase) {
    throw new BadRequestError('Type "' + devcon.confirmPhrase + '" to confirm. Nothing was deleted.');
  }
  return e.json(200, devcon.wipe(e, { photos: body.photos === true }));
}, $apis.requireAuth("users"));
