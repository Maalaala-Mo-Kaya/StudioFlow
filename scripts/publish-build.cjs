const { cpSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { randomUUID } = require('node:crypto');

const source = resolve(__dirname, '..', 'dist');
const destination = resolve(__dirname, '..', 'pb_public');

function publish() {
  const html = readFileSync(join(source, 'index.html'), 'utf8');
  const assets = Array.from(html.matchAll(/\b(?:src|href)="\/(assets\/[^"]+)"/g), ([, asset]) => asset);
  if (!assets.some((asset) => asset.endsWith('.js')) || assets.some((asset) => !statSync(join(source, asset)).isFile())) {
    throw new Error('Build output is incomplete. Run npm run build to regenerate dist.');
  }

  mkdirSync(destination, { recursive: true });
  for (const entry of readdirSync(source)) {
    if (entry !== 'index.html') cpSync(join(source, entry), join(destination, entry), { recursive: true });
  }

  // Publish the entry page last. Keep prior hashed assets available to tabs already open.
  const temporary = join(destination, `.index-${randomUUID()}.tmp`);
  try {
    writeFileSync(temporary, html, { flag: 'wx' });
    renameSync(temporary, join(destination, 'index.html'));
  } finally {
    rmSync(temporary, { force: true });
  }
  console.log(`Published ${assets.find((asset) => asset.endsWith('.js'))} to ${destination}`);
}

try {
  publish();
} catch (error) {
  console.error('StudioFlow publication failed:', error.message);
  process.exitCode = 1;
}
