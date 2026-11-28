/// <reference path="../pb_data/types.d.ts" />
// Shoot gallery on the Photo Floor (delete / restore bad shots before the
// Chooser sees them). The rules live in studio_shoot_review.js.

routerAdd("GET", "/api/studioflow/shoot/{id}/photos", (e) => {
  const review = require(__hooks + "/studio_shoot_review.js");
  e.response.header().set("Cache-Control", "no-store");
  return e.json(200, review.list(e.app, e.request.pathValue("id"), e.auth));
}, $apis.requireAuth("users"));

routerAdd("GET", "/api/studioflow/shoot/{id}/image/{photo}", (e) => {
  const review = require(__hooks + "/studio_shoot_review.js");
  const query = e.request.url.query();
  return review.image(e.app, e.request.pathValue("id"), e.auth, e.request.pathValue("photo"), query.get("name"),
    query.get("deleted") === "1", (file, mime) => {
      e.response.header().set("Cache-Control", "private, no-store");
      e.response.header().set("X-Content-Type-Options", "nosniff");
      return e.stream(200, mime, file);
    });
}, $apis.requireAuth("users"));

// Card upload (photos shot untethered): one file per request, raw body, ?name=<file name>.
routerAdd("POST", "/api/studioflow/shoot-upload/{id}", (e) => {
  return e.json(200, require(__hooks + "/studio_shoot_review.js").upload(e));
}, $apis.requireAuth("users"), $apis.bodyLimit(1 << 30));

routerAdd("POST", "/api/studioflow/shoot-upload/{id}/done", (e) => {
  const body = e.requestInfo().body || {};
  return e.json(200, require(__hooks + "/studio_shoot_review.js").uploadDone(e.app, e.request.pathValue("id"), e.auth, body.count));
}, $apis.requireAuth("users"), $apis.bodyLimit(1024));

routerAdd("POST", "/api/studioflow/shoot/{id}/{action}", (e) => {
  const review = require(__hooks + "/studio_shoot_review.js");
  const action = e.request.pathValue("action");
  const body = e.requestInfo().body || {};
  if (action === "reshoot") return e.json(200, review.reshoot(e.app, e.request.pathValue("id"), e.auth, body.reason, body.taskId));
  if (action === "retake") return e.json(200, review.retake(e.app, e.request.pathValue("id"), e.auth, body.reason));
  if (action === "retag") return e.json(200, review.retag(e.app, e.request.pathValue("id"), e.auth, body.photo, body.code));
  if (action !== "delete" && action !== "restore") throw new NotFoundError();
  return e.json(200, review.change(e.app, e.request.pathValue("id"), e.auth, body.photos, action === "restore"));
}, $apis.requireAuth("users"), $apis.bodyLimit(256 << 10));
