// Camera hot-folder import.
//
// Each camera station watches one server folder: the output folder of the
// camera's tethering or Wi-Fi transfer software. While the photographer has a
// client linked to the station, every finished photo that lands in that folder
// is moved into the client's photo folder (photos in the job folder itself,
// RAW files in its RAW subfolder).
//
// Safety rules:
// - A file is claimed by renaming it into <watch>/.studioflow-importing/<job id>/.
//   Windows refuses that rename while the camera software or a copy is still
//   writing the file, so half-written photos are never moved.
// - Files already in the folder when a session starts are left alone ("waiting")
//   until someone explicitly sends them to the current client.
// - A file that was claimed but not delivered (crash, offline drive) stays in
//   the staging folder and is delivered to the same job order on the next scan.
const storage = require(__hooks + "/studio_photo_storage.js");
const workflow = require(__hooks + "/studio_workflow.js");
const photography = require(__hooks + "/studio_photography.js");

const stagingName = ".studioflow-importing";
const rawFormats = new Set([
  ".3fr", ".arw", ".cr2", ".cr3", ".crw", ".dng", ".erf", ".iiq", ".kdc", ".mef", ".mos",
  ".nef", ".nrw", ".orf", ".pef", ".raf", ".rw2", ".rwl", ".sr2", ".srf", ".srw", ".x3f",
]);
const settleMs = 2000;
const finishQuietMs = 8000;
const lockMs = 2 * 60 * 1000;
const maxDepth = 4;
const maxFilesPerScan = 300;
const sessionFields = [
  "active_registration", "session_started", "session_imported", "session_skip",
  "waiting_count", "last_scan", "last_import", "last_error", "scan_lock",
  "session_task", "session_photographer", "session_finishing",
];
const taskPrefix = (task, photographer) => "sf-" + task + "-" + photographer + "-";
// Lets the integration test exercise the cross-drive copy path on one drive.
const forceCopy = () => $os.getenv("STUDIOFLOW_IMPORT_COPY") === "1";

function text(error) {
  return String(error?.message || error).replace(/^(?:Go)?Error:\s*/, "").slice(0, 300);
}

function now() {
  return new DateTime().string();
}

function normalize(path) {
  const clean = $filepath.clean(path).toLowerCase().replace(/\\/g, "/");
  return clean.endsWith("/") ? clean : clean + "/";
}

function isWithin(child, parent) {
  return normalize(child).startsWith(normalize(parent));
}

function validateWatchFolder(app, value, selfId) {
  const raw = String(value || "").trim();
  if (!raw) throw new BadRequestError("Choose the camera output folder.");
  if (!$filepath.isAbs(raw)) {
    throw new BadRequestError("Use a full folder path on the server PC, such as C:\\StudioFlow_Incoming\\Camera1.");
  }
  const path = $filepath.clean(raw);
  if ($filepath.dir(path) === path) throw new BadRequestError("Choose a folder, not a whole drive.");
  let info;
  try { info = $os.stat(path); } catch (_) {
    throw new BadRequestError("This folder does not exist on the server PC: " + path);
  }
  if (!info.isDir()) throw new BadRequestError("This path is a file, not a folder: " + path);
  const photos = storage.basePath();
  if (isWithin(path, photos) || isWithin(photos, path)) {
    throw new BadRequestError("The camera folder must be separate from the client photo folders (" + photos + ").");
  }
  for (const name of ["SystemRoot", "ProgramFiles", "ProgramFiles(x86)", "ProgramData"]) {
    const system = $os.getenv(name);
    if (system && isWithin(path, system)) throw new BadRequestError("System folders cannot be used as a camera folder.");
  }
  for (const other of app.findRecordsByFilter("camera_stations", "id != {:id}", "", 0, 0, { id: selfId || "" })) {
    const folder = other.getString("watch_folder");
    if (folder && (isWithin(path, folder) || isWithin(folder, path))) {
      throw new BadRequestError('The camera "' + other.getString("name") + '" already watches this folder.');
    }
  }
  return path;
}

