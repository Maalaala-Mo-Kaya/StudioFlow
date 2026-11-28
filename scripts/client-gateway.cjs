#!/usr/bin/env node
/**
 * StudioFlow client gateway: the CLIENT port (default 0.0.0.0:8090).
 *
 * The router lets the guest Wi-Fi (students) reach only this port. PocketBase itself, with every
 * staff station and the /_/ dashboard, listens on the STAFF port (default 8091), which only the
 * staff network can reach. This gateway:
 *   - serves the kiosk-only build (pb_public_kiosk/, made by `npm run build`);
 *   - forwards to PocketBase only the calls the public kiosk makes (ROUTES below), with any
 *     Authorization / Cookie header removed, so nothing here acts as a staff member;
 *   - answers everything else (sign-in, /_/, staff endpoints, other collections) with 404.
 *
 * No dependencies (node:http only), so it runs offline wherever the build runs.
 *
 *   node scripts/client-gateway.cjs [--http=0.0.0.0:8090] [--upstream=http://127.0.0.1:8091]
 *                                   [--publicDir=pb_public_kiosk]
 * or the env vars STUDIOFLOW_CLIENT_HTTP, STUDIOFLOW_STAFF_URL, STUDIOFLOW_KIOSK_DIR.
 */
'use strict';

const http = require('node:http');
const { createReadStream, promises: fs } = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

function option(name, envName, fallback) {
  const flag = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return flag ? flag.slice(name.length + 3) : (process.env[envName] || fallback);
}

const LISTEN = option('http', 'STUDIOFLOW_CLIENT_HTTP', '0.0.0.0:8090');
const UPSTREAM = new URL(option('upstream', 'STUDIOFLOW_STAFF_URL', 'http://127.0.0.1:8091'));
const PUBLIC_DIR = path.resolve(ROOT, option('publicDir', 'STUDIOFLOW_KIOSK_DIR', 'pb_public_kiosk'));

/** Realtime topics a guest may subscribe to (POST /api/realtime is checked against this). */
const REALTIME_TOPICS = new Set(['studioflow-registration-catalog']);

/** Every PocketBase call the public kiosk makes. Anything not listed is refused. */
const ROUTES = [
  { methods: ['GET', 'HEAD'], path: /^\/api\/health$/ },
  // Kiosk catalog (packages, add-ons, schools, session types, switches) and its live updates.
  { methods: ['GET'], path: /^\/api\/studioflow\/registration-catalog$/ },
  { methods: ['GET'], path: /^\/api\/realtime$/ },
  { methods: ['POST'], path: /^\/api\/realtime$/, check: checkRealtimeBody },
  // Submitting the form (the create rule and the registration hooks decide what is accepted).
  { methods: ['POST'], path: /^\/api\/collections\/registrations\/records$/ },
  // Package flyers and sample shots (src/utils/packagePhotos.ts addresses them by name).
  { methods: ['GET', 'HEAD'], path: /^\/api\/files\/packages\/[A-Za-z0-9_]{1,40}\/[^/]{1,255}$/ },
  // QR short links handed to clients (pb_hooks/studio_qr.pb.js).
  { methods: ['GET', 'HEAD', 'POST'], path: /^\/q\/[A-Za-z0-9_-]{1,64}$/ },
];

// Request headers never sent upstream: no staff session can pass through this port, and the
// client address is set here (see X-Real-IP below), never taken from the request.
const DROP_REQUEST_HEADERS = ['authorization', 'cookie', 'x-real-ip', 'x-forwarded-for', 'forwarded', 'x-forwarded-host'];
// Hop-by-hop headers (RFC 9110 7.6.1) that a proxy must not forward.
const HOP_HEADERS = ['connection', 'keep-alive', 'proxy-connection', 'te', 'trailer', 'transfer-encoding', 'upgrade'];

const MAX_REALTIME_BODY = 16 * 1024;

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.wasm': 'application/wasm',
};

const agent = new http.Agent({ keepAlive: true });

