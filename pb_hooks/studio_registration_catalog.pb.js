/// <reference path="../pb_data/types.d.ts" />

const { COLLECTIONS } = require(__hooks + "/studio_registration_catalog.js");

onRecordAfterCreateSuccess((e) => {
  e.next();
  require(__hooks + "/studio_station_events.js").notify(e.app, require(__hooks + "/studio_registration_catalog.js").TOPIC);
}, ...COLLECTIONS);
onRecordAfterUpdateSuccess((e) => {
  e.next();
  require(__hooks + "/studio_station_events.js").notify(e.app, require(__hooks + "/studio_registration_catalog.js").TOPIC);
}, ...COLLECTIONS);
onRecordAfterDeleteSuccess((e) => {
  e.next();
  require(__hooks + "/studio_station_events.js").notify(e.app, require(__hooks + "/studio_registration_catalog.js").TOPIC);
}, ...COLLECTIONS);