// Photos (and RAW files when enabled) in the watch folder, oldest first.
function candidates(station) {
  const deep = station.getBool("include_subfolders");
  const raw = station.getBool("import_raw");
  const found = [];
  const walk = (dir, rel, depth) => {
    let entries;
    try { entries = $os.readDir(dir); } catch (error) {
      throw error;
    }
    for (const entry of entries) {
      const name = entry.name();
      if (/^[.~$]/.test(name)) continue;
      const abs = $filepath.join(dir, name);
      const path = rel ? rel + "/" + name : name;
      if (entry.isDir()) {
        if (deep && depth < maxDepth) walk(abs, path, depth + 1);
        continue;
      }
      if (!entry.type().isRegular()) continue;
      const ext = $filepath.ext(name).toLowerCase();
      const kind = storage.formats[ext] ? "photo" : raw && rawFormats.has(ext) ? "raw" : "";
      if (!kind) continue;
      const info = entry.info();
      const modified = info.modTime().unixMilli();
      found.push({ abs, dir, name, path, kind, size: info.size(), modified, key: [path.toLowerCase(), info.size(), modified].join("|") });
    }
  };
  walk(station.getString("watch_folder"), "", 0);
  return found.sort((a, b) => a.modified - b.modified || (a.path < b.path ? -1 : Number(a.path > b.path)));
}

function exists(path) {
  try { $os.stat(path); return true; } catch (_) { return false; }
}

// A destination name that is free in the job folder and both selection folders.
function freeName(student, folder, sub, name) {
  const ext = $filepath.ext(name);
  const stem = name.slice(0, name.length - ext.length);
  const groups = sub ? [sub] : ["", ...Object.values(storage.photoDirectories(student, folder))];
  for (let n = 1; n < 10000; n++) {
    const candidate = n === 1 ? name : stem + "_" + n + ext;
    if (groups.every((group) => !storage.statEntry(student, group ? group + "/" + candidate : candidate))) {
      return sub ? sub + "/" + candidate : candidate;
    }
  }
  throw new Error("No free file name for " + name);
}

function copyInto(source, student, rel) {
  const partial = rel + ".studioflow-partial";
  if (storage.statEntry(student, partial)) student.remove(partial);
  const sourceDir = $os.openRoot($filepath.dir(source));
  try {
    const input = sourceDir.open($filepath.base(source));
    try {
      const size = input.stat().size();
      // O_WRONLY | O_CREATE | O_EXCL: never overwrite an existing file.
      const output = student.openFile(partial, 0x1 | 0x40 | 0x80, 0o640);
      try {
        const chunk = 1024 * 1024;
        for (let offset = 0; offset < size; offset += chunk) {
          const buffer = new Uint8Array(Math.min(chunk, size - offset));
          input.readAt(buffer, offset);
          output.writeAt(buffer, offset);
        }
        output.sync();
      } finally { output.close(); }
      if (student.stat(partial).size() !== size) throw new Error("The copied photo is incomplete.");
    } finally { input.close(); }
  } finally { sourceDir.close(); }
  if (storage.statEntry(student, rel)) throw new Error("A photo with the same name appeared during the import.");
  student.rename(partial, rel);
}

// Moves one claimed (staged) file into the client's folder.
function deliver(app, staged, registration) {
  const name = $filepath.base(staged);
  const sub = storage.formats[$filepath.ext(name).toLowerCase()] ? "" : "RAW";
  const folder = storage.photoFolder(app, registration);
  storage.provision(folder);
  const student = storage.openStudent(folder, true);
  if (!student) throw new Error("The client folder could not be opened.");
  try {
    if (sub) student.mkdirAll(sub, 0o750);
    const attributed = /^sf-(?:primary|[a-z0-9]{12})-[a-z0-9]{15}-[a-z0-9]{20}-/.test(name);
    const rel = attributed ? (sub ? sub + "/" + name : name) : freeName(student, folder, sub, name);
    if (attributed && storage.statEntry(student, rel)) {
      // Publishing is atomic. A retry after publishing but before deleting the staged
      // copy uses the same import identity and must not make another gallery image.
      if (student.stat(rel).size() !== $os.stat(staged).size()) throw new Error("The imported photo conflicts with its staged copy.");
      $os.remove(staged);
      return rel;
    }
    let moved = false;
    if (!forceCopy()) {
      try {
        $os.rename(staged, $filepath.join(storage.displayPath(folder), ...rel.split("/")));
        moved = true;
      } catch (_) {
        // Different drive (or network share): fall back to copy + verify + delete.
      }
    }
    if (!moved) {
      copyInto(staged, student, rel);
      $os.remove(staged);
    }
    return rel;
  } finally { student.close(); }
}

