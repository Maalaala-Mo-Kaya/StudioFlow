// Shoot gallery on the Photo Floor: while a client is on set, the photographer
// sees the shots the camera import has moved into the client's folder and can
// delete the ones that didn't come out well, before the Chooser sees them.
//
// Rules:
// - Deleting never removes a file from disk. The photo (and its RAW twin) moves
//   into <client folder>/_DELETED/, which the gallery inventory, the Chooser and
//   photo counts never read. Restore moves it back.
// - Only photos in the top of the job folder can be deleted. Photos already in
//   the selected / unselected folders (a re-shoot) are never touched.
// - Moves use an exclusive hard link + remove, so an existing file is never
//   overwritten (the same pattern as the Chooser's selection moves).
// - Viewing: admin or any photographer. Changes: admin, or the photographer
//   whose camera is linked to this client, until Mark Done.
const workflow = require(__hooks + "/studio_workflow.js");
const storage = require(__hooks + "/studio_photo_storage.js");

const trash = "_DELETED";
const trashRaw = trash + "/RAW";
const maxBatch = 200;
// Import prefix of an attributed shot: sf-<task>-<photographer>-<random>-<original stem>.
const importPrefix = /^(sf-(?:primary|[a-z0-9]{12})-[a-z0-9]{15}-)[a-z0-9]{20}-/;

function load(app, id) {
  try { return app.findRecordById("registrations", id); } catch (_) {
    throw new NotFoundError("Registration not found.");
  }
}

// Which shot a file is: the same key for a JPEG and the RAW the camera wrote with it (the
// JPEG's shot type label is left out: RAW files are never tagged).
function shotKey(raw) {
  const name = require(__hooks + "/studio_shot_types.js").untagged(raw);
  const ext = $filepath.ext(name);
  const stem = name.slice(0, name.length - ext.length);
  const match = stem.match(importPrefix);
  return (match ? match[1] + stem.slice(match[0].length) : stem).toLowerCase();
}

function linkedStation(app, record, userId) {
  return app.findRecordsByFilter("camera_stations",
    "active_registration = {:reg} && session_photographer = {:user}", "", 1, 0,
    { reg: record.id, user: userId })[0] || null;
}

// Why the caller can't change this shoot, or "" when they can. The Photo Floor is shared: any
// photographer (or admin) may delete and restore shots, camera linked or not, until the Chooser or
// production starts (the same rule as adding photos from a card or a re-shoot).
function editBlock(app, record, account) {
  const block = uploadBlock(record);
  if (block) return block;
  // An assigned session that is syncing its last shots: wait for it, so a shot isn't deleted mid-move.
  const station = linkedStation(app, record, account.id);
  if (station && station.getInt("session_finishing")) return "Mark Done was clicked. The last shots are syncing.";
  return "";
}

function withFolder(app, record, create, work) {
  let folder;
  let root;
  try {
    folder = storage.photoFolder(app, record);
    root = storage.openStudent(folder, create);
  } catch (error) {
    if (error.status === 409) throw error;
    throw new ApiError(503, "Photo storage is temporarily unavailable.");
  }
  if (!root) return work(null, folder);
  try { return work(root, folder); } finally { root.close(); }
}

function readDirSafe(root, dir) {
  const info = storage.statEntry(root, dir);
  if (!info) return [];
  if (!info.isDir()) throw new ApiError(503, "The " + dir + " folder of this client is not a folder.");
  const handle = root.open(dir);
  try { return handle.readDir(-1); } finally { handle.close(); }
}

function describe(path, name, info, origins) {
  const types = require(__hooks + "/studio_shot_types.js");
  const origin = origins?.get(types.originKey(name));
  return {
    id: $security.sha256(path),
    name,
    type: types.tagOf(name),
    // Where the shot came from: a camera id or "card" (with who uploaded it); "" when not recorded.
    camera: origin?.camera || "",
    by: origin?.photographer || "",
    byName: origin?.photographerName || "",
    size: info.size(),
    modified: Math.floor(info.modTime().unixMilli()),
  };
}

