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
  // The Photo Floor is shared: any photographer (or admin) may link, unlink or take over any camera.
  // Taking over another photographer's session ends it first, so its last shots still go to the
  // client who was linked (and that visit is recorded) before the camera changes hands.
  // Assigned photography sessions (session_task) keep their own rules (Mark Done).
  const owner = station.getString("session_photographer");
  const takeover = !!owner && owner !== account.id && !!station.getString("active_registration") && !station.getString("session_task");
  switch (action) {
    case "scan": camera.scan(e.app, id); break;
    case "start":
      if (takeover) camera.endSession(e.app, id, "");
      camera.startSession(e.app, id, String(body.registration || ""), e.auth.id);
      break;
    case "end": camera.endSession(e.app, id, String(body.registration || "")); break;
    case "claim-waiting": camera.claimWaiting(e.app, id, owner || e.auth.id); break;
    case "shot-type": camera.setShotType(e.app, id, body.code); break;
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

// A single-session client who is done shooting (or cancelled / released) leaves every camera still
// linked to them: each camera first files its last shots to them, then unlinks. So no shot lands in
// the folder while the Chooser works on it, and no camera stays tied to a finished client.
// Assigned photography sessions (session_task) finish through Mark Done instead.
onRecordAfterUpdateSuccess((e) => {
  e.next();
  const status = e.record.getString("status");
  if (!["done_shooting", "completed", "ready_for_pickup", "released", "cancelled"].includes(status)) return;
  try {
    const camera = require(__hooks + "/studio_camera_import.js");
    const linked = e.app.findRecordsByFilter("camera_stations", "active_registration = {:id} && session_task = ''",
      "", 0, 0, { id: e.record.id });
    for (const station of linked) camera.endSession(e.app, station.id, e.record.id);
  } catch (err) {
    console.log("StudioFlow: could not unlink the cameras of a finished client:", err);
  }
}, "registrations");

// Background safety net: photographer stations also trigger a scan every few
// seconds while the Photo Floor page is open.
cronAdd("studioflow_camera_import", "* * * * *", () => {
  require(__hooks + "/studio_camera_import.js").scanAll($app);
});