// Claims a file from the watch folder and delivers it. Returns "imported",
// "busy" (still being written, retry later) or "skipped" (not a valid photo).
function importFile(app, watch, file, registration, prefix) {
  if (!storage.usableName(file.name)) return "skipped";
  if (file.kind === "photo") {
    let valid;
    try {
      const dir = $os.openRoot(file.dir);
      try { valid = !!storage.photoMime(dir, file.name, dir.stat(file.name)); } finally { dir.close(); }
    } catch (_) {
      return "busy";
    }
    if (!valid) return "skipped";
  }
  const stageDir = $filepath.join(watch, stagingName, registration.id);
  $os.mkdirAll(stageDir, 0o750);
  const ext = $filepath.ext(file.name);
  const stem = file.name.slice(0, file.name.length - ext.length);
  const safeStem = stem.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 75) || "photo";
  const name = prefix ? prefix + $security.randomStringWithAlphabet(20, "abcdefghijklmnopqrstuvwxyz0123456789") + "-" + safeStem + ext : file.name;
  let staged = $filepath.join(stageDir, name);
  for (let n = 2; exists(staged); n++) staged = $filepath.join(stageDir, stem + "_" + n + ext);
  try { $os.rename(file.abs, staged); } catch (_) {
    return "busy";
  }
  deliver(app, staged, registration);
  return "imported";
}

// Finishes imports that were claimed but not delivered. Returns counts per job id.
function resumeStaged(app, watch, activeId, errors) {
  const counts = {};
  const root = $filepath.join(watch, stagingName);
  let jobs;
  try { jobs = $os.readDir(root); } catch (error) {
    if (!storage.isMissing(error)) throw error;
    return counts;
  }
  for (const job of jobs) {
    if (!job.isDir()) continue;
    const dir = $filepath.join(root, job.name());
    const fail = (message) => {
      if (!activeId || activeId === job.name()) errors.push(message);
      else app.logger().warn("Camera import is holding photos for another order", "registration", job.name(), "error", message);
    };
    let registration;
    try { registration = app.findRecordById("registrations", job.name()); } catch (_) {
      fail("Photos for a removed job order are held in " + dir + ".");
      continue;
    }
    let entries;
    try { entries = $os.readDir(dir); } catch (error) { fail(text(error)); continue; }
    for (const entry of entries) {
      if (!entry.type().isRegular() || entry.name().endsWith(".studioflow-partial")) continue;
      try {
        deliver(app, $filepath.join(dir, entry.name()), registration);
        counts[registration.id] = (counts[registration.id] || 0) + 1;
      } catch (error) {
        fail(entry.name() + ": " + text(error));
      }
    }
    try { $os.remove(dir); } catch (_) { /* not empty yet */ }
  }
  return counts;
}