function shots(root, folder, origins) {
  if (!root) return { photos: [], deleted: [] };
  let photos;
  try {
    photos = storage.inventory(root, folder).filter((item) => item.group === "");
  } catch (_) {
    throw new ApiError(503, "The photo folder could not be read. Try again after storage is available.");
  }
  const kept = photos.map((item) => describe(item.path, item.name, storage.statEntry(root, item.path), origins));
  const deleted = [];
  for (const entry of readDirSafe(root, trash)) {
    const name = entry.name();
    if (!storage.usableName(name) || !entry.type().isRegular() || !storage.formats[$filepath.ext(name).toLowerCase()]) continue;
    const path = trash + "/" + name;
    const info = storage.statEntry(root, path);
    if (!storage.photoMime(root, path, info)) continue;
    deleted.push(describe(path, name, info, origins));
  }
  const newest = (a, b) => b.modified - a.modified || (a.name < b.name ? -1 : Number(a.name > b.name));
  return { photos: kept.sort(newest), deleted: deleted.sort(newest) };
}

function list(app, id, auth) {
  const account = workflow.staff(app, auth, ["admin", "photographer"]);
  const record = load(app, id);
  const block = editBlock(app, record, account);
  const origins = require(__hooks + "/studio_shot_types.js").origins(app, record.id);
  const result = withFolder(app, record, false, (root, folder) => shots(root, folder, origins));
  const packageTypes = require(__hooks + "/studio_shot_types.js").packageCodes(app, record);
  return { ...result, packageTypes, canEdit: !block, reason: block };
}

// Checks a photo the client sent: the name must be a plain file name and the id its path's hash.
function resolve(root, dir, photo) {
  const name = String(photo?.name || "");
  const path = dir ? dir + "/" + name : name;
  if (!storage.usableName(name) || $security.sha256(path) !== String(photo?.id || "")) {
    throw new NotFoundError("Photo not found.");
  }
  if (!storage.photoMime(root, path, storage.statEntry(root, path))) throw new NotFoundError("Photo not found: " + name);
  return { name, path };
}

// Opens one shot and hands it to `send(file, mime)` while the folder is still open.
function image(app, id, auth, photoId, name, deleted, send) {
  workflow.staff(app, auth, ["admin", "photographer"]);
  const record = load(app, id);
  return withFolder(app, record, false, (root) => {
    if (!root) throw new NotFoundError("Photo not found.");
    const { path } = resolve(root, deleted ? trash : "", { id: photoId, name });
    const mime = storage.photoMime(root, path, storage.statEntry(root, path));
    const file = root.open(path);
    try {
      if (!file.stat().mode().isRegular()) throw new NotFoundError("Photo not found.");
      return send(file, mime);
    } finally { file.close(); }
  });
}

// A file name in `dir` that is free, keeping the original name when possible.
function freeName(root, dir, name) {
  const ext = $filepath.ext(name);
  const stem = name.slice(0, name.length - ext.length);
  for (let n = 1; n < 10000; n++) {
    const candidate = n === 1 ? name : stem + "_" + n + ext;
    if (!storage.statEntry(root, dir ? dir + "/" + candidate : candidate)) return candidate;
  }
  throw new Error("No free file name for " + name);
}

// Moves one file between folders of the client root without ever overwriting.
function moveFile(root, from, toDir, name) {
  const target = freeName(root, toDir, name);
  const to = toDir ? toDir + "/" + target : target;
  root.link(from, to);
  root.remove(from);
  return target;
}

function rawTwins(root, dir, key) {
  return readDirSafe(root, dir)
    .filter((entry) => entry.type().isRegular() && storage.usableName(entry.name())
      && !storage.formats[$filepath.ext(entry.name()).toLowerCase()] && shotKey(entry.name()) === key)
    .map((entry) => entry.name());
}

