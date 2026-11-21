const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const prune = process.argv.includes('--prune');
const database = process.argv[3] || path.join(__dirname, '..', 'pb_data', 'data.db');
const root = process.argv[4] || process.env.STUDIOFLOW_PHOTOS_ROOT || 'C:\\StudioFlow_Photos';
const isDirectory = (name) => fs.lstatSync(name).isDirectory();
const subfolders = (name) => fs.readdirSync(name, { withFileTypes: true })
  .filter((entry) => entry.isDirectory()).map((entry) => entry.name);

function scan(db, photoRoot) {
  const registrations = db.prepare('SELECT photo_folder, job_order_no FROM registrations').all();
  const bound = new Set(registrations.map((row) => row.photo_folder?.toLowerCase()));
  const jobs = new Set(registrations.map((row) => row.job_order_no?.toLowerCase()).filter(Boolean));
  let count = 0;
  for (const first of subfolders(photoRoot)) {
    const top = path.join(photoRoot, first);
    for (const second of subfolders(top)) {
      const scope = path.join(top, second);
      for (const leaf of subfolders(scope)) {
        const relative = [first, second, leaf].join('/');
        if (bound.has(relative.toLowerCase()) || jobs.has(leaf.split('_')[0].toLowerCase())) continue;
        // Only recognize job folders. Never treat an arbitrary directory as a client repository.
        if (!/^\d+_.+/.test(leaf)) continue;
        const repository = path.join(scope, leaf);
        const children = fs.readdirSync(repository);
        const supported = new Set([leaf.toLowerCase(), 'selected', 'unselected']);
        if (!children.every((name) => {
          const child = path.join(repository, name);
          return supported.has(name.toLowerCase()) && isDirectory(child) && fs.readdirSync(child).length === 0;
        })) continue;
        if (prune) {
          // rmdir is non-recursive and fails if a file appeared after the scan.
          for (const child of children) fs.rmdirSync(path.join(repository, child));
          fs.rmdirSync(repository);
        }
        console.log(prune ? 'Removed empty folder:' : 'Empty orphan:', relative);
        count++;
      }
    }
  }
  console.log(count + (prune ? ' empty orphan folders removed.' : ' empty orphan folders found. Preview only.'));
}

try {
  const photoRoot = fs.realpathSync(root);
  if (path.dirname(photoRoot) === photoRoot) throw new Error('Use the StudioFlow photo root, rather than a whole drive.');
  const db = new DatabaseSync(fs.realpathSync(database), { readOnly: !prune });
  try {
    if (prune) db.exec('BEGIN IMMEDIATE');
    scan(db, photoRoot);
    if (prune) db.exec('COMMIT');
  } finally { db.close(); }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