// One pass over a station's folder. `flush` ignores the settle delay, used when
// a session ends so the last shots still reach the client who was on set.
function scan(app, id, flush = false) {
  const started = Date.now();
  const lock = app.db().newQuery(
    "UPDATE camera_stations SET scan_lock = {:now} WHERE id = {:id} AND (scan_lock IS NULL OR scan_lock < {:stale})",
  ).bind({ now: started, id, stale: started - lockMs }).execute();
  if (lock.rowsAffected() !== 1) return false;

  let imported = 0;
  let waiting = 0;
  let registrationId = "";
  let unlink = false;
  let resolved = false;
  const errors = [];
  try {
    const station = app.findRecordById("camera_stations", id);
    if (station.getBool("enabled")) {
      const watch = station.getString("watch_folder");
      registrationId = station.getString("active_registration");
      const taskId = station.getString("session_task");
      const photographerId = station.getString("session_photographer");
      const prefix = taskId ? taskPrefix(taskId, photographerId) : "";
      const resumed = resumeStaged(app, watch, registrationId, errors);
      imported += resumed[registrationId] || 0;

      let files = [];
      try { files = candidates(station); } catch (_) {
        errors.push("The camera folder cannot be read: " + watch);
      }
      let registration = null;
      if (registrationId) {
        try { registration = app.findRecordById("registrations", registrationId); } catch (_) { /* removed */ }
        if (!registration || (!taskId && ["cancelled", "released"].includes(registration.getString("status")))) {
          errors.push("The linked client is no longer on the photo floor. Link the next client.");
          unlink = true;
          registration = null;
        }
      }
      if (!registration) {
        waiting = files.length;
      } else {
        const skip = new Set(workflow.json(station, "session_skip") || []);
        let backlog = false;
        let processed = 0;
        for (const file of files) {
          if (skip.has(file.key)) { waiting++; continue; }
          if (processed >= maxFilesPerScan) { backlog = true; break; }
          if ((!flush || taskId) && (file.size <= 0 || started - file.modified < settleMs)) {
            backlog = true;
            continue;
          }
          processed++;
          try {
            const result = importFile(app, watch, file, registration, prefix);
            if (result === "imported") imported++;
            else if (result === "busy") backlog = true;
            else if (taskId) errors.push(file.name + ": The camera file is not a readable photo.");
          } catch (error) {
            errors.push(file.name + ": " + text(error));
          }
        }
        const assigned = taskId && photography.active(photography.data(registration))
          .some((task) => task.id === taskId && task.photographerId === photographerId);
        const retiring = taskId && (!assigned || !photography.eligible(registration));
        const finishing = station.getInt("session_finishing");
        if (retiring && !finishing) {
          app.db().newQuery("UPDATE camera_stations SET session_finishing = {:time} WHERE id = {:id} AND session_finishing = 0")
            .bind({ id, time: Date.now() }).execute();
        }
        if (taskId && finishing) {
          if (imported || backlog || errors.length) {
            app.db().newQuery("UPDATE camera_stations SET session_finishing = {:time} WHERE id = {:id} AND scan_lock = {:lock}")
              .bind({ id, time: Date.now(), lock: started }).execute();
          } else if (started - finishing >= finishQuietMs) {
            resolved = finishTask(app, station, prefix);
            if (!resolved) errors.push("Waiting for a readable photo for this session.");
          }
        }
      }
    }
  } catch (error) {
    errors.push(text(error));
  } finally {
    const time = now();
    app.db().newQuery(`UPDATE camera_stations SET
        scan_lock = 0, last_scan = {:time}, waiting_count = {:waiting}, last_error = {:error},
        session_imported = CASE WHEN {:reg} != '' AND active_registration = {:reg} THEN COALESCE(session_imported, 0) + {:count} ELSE session_imported END,
        last_import = CASE WHEN {:count} > 0 THEN {:time} ELSE last_import END,
        session_photographer = CASE WHEN {:unlink} AND active_registration = {:reg} THEN '' ELSE session_photographer END,
        active_registration = CASE WHEN {:unlink} AND active_registration = {:reg} THEN '' ELSE active_registration END
      WHERE id = {:id} AND scan_lock = {:lock}`).bind({
      id, time, waiting, error: errors.slice(0, 3).join(" | ").slice(0, 1000),
      reg: registrationId, count: imported, unlink: unlink ? 1 : 0, lock: started,
    }).execute();
  }
  if (imported || unlink || resolved) require(__hooks + "/studio_station_events.js").notify(app);
  return true;
}