function change(app, id, auth, photos, restore) {
  if (!Array.isArray(photos) || !photos.length) throw new BadRequestError("Choose at least one photo.");
  if (photos.length > maxBatch) throw new BadRequestError("Choose at most " + maxBatch + " photos at a time.");
  const result = workflow.withRegistration(app, id, (tx, record) => {
    const account = workflow.staff(tx, auth, ["admin", "photographer"]);
    const block = editBlock(tx, record, account);
    if (block) throw new ApiError(409, block);
    return withFolder(tx, record, true, (root, folder) => {
      if (!root) throw new ApiError(503, "The client's photo folder is not available.");
      const from = restore ? trash : "";
      const to = restore ? "" : trash;
      const unique = [...new Map(photos.map((photo) => [String(photo?.id || ""), photo])).values()];
      const checked = unique.map((photo) => resolve(root, from, photo));
      const types = require(__hooks + "/studio_shot_types.js");
      const known = types.origins(tx, record.id);
      for (const photo of checked) types.checkOwner(known, account, photo.name);
      root.mkdirAll(restore ? "RAW" : trashRaw, 0o750);
      const moved = [];
      try {
        for (const photo of checked) {
          const name = moveFile(root, photo.path, to, photo.name);
          for (const raw of rawTwins(root, restore ? trashRaw : "RAW", shotKey(photo.name))) {
            moveFile(root, (restore ? trashRaw : "RAW") + "/" + raw, restore ? "RAW" : trashRaw, raw);
          }
          moved.push(name);
        }
      } catch (error) {
        app.logger().warn("Shoot review move failed", "registration", record.id, "error", String(error));
        throw new ApiError(503, "Some photos could not be moved (" + moved.length + " of " + checked.length + " done). Try again.");
      }
      return { moved, ...shots(root, folder, require(__hooks + "/studio_shot_types.js").origins(tx, record.id)), canEdit: true, reason: "" };
    });
  });
  require(__hooks + "/studio_station_events.js").notify(app);
  return result;
}

// A name free in the job folder and both selection folders (as the camera import does), so a
// later Chooser move never meets the same name.
function freeAcross(root, folder, name) {
  const groups = ["", ...Object.values(storage.photoDirectories(root, folder))];
  const ext = $filepath.ext(name);
  const stem = name.slice(0, name.length - ext.length);
  for (let n = 1; n < 10000; n++) {
    const candidate = n === 1 ? name : stem + "_" + n + ext;
    if (groups.every((group) => !storage.statEntry(root, group ? group + "/" + candidate : candidate))) return candidate;
  }
  throw new Error("No free file name for " + name);
}

// Sets the shot type of one kept shot (renames it; the RAW twin keeps its name). Same rules as delete.
function retag(app, id, auth, photo, rawCode) {
  const types = require(__hooks + "/studio_shot_types.js");
  const code = types.checkCode(app, rawCode);
  const result = workflow.withRegistration(app, id, (tx, record) => {
    const account = workflow.staff(tx, auth, ["admin", "photographer"]);
    const block = editBlock(tx, record, account);
    if (block) throw new ApiError(409, block);
    return withFolder(tx, record, false, (root, folder) => {
      if (!root) throw new ApiError(503, "The client's photo folder is not available.");
      const shot = resolve(root, "", photo);
      types.checkOwner(types.origins(tx, record.id), account, shot.name);
      let name = shot.name;
      if (types.tagOf(name) !== code) {
        name = freeAcross(root, folder, types.tagged(shot.name, code));
        try {
          root.link(shot.path, name);
          root.remove(shot.path);
        } catch (error) {
          app.logger().warn("Shot type change failed", "registration", record.id, "error", String(error));
          throw new ApiError(503, "The shot type could not be changed. Try again.");
        }
      }
      return { renamed: name, ...shots(root, folder, types.origins(tx, record.id)), canEdit: true, reason: "" };
    });
  });
  require(__hooks + "/studio_station_events.js").notify(app);
  return result;
}

// Re-shoot: a client marked Done shooting goes back on set (status shooting), so the
// photographer can take more shots into the same folder. Only before the Chooser has started
// (a retake after choosing is a paid retake handled by the admin and cashier) and before
// production. Each re-shoot is logged in registrations.photo_reshoots.
const chooserStarted = "The Chooser has already started on this client's photos. A retake now goes through the admin.";

// Orders with photography sessions (e.g. "Group shots" by one photographer, "Solo" by another)
// reopen one finished session: the client may still be on the floor for another session.
function reshootBlock(record, withSessions) {
  const status = record.getString("status");
  if (withSessions ? !["shooting", "done_shooting"].includes(status)
    : status !== "done_shooting" || !record.getBool("shoot_completed")) {
    return "Only a client marked Done shooting can be re-shot.";
  }
  if (!["", "none", "pending_framing"].includes(record.getString("framing_status"))) {
    return "Production has started on this order, so it can't be re-shot here.";
  }
  if (!["", "pending_shoot", "shot_raw"].includes(record.getString("photo_status"))
    || workflow.json(record, "photo_selection") || workflow.json(record, "photo_pending")
    || record.getFloat("photo_edit_until") > 0) {
    return chooserStarted;
  }
  return "";
}

