#!/usr/bin/env node
/*
 * StudioFlow: reset for handover.
 * Clears test data so the studio starts clean: Job Order 00001, receipt OR-000001, queue #001.
 *
 *   keep  - remove client records (job orders, payments, makeup logs, signatures, camera sessions,
 *           server logs; optionally school rosters). Keeps schools, courses, packages, add-ons,
 *           makeup services, staff accounts and camera settings.
 *   fresh - brand-new database from the migrations (starter school/packages + default staff logins).
 *
 * Always: refuses while PocketBase is using the database, backs up pb_data to backups\, and moves the
 * photo folder aside (never deletes it).
 *
 * Interactive:  scripts\reset-for-handover.bat
 * Scripted:     node scripts/reset-for-handover.cjs --mode keep|fresh [--rosters] [--photos-reset]
 *               [--data <pb_data dir>] [--photos <photo root>] [--backups <dir>] [--yes]
 * Needs Node 22.13+ (node:sqlite).
 */
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline/promises');

const repo = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const flag = (name) => args.includes('--' + name);
const option = (name) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : undefined; };

const dataDir = path.resolve(option('data') || path.join(repo, 'pb_data'));
const photoRoot = path.resolve(option('photos') || process.env.STUDIOFLOW_PHOTOS_ROOT || 'C:\\StudioFlow_Photos');
const backupsRoot = path.resolve(option('backups') || path.join(repo, 'backups'));
const pocketbase = path.join(repo, 'pocketbase.exe');
const now = new Date();
const pad = (n) => String(n).padStart(2, '0');
// Local time, e.g. 20261119_213045, for folder names.
const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

// Client records: removed in "keep" mode. Order matters only for readability (no SQL foreign keys).
const CLIENT_TABLES = ['refunds', 'payments', 'mua_completions', 'mua_assignment_events', 'registrations'];

function fail(message) {
  console.error('\n[STOPPED] ' + message);
  process.exit(1);
}

/** PocketBase processes whose data directory is the one we are about to reset. */
function serversUsing(dir) {
  if (process.platform !== 'win32') return [];
  let rows;
  try {
    const out = execFileSync('powershell', ['-NoProfile', '-Command',
      "Get-CimInstance Win32_Process -Filter \"Name='pocketbase.exe'\" | Select-Object ProcessId, ExecutablePath, CommandLine | ConvertTo-Json -Compress"],
    { encoding: 'utf8' }).trim();
    rows = out ? [].concat(JSON.parse(out)) : [];
  } catch {
    return [{ ProcessId: '?', CommandLine: 'could not list processes' }];
  }
  return rows.filter((row) => {
    const exeDir = row.ExecutablePath ? path.dirname(row.ExecutablePath) : repo;
    const match = /--dir[= ]+"?([^"\s]+)"?/.exec(row.CommandLine || '');
    const used = match ? path.resolve(exeDir, match[1]) : path.join(exeDir, 'pb_data');
    return used.toLowerCase() === dir.toLowerCase();
  });
}

function counts(dbFile) {
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(dbFile, { readOnly: true });
  try {
    const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name));
    const n = (t) => (tables.has(t) ? db.prepare(`SELECT COUNT(*) AS n FROM "${t}"`).get().n : 0);
    return Object.fromEntries(['registrations', 'payments', 'refunds', 'mua_completions', 'mua_assignment_events', 'master_lists', 'organizations', 'courses',
      'packages', 'add_ons', 'mua_service_types', 'users', 'camera_stations'].map((t) => [t, n(t)]));
  } finally { db.close(); }
}

function copyDir(from, to) {
  fs.cpSync(from, to, { recursive: true, errorOnExist: true });
}

function clearClientRecords(dbFile, clearRosters) {
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(dbFile);
  try {
    const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name));
    const collectionIds = {};
    for (const row of db.prepare('SELECT id, name FROM _collections').all()) collectionIds[row.name] = row.id;
    db.exec('BEGIN IMMEDIATE');
    try {
      for (const t of [...CLIENT_TABLES, ...(clearRosters ? ['master_lists'] : [])]) {
        if (tables.has(t)) db.exec(`DELETE FROM "${t}"`);
      }
      if (tables.has('studio_number_sequences')) db.exec('DELETE FROM studio_number_sequences');
      if (tables.has('camera_stations')) {
        db.exec(`UPDATE camera_stations SET active_registration = '', session_started = '', session_imported = 0,
          session_skip = NULL, waiting_count = 0, last_scan = '', last_import = '', last_error = '', scan_lock = 0`);
      }
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    // Physically drop the deleted rows from the file (client personal data).
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    db.exec('VACUUM');
    return collectionIds;
  } finally { db.close(); }
}

