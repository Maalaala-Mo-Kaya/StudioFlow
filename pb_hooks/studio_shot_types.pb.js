/// <reference path="../pb_data/types.d.ts" />
// Shot types (rules in studio_shot_types.js). The list is edited by the admin through the
// collection API; these hooks keep its codes usable as file-name labels.

routerAdd("GET", "/api/studioflow/shot-types", (e) => {
  e.response.header().set("Cache-Control", "no-store");
  return e.json(200, require(__hooks + "/studio_shot_types.js").listing(e.app, e.auth));
}, $apis.requireAuth("users"));

// The photographer's own menu: { types: [shot type ids] }.
routerAdd("POST", "/api/studioflow/shot-menu", (e) => {
  const types = require(__hooks + "/studio_shot_types.js");
  const body = e.requestInfo().body || {};
  types.saveMenu(e.app, e.auth, body.types);
  return e.json(200, types.listing(e.app, e.auth));
}, $apis.requireAuth("users"), $apis.bodyLimit(16384));

onRecordCreateRequest((e) => {
  require(__hooks + "/studio_shot_types.js").clean(e, null);
  return e.next();
}, "shot_types");

onRecordUpdateRequest((e) => {
  require(__hooks + "/studio_shot_types.js").clean(e, e.app.findRecordById("shot_types", e.record.id));
  return e.next();
}, "shot_types");

for (const hook of [onRecordAfterCreateSuccess, onRecordAfterUpdateSuccess, onRecordAfterDeleteSuccess]) {
  hook((e) => {
    e.next();
    require(__hooks + "/studio_station_events.js").notify(e.app);
  }, "shot_types");
}