// The reason is optional (photographers re-shoot freely); it is still logged when given.
function reshoot(app, id, auth, rawReason, taskId) {
  const reason = String(rawReason || "").trim() || "Re-shoot";
  if (reason.length > 300) throw new BadRequestError("Keep the reason under 300 characters.");
  const photography = require(__hooks + "/studio_photography.js");
  const result = workflow.withRegistration(app, id, (tx, record) => {
    const account = workflow.staff(tx, auth, ["admin", "photographer"]);
    const plan = photography.data(record);
    const sessions = photography.active(plan);
    let task = null;
    if (sessions.length) {
      if (!taskId) throw new BadRequestError("Choose which photography session to re-shoot.");
      task = sessions.find((entry) => entry.id === String(taskId));
      if (!task) throw new NotFoundError("Photography session not found.");
      if (task.status !== "completed") throw new ApiError(409, "This session isn't finished yet.");
      if (tx.findRecordsByFilter("camera_stations", "active_registration = {:reg} && session_task = {:task}", "", 1, 0,
        { reg: record.id, task: task.id }).length) {
        throw new ApiError(409, "This session's photos are still syncing. Try again in a moment.");
      }
    }
    const block = reshootBlock(record, !!task);
    if (block) throw new ApiError(409, block);
    const photos = withFolder(tx, record, false, (root, folder) => {
      if (!root) return 0;
      let inventory;
      try { inventory = storage.inventory(root, folder); } catch (_) {
        throw new ApiError(503, "The photo folder could not be read. Try again after storage is available.");
      }
      // Photos in the selected / unselected folders mean the Chooser has opened this client.
      if (inventory.some((photo) => photo.group)) throw new ApiError(409, chooserStarted);
      return inventory.length;
    });
    const log = workflow.json(record, "photo_reshoots");
    record.set("photo_reshoots", [...(Array.isArray(log) ? log : []), {
      at: new Date().toISOString(),
      by: account.id,
      by_name: account.getString("name") || account.getString("username"),
      role: account.getString("role"),
      reason,
      photos,
      ...(task ? { task: task.id, task_name: task.name, photographer: task.photographerName || "" } : {}),
    }]);
    if (task) {
      // The session is outstanding again; applyStatus (onRecordUpdate) then moves a finished
      // order back to shooting, so it leaves the Chooser list until every session is done.
      task.status = "pending";
      task.reshoots = (task.reshoots || 0) + 1;
      delete task.completedAt;
      delete task.finishingAt;
      record.set("photography", plan);
    } else {
      record.set("status", "shooting");
      record.set("shoot_completed", false);
      record.set("photo_status", "pending_shoot");
    }
    tx.save(record);
    return { status: record.getString("status"), photos, task: task ? task.id : "" };
  });
  require(__hooks + "/studio_station_events.js").notify(app);
  return result;
}

