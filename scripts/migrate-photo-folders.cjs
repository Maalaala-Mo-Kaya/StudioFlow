// Run with PocketBase stopped and the photo root idle. Preview is read-only.
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { randomUUID } = require('node:crypto');
const { clientFolderName } = require('../pb_hooks/studio_photo_names.cjs');

const [databaseArg, rootArg, mode] = process.argv.slice(2);
if (!databaseArg || !rootArg || ![undefined, '--apply', '--resume'].includes(mode)) {
  console.error('Usage: node scripts/migrate-photo-folders.cjs <data.db> <photos-root> [--apply | --resume]');
  process.exit(1);
}
const database = fs.realpathSync(databaseArg);
const root = fs.realpathSync(rootArg);
const journal = database + '.photo-folders.json';
const db = new DatabaseSync(database, { readOnly: !mode });

function stat(target) {
  try { return fs.lstatSync(target, { bigint: true }); }
  catch (error) { if (error.code !== 'ENOENT') throw error; return null; }
}

function directory(target) {
  const info = stat(target);
  if (info && !info.isDirectory()) throw new Error('Expected a real directory at ' + target);
  return info;
}

function identity(info) {
  return info ? [String(info.dev), String(info.ino)].join(':') : null;
}

function location(relative) {
  const parts = relative.split('/');
  if (parts.length !== 3 || parts.some((part) => !part || /[. ]$|[<>:"\\|?*\x00-\x1F]/.test(part))) {
    throw new Error('Invalid repository path');
  }
  const scope = path.join(root, parts[0], parts[1]);
  if (!directory(path.dirname(scope)) || !directory(scope)) throw new Error('Repository scope is missing');
  return path.join(scope, parts[2]);
}

function folderEntry(names, options) {
  const matches = names.filter((name) => options.includes(name.toLowerCase()));
  if (matches.length > 1) throw new Error('Multiple directories match the same photo group');
  return matches[0];
}

function plan() {
  const rows = db.prepare('SELECT * FROM registrations').all();
  const owners = (relative) => rows.filter((row) => row.photo_folder?.toLowerCase() === relative.toLowerCase());
  const entries = [];
  for (const row of rows) {
    if (!row.photo_folder) {
      if (row.job_order_no) console.log('Review unbound job order', row.job_order_no);
      continue;
    }
    try {
      if (!row.job_order_no || rows.filter((other) => other.job_order_no === row.job_order_no).length !== 1 ||
        owners(row.photo_folder).length !== 1) throw new Error('Job order or repository ownership is ambiguous');
      if (JSON.parse(row.photo_pending || 'null')) throw new Error('Finish the pending photo transfer first');
      const source = location(row.photo_folder);
      const sourceInfo = directory(source);
      if (!sourceInfo) throw new Error('Bound repository is missing');
      const oldLeaf = path.basename(source);
      const names = fs.readdirSync(source);
      const existingSelected = folderEntry(names, [oldLeaf.toLowerCase(), 'selected']);
      const unselected = folderEntry(names, ['unselected']);
      // Preserve a repository already using the new layout, even after a client name edit.
      if (oldLeaf.startsWith(row.job_order_no + '_') && !/\s|__/.test(oldLeaf) &&
        existingSelected === oldLeaf && unselected === 'Unselected' &&
        directory(path.join(source, existingSelected)) && directory(path.join(source, unselected))) continue;
      const leaf = clientFolderName(row.job_order_no, row.family_name, row.given_name, row.middle_name);
      const next = row.photo_folder.split('/').slice(0, 2).concat(leaf).join('/');
      const target = location(next);
      if (owners(next).some((other) => other.id !== row.id)) throw new Error('Destination is bound to another client');
      if (source !== target && stat(target)) throw new Error('Destination already exists');
      const selected = folderEntry(names, [oldLeaf.toLowerCase(), leaf.toLowerCase(), 'selected']);
      const children = [[selected, leaf], [unselected, 'Unselected']].map(([from, to]) => {
        const info = from && directory(path.join(source, from));
        return { from, to, identity: identity(info), temporary: '.studioflow-rename-' + randomUUID() };
      });
      if (source === target && children.every(({ from, to }) => from === to)) continue;
      const selection = JSON.parse(row.photo_selection || 'null');
      const updated = selection?.map(([file, fingerprint]) => {
        if (!selected || !file.startsWith(selected + '/') || /[/\\:]/.test(file.slice(selected.length + 1)) ||
          !stat(path.join(source, file))?.isFile()) throw new Error('A saved selection reference could not be verified');
        return [leaf + file.slice(selected.length), fingerprint];
      });
      entries.push({ id: row.id, old: row.photo_folder, next, identity: identity(sourceInfo), children,
        oldSelection: row.photo_selection, selection: updated ? JSON.stringify(updated) : null });
      console.log('Ready', row.photo_folder, '=>', next);
    } catch (error) {
      console.log('Skipped', row.job_order_no, row.photo_folder, error.message);
    }
  }
  // Report repositories outside the saved bindings, without guessing their owners.
  const directories = (base) => fs.readdirSync(base, { withFileTypes: true }).filter((item) => item.isDirectory());
  for (const first of directories(root)) {
    const top = path.join(root, first.name);
    for (const second of directories(top)) {
      for (const leaf of directories(path.join(top, second.name))) {
        const relative = [first.name, second.name, leaf.name].join('/');
        if (!owners(relative).length) console.log('Review unmatched folder', relative);
      }
    }
  }
  return entries;
}

function rename(from, to, expected) {
  if (from === to) return;
  const source = directory(from);
  const destination = directory(to);
  if (!source && identity(destination) === expected) return;
  if (identity(source) !== expected || destination) throw new Error('Rename would conflict at ' + to);
  fs.renameSync(from, to);
}

function apply(entry) {
  const row = db.prepare('SELECT photo_folder, photo_pending, photo_selection FROM registrations WHERE id = ?').get(entry.id);
  if (!row || ![entry.old, entry.next].includes(row.photo_folder) || JSON.parse(row.photo_pending || 'null') ||
    ![entry.oldSelection, entry.selection].includes(row.photo_selection)) throw new Error('Registration changed since planning');
  const source = location(entry.old);
  const target = location(entry.next);
  const active = identity(directory(source)) === entry.identity ? source : target;
  if (identity(directory(active)) !== entry.identity) throw new Error('Repository identity changed');
  for (const child of entry.children) {
    const to = path.join(active, child.to);
    if (!child.from) {
      if (!directory(to)) fs.mkdirSync(to);
      continue;
    }
    if (child.from === child.to || fs.readdirSync(active).includes(child.to)) {
      if (identity(directory(to)) !== child.identity) throw new Error('Photo folder identity changed at ' + to);
      continue;
    }
    const temporary = path.join(active, child.temporary);
    rename(path.join(active, child.from), temporary, child.identity);
    rename(temporary, to, child.identity);
  }
  rename(source, target, entry.identity);
  db.prepare('UPDATE registrations SET photo_folder = ?, photo_folder_key = ?, photo_selection = ? WHERE id = ?')
    .run(entry.next, entry.next.toLowerCase(), entry.selection, entry.id);
  console.log('Verified', entry.next);
}

try {
  if (!mode) {
    if (stat(journal)) throw new Error('A saved migration exists. Resume it before making a new plan.');
    console.log(plan().length + ' repositories ready. Preview only.');
  } else {
    db.exec('BEGIN IMMEDIATE');
    if (mode === '--apply') {
      if (stat(journal)) throw new Error('A saved migration exists. Use --resume.');
      const entries = plan();
      const handle = fs.openSync(journal, 'wx', 0o600);
      try {
        fs.writeFileSync(handle, JSON.stringify({ root, entries }));
        fs.fsyncSync(handle);
      } finally { fs.closeSync(handle); }
    }
    const saved = JSON.parse(fs.readFileSync(journal, 'utf8'));
    if (saved.root !== root) throw new Error('The photo root differs from the saved plan.');
    for (const entry of saved.entries) apply(entry);
    db.exec('COMMIT');
    fs.renameSync(journal, journal + '.completed-' + randomUUID());
    console.log('Committed ' + saved.entries.length + ' repositories.');
  }
} catch (error) {
  console.error(error.message);
  if (mode && stat(journal)) console.error('Keep PocketBase stopped. Resolve the reported issue and use --resume with the same paths.');
  process.exitCode = 1;
} finally { db.close(); }
