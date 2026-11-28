/// <reference path="../pb_data/types.d.ts" />
// Photo Sender over HTTP (rules in studio_camera_sender.js).

// Called by the Photo Sender with the camera key (X-Camera-Key), not a staff login.
routerAdd("POST", "/api/studioflow/camera-sender/{id}/upload", (e) => {
  return require(__hooks + "/studio_camera_sender.js").upload(e);
}, $apis.bodyLimit(1 << 30));

routerAdd("POST", "/api/studioflow/camera-sender/{id}/status", (e) => {
  return require(__hooks + "/studio_camera_sender.js").heartbeat(e);
}, $apis.bodyLimit(16384));

// The key for the Photo Sender download (admin or photographer). Made on first use.
routerAdd("GET", "/api/studioflow/camera-sender/{id}/key", (e) => {
  require(__hooks + "/studio_workflow.js").staff(e.app, e.auth, ["admin", "photographer"]);
  e.response.header().set("Cache-Control", "private, no-store");
  return e.json(200, require(__hooks + "/studio_camera_sender.js").key(e.app, e.request.pathValue("id"), false));
}, $apis.requireAuth("users"));

// A new key (admin only): a laptop with the old download stops sending until it gets the new one.
routerAdd("POST", "/api/studioflow/camera-sender/{id}/key/reset", (e) => {
  const account = require(__hooks + "/studio_workflow.js").staff(e.app, e.auth, ["admin"]);
  const result = require(__hooks + "/studio_camera_sender.js").key(e.app, e.request.pathValue("id"), true);
  e.app.logger().warn("Photo Sender key reset", "camera", result.camera, "by", account.getString("username"));
  e.response.header().set("Cache-Control", "private, no-store");
  return e.json(200, result);
}, $apis.requireAuth("users"), $apis.bodyLimit(1024));