// Paid retake (admin only): after the Chooser has picked (or production started), the client
// pays for a retake and goes back to the photographers. Every photography session reopens,
// the saved Chooser selection is cleared (the photo files stay where they are, so the Chooser
// sees the earlier picks again next to the new shots) and production goes back to the start.
// Money isn't touched here: the admin charges the retake on the order (Students → Edit) and the
// cashier collects it, like any other change to a job order.
function retake(app, id, auth, rawReason) {
  const reason = String(rawReason || "").trim();
  if (!reason) throw new BadRequestError("Write why the client is having a paid retake.");
  if (reason.length > 300) throw new BadRequestError("Keep the reason under 300 characters.");
  const photography = require(__hooks + "/studio_photography.js");
  const result = workflow.withRegistration(app, id, (tx, record) => {
    const account = workflow.staff(tx, auth, ["admin"]);
    const status = record.getString("status");
    if (!["done_shooting", "completed", "ready_for_pickup"].includes(status) || !record.getBool("shoot_completed")) {
      throw new ApiError(409, status === "released" || status === "cancelled"
        ? "Released and cancelled orders can't have a retake."
        : "Only a client whose photography is finished can have a paid retake.");
    }
    if (workflow.json(record, "photo_pending")) throw new ApiError(409, "The Chooser's selection is still being saved. Try again in a moment.");
    if (record.getFloat("photo_edit_until") > Date.now()) {
      throw new ApiError(409, "The Chooser has this client open right now. Try again when they're done.");
    }
    if (tx.findRecordsByFilter("camera_stations", "active_registration = {:reg}", "", 1, 0, { reg: record.id }).length) {
      throw new ApiError(409, "A camera is still linked to this client. Try again in a moment.");
    }
    const photos = withFolder(tx, record, false, (root, folder) => {
      if (!root) return 0;
      try { return storage.inventory(root, folder).length; } catch (_) {
        throw new ApiError(503, "The photo folder could not be read. Try again after storage is available.");
      }
    });
    const hadSelection = !!workflow.json(record, "photo_selection");
    const plan = photography.data(record);
    const sessions = photography.active(plan);
    for (const task of sessions) {
      task.status = "pending";
      task.reshoots = (task.reshoots || 0) + 1;
      delete task.completedAt;
      delete task.finishingAt;
    }
    if (plan) {
      delete plan.selectionReview;
      record.set("photography", plan);
    }
    const log = workflow.json(record, "photo_reshoots");
    record.set("photo_reshoots", [...(Array.isArray(log) ? log : []), {
      kind: "paid_retake",
      at: new Date().toISOString(),
      by: account.id,
      by_name: account.getString("name") || account.getString("username"),
      role: "admin",
      reason,
      photos,
      status_before: status,
      production_before: record.getString("framing_status"),
      had_selection: hadSelection,
      ...(sessions.length ? { tasks: sessions.map((task) => task.name) } : {}),
    }]);
    record.set("photo_selection", null);
    record.set("photo_edit_until", 0);
    record.set("framing_status", "");
    record.set("photo_status", "pending_shoot");
    if (!sessions.length) {
      record.set("status", "shooting");
      record.set("shoot_completed", false);
    }
    // With sessions, applyStatus (onRecordUpdate) moves the finished order back to shooting.
    tx.save(record);
    return { status: record.getString("status"), photos, sessions: sessions.length };
  });
  require(__hooks + "/studio_station_events.js").notify(app);
  return result;
}

// Card upload: photos shot untethered (to the camera's memory card) are added straight to a client
// from the Photo Floor, whichever camera is or isn't linked. Any photographer or admin, while the
// client is paid and on the floor or done shooting, and only until the Chooser starts (like a
// re-shoot). Files arrive one per request, streamed to disk under a dot name, size-checked, then
// published under a free name (photos at the top of the job folder, RAW files in RAW/). A file
// already in the client's folders with the same name and size is skipped, so a whole card can be
// picked again and only the new shots are added.
const maxUploadBytes = 1 << 30;

function uploadBlock(record) {
  const status = record.getString("status");
  if (["cancelled", "released"].includes(status)) return "This job order is closed.";
  if (!["paid", "shooting", "done_shooting"].includes(status) || !workflow.paymentEligible(record)) {
    return "Only paid clients on the Photo Floor can receive photos.";
  }
  if (workflow.json(record, "photo_pending")) return "The gallery is being updated. Try again in a moment.";
  if (!["", "none", "pending_framing"].includes(record.getString("framing_status"))) {
    return "Production has started on this order, so photos can't be added here.";
  }
  if (!["", "pending_shoot", "shot_raw"].includes(record.getString("photo_status"))
    || workflow.json(record, "photo_selection") || record.getFloat("photo_edit_until") > 0) {
    return chooserStarted;
  }
  return "";
}

