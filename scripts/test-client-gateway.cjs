// The client port (scripts/client-gateway.cjs): what a guest device can and can't reach.
// A fake upstream stands in for PocketBase and records every request that gets through.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');
const { mkdtemp, mkdir, writeFile, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

async function listen(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return server.address().port;
}

test('client gateway forwards only the kiosk calls', async (t) => {
  const seen = [];
  const upstream = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      seen.push({ method: req.method, url: req.url, headers: req.headers, body: Buffer.concat(chunks).toString() });
      res.writeHead(200, { 'Content-Type': 'application/json', 'Set-Cookie': 'staff=1' });
      res.end(JSON.stringify({ ok: true }));
    });
  });
  const upstreamPort = await listen(upstream);

  const publicDir = await mkdtemp(join(tmpdir(), 'studioflow-gateway-'));
  await mkdir(join(publicDir, 'assets'));
  await writeFile(join(publicDir, 'index.html'), '<!doctype html><title>kiosk</title>');
  await writeFile(join(publicDir, 'assets', 'app-abc.js'), 'console.log(1)');
  await writeFile(join(publicDir, '.index-temp.tmp'), 'partial');

  process.env.STUDIOFLOW_CLIENT_HTTP = '127.0.0.1:0';
  process.env.STUDIOFLOW_STAFF_URL = `http://127.0.0.1:${upstreamPort}`;
  process.env.STUDIOFLOW_KIOSK_DIR = publicDir;
  const gateway = require('./client-gateway.cjs').start();
  await once(gateway, 'listening');
  const base = `http://127.0.0.1:${gateway.address().port}`;

  t.after(async () => {
    gateway.close();
    upstream.close();
    gateway.closeAllConnections?.();
    upstream.closeAllConnections?.();
    await rm(publicDir, { recursive: true, force: true });
  });

  const call = async (path, init) => {
    const before = seen.length;
    const response = await fetch(base + path, init);
    await response.arrayBuffer();
    return { status: response.status, headers: response.headers, forwarded: seen.length > before ? seen.at(-1) : undefined };
  };

  // The kiosk build.
  const page = await call('/');
  assert.equal(page.status, 200);
  assert.equal(page.headers.get('cache-control'), 'no-cache');
  assert.equal((await call('/assets/app-abc.js')).headers.get('cache-control'), 'public, max-age=31536000, immutable');
  assert.equal((await call('/.index-temp.tmp')).status, 404, 'Dot files are never served.');
  assert.equal((await call('/assets/%2e%2e/%2e%2e/package.json')).status, 404, 'No way out of the kiosk build.');

  // Staff-only things are refused here and never reach PocketBase.
  for (const [path, init] of [
    ['/_/', undefined],
    ['/api/collections/users/auth-with-password', { method: 'POST', body: '{}' }],
    ['/api/collections/_superusers/auth-with-password', { method: 'POST', body: '{}' }],
    ['/api/collections/registrations/records', undefined],
    ['/api/collections/payments/records', undefined],
    ['/api/collections/master_lists/records', undefined],
    ['/api/studioflow/makeup', undefined],
    ['/api/studioflow/student-excel', undefined],
    ['/api/studioflow/registrations/abc/confirm-payment', { method: 'POST', body: '{}' }],
    ['/api/files/registrations/abc/signature.png', undefined],
    ['/api/files/users/abc/avatar.png', undefined],
    ['/api/backups', undefined],
    ['/api/collections/registrations/records/abc', { method: 'PATCH', body: '{}' }],
    ['/api//studioflow/makeup', undefined],
  ]) {
    const result = await call(path, init);
    assert.equal(result.forwarded, undefined, `${path} must not reach PocketBase`);
    assert.ok([404, 405].includes(result.status), `${path}: ${result.status}`);
  }

  // Submitting the form: forwarded as a guest, whatever the browser sends.
  const submit = await call('/api/collections/registrations/records?expand=package', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json', Authorization: 'Bearer staff-token', Cookie: 'pb_auth=x',
      'X-Real-IP': '10.0.0.1', 'X-Forwarded-For': '10.0.0.1',
    },
    body: JSON.stringify({ first_name: 'Ana' }),
  });
  assert.equal(submit.status, 200);
  assert.equal(submit.forwarded.url, '/api/collections/registrations/records?expand=package');
  assert.equal(submit.forwarded.headers.authorization, undefined, 'No staff session passes through the client port.');
  assert.equal(submit.forwarded.headers.cookie, undefined);
  assert.equal(submit.forwarded.headers['x-forwarded-for'], undefined);
  assert.equal(submit.forwarded.headers['x-real-ip'], '127.0.0.1', 'The guest address is set by the gateway, never taken from the request.');
  assert.equal(submit.forwarded.body, JSON.stringify({ first_name: 'Ana' }));
  assert.equal(submit.headers.get('set-cookie'), null);

  for (const path of ['/api/studioflow/registration-catalog', '/api/files/packages/abc123/flyer_x1.jpg?thumb=480x360', '/api/health', '/q/AbC123xyz']) {
    const result = await call(path);
    assert.equal(result.status, 200, path);
    assert.equal(result.forwarded.url, path);
  }
  assert.equal((await call('/api/studioflow/registration-catalog', { method: 'DELETE' })).status, 405);

  // Realtime: the public catalog topic only.
  const realtime = (subscriptions) => call('/api/realtime', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId: 'c1', subscriptions }),
  });
  const allowed = await realtime(['studioflow-registration-catalog']);
  assert.equal(allowed.status, 200);
  assert.deepEqual(JSON.parse(allowed.forwarded.body).subscriptions, ['studioflow-registration-catalog']);
  assert.equal((await realtime([])).status, 200, 'Unsubscribing is allowed.');
  for (const topics of [['studioflow-workflow'], ['registrations'], ['payments/abc'], ['studioflow-registration-catalog', 'users']]) {
    const refused = await realtime(topics);
    assert.equal(refused.status, 403, topics.join());
    assert.equal(refused.forwarded, undefined);
  }

  // PocketBase down: a clear error, not a hang.
  upstream.close();
  upstream.closeAllConnections?.();
  await once(upstream, 'close');
  assert.equal((await call('/api/studioflow/registration-catalog')).status, 502);
});
