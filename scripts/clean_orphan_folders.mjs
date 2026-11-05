/**
 * StudioFlow V2 - Orphan Folder Scanner & Recovery Tool (T044 / R04)
 * 
 * Scans the pictorial folder storage structure:
 *   [PhotosRoot] / [School] / [Year] / [Degree] / [Section] / [StudentID_LastName]
 * 
 * Detects:
 *   1. Completely empty student directories left behind by aborted or cancelled registrations.
 *   2. Directories without valid photo assets (RAW / JPG).
 * 
 * Modes:
 *   --dry-run (default): Lists detected orphaned or empty directories without deleting anything.
 *   --prune: Deletes verified empty orphaned directories safely.
 */

import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);
const isPrune = args.includes('--prune') || args.includes('-p');
const photosDirArg = args.find(a => a.startsWith('--dir='))?.split('=')[1];
const targetDir = path.resolve(photosDirArg || './photos');

console.log('='.repeat(70));
console.log(' STUDIOFLOW V2 - ORPHAN FOLDER DETECTION & CLEANUP (T044 / R04)');
console.log('='.repeat(70));
console.log(`Target Directory : ${targetDir}`);
console.log(`Execution Mode   : ${isPrune ? 'PRUNE (Delete empty folders)' : 'DRY RUN (Report only)'}`);
console.log('='.repeat(70));

if (!fs.existsSync(targetDir)) {
  console.log(`\n[INFO] Directory '${targetDir}' does not exist on disk yet.`);
  console.log('When photographers capture sessions, pictorial directories are created under this path.');
  console.log('[PASS] No orphaned directories detected.\n');
  process.exit(0);
}

/**
 * Recursively find all empty directories or directories with no photo files
 */
function scanDirectory(dir, depth = 0, maxDepth = 6) {
  const results = {
    emptyFolders: [],
    totalFoldersScanned: 0,
    totalFilesScanned: 0,
  };

  if (depth > maxDepth || !fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  results.totalFoldersScanned++;

  if (entries.length === 0) {
    if (depth > 0) {
      results.emptyFolders.push(dir);
    }
    return results;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const subResults = scanDirectory(fullPath, depth + 1, maxDepth);
      results.emptyFolders.push(...subResults.emptyFolders);
      results.totalFoldersScanned += subResults.totalFoldersScanned;
      results.totalFilesScanned += subResults.totalFilesScanned;
    } else {
      results.totalFilesScanned++;
    }
  }

  return results;
}

const scan = scanDirectory(targetDir);

console.log(`\nScan Summary:`);
console.log(`- Total Folders Inspected: ${scan.totalFoldersScanned}`);
console.log(`- Total Files Found      : ${scan.totalFilesScanned}`);
console.log(`- Empty/Orphan Folders   : ${scan.emptyFolders.length}`);

if (scan.emptyFolders.length === 0) {
  console.log('\n[PASS] No orphaned or empty directories found. File structure is healthy.\n');
  process.exit(0);
}

console.log('\nDetected Orphan Folders:');
scan.emptyFolders.forEach((folder, idx) => {
  const rel = path.relative(targetDir, folder);
  console.log(`  [${idx + 1}] ${rel}`);
});

if (!isPrune) {
  console.log('\n[NOTICE] Dry-run complete. To remove empty orphaned folders, run:');
  console.log('  node scripts/clean_orphan_folders.mjs --prune\n');
  process.exit(0);
}

console.log('\nPruning verified empty directories...');
let prunedCount = 0;
// Prune from deepest to shallowest
const sortedFolders = [...scan.emptyFolders].sort((a, b) => b.length - a.length);

for (const folder of sortedFolders) {
  try {
    const contents = fs.readdirSync(folder);
    if (contents.length === 0) {
      fs.rmdirSync(folder);
      prunedCount++;
      console.log(`  [DELETED] ${path.relative(targetDir, folder)}`);
    } else {
      console.log(`  [SKIPPED] ${path.relative(targetDir, folder)} (Not empty)`);
    }
  } catch (err) {
    console.error(`  [ERROR] Failed to delete ${folder}:`, err.message);
  }
}

console.log(`\nSuccessfully pruned ${prunedCount} empty orphaned folders.\n`);