function upload(e) {
  const account = workflow.staff(e.app, e.auth, ["admin", "photographer"]);
  const record = load(e.app, e.request.pathValue("id"));
  const block = uploadBlock(record);
  if (block) throw new ApiError(409, block);
  const raws = require(__hooks + "/studio_camera_import.js").rawFormats;
  const types = require(__hooks + "/studio_shot_types.js");
  const name = types.untagged(String(e.request.url.query().get("name") || "").trim());
  const code = types.checkCode(e.app, e.request.url.query().get("type"));
  const ext = $filepath.ext(name).toLowerCase();
  const photo = !!storage.formats[ext];
  if (!storage.usableName(name) || /[\\/]/.test(name) || /^[.~$]/.test(name) || !(photo || raws.has(ext))) {
    throw new BadRequestError("Only photo and RAW files can be added: " + name.slice(0, 120));
  }
  const size = e.request.contentLength;
  if (!(size > 0)) throw new BadRequestError("The file is empty: " + name);
  if (size > maxUploadBytes) throw new ApiError(413, "This file is too large: " + name);

  let folder;
  try {
    folder = storage.photoFolder(e.app, record);
    storage.provision(folder);
  } catch (error) {
    if (error.status === 409) throw error;
    throw new ApiError(503, "Photo storage is temporarily unavailable.");
  }
  return withFolder(e.app, record, true, (root) => {
    if (!root) throw new ApiError(503, "The client's photo folder is not available.");
    const dir = photo ? "" : "RAW";
    if (dir) root.mkdirAll(dir, 0o750);
    const partial = (dir ? dir + "/" : "") + ".sf-card-" + $security.randomStringWithAlphabet(16, "abcdefghijklmnopqrstuvwxyz0123456789") + ".part";
    let written = 0;
    try {
      // O_WRONLY | O_CREATE | O_EXCL.
      const file = root.openFile(partial, 0x1 | 0x40 | 0x80, 0o640);
      try {
        written = file.readFrom(e.request.body);
        file.sync();
      } finally { file.close(); }
      if (written !== size) throw new BadRequestError("The upload of " + name + " was incomplete. Try again.");
      // The same shot already here (top, RAW, selection folders or _DELETED), whatever its shot type
      // label: skip it, so a card picked again adds only the new shots. Checked only after the whole
      // file was read: answering before that makes the server drop the connection mid-upload.
      const places = [...new Set(["", "RAW", trash, trashRaw, ...Object.values(storage.photoDirectories(root, folder))])];
      for (const place of places) {
        for (const entry of readDirSafe(root, place || ".")) {
          if (!entry.type().isRegular() || types.untagged(entry.name()).toLowerCase() !== name.toLowerCase()) continue;
          const info = storage.statEntry(root, place ? place + "/" + entry.name() : entry.name());
          if (info && info.size() === size) return { status: "already", name: entry.name() };
        }
      }
      // A name free in the job folder and both selection folders (as the camera import does), so a
      // later Chooser move never meets the same name. RAW files keep their name (never tagged).
      let saved = "";
      if (photo) saved = freeAcross(root, folder, types.tagged(name, code));
      else {
        const ext0 = $filepath.ext(name);
        const stem = name.slice(0, name.length - ext0.length);
        for (let n = 1; n < 10000 && !saved; n++) {
          const candidate = n === 1 ? name : stem + "_" + n + ext0;
          if (!storage.statEntry(root, "RAW/" + candidate)) saved = candidate;
        }
        if (!saved) throw new Error("No free file name for " + name);
      }
      const target = dir ? dir + "/" + saved : saved;
      if (photo) {
        // Check the picture itself under its real extension before it becomes visible.
        root.link(partial, target);
        if (!storage.photoMime(root, target, storage.statEntry(root, target))) {
          root.remove(target);
          throw new BadRequestError(name + " is not a readable photo.");
        }
      } else {
        root.link(partial, target);
      }
      if (photo) types.recordOrigin(e.app, record.id, saved, "card", account.id);
      e.app.logger().info("Card upload", "registration", record.id, "file", target, "by", account.getString("username"));
      return { status: "saved", name: saved };
    } finally {
      try { root.remove(partial); } catch (_) { /* already gone */ }
    }
  });
}

// After a batch: one floor badge ("Card upload · <photographer> · N shots") and a station refresh.
function uploadDone(app, id, auth, count) {
  const account = workflow.staff(app, auth, ["admin", "photographer"]);
  load(app, id);
  const shots = Number.isInteger(count) && count > 0 && count <= 10000 ? count : 0;
  require(__hooks + "/studio_camera_import.js").recordVisit(app, id, { id: "card", name: "Card upload" }, account.id, shots);
  require(__hooks + "/studio_station_events.js").notify(app);
  return { recorded: shots };
}

module.exports = { change, image, list, reshoot, retag, retake, shotKey, trash, upload, uploadDone };
