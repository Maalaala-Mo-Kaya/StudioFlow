const { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { randomUUID } = require('node:crypto');

const root = resolve(__dirname, '..');

// dist/ (staff app) -> pb_public/, served by PocketBase on the staff port.
// dist-kiosk/ (kiosk only) -> pb_public_kiosk/, served by client-gateway.cjs on the client port.
// The kiosk never uses the OCR engine (Admin -> Import from File), so it is left out there.
const targets = [
  { source: join(root, 'dist'), destination: join(root, 'pb_public'), skip: [] },
  { source: join(root, 'dist-kiosk'), destination: join(root, 'pb_public_kiosk'), skip: ['ocr'] },
];

function publish({ source, destination, skip }) {
  const html = readFileSync(join(source, 'index.html'), 'utf8');
  const assets = Array.from(html.matchAll(/\b(?:src|href)="\/(assets\/[^"]+)"/g), ([, asset]) => asset);
  if (!assets.some((asset) => asset.endsWith('.js')) || assets.some((asset) => !statSync(join(source, asset)).isFile())) {
    throw new Error(`Build output in ${source} is incomplete. Run npm run build to regenerate it.`);
  }

  mkdirSync(destination, { recursive: true });
  for (const entry of readdirSync(source)) {
    if (entry !== 'index.html' && !skip.includes(entry)) cpSync(join(source, entry), join(destination, entry), { recursive: true });
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
  for (const target of targets) {
    if (!existsSync(join(target.source, 'index.html'))) {
      throw new Error(`${target.source} has no build. Run npm run build (it builds the staff app and the kiosk).`);
    }
    publish(target);
  }
} catch (error) {
  console.error('StudioFlow publication failed:', error.message);
  process.exitCode = 1;
}
