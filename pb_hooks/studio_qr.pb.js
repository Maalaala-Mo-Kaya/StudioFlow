/// <reference path="../pb_data/types.d.ts" />

routerAdd("GET", "/api/studioflow/qr-codes", (e) => {
  require(__hooks + "/studio_workflow.js").staff(e.app, e.auth, ["admin"]);
  const qr = require(__hooks + "/studio_qr.js");
  qr.noStore(e);
  return e.json(200, e.app.findRecordsByFilter(qr.COLLECTION, "", "-created,-id", 0, 0).map(qr.summary));
}, $apis.requireAuth("users"));

routerAdd("POST", "/api/studioflow/qr-codes", (e) => {
  require(__hooks + "/studio_workflow.js").staff(e.app, e.auth, ["admin"]);
  const qr = require(__hooks + "/studio_qr.js");
  qr.noStore(e);
  const body = e.requestInfo().body || {};
  let saved;
  e.app.runInTransaction((tx) => {
    // Serialize initialization of the encryption key with other Wi-Fi saves.
    if (body.kind === "wifi") tx.db().newQuery("UPDATE qr_codes SET id = id WHERE 0").execute();
    const record = new Record(tx.findCollectionByNameOrId(qr.COLLECTION));
    qr.update(tx, record, body, true);
    tx.save(record);
    saved = qr.summary(record);
  });
  return e.json(201, saved);
}, $apis.requireAuth("users"), $apis.bodyLimit(16384));

routerAdd("PATCH", "/api/studioflow/qr-codes/{id}", (e) => {
  require(__hooks + "/studio_workflow.js").staff(e.app, e.auth, ["admin"]);
  const qr = require(__hooks + "/studio_qr.js");
  qr.noStore(e);
  const body = e.requestInfo().body || {};
  const id = e.request.pathValue("id");
  let saved;
  e.app.runInTransaction((tx) => {
    // Serialize edits and status changes before reading the current record.
    const match = tx.db().newQuery("UPDATE qr_codes SET id = id WHERE id = {:id}").bind({ id }).execute();
    if (!match.rowsAffected()) throw new NotFoundError("QR code not found.");
    const record = tx.findRecordById(qr.COLLECTION, id);
    if (Object.keys(body).length === 1 && typeof body.disabled === "boolean") {
      if (record.getString("kind") === "wifi") throw new BadRequestError("Wi-Fi QR codes are static.");
      record.set("disabled", body.disabled);
    } else {
      qr.update(tx, record, body, false);
    }
    tx.save(record);
    saved = qr.summary(record);
  });
  return e.json(200, saved);
}, $apis.requireAuth("users"), $apis.bodyLimit(16384));

routerAdd("POST", "/api/studioflow/qr-codes/{id}/wifi-password", (e) => {
  require(__hooks + "/studio_workflow.js").staff(e.app, e.auth, ["admin"]);
  const qr = require(__hooks + "/studio_qr.js");
  qr.noStore(e);
  const records = e.app.findRecordsByIds(qr.COLLECTION, [e.request.pathValue("id")]);
  const record = records[0];
  if (!record || record.getString("kind") !== "wifi" || !record.getString("wifi_ciphertext")) {
    throw new NotFoundError("This Wi-Fi connection has no saved password.");
  }
  const credentials = require(__hooks + "/studio_wifi_credentials.js");
  return e.json(200, { password: credentials.decrypt(e.app, record.getString("wifi_ciphertext")) });
}, $apis.requireAuth("users"), $apis.bodyLimit(1024));

routerAdd("DELETE", "/api/studioflow/qr-codes/{id}", (e) => {
  require(__hooks + "/studio_workflow.js").staff(e.app, e.auth, ["admin"]);
  const qr = require(__hooks + "/studio_qr.js");
  qr.noStore(e);
  const records = e.app.findRecordsByIds(qr.COLLECTION, [e.request.pathValue("id")]);
  if (!records.length) throw new NotFoundError("QR code not found.");
  e.app.delete(records[0]);
  return e.noContent(204);
}, $apis.requireAuth("users"));

routerAdd("GET", "/q/{slug}", (e) => require(__hooks + "/studio_qr.js").publicLink(e, false));
routerAdd("POST", "/q/{slug}", (e) => require(__hooks + "/studio_qr.js").publicLink(e, true), $apis.bodyLimit(4096));

cronAdd("studioflow_qr_attempt_cleanup", "*/10 * * * *", () => {
  require(__hooks + "/studio_qr.js").pruneAttempts($app);
});
