/// <reference path="../pb_data/types.d.ts" />
// Camera hot-folder import: configuration, photographer sessions and scanning.
// The logic lives in studio_camera_import.js.

routerAdd("GET", "/api/studioflow/camera", (e) => {
  const workflow = require(__hooks + "/studio_workflow.js");
  const camera = require(__hooks + "/studio_camera_import.js");
  workflow.staff(e.app, e.auth, ["admin", "photographer"]);
  const stations = e.app.findRecordsByFilter("camera_stations", "", "name", 0, 0);
  return e.json(200, stations.map((station) => camera.status(e.app, station)));
}, $apis.requireAuth("users"));

routerAdd("GET", "/api/studioflow/camera/browse", (e) => {
  const workflow = require(__hooks + "/studio_workflow.js");
  const camera = require(__hooks + "/studio_camera_import.js");
  workflow.staff(e.app, e.auth, ["admin", "photographer"]);
  return e.json(200, camera.browse(e.request.url.query().get("path")));
}, $apis.requireAuth("users"));

routerAdd("POST", "/api/studioflow/camera/browse", (e) => {
  const workflow = require(__hooks + "/studio_workflow.js");
  const camera = require(__hooks + "/studio_camera_import.js");
  workflow.staff(e.app, e.auth, ["admin", "photographer"]);
  const body = e.requestInfo().body || {};
  return e.json(200, camera.createFolder(String(body.path || ""), body.name));
}, $apis.requireAuth("users"));

routerAdd("POST", "/api/studioflow/camera/{id}/{action}", (e) => {
  const workflow = require(__hooks + "/studio_workflow.js");
  const camera = require(__hooks + "/studio_camera_import.js");
  workflow.staff(e.app, e.auth, ["admin", "photographer"]);
  const id = e.request.pathValue("id");
  const body = e.requestInfo().body || {};
  camera.findStation(e.app, id);
  switch (e.request.pathValue("action")) {
    case "scan": camera.scan(e.app, id); break;
    case "start": camera.startSession(e.app, id, String(body.registration || "")); break;
    case "end": camera.endSession(e.app, id, String(body.registration || "")); break;
    case "claim-waiting": camera.claimWaiting(e.app, id); break;
    default: throw new NotFoundError("Unknown camera action.");
  }
  return e.json(200, camera.status(e.app, camera.findStation(e.app, id)));
}, $apis.requireAuth("users"));

// Configuration is edited through the collection API; session state is server-owned.
onRecordCreateRequest((e) => {
  const camera = require(__hooks + "/studio_camera_import.js");
  const name = e.record.getString("name").trim();
  if (!name) throw new BadRequestError("Give the camera a name, such as Booth 1.");
  e.record.set("name", name);
  e.record.set("watch_folder", camera.validateWatchFolder(e.app, e.record.getString("watch_folder"), ""));
  for (const field of camera.sessionFields) e.record.set(field, null);
  e.record.set("session_skip", []);
  return e.next();
}, "camera_stations");

onRecordUpdateRequest((e) => {
  const camera = require(__hooks + "/studio_camera_import.js");
  const before = e.record.original();
  const name = e.record.getString("name").trim();
  if (!name) throw new BadRequestError("Give the camera a name, such as Booth 1.");
  e.record.set("name", name);
  const folder = camera.validateWatchFolder(e.app, e.record.getString("watch_folder"), e.record.id);
  e.record.set("watch_folder", folder);
  for (const field of camera.sessionFields) e.record.set(field, before.get(field));
  // A new folder or a disabled camera ends the current session.
  if (!e.record.getBool("enabled") || folder.toLowerCase() !== before.getString("watch_folder").toLowerCase()) {
    e.record.set("active_registration", "");
    e.record.set("session_skip", []);
    e.record.set("waiting_count", 0);
  }
  return e.next();
}, "camera_stations");

onRecordAfterCreateSuccess((e) => {
  e.next();
  require(__hooks + "/studio_station_events.js").notify(e.app);
}, "camera_stations");

onRecordAfterUpdateSuccess((e) => {
  e.next();
  require(__hooks + "/studio_station_events.js").notify(e.app);
}, "camera_stations");

// A client sent back to makeup mid-shoot leaves the Photo Floor: any camera linked to them is
// unlinked (their last shots are filed first), so the next client's photos can't land in their folder.
onRecordAfterUpdateSuccess((e) => {
  e.next();
  const record = e.record;
  if (record.getString("status") !== "paid" || !record.getString("makeup_service")
    || record.getString("makeup_state") === "completed") return;
  try {
    const camera = require(__hooks + "/studio_camera_import.js");
    for (const station of e.app.findRecordsByFilter("camera_stations", "active_registration = {:id}", "", 0, 0, { id: record.id })) {
      camera.endSession(e.app, station.id, record.id);
    }
  } catch (err) {
    console.log("StudioFlow: could not unlink the camera of a client sent to makeup:", err);
  }
}, "registrations");

// Background safety net: photographer stations also trigger a scan every few
// seconds while the Photo Floor page is open.
cronAdd("studioflow_camera_import", "* * * * *", () => {
  require(__hooks + "/studio_camera_import.js").scanAll($app);
});