function scanAll(app) {
  for (const station of app.findRecordsByFilter("camera_stations", "enabled = true", "", 0, 0)) {
    try { scan(app, station.id); } catch (error) {
      app.logger().warn("Camera import scan failed", "station", station.id, "error", text(error));
    }
  }
}

function findStation(app, id) {
  try { return app.findRecordById("camera_stations", id); } catch (_) {
    throw new NotFoundError("Camera station not found.");
  }
}

function photoCount(app, registration) {
  try {
    const folder = storage.photoFolder(app, registration);
    const root = storage.openStudent(folder);
    if (!root) return 0;
    try { return storage.inventory(root, folder).length; } finally { root.close(); }
  } catch (_) {
    return null;
  }
}

// The Photo Sender (scripts/photo-sender) on a tethering laptop writes this file into
// the watch folder every few seconds. Its age comes from the file's modification time
// on this PC, so the laptop's clock doesn't matter. Dot names are never imported.
const senderFile = ".studioflow-sender.json";
const senderText = (value, max = 200) => typeof value === "string" ? value.slice(0, max) : "";
const senderCount = (value) => Number.isInteger(value) && value >= 0 ? value : null;

function sender(watch) {
  let info;
  try { info = $os.stat($filepath.join(watch, senderFile)); } catch (_) { return null; }
  if (!info.mode().isRegular() || info.size() > 16384) return null;
  const seenAgo = Math.max(0, Math.round((Date.now() - info.modTime().unixMilli()) / 1000));
  let data = {};
  try { data = JSON.parse(toString($os.readFile($filepath.join(watch, senderFile)))) || {}; } catch (_) { /* being rewritten */ }
  const sentAgo = senderCount(data.lastSentSecondsAgo);
  return {
    host: senderText(data.host, 80),
    source: senderText(data.source, 300),
    seenAgo,
    lastSentName: senderText(data.lastSentName, 200),
    lastSentAgo: sentAgo === null ? null : sentAgo + seenAgo,
    waiting: senderCount(data.waiting),
    error: senderText(data.error, 300),
    // "upload": the sender sends over HTTP (studio_camera_sender.js); "share": into a shared folder.
    via: data.via === "upload" ? "upload" : "share",
  };
}

function status(app, station) {
  const watch = station.getString("watch_folder");
  let folderOk = false;
  try { folderOk = $os.stat(watch).isDir(); } catch (_) { /* offline or removed */ }
  let client = null;
  const registrationId = station.getString("active_registration");
  if (registrationId) {
    try {
      const registration = app.findRecordById("registrations", registrationId);
      let folder = "";
      try { folder = storage.displayPath(storage.photoFolder(app, registration)); } catch (_) { /* shown without a path */ }
      client = { ...workflow.summary(app, registration), photoCount: photoCount(app, registration), folder };
    } catch (_) { /* removed */ }
  }
  return {
    id: station.id,
    name: station.getString("name"),
    watchFolder: watch,
    enabled: station.getBool("enabled"),
    includeSubfolders: station.getBool("include_subfolders"),
    importRaw: station.getBool("import_raw"),
    folderOk,
    client,
    taskId: station.getString("session_task"),
    photographerId: station.getString("session_photographer"),
    finishing: !!station.getInt("session_finishing"),
    sessionStarted: station.getString("session_started"),
    sessionImported: station.getInt("session_imported"),
    waiting: station.getInt("waiting_count"),
    lastScan: station.getString("last_scan"),
    lastImport: station.getString("last_import"),
    lastError: station.getString("last_error"),
    sender: folderOk ? sender(watch) : null,
  };
}

