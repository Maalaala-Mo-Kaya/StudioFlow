// Photo Sender over HTTP (scripts/photo-sender, "network upload" mode).
//
// The sender on the photographer's laptop uploads each finished shot to
// POST /api/studioflow/camera-sender/:id/upload with the camera's key. The shot is written into
// that camera's watch folder exactly as if it had been copied into a shared folder, so the
// normal camera import (studio_camera_import.js) files it into the linked client's folder.
// No Windows file sharing is needed on the server.
//
// Safety:
// - The body is streamed to disk under a dot name (".sf-upload-…", never imported), its size
//   checked against Content-Length, then published under the shot's own name with a hard link,
//   which refuses an existing name (a _2, _3… is added). Nothing is ever overwritten.
// - Each upload carries an id (X-Upload-Id). A retry of an upload that already arrived (the
//   reply was lost) is answered "already" and not saved twice. The ids are kept for 3 days in
//   <watch>/.studioflow-received/.
// - The sender deletes the laptop copy only after a successful reply.
const storage = require(__hooks + "/studio_photo_storage.js");

const receivedDir = ".studioflow-received";
const receivedKeepMs = 3 * 24 * 3600 * 1000;
const senderFile = ".studioflow-sender.json";
const maxUploadBytes = 1 << 30;
const keyAlphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const rawFormats = new Set([
  ".3fr", ".arw", ".cr2", ".cr3", ".crw", ".dng", ".erf", ".iiq", ".kdc", ".mef", ".mos",
  ".nef", ".nrw", ".orf", ".pef", ".raf", ".rw2", ".rwl", ".sr2", ".srf", ".srw", ".x3f",
]);

function text(error) {
  return String(error?.message || error).replace(/^(?:Go)?Error:\s*/, "").slice(0, 300);
}

function findStation(app, id) {
  try { return app.findRecordById("camera_stations", id); } catch (_) {
    throw new NotFoundError("Camera station not found.");
  }
}

// The station whose key the request carries. Wrong camera and wrong key get the same answer.
function authStation(e) {
  const given = String(e.request.header.get("X-Camera-Key") || "");
  let station = null;
  try { station = e.app.findRecordById("camera_stations", e.request.pathValue("id")); } catch (_) { /* below */ }
  const key = station ? station.getString("sender_key") : "";
  if (!station || !key || !given || !$security.equal(key, given)) {
    throw new UnauthorizedError("The camera key was refused. Download the Photo Sender for this camera again.");
  }
  return station;
}

function watchFolder(station) {
  if (!station.getBool("enabled")) {
    throw new ApiError(409, "This camera is turned off in Camera Import. The shots wait on the laptop.");
  }
  const watch = station.getString("watch_folder");
  try { if ($os.stat(watch).isDir()) return watch; } catch (_) { /* below */ }
  throw new ApiError(503, "The camera folder on the server can't be opened. The shots wait on the laptop.");
}

function exists(root, name) {
  try { root.lstat(name); return true; } catch (_) { return false; }
}

function cleanReceived(watch) {
  let entries;
  try { entries = $os.readDir($filepath.join(watch, receivedDir)); } catch (_) { return; }
  const cutoff = Date.now() - receivedKeepMs;
  for (const entry of entries) {
    try {
      if (entry.info().modTime().unixMilli() < cutoff) $os.remove($filepath.join(watch, receivedDir, entry.name()));
    } catch (_) { /* next time */ }
  }
}

// Publishes the partial upload under `name` (or name_2, name_3…). Returns the name used.
function publish(root, partial, name) {
  const ext = $filepath.ext(name);
  const stem = name.slice(0, name.length - ext.length);
  for (let n = 1; n < 10000; n++) {
    const candidate = n === 1 ? name : stem + "_" + n + ext;
    if (exists(root, candidate)) continue;
    try {
      root.link(partial, candidate);
      root.remove(partial);
      return candidate;
    } catch (error) {
      if (exists(root, candidate)) continue;
      // No hard links on this drive (FAT/exFAT): rename, now that the name is known to be free.
      root.rename(partial, candidate);
      return candidate;
    }
  }
  throw new Error("No free file name for " + name);
}