function send(res, status, message) {
  if (res.headersSent) { res.destroy(); return; }
  const body = JSON.stringify({ status, message, data: {} });
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

function clientAddress(req) {
  return String(req.socket.remoteAddress || '').replace(/^::ffff:/, '');
}

/** The subscriptions a guest sends must all be public topics (empty = unsubscribe all). */
function checkRealtimeBody(body) {
  let parsed;
  try { parsed = JSON.parse(body.toString('utf8') || '{}'); } catch { return false; }
  const subscriptions = parsed && parsed.subscriptions;
  if (subscriptions === undefined || subscriptions === null) return true;
  return Array.isArray(subscriptions) && subscriptions.every((topic) =>
    typeof topic === 'string' && REALTIME_TOPICS.has(topic.split('?')[0]));
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) { reject(Object.assign(new Error('too large'), { status: 413 })); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function upstreamHeaders(req, url, bodyLength) {
  const headers = { ...req.headers };
  for (const name of [...DROP_REQUEST_HEADERS, ...HOP_HEADERS]) delete headers[name];
  headers['x-real-ip'] = clientAddress(req);
  headers['x-forwarded-proto'] = 'http';
  headers.host = req.headers.host || `${url.hostname}:${url.port}`;
  if (bodyLength !== undefined) {
    headers['content-length'] = String(bodyLength);
    delete headers['transfer-encoding'];
  }
  return headers;
}

function forward(req, res, pathAndQuery, body) {
  const upstream = http.request({
    protocol: UPSTREAM.protocol,
    hostname: UPSTREAM.hostname,
    port: UPSTREAM.port || 80,
    method: req.method,
    path: pathAndQuery,
    headers: upstreamHeaders(req, UPSTREAM, body ? body.length : undefined),
    agent,
  }, (response) => {
    const headers = { ...response.headers };
    for (const name of HOP_HEADERS) delete headers[name];
    delete headers['set-cookie'];
    res.writeHead(response.statusCode || 502, headers);
    // Realtime (text/event-stream) must reach the browser as it arrives.
    if (String(response.headers['content-type'] || '').startsWith('text/event-stream')) res.flushHeaders();
    response.pipe(res);
    response.on('error', () => res.destroy());
  });
  upstream.on('error', (error) => {
    console.error(`[gateway] ${req.method} ${pathAndQuery}: ${error.message}`);
    send(res, 502, 'The studio server is not reachable right now. Please tell the staff.');
  });
  // The browser left (closed tab, ended realtime stream): stop the upstream request too.
  res.on('close', () => { if (!res.writableFinished) upstream.destroy(); });
  if (body) upstream.end(body);
  else req.pipe(upstream);
}

async function serveStatic(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed.');
  let relative;
  try { relative = decodeURIComponent(pathname); } catch { return send(res, 400, 'Bad path.'); }
  if (relative === '/' || relative === '') relative = '/index.html';
  const file = path.resolve(PUBLIC_DIR, '.' + relative);
  // Stay inside the kiosk build; no dot files (the publish step's temp files, etc.).
  if ((file !== PUBLIC_DIR && !file.startsWith(PUBLIC_DIR + path.sep)) || path.basename(file).startsWith('.')) {
    return send(res, 404, 'Not found.');
  }
  let stat;
  try { stat = await fs.stat(file); } catch { stat = undefined; }
  if (!stat || !stat.isFile()) {
    if (relative === '/index.html') return send(res, 503, 'The kiosk build is missing. Run npm run build on the server.');
    return send(res, 404, 'Not found.');
  }
  const headers = {
    'Content-Type': CONTENT_TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
    'Content-Length': stat.size,
    'X-Content-Type-Options': 'nosniff',
    // Hash routes: the entry page is revalidated so it points to the current build; hashed
    // assets never change.
    'Cache-Control': relative === '/index.html' ? 'no-cache' : relative.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'public, max-age=3600',
  };
  res.writeHead(200, headers);
  if (req.method === 'HEAD') return res.end();
  createReadStream(file).on('error', () => res.destroy()).pipe(res);
}

async function handle(req, res) {
  let url;
  try { url = new URL(req.url || '/', 'http://gateway'); } catch { return send(res, 400, 'Bad request.'); }
  const { pathname } = url;
  // Normalised paths only: no // or /./ tricks reaching PocketBase's router.
  if (/\/\.{0,2}(\/|$)/.test(pathname.slice(1)) && pathname !== '/') return send(res, 404, 'Not found.');

  const isApi = pathname.startsWith('/api/') || pathname === '/api' || pathname.startsWith('/_') || pathname.startsWith('/q/');
  if (!isApi) return serveStatic(req, res, pathname);

  const matches = ROUTES.filter((entry) => entry.path.test(pathname));
  if (!matches.length) return send(res, 404, 'Not found.');
  // CORS preflight (the Vite kiosk dev server is another origin); PocketBase answers it.
  if (req.method === 'OPTIONS') return forward(req, res, pathname + url.search);
  const route = matches.find((entry) => entry.methods.includes(req.method || ''));
  if (!route) return send(res, 405, 'Method not allowed.');

  if (route.check) {
    let body;
    try { body = await readBody(req, MAX_REALTIME_BODY); } catch (error) { return send(res, error.status || 400, 'Bad request.'); }
    if (!route.check(body)) return send(res, 403, 'Only the registration updates are available here.');
    return forward(req, res, pathname + url.search, body);
  }
  return forward(req, res, pathname + url.search);
}

function start() {
  const separator = LISTEN.lastIndexOf(':');
  const host = separator > 0 ? LISTEN.slice(0, separator).replace(/^\[|\]$/g, '') : '0.0.0.0';
  const port = Number(separator >= 0 ? LISTEN.slice(separator + 1) : LISTEN);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(`Bad --http address: ${LISTEN}`);

  const server = http.createServer((req, res) => {
    handle(req, res).catch((error) => {
      console.error('[gateway]', error);
      send(res, 500, 'Something went wrong.');
    });
  });
  // Realtime streams stay open; uploads (the signature) may be slow on weak Wi-Fi.
  server.requestTimeout = 5 * 60 * 1000;
  server.on('error', (error) => {
    console.error(error.code === 'EADDRINUSE'
      ? `[gateway] Port ${port} is already in use. Is the client gateway already running?`
      : `[gateway] ${error.message}`);
    process.exit(1);
  });
  server.listen(port, host, () => {
    console.log(`[gateway] Client port listening on http://${host}:${port}`);
    console.log(`[gateway] Forwarding kiosk calls to ${UPSTREAM.origin} (staff port)`);
    console.log(`[gateway] Serving the kiosk build from ${PUBLIC_DIR}`);
  });
  return server;
}

if (require.main === module) start();

module.exports = { ROUTES, REALTIME_TOPICS, checkRealtimeBody, handle, start };