function startSession(app, id, registrationId, photographerId) {
  const before = findStation(app, id);
  if (!before.getBool("enabled")) throw new BadRequestError("This camera is turned off in Admin → Camera Import.");
  let registration;
  try { registration = app.findRecordById("registrations", registrationId || ""); } catch (_) {
    throw new NotFoundError("Registration not found.");
  }
  if (!["paid", "shooting", "done_shooting"].includes(registration.getString("status")) || !require(__hooks + "/studio_workflow.js").paymentEligible(registration)) {
    throw new BadRequestError("Only paid clients on the photo floor can receive camera photos.");
  }
  if (before.getString("session_task") || photography.active(photography.data(registration)).length) {
    throw new ApiError(409, "Use the assigned photography session to link this camera.");
  }
  if (before.getString("active_registration") === registration.id) return;
  // The previous client's last shots go to them before the camera switches.
  if (before.getString("active_registration")) scan(app, id, true);
  const station = findStation(app, id);
  let skip = [];
  try { skip = candidates(station).map((file) => file.key); } catch (_) { /* reported by the next scan */ }
  workflow.withRegistration(app, registration.id, (tx, current) => {
    if (photography.active(photography.data(current)).length) throw new ApiError(409, "Use the assigned photography session to link this camera.");
    const linked = tx.db().newQuery(`UPDATE camera_stations SET active_registration = {:reg}, session_started = {:time},
        session_photographer = {:user}, session_imported = 0, session_skip = {:skip}, waiting_count = {:waiting}, last_error = ''
        WHERE id = {:id} AND enabled = true AND watch_folder = {:folder} AND session_task = '' AND active_registration = {:before}
          AND (session_photographer = '' OR session_photographer = {:user}) AND scan_lock = 0`)
      .bind({ id, reg: current.id, user: photographerId, before: before.getString("active_registration"), folder: station.getString("watch_folder"),
        time: now(), skip: JSON.stringify(skip), waiting: skip.length }).execute();
    if (!linked.rowsAffected()) throw new ApiError(409, "The camera is busy. Check its active session and try again.");
  });
  require(__hooks + "/studio_station_events.js").notify(app);
}

function endSession(app, id, registrationId) {
  const station = findStation(app, id);
  const active = station.getString("active_registration");
  if (!active || (registrationId && registrationId !== active)) return;
  if (station.getString("session_task")) throw new ApiError(409, "Use Mark Done to finish the assigned camera session.");
  scan(app, id, true);
  app.db().newQuery(`UPDATE camera_stations SET active_registration = '', session_photographer = '', session_skip = '[]'
      WHERE id = {:id} AND active_registration = {:reg} AND session_task = ''`).bind({ id, reg: active }).execute();
  require(__hooks + "/studio_station_events.js").notify(app);
}

// Sends the files that were waiting when the session started to the current client.
function claimWaiting(app, id, photographerId) {
  const station = findStation(app, id);
  if (!station.getString("active_registration")) throw new BadRequestError("Link a client to this camera first.");
  const changed = app.db().newQuery(`UPDATE camera_stations SET session_skip = '[]',
    session_finishing = CASE WHEN session_finishing > 0 THEN {:now} ELSE 0 END
    WHERE id = {:id} AND active_registration = {:reg} AND session_started = {:started}
      AND (session_photographer = '' OR session_photographer = {:user})`).bind({
    id, reg: station.getString("active_registration"), user: photographerId, started: station.getString("session_started"), now: Date.now(),
  }).execute();
  if (!changed.rowsAffected()) throw new ApiError(409, "The camera's active session changed.");
  scan(app, id, true);
}

function linkTask(tx, id, record, task, account) {
  const station = findStation(tx, id);
  if (!station.getBool("enabled")) throw new BadRequestError("Select an enabled camera.");
  if (station.getString("active_registration") === record.id && station.getString("session_task") === task.id
    && station.getString("session_photographer") === account.id) return;
  if (station.getString("active_registration")) throw new ApiError(409, "Finish the current camera session before linking the next client.");
  if (tx.findRecordsByFilter("camera_stations", "active_registration = {:reg} && session_task = {:task} && session_photographer = {:user}",
    "", 1, 0, { reg: record.id, task: task.id, user: account.id }).length) {
    throw new ApiError(409, "This session is already linked to another camera.");
  }
  let skip;
  try { skip = candidates(station).map((file) => file.key); } catch (_) {
    throw new ApiError(409, "The camera output folder cannot be read.");
  }
  const result = tx.db().newQuery(`UPDATE camera_stations SET active_registration = {:reg}, session_started = {:time},
    session_task = {:task}, session_photographer = {:user}, session_finishing = 0,
    session_imported = 0, session_skip = {:skip}, waiting_count = {:waiting}, last_error = ''
    WHERE id = {:id} AND scan_lock = 0`)
    .bind({ id, reg: record.id, task: task.id, user: account.id, time: now(), skip: JSON.stringify(skip), waiting: skip.length }).execute();
  if (!result.rowsAffected()) throw new ApiError(409, "The camera is scanning. Try selecting the session again.");
}

