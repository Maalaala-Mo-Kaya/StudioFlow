// DEV CON: wipe client records (test registrations) from the running server.
//
// Removes ONLY client data: job orders and everything recorded against them (payments, refunds,
// cashier confirmations, makeup logs and assignments, MUA payouts) plus their uploaded files
// (signatures). Job order and queue numbering start again at 00001 / #001, and receipt, refund and
// payout numbers follow (they count from the rows that remain). Camera stations keep their settings;
// only the linked-client session is cleared.
//
// Never touched: packages, add-ons, single items, saved poses, schools, courses, levels, rosters,
// session types, MUA services and team, studio settings, staff accounts, camera settings.
//
// A PocketBase backup (pb_data/backups, also in the dashboard under Settings → Backups) is made first.
// Client photo folders are moved aside next to the photo root, never deleted.
const storage = require(__hooks + "/studio_photo_storage.js");

// Order is for readability only (no SQL foreign keys between these tables).
const clientTables = [
  "refunds", "payments", "cashier_confirmations", "cashier_registration_edits", "mua_completions",
  "mua_assignment_events", "mua_payouts", "registrations",
];
const keptTables = [
  "packages", "add_ons", "catalog_items", "item_packages", "organizations", "courses",
  "master_lists", "session_types", "users", "camera_stations",
];
const confirmPhrase = "DELETE ALL CLIENTS";

function count(app, name) {
  return app.hasTable(name) ? app.countRecords(name) : 0;
}

function stamp() {
  // Manila time, e.g. 20261123_101500.
  const iso = new Date(Date.now() + 8 * 3600000).toISOString();
  return iso.slice(0, 10).replace(/-/g, "") + "_" + iso.slice(11, 19).replace(/:/g, "");
}

function photoEntries() {
  try { return $os.readDir(storage.basePath()).filter((entry) => !/^[.$]/.test(entry.name())); } catch (_) {
    return [];
  }
}

function summary(app) {
  const clients = Object.fromEntries(clientTables.map((name) => [name, count(app, name)]));
  const kept = Object.fromEntries(keptTables.map((name) => [name, count(app, name)]));
  const settings = app.findRecordsByFilter("studio_settings", "key = 'main'", "", 1, 0)[0];
  return {
    clients, kept, photoRoot: storage.basePath(), photoFolders: photoEntries().length, confirmPhrase,
    chooserUnlimited: !!settings?.getBool("chooser_unlimited"),
  };
}

// Moves every client folder out of the photo root into <root>_DEVCON_<stamp>. Returns where it went.
function movePhotosAside(when) {
  const root = storage.basePath();
  const entries = photoEntries();
  if (!entries.length) return { movedTo: "", moved: 0, failed: [] };
  const target = root.replace(/[\\/]+$/, "") + "_DEVCON_" + when;
  $os.mkdirAll(target, 0o750);
  let moved = 0;
  const failed = [];
  for (const entry of entries) {
    try {
      $os.rename($filepath.join(root, entry.name()), $filepath.join(target, entry.name()));
      moved++;
    } catch (error) {
      failed.push(entry.name() + ": " + String(error?.message || error).slice(0, 200));
    }
  }
  return { movedTo: target, moved, failed };
}

function wipe(e, options) {
  const app = e.app;
  const when = stamp();
  const before = summary(app);
  const backup = "devcon_before_reset_" + when + ".zip";
  try {
    app.createBackup(e.request.context(), backup);
  } catch (error) {
    throw new BadRequestError("The backup could not be made, so nothing was deleted: " + String(error?.message || error));
  }

  const collections = clientTables.filter((name) => app.hasTable(name)).map((name) => app.findCollectionByNameOrId(name));
  // Raw SQL on purpose: the record hooks refuse deleting payments and refunds, which is right for
  // the studio's real ledger but not for clearing test data.
  app.runInTransaction((tx) => {
    for (const collection of collections) tx.db().newQuery(`DELETE FROM "${collection.name}"`).execute();
    if (tx.hasTable("studio_number_sequences")) tx.db().newQuery("DELETE FROM studio_number_sequences").execute();
    if (tx.hasTable("camera_stations")) {
      tx.db().newQuery(`UPDATE camera_stations SET active_registration = '', session_started = '', session_imported = 0,
        session_skip = '[]', waiting_count = 0, last_import = '', last_error = '', scan_lock = 0`).execute();
      // Photography task sessions (added with the per-photographer tasks), when the columns exist.
      const columns = new Set(tx.tableColumns("camera_stations"));
      const extra = [["session_task", "''"], ["session_photographer", "''"], ["session_finishing", "0"]]
        .filter(([name]) => columns.has(name)).map(([name, value]) => `${name} = ${value}`);
      if (extra.length) tx.db().newQuery(`UPDATE camera_stations SET ${extra.join(", ")}`).execute();
    }
  });

  // Uploaded files (signatures) live under storage/<collection id>/<record id>/.
  const fileErrors = [];
  const fsys = app.newFilesystem();
  try {
    for (const collection of collections) {
      for (const error of fsys.deletePrefix(collection.id + "/") || []) fileErrors.push(String(error));
    }
  } finally { fsys.close(); }

  // Drop the deleted rows from the database file (client personal data).
  try { app.vacuum(); } catch (_) { /* a busy database keeps the free pages; harmless */ }

  const photos = options.photos ? movePhotosAside(when) : null;
  require(__hooks + "/studio_station_events.js").notify(app);
  app.logger().warn("DEV CON: client records deleted", "by", e.auth.getString("username"), "backup", backup,
    "registrations", before.clients.registrations);
  return { deleted: before.clients, backup, photos, fileErrors: fileErrors.slice(0, 5), after: summary(app) };
}

module.exports = { confirmPhrase, summary, wipe };