function upload(e) {
  const station = authStation(e);
  const watch = watchFolder(station);
  const name = String(e.request.url.query().get("name") || "").trim();
  const ext = $filepath.ext(name).toLowerCase();
  if (!storage.usableName(name) || /[\\/]/.test(name) || /^[.~$]/.test(name)
    || !(storage.formats[ext] || rawFormats.has(ext))) {
    throw new BadRequestError("Only photo and RAW files can be sent: " + name.slice(0, 120));
  }
  const uploadId = String(e.request.header.get("X-Upload-Id") || "");
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(uploadId)) throw new BadRequestError("Send an X-Upload-Id.");
  const size = e.request.contentLength;
  if (!(size > 0)) throw new BadRequestError("The upload is empty.");
  if (size > maxUploadBytes) throw new ApiError(413, "This file is too large to send.");

  const marker = $filepath.join(watch, receivedDir, $security.sha256(station.id + ":" + uploadId).slice(0, 40));
  try {
    return e.json(200, { status: "already", name: toString($os.readFile(marker), 300) });
  } catch (_) { /* not received yet */ }

  const root = $os.openRoot(watch);
  let partial = "";
  try {
    partial = ".sf-upload-" + $security.randomStringWithAlphabet(16, "abcdefghijklmnopqrstuvwxyz0123456789") + ".part";
    // O_WRONLY | O_CREATE | O_EXCL.
    const file = root.openFile(partial, 0x1 | 0x40 | 0x80, 0o640);
    let written = 0;
    try {
      written = file.readFrom(e.request.body);
      file.sync();
    } finally { file.close(); }
    if (written !== size) throw new BadRequestError("The upload was incomplete (" + written + " of " + size + " bytes). It will be sent again.");
    const saved = publish(root, partial, name);
    partial = "";
    try {
      $os.mkdirAll($filepath.join(watch, receivedDir), 0o750);
      $os.writeFile(marker, saved, 0o640);
    } catch (error) {
      e.app.logger().warn("Photo Sender: could not record an upload id", "camera", station.id, "error", text(error));
    }
    if (Math.random() < 0.05) cleanReceived(watch);
    return e.json(200, { status: "saved", name: saved, size: written });
  } finally {
    if (partial) { try { root.remove(partial); } catch (_) { /* already gone */ } }
    root.close();
  }
}

const statusText = (value, max) => typeof value === "string" ? value.replace(/[\x00-\x1f\x7f]/g, " ").slice(0, max) : "";
const statusCount = (value) => Number.isInteger(value) && value >= 0 && value < 1e9 ? value : null;

// The sender's heartbeat. It is saved as the same status file a shared-folder sender writes,
// so the Photo Floor shows "Photo Sender online / not heard from" the same way.
function heartbeat(e) {
  const station = authStation(e);
  const body = e.requestInfo().body || {};
  const watch = station.getString("watch_folder");
  const status = {
    host: statusText(body.host, 80),
    source: statusText(body.source, 300),
    waiting: statusCount(body.waiting),
    lastSentName: statusText(body.lastSentName, 200),
    lastSentSecondsAgo: statusCount(body.lastSentSecondsAgo),
    error: statusText(body.error, 300),
    via: "upload",
  };
  let folderOk = false;
  try { folderOk = $os.stat(watch).isDir(); } catch (_) { /* reported below */ }
  if (folderOk) {
    try { $os.writeFile($filepath.join(watch, senderFile), JSON.stringify(status), 0o640); } catch (_) { folderOk = false; }
  }
  return e.json(200, {
    camera: station.getString("name"), enabled: station.getBool("enabled"), folderOk,
    importRaw: station.getBool("import_raw"),
  });
}

// The camera's key for the Photo Sender download, made on first use. `reset` makes a new one:
// a laptop with the old key stops sending (its shots wait) until it gets the new download.
function key(app, id, reset) {
  const station = findStation(app, id);
  let value = station.getString("sender_key");
  if (!value || reset) {
    value = $security.randomStringWithAlphabet(40, keyAlphabet);
    station.set("sender_key", value);
    app.save(station);
  }
  return { camera: station.id, name: station.getString("name"), key: value, watchFolder: station.getString("watch_folder") };
}

module.exports = { heartbeat, key, upload };
