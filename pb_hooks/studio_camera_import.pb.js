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
  const account = workflow.staff(e.app, e.auth, ["admin", "photographer"]);
  const id = e.request.pathValue("id");
  const body = e.requestInfo().body || {};
  const station = camera.findStation(e.app, id);
  const action = e.request.pathValue("action");
  // Another photographer's session: anyone may free the camera ("end" first files the last shots
  // to the client who was linked), but only the photographer who linked it, or an admin, may link
  // a new client or hand it the waiting files.
  const owner = station.getString("session_photographer");
  if ((action === "start" || action === "claim-waiting") && station.getString("active_registration") && owner
    && owner !== e.auth.id && account.getString("role") !== "admin") {
    let who = "another photographer";
    try {
      const user = e.app.findRecordById("users", owner);
      who = user.getString("name") || user.getString("username") || who;
    } catch (_) { /* removed account */ }
    throw new ForbiddenError("This camera is still linked to a client by " + who + ". Press Return to Queue on that client first.");
  }
  switch (action) {
    case "scan": camera.scan(e.app, id); break;
    case "start":
      // An admin taking over another photographer's camera: end that session first (its last shots
      // go to the client who was linked), then link the new client under the admin.
      if (owner && owner !== e.auth.id && station.getString("active_registration") && !station.getString("session_task")) {
        camera.endSession(e.app, id, "");
      }
      camera.startSession(e.app, id, String(body.registration || ""), e.auth.id);
      break;
    case "end": camera.endSession(e.app, id, String(body.registration || "")); break;
    case "claim-waiting": camera.claimWaiting(e.app, id, e.auth.id); break;
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
  // The Photo Sender key is made only by /api/studioflow/camera-sender/:id/key.
  if (e.record.collection().fields.getByName("sender_key")) e.record.set("sender_key", "");
  return e.next();
}, "camera_stations");

onRecordUpdateRequest((e) => {
  const camera = require(__hooks + "/studio_camera_import.js");
  const app = e.app;
  return app.runInTransaction((tx) => {
    tx.db().newQuery("UPDATE camera_stations SET id = id WHERE id = {:id}").bind({ id: e.record.id }).execute();
    const before = camera.findStation(tx, e.record.id);
    const name = e.record.getString("name").trim();
    if (!name) throw new BadRequestError("Give the camera a name, such as Booth 1.");
    e.record.set("name", name);
    const folder = camera.validateWatchFolder(tx, e.record.getString("watch_folder"), e.record.id);
    e.record.set("watch_folder", folder);
    for (const field of camera.sessionFields) e.record.set(field, before.get(field));
    if (e.record.collection().fields.getByName("sender_key")) e.record.set("sender_key", before.getString("sender_key"));
    const changedFolder = folder.toLowerCase() !== before.getString("watch_folder").toLowerCase();
    if (changedFolder || !e.record.getBool("enabled") || e.record.getBool("import_raw") !== before.getBool("import_raw")
      || e.record.getBool("include_subfolders") !== before.getBool("include_subfolders")) {
      if (before.getString("session_task")) throw new ApiError(409, "Finish syncing the linked photography session before changing its import settings.");
    }
    // Legacy camera sessions end when their folder changes or the camera is disabled.
    if (changedFolder || !e.record.getBool("enabled")) {
      e.record.set("active_registration", "");
      e.record.set("session_photographer", "");
      e.record.set("session_skip", []);
      e.record.set("waiting_count", 0);
    }
    e.app = tx;
    try { return e.next(); } finally { e.app = app; }
  });
}, "camera_stations");

onRecordDeleteRequest((e) => {
  const camera = require(__hooks + "/studio_camera_import.js");
  const app = e.app;
  return app.runInTransaction((tx) => {
    tx.db().newQuery("UPDATE camera_stations SET id = id WHERE id = {:id}").bind({ id: e.record.id }).execute();
    if (camera.findStation(tx, e.record.id).getString("session_task")) {
      throw new ApiError(409, "Finish syncing the linked photography session before deleting the camera.");
    }
    e.app = tx;
    try { return e.next(); } finally { e.app = app; }
  });
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
      if (station.getString("session_task")) camera.scan(e.app, station.id);
      else camera.endSession(e.app, station.id, record.id);
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