function finishTask(app, station, prefix) {
  return workflow.withRegistration(app, station.getString("active_registration"), (tx, record) => {
    const current = findStation(tx, station.id);
    if (current.getInt("scan_lock") !== station.getInt("scan_lock")
      || current.getInt("session_finishing") !== station.getInt("session_finishing")) return false;
    const plan = photography.data(record);
    const task = photography.active(plan).find((entry) => entry.id === station.getString("session_task")
      && entry.photographerId === station.getString("session_photographer"));
    if (task?.finishingAt && record.getString("status") !== "cancelled") {
      const folder = storage.photoFolder(tx, record);
      const root = storage.openStudent(folder);
      if (!root) return false;
      try {
        if (!storage.inventory(root, folder).some((file) => task.adoptedCamera || file.name.startsWith(prefix))) return false;
      } finally { root.close(); }
      task.status = "completed";
      task.completedAt = new Date().toISOString();
      delete task.finishingAt;
      if (workflow.json(record, "photo_selection") || workflow.json(record, "photo_pending")?.request) {
        plan.selectionReview = task.id;
      }
      record.set("photography", plan);
      tx.save(record);
    } else if (task && task.status !== "completed") {
      task.status = "pending";
      delete task.finishingAt;
      record.set("photography", plan);
      tx.save(record);
    }
    tx.db().newQuery(`UPDATE camera_stations SET active_registration = '', session_task = '', session_photographer = '',
      session_finishing = 0, session_skip = '[]' WHERE id = {:id}`).bind({ id: station.id }).execute();
    return true;
  });
}

function browse(path) {
  if (!path) {
    const folders = [];
    for (const letter of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
      const drive = letter + ":\\";
      try { if ($os.stat(drive).isDir()) folders.push({ name: drive, path: drive }); } catch (_) { /* no drive */ }
    }
    if (!folders.length) folders.push({ name: "/", path: "/" });
    return { path: "", parent: null, folders };
  }
  if (!$filepath.isAbs(path)) throw new BadRequestError("Use a full folder path.");
  const clean = $filepath.clean(path);
  let entries;
  try { entries = $os.readDir(clean); } catch (_) {
    throw new NotFoundError("This folder cannot be opened on the server PC: " + clean);
  }
  const folders = entries
    .filter((entry) => entry.isDir() && !/^[.$]/.test(entry.name()))
    .map((entry) => ({ name: entry.name(), path: $filepath.join(clean, entry.name()) }))
    .sort((a, b) => a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1)
    .slice(0, 1000);
  const parent = $filepath.dir(clean);
  return { path: clean, parent: parent === clean ? "" : parent, folders };
}

function createFolder(parent, name) {
  const clean = String(name || "").trim();
  if (!storage.usableName(clean)) throw new BadRequestError("Use a folder name without \\ / : * ? \" < > |.");
  const base = browse(parent).path;
  if (!base) throw new BadRequestError("Open a drive or folder first.");
  const path = $filepath.join(base, clean);
  if (exists(path)) throw new BadRequestError("A folder with this name already exists.");
  $os.mkdir(path, 0o750);
  return browse(path);
}

module.exports = {
  browse, claimWaiting, createFolder, endSession, findStation, scan, scanAll, sessionFields,
  startSession, status, validateWatchFolder, linkTask,
};