async function main() {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 13)) fail('Node.js 22.13 or newer is required (node:sqlite).');

  const dbFile = path.join(dataDir, 'data.db');
  if (!fs.existsSync(dbFile)) fail(`No database at ${dbFile}`);
  const running = serversUsing(dataDir);
  if (running.length) {
    fail(`PocketBase is running on this database (process ${running.map((r) => r.ProcessId).join(', ')}).\n` +
      '          Close the server window (run.bat) first, then run this again.');
  }

  // Line queue: works for typed answers and for answers piped in all at once.
  const ask = readline.createInterface({ input: process.stdin, terminal: false });
  const lines = [];
  const waiting = [];
  let closed = false;
  ask.on('line', (line) => (waiting.length ? waiting.shift()(line) : lines.push(line)));
  ask.on('close', () => { closed = true; while (waiting.length) waiting.shift()(''); });
  const question = async (q) => {
    process.stdout.write(q);
    const line = lines.length ? lines.shift() : closed ? '' : await new Promise((resolve) => waiting.push(resolve));
    return line.trim();
  };
  try {
    const before = counts(dbFile);
    console.log('\nDatabase: ' + dbFile);
    console.log('Photos:   ' + photoRoot + (fs.existsSync(photoRoot) ? '' : '  (not found)'));
    console.log('\nNow in the database:');
    console.log(`  Client records : ${before.registrations} job orders, ${before.payments} payments, ${before.refunds} refunds, ${before.mua_completions} makeup logs, ${before.mua_assignment_events} assignment events, ${before.master_lists} roster rows`);
    console.log(`  Setup          : ${before.organizations} schools, ${before.courses} courses, ${before.packages} packages, ${before.add_ons} add-ons, ${before.mua_service_types} makeup services, ${before.users} staff accounts, ${before.camera_stations} cameras`);

    let mode = option('mode');
    if (!mode) {
      console.log('\nChoose a reset:');
      console.log('  [1] Keep setup    - remove all client records, keep schools, packages, staff and cameras (recommended)');
      console.log('  [2] Factory fresh - brand-new database with only the built-in starter setup and default logins');
      console.log('  [3] Cancel');
      const choice = await question('Enter 1, 2 or 3: ');
      mode = choice === '1' ? 'keep' : choice === '2' ? 'fresh' : '';
    }
    if (!['keep', 'fresh'].includes(mode)) { console.log('Cancelled. Nothing was changed.'); return; }

    let rosters = flag('rosters');
    if (mode === 'keep' && !option('mode')) rosters = /^y/i.test(await question(`Also remove the school rosters (${before.master_lists} rows)? [y/N]: `));
    let photos = flag('photos-reset');
    if (!option('mode') && fs.existsSync(photoRoot)) {
      photos = /^y/i.test(await question('Move the current photo folders aside and start with an empty photo folder? [y/N]: '));
    }

    console.log('\nThis will:');
    console.log(`  - back up pb_data to ${path.join(backupsRoot, 'before_reset_' + stamp, 'pb_data')}`);
    console.log(mode === 'keep'
      ? `  - delete all job orders, payments, makeup logs, signatures${rosters ? ', rosters' : ''}, camera sessions and server logs`
      : '  - replace the database with a brand-new one (all schools, packages, staff and cameras are removed too)');
    if (photos) console.log(`  - rename ${photoRoot} to ${photoRoot}_before_reset_${stamp} and create an empty one`);
    if (!flag('yes')) {
      const confirm = await question('\nType RESET to continue: ');
      if (confirm !== 'RESET') { console.log('Cancelled. Nothing was changed.'); return; }
    }

    // Check again right before touching anything.
    if (serversUsing(dataDir).length) fail('PocketBase was started meanwhile. Close it and run this again.');

    const backupDir = path.join(backupsRoot, `before_reset_${stamp}`);
    fs.mkdirSync(backupDir, { recursive: true });
    copyDir(dataDir, path.join(backupDir, 'pb_data'));
    console.log('\n[OK] Backup saved: ' + backupDir);

    if (mode === 'keep') {
      const ids = clearClientRecords(dbFile, rosters);
      // Uploaded files (signatures) live under storage/<collection id>/<record id>/.
      for (const name of [...CLIENT_TABLES, ...(rosters ? ['master_lists'] : [])]) {
        if (ids[name]) fs.rmSync(path.join(dataDir, 'storage', ids[name]), { recursive: true, force: true });
      }
      console.log('[OK] Client records removed; setup kept.');
    } else {
      fs.rmSync(dataDir, { recursive: true, force: true });
      execFileSync(pocketbase, ['migrate', 'up', '--dir', dataDir, '--migrationsDir', path.join(repo, 'pb_migrations'),
        '--hooksDir', path.join(repo, 'pb_hooks')], { stdio: 'inherit' });
      // Keep the editor typings the hooks reference.
      const typings = path.join(backupDir, 'pb_data', 'types.d.ts');
      if (fs.existsSync(typings)) fs.copyFileSync(typings, path.join(dataDir, 'types.d.ts'));
      console.log('[OK] New database created.');
    }
    // Server request logs can contain client details; PocketBase recreates this file on start.
    for (const file of ['auxiliary.db', 'auxiliary.db-wal', 'auxiliary.db-shm']) fs.rmSync(path.join(dataDir, file), { force: true });

    if (photos && fs.existsSync(photoRoot)) {
      const aside = `${photoRoot}_before_reset_${stamp}`;
      fs.renameSync(photoRoot, aside);
      fs.mkdirSync(photoRoot);
      console.log('[OK] Photo folders moved to ' + aside);
    }

    const after = counts(dbFile);
    console.log('\nAfter reset:');
    console.log(`  Client records : ${after.registrations} job orders, ${after.payments} payments, ${after.refunds} refunds, ${after.mua_completions} makeup logs, ${after.mua_assignment_events} assignment events, ${after.master_lists} roster rows`);
    console.log(`  Setup          : ${after.organizations} schools, ${after.courses} courses, ${after.packages} packages, ${after.add_ons} add-ons, ${after.users} staff accounts, ${after.camera_stations} cameras`);
    console.log('\nNumbering starts at: Job Order 00001, receipt OR-000001, queue #001.');
    console.log('\nBefore handing over:');
    if (mode === 'fresh') {
      console.log('  - Create the dashboard login:  pocketbase.exe superuser upsert <email> <password>');
      console.log('  - Remove the sample school (ACLC) and sample packages, then add the studio\'s own in Admin.');
    }
    console.log('  - Change every staff password in Admin > Staff (default logins use password123).');
    console.log('  - Start the server with run.bat and check the Cashier screen shows no job orders.');
    console.log('  - Keep the backup folder until the studio is happy, then delete it (it holds the test data).');
  } finally {
    ask.close();
  }
}

main().catch((error) => fail(error.stack || String(error)));
