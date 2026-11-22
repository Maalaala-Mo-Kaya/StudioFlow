const assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');
const { once } = require('node:events');
const { mkdtemp, mkdir, writeFile, readdir, readFile, copyFile, link, stat, rm, rename, utimes } = require('node:fs/promises');
const { createHash, randomBytes, randomUUID } = require('node:crypto');
const { createServer } = require('node:net');
const { tmpdir } = require('node:os');
const { basename, join, resolve } = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { runInNewContext } = require('node:vm');
const { test } = require('node:test');
const { setTimeout: delay } = require('node:timers/promises');

const repo = resolve(__dirname, '..');
const executable = process.env.POCKETBASE_TEST_BINARY || join(repo, 'pocketbase.exe');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aUoUAAAAASUVORK5CYII=', 'base64');
const password = 'Isolated-Test-Password!';
const api = '/api/studioflow';
const { clientFolderName } = require('../pb_hooks/studio_photo_names.cjs');

test('photo repository names retain the official number and normalize client names', () => {
  assert.equal(clientFolderName('0018', 'Dela Cruz', 'Juan', ''), '0018_Dela_Cruz_Juan');
  assert.equal(clientFolderName('0018', '  Dela / Cruz ', 'Juan', 'Santos*'), '0018_Dela_Cruz_Juan_Santos');
  assert.equal(clientFolderName('0018', 'X'.repeat(500), 'Juan', ''), '0018_' + 'X'.repeat(115));
  const unicode = clientFolderName('0018', '😀'.repeat(100), '', '');
  assert.equal(unicode, '0018_' + '😀'.repeat(28));
  assert.ok(Buffer.byteLength(unicode) <= 120);
  assert.throws(() => clientFolderName('', 'Dela Cruz', 'Juan', ''), /official job order/);
});

async function port() {
  const socket = createServer();
  await new Promise((done, reject) => socket.once('error', reject).listen(0, '127.0.0.1', done));
  const number = socket.address().port;
  await new Promise((done) => socket.close(done));
  return number;
}

test('StudioFlow staff workflow on PocketBase and real photo folders', { timeout: 150_000 }, async (t) => {
  const home = await mkdtemp(join(tmpdir(), 'studioflow-workflow-'));
  const data = join(home, 'db');
  const photos = join(home, 'photos');
  // An empty public folder: otherwise PocketBase serves the repo's deployed pb_public, whose
  // index fallback answers unknown routes with 200 and hides missing-route (404) checks.
  const publicDir = join(home, 'public');
  await mkdir(publicDir);
  const host = 'http://127.0.0.1:' + await port();
  const flags = ['--dir', data, '--hooksDir', join(repo, 'pb_hooks'), '--migrationsDir', join(repo, 'pb_migrations')];
  const options = { env: { ...process.env, STUDIOFLOW_PHOTOS_ROOT: photos }, windowsHide: true };
  let server;
  let logs = '';
  const realtime = new AbortController();
  t.after(async () => {
    realtime.abort();
    if (server && server.exitCode === null && server.signalCode === null) {
      server.kill();
      await once(server, 'exit');
    }
    await rm(home, { recursive: true, force: true });
  });
  // Start from the preceding schema so the same run covers an in-place upgrade.
  const legacyMigrations = join(home, 'legacy-migrations');
  await mkdir(legacyMigrations);
  for (const filename of await readdir(join(repo, 'pb_migrations'))) {
    if (filename < '1793801600') await copyFile(join(repo, 'pb_migrations', filename), join(legacyMigrations, filename));
  }
  const legacyFlags = ['--dir', data, '--hooksDir', join(repo, 'pb_hooks'), '--migrationsDir', legacyMigrations];
  execFileSync(executable, ['superuser', 'upsert', 'test-admin@example.test', randomUUID(), ...legacyFlags], options);
  execFileSync(executable, ['migrate', 'up', ...legacyFlags], options);
  const legacyId = 'legacyreg000001';
  const legacyPath = join(photos, 'ORGANIZATION', 'COURSE', '00050_Dela_Cruz_Juan_Carlos');
  await mkdir(legacyPath, { recursive: true });
  await mkdir(join(legacyPath, 'selected'));
  await mkdir(join(legacyPath, 'unselected'));
  await writeFile(join(legacyPath, 'legacy.png'), png);
  const legacyDb = new DatabaseSync(join(data, 'data.db'));
  try {
    const legacyAddon = legacyDb.prepare("SELECT id, name, code, amount FROM add_ons WHERE code = 'ADD-HAIRMAKEUP'").get();
    // Inclusions saved the way the admin screen sends them (a JSON-encoded string).
    legacyDb.prepare(`INSERT INTO packages (id, code, name, amount, inclusions, is_active, created, updated)
      VALUES ('legacypkg00001', 'LEG', 'Legacy Package', 500, ?, 1, '2026-01-01 00:00:00.000Z', '2026-01-01 00:00:00.000Z')`)
      .run(JSON.stringify(JSON.stringify(['8x10 frame', 'Soft copies'])));
    // Duplicate catalog codes from before codes were unique (differing only in case and spaces),
    // plus two add-ons with no code, which stay allowed.
    const legacyItem = legacyDb.prepare(`INSERT INTO packages (id, code, name, amount, is_active, created, updated)
      VALUES (?, ?, ?, 500, 1, ?, ?)`);
    legacyItem.run('legacypkg00002', 'leg', 'Legacy Copy', '2026-01-02 00:00:00.000Z', '2026-01-02 00:00:00.000Z');
    legacyItem.run('legacypkg00003', ' LEG ', 'Legacy Copy 2', '2026-01-03 00:00:00.000Z', '2026-01-03 00:00:00.000Z');
    // Dated after the built-in add-ons (seeded when this test's database was created), so those keep their codes.
    const legacyAddOn = legacyDb.prepare(`INSERT INTO add_ons (id, code, name, amount, is_active, created, updated)
      VALUES (?, ?, ?, 50, 1, strftime('%Y-%m-%d %H:%M:%fZ', 'now', ?), strftime('%Y-%m-%d %H:%M:%fZ', 'now', ?))`);
    legacyAddOn.run('legacyadd00001', 'add-hairmakeup', 'Lowercase Copy', '+1 day', '+1 day');
    legacyAddOn.run('legacyadd00002', '', 'No Code A', '+2 days', '+2 days');
    legacyAddOn.run('legacyadd00003', '', 'No Code B', '+3 days', '+3 days');
    legacyDb.prepare(`INSERT INTO registrations
      (id, job_order_no, family_name, given_name, status, add_ons, paid_amount, total_amount, balance, payment_status,
        package, package_snapshot)
      VALUES (?, '00050', 'Dela Cruz', 'Juan Carlos', 'done_shooting', ?, 1000, 1500, 500, 'downpayment', 'legacypkg00001',
        json_object('id', 'legacypkg00001', 'code', 'LEG', 'name', 'Legacy Package', 'configuredAmount', 500))`)
      .run(legacyId, JSON.stringify([legacyAddon]));
    legacyDb.prepare(`INSERT INTO payments
      (id, registration, amount, payment_type, payment_method, cash_tendered, receipt_no, status, created, updated)
      VALUES ('legacypay00001', ?, 1000, 'additional', 'cash', 1000, 'REC-legacy-receipt', 'completed',
        '2026-01-05 01:00:00.000Z', '2026-01-05 01:00:00.000Z')`).run(legacyId);
  } finally { legacyDb.close(); }

  // Stage records from the old MUA catalog before applying consolidation.
  const oldMuaMigrations = join(home, 'old-mua-migrations');
  await mkdir(oldMuaMigrations);
  for (const filename of await readdir(join(repo, 'pb_migrations'))) {
    if (filename < '1793803400') await copyFile(join(repo, 'pb_migrations', filename), join(oldMuaMigrations, filename));
  }
  execFileSync(executable, ['migrate', 'up', ...flags.slice(0, -1), oldMuaMigrations], options);
  const oldMuaDb = new DatabaseSync(join(data, 'data.db'));
  const bundleId = 'legacybundle001';
  let oldAddOnId;
  try {
    oldAddOnId = oldMuaDb.prepare("SELECT id FROM add_ons WHERE code = 'ADD-HAIRMAKEUP'").get().id;
    const oldMakeupId = oldMuaDb.prepare("SELECT id FROM mua_service_types WHERE name = 'Makeup'").get().id;
    oldMuaDb.prepare(`INSERT INTO packages (id, code, name, amount, is_active, requires_mua, revenue_category)
      VALUES (?, 'LEGACY-BUNDLE', 'Premium Portrait', 1000, 1, 1, 'studio')`).run(bundleId);
    const insertLog = oldMuaDb.prepare(`INSERT INTO mua_completions
      (id, job_id, service_id, service_name, sources, artist_id, artist_name, local_date, completed_at, payout_rate)
      VALUES (?, ?, ?, 'Makeup', ?, 'legacy-artist', 'Historical Artist', '2026-01-06', '2026-01-06 01:00:00.000Z', ?)`);
    const addOnSource = { source: 'add_on', id: oldAddOnId, name: 'Professional Studio Hair & Makeup' };
    insertLog.run('oldmualog000001', 'old-mua-mapped', oldMakeupId, JSON.stringify([addOnSource]), 120);
    insertLog.run('oldmualog000002', 'old-mua-overlap', oldMakeupId, JSON.stringify([
      addOnSource, { source: 'package', id: bundleId, name: 'Premium Portrait' },
    ]), 80);
  } finally { oldMuaDb.close(); }
  async function startServer() {
    server = spawn(executable, ['serve', '--http', host.slice(7), '--publicDir', publicDir, ...flags], options);
    for (const stream of [server.stdout, server.stderr]) stream.on('data', (chunk) => { logs += chunk; });
    for (let attempt = 0; attempt < 60; attempt++) {
      if (await fetch(host + '/api/health').then((res) => res.ok).catch(() => false)) return;
      assert.equal(server.exitCode, null, logs);
      await delay(150);
    }
    assert.fail(logs);
  }
  await startServer();

  async function send(path, { token, method = 'GET', body, status = 200 } = {}) {
    const headers = token ? { Authorization: token } : {};
    if (body && !(body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(body);
    }
    const response = await fetch(host + path, { method, headers, body });
    const payload = response.headers.get('content-type')?.includes('/json')
      ? await response.json() : Buffer.from(await response.arrayBuffer());
    if (status) assert.equal(response.status, status, `${method} ${path}: ${JSON.stringify(payload)}\n${logs}`);
    return { status: response.status, payload };
  }

  const records = (collection, id = '') => '/api/collections/' + collection + '/records' + (id ? '/' + id : '');
  const login = (identity, secret = password, status = 200) => send('/api/collections/users/auth-with-password', {
    method: 'POST', body: { identity, password: secret }, status,
  }).then(({ payload }) => payload);
  const admin = (await login('admin', 'password123')).token;
  const cashier = (await login('cashier', 'password123')).token;
  const photographer = (await login('photographer', 'password123')).token;
  const create = (collection, body, token = admin) => send(records(collection), { method: 'POST', token, body }).then((r) => r.payload);
  const school = await create('organizations', { code: 'WORKFLOW', name: 'Workflow Academy', is_active: true });
  const level = await create('levels', { organization: school.id, name: 'College' });
  const assignment = await send(api + '/school-courses', {
    method: 'POST', token: admin, body: { schoolId: school.id, levelId: level.id, name: 'Media Arts', code: 'MEDIA' }, status: 201,
  });
  const course = { id: assignment.payload.course_id };
  const standard = await create('packages', {
    code: 'STD', name: 'Package E', inclusions: JSON.stringify(['Makeup and grooming']),
    amount: 1000, is_active: true, revenue_category: 'studio', requires_mua: false,
  });
  const prepared = await create('packages', {
    code: 'PKG-D', name: 'Package D', amount: 1000, is_active: true, photo_selection_limit: 2, requires_mua: true, revenue_category: 'mua',
  });
  const makeup = await create('add_ons', { code: 'EXTRA', name: 'Touch up', amount: 100, is_active: true, revenue_category: 'mua', requires_mua: true });
  const patchCatalog = (collection, item, body) => send(records(collection, item.id), { token: admin, method: 'PATCH', body })
    .then(({ payload }) => payload);
  async function createStaff(username, role) {
    const account = await create('users', { username, name: username, email: username + '@example.test', password, passwordConfirm: password, role });
    return { id: account.id, username, token: (await login(username)).token };
  }
  const artists = [];
  for (let n = 0; n < 10; n++) artists.push(await createStaff('artist' + n, 'mua'));
  const chooser = await createStaff('testchooser', 'chooser');
  const otherChooser = await createStaff('otherchooser', 'chooser');
  let sequence = 0;
  async function register(pkg, addOns = [], expected = 200, fields = {}) {
    const studentId = 'WF-' + ++sequence;
    const form = new FormData();
    for (const [key, value] of Object.entries({
      family_name: 'Dela Cruz', given_name: 'Juan Carlos', middle_name: 'D', gender: 'male', mobile_number: '09170000000',
      organization: school.id, level: level.id, course: course.id, package: pkg.id, student_id: studentId,
      terms_accepted: 'true', email: 'person@example.test', mobile_number: '0917-000-0000', add_ons: JSON.stringify(addOns),
      status: 'shooting', paid_amount: '1000', makeup_look: 'full', ...fields,
    })) form.set(key, value);
    form.set('signature', new Blob([png], { type: 'image/png' }), 'signature.png');
    const { payload } = await send(records('registrations'), { method: 'POST', body: form, status: expected });
    if (expected !== 200) return payload;
    assert.equal(payload.status, 'pending_payment');
    assert.equal(payload.paid_amount, 0);
    return payload;
  }
  async function pay(student, amount, type = 'full', status = 200, extra = {}) {
    return (await send(records('payments'), { token: cashier, method: 'POST', status, body: {
      registration: student.id, amount, cashier_name: 'Test cashier', payment_type: type,
      payment_method: 'cash', cash_tendered: amount, ...extra,
    } })).payload;
  }
  const contest = (student, actor, action, status = 200, body) => send(`${api}/makeup/${student.id}/${action}`, {
    method: 'POST', token: actor.token || actor, status, body: { version: '0', ...body },
  });
  const { default: PocketBase } = await import('pocketbase');
  const station = new PocketBase(host);
  const olderArtist = artists[0];
  station.authStore.save(olderArtist.token);
  const legacyAction = (student, action) => station.send(`${api}/makeup/${student.id}/${action}`, { method: 'POST' });
  const registrations = (student, token = admin, body, status = 200) => send(records('registrations', student.id), {
    method: body ? 'PATCH' : 'GET', token, body, status,
  });
  const queue = (actor) => send(api + '/makeup', { token: actor.token || actor }).then((r) => r.payload);
  const shoot = (student, status, expected = 200) => registrations(student, photographer, { status }, expected);

  const legacy = (await registrations({ id: legacyId })).payload;
  assert.match(legacy.makeup_service, /makeup/i);
  assert.equal(legacy.balance, 500);
  // The receipt upgrade backfills balances on existing payments and keeps their receipt numbers.
  const legacyPayment = (await send(records('payments', 'legacypay00001'), { token: admin })).payload;
  assert.deepEqual([legacyPayment.receipt_no, legacyPayment.balance_before, legacyPayment.balance_after], ['REC-legacy-receipt', 1500, 500]);
  assert.equal(legacy.status, 'done_shooting');
  assert.equal(legacy.job_order_no, '00050');
  // The upgrade adds the package contents to the saved snapshot and keeps the sold-price fields as saved.
  assert.deepEqual(legacy.package_snapshot, {
    id: 'legacypkg00001', code: 'LEG', name: 'Legacy Package', configuredAmount: 500,
    inclusions: ['8x10 frame', 'Soft copies'], photo_selection_limit: 0,
  });
  const builtInAddOn = (await send(records('add_ons'))).payload.items.find((item) => item.code === 'ADD-HAIRMAKEUP');
  assert.equal(builtInAddOn.requires_mua, true);

  // Unique catalog codes: the upgrade keeps the oldest item's code and renames later duplicates
  // (matched ignoring case and spaces); add-ons without a code are left alone.
  const catalogCode = async (collection, id) => (await send(records(collection, id), { token: admin })).payload.code;
  assert.deepEqual(await Promise.all(['legacypkg00001', 'legacypkg00002', 'legacypkg00003'].map((id) => catalogCode('packages', id))),
    ['LEG', 'leg-2', 'LEG-3']);
  assert.equal(await catalogCode('add_ons', builtInAddOn.id), 'ADD-HAIRMAKEUP');
  assert.deepEqual(await Promise.all(['legacyadd00001', 'legacyadd00002', 'legacyadd00003'].map((id) => catalogCode('add_ons', id))),
    ['add-hairmakeup-2', '', '']);
  // The saved job order keeps the code it was sold with.
  assert.equal(legacy.package_snapshot.code, 'LEG');
  // New items: a code in use (any case, with spaces) is refused with a clear message; codes are trimmed.
  const duplicate = await send(records('packages'), { token: admin, method: 'POST', status: 400,
    body: { code: ' leg ', name: 'Another', amount: 100, is_active: true } });
  assert.match(duplicate.payload.message, /Code leg is already used by another package/);
  const renamed = await send(records('packages', 'legacypkg00002'), { token: admin, method: 'PATCH', status: 400, body: { code: 'Leg-3' } });
  assert.match(renamed.payload.message, /already used/);
  const untyped = await send(records('add_ons'), { token: admin, method: 'POST', status: 400, body: { code: 'NO-TYPE', name: 'No type', amount: 10, is_active: true } });
  assert.match(untyped.payload.message, /money goes: Studio revenue or Other Payment — MUA/);
  await send(records('packages'), { token: admin, method: 'POST', status: 400, body: { code: 'NO-TYPE', name: 'No type', amount: 10, is_active: true, revenue_category: 'other' } });
  const trimmed = await create('add_ons', { code: '  UNIQUE-TRIM  ', name: 'Trimmed', amount: 10, is_active: true, revenue_category: 'studio' });
  assert.equal(trimmed.code, 'UNIQUE-TRIM');
  await send(records('add_ons'), { token: admin, method: 'POST', status: 400, body: { code: 'unique-trim', name: 'Dup', amount: 10 } });
  const noCode = await create('add_ons', { code: '', name: 'Another without a code', amount: 10, is_active: true, revenue_category: 'studio' });
  for (const id of ['legacyadd00001', 'legacyadd00002', 'legacyadd00003', trimmed.id, noCode.id]) {
    await send(records('add_ons', id), { token: admin, method: 'DELETE', status: 204 });
  }
  // Two saves racing with one new code: exactly one wins (the unique index backs up the hook).
  const codeRace = await Promise.all([1, 2].map((n) => send(records('packages'), { token: admin, method: 'POST', status: 0,
    body: { code: 'RACE-CODE', name: 'Race ' + n, amount: 100, is_active: true, revenue_category: 'studio' } })));
  assert.deepEqual(codeRace.map((r) => r.status).sort(), [200, 400]);
  for (const id of ['legacypkg00002', 'legacypkg00003']) await send(records('packages', id), { token: admin, method: 'DELETE', status: 204 });
  await send(records('packages', codeRace.find((r) => r.status === 200).payload.id), { token: admin, method: 'DELETE', status: 204 });
  await registrations(legacy, admin, { family_name: 'Corrected Name' });
  assert.equal((await send(`${api}/photo-folder/${legacyId}`, { method: 'POST', token: photographer })).payload.path, legacyPath);
  await registrations(legacy, cashier, { status: 'released', framing_status: 'released' }, 400);

  function readRealtime(stream) {
    const reader = stream.body.getReader();
    let pendingEvents = '';
    return async function readEvent(name, matches = () => true) {
      while (true) {
        const boundary = pendingEvents.indexOf('\n\n');
        if (boundary < 0) {
          const { value, done } = await reader.read();
          if (done) throw new Error('Realtime stream closed.');
          pendingEvents += Buffer.from(value).toString();
          continue;
        }
        const event = pendingEvents.slice(0, boundary);
        pendingEvents = pendingEvents.slice(boundary + 2);
        if (event.includes('event:' + name) || event.includes('event: ' + name)) {
          const payload = JSON.parse(event.split('\n').find((line) => line.startsWith('data:')).slice(5));
          if (matches(payload)) return payload;
        }
      }
    };
  }
  const readEvent = readRealtime(await fetch(host + '/api/realtime', { signal: realtime.signal }));
  const connect = await readEvent('PB_CONNECT');
  await send('/api/realtime', { method: 'POST', token: photographer, status: 204,
    body: { clientId: connect.clientId, subscriptions: ['studioflow-workflow', 'registrations/*'] } });

  const plain = await register(standard);
  const liveUpdate = await Promise.race([readEvent('studioflow-workflow'), delay(4000, 'timeout', { ref: false })]);
  assert.deepEqual(liveUpdate, {}, 'The server must notify connected realtime clients.');
  const unpaid = await register(prepared);
  // The kiosk needs a mobile number (email is optional but must be valid when given).
  const contactErrors = (fields) => register(standard, [], 400, fields).then((payload) => Object.keys(payload.data || {}));
  assert.deepEqual(await contactErrors({ mobile_number: '' }), ['mobile_number']);
  assert.deepEqual(await contactErrors({ mobile_number: '12345' }), ['mobile_number']);
  assert.deepEqual(await contactErrors({ email: 'not-an-email' }), ['email']);
  // Each job order keeps the package contents it was sold with.
  assert.deepEqual([plain.package_snapshot.inclusions, plain.package_snapshot.photo_selection_limit, plain.package_snapshot.amount],
    [['Makeup and grooming'], 0, 1000]);
  assert.deepEqual([unpaid.package_snapshot.inclusions, unpaid.package_snapshot.photo_selection_limit], [[], 2]);
  await patchCatalog('packages', prepared, { inclusions: JSON.stringify(['Changed later']), photo_selection_limit: 9 });
  assert.deepEqual((await registrations(unpaid)).payload.package_snapshot, unpaid.package_snapshot,
    'Editing a package does not change orders already placed.');
  await patchCatalog('packages', prepared, { inclusions: JSON.stringify([]), photo_selection_limit: 2 });
  // A package or add-on that orders use can't be deleted (deactivate it instead); unused ones can.
  await send(records('packages', prepared.id), { token: admin, method: 'DELETE', status: 409 });
  const unusedPackage = await create('packages', { code: 'TMP', name: 'Unused', amount: 0, is_active: true, revenue_category: 'studio' });
  await send(records('packages', unusedPackage.id), { token: admin, method: 'DELETE', status: 204 });
  const unusedAddOn = await create('add_ons', { code: 'TMP-ADD', name: 'Unused add-on', amount: 0, is_active: true, revenue_category: 'studio' });
  await send(records('add_ons', unusedAddOn.id), { token: admin, method: 'DELETE', status: 204 });
  assert.deepEqual([plain.job_order_no, plain.queue_number, unpaid.job_order_no, unpaid.queue_number], [null, null, null, null]);
  assert.deepEqual([(await registrations(plain, cashier)).payload.job_order_no, (await registrations(plain, cashier)).payload.queue_number], [null, null]);
  await pay(plain, 1, 'full', 400);
  assert.equal((await registrations(plain)).payload.job_order_no, null);
  await registrations(plain, admin, { job_order_no: '12345' }, 403);
  await registrations(plain, admin, { queue_number: 123 }, 403);
  // The client folder is made at the first payment, named <job no>_<Last>_<First> (no record ID).
  const clientFolder = (student) => join(photos, 'WORKFLOW', 'MEDIA', `${student.job_order_no}_Dela_Cruz_Juan_Carlos_D`);
  await assert.rejects(stat(join(photos, 'WORKFLOW', 'MEDIA')), { code: 'ENOENT' }, 'An unpaid registration has no folder yet.');
  await pay(plain, 1000);
  const paidPlain = (await registrations(plain)).payload;
  assert.equal(paidPlain.job_order_no, '00051', 'Failed payments consume no number and the legacy sequence carries forward.');
  assert.ok(paidPlain.queue_number > 0, 'No-MUA jobs are ready for photography at payment.');
  assert.ok((await stat(clientFolder(paidPlain))).isDirectory(), 'The first payment creates the client folder.');
  assert.deepEqual((await readdir(clientFolder(paidPlain))).sort(), [basename(clientFolder(paidPlain)), 'Unselected'].sort());
  assert.equal((await queue(artists[0])).length, 0);
  assert.equal((await send(api + '/queue-count')).payload.count, 1);
  assert.equal((await send(records('registrations'))).payload.items.length, 0);
  assert.equal((await send(records('registrations'), { token: chooser.token })).payload.items.length, 0);
  await registrations(plain, chooser.token, { status: 'shooting' }, 404);
  await send(api + '/makeup', { token: chooser.token, status: 403 });
  await send(api + '/chooser', { token: artists[0].token, status: 403 });
  await send(records('users', artists[0].id), { token: artists[0].token, method: 'PATCH', body: { role: 'admin' }, status: 404 });
  await send(records('payments'), { token: artists[0].token, method: 'POST', body: {}, status: 400 });
  await contest(unpaid, artists[0], 'claim', 409);
  await shoot(plain, 'shooting');
  await shoot(plain, 'done_shooting');

  let galleryStudent;
  for (const count of [2, 5, 10]) {
    const student = await register(count === 5 ? standard : prepared, count === 5 ? [{ id: makeup.id }] : []);
    await pay(student, count === 5 ? 550 : 500, 'initial');
    const paid = (await registrations(student)).payload;
    assert.match(paid.job_order_no, /^\d{5,}$/);
    assert.equal(paid.queue_number, null);
    if (count === 2) {
      const update = await Promise.race([
        readEvent('registrations/*', ({ record }) => record.id === student.id && record.status === 'paid'),
        delay(4000, 'timeout', { ref: false }),
      ]);
      assert.equal(update.action, 'update', 'Confirmed payment notifies connected queue clients.');
    }
    const waiting = await queue(artists[0]);
    assert.deepEqual(waiting.map((row) => row.id), [student.id]);
    assert.equal(waiting[0].state, 'waiting');
    assert.equal(waiting[0].queueNumber, null);
    assert.equal(waiting[0].version, 0);
    assert.equal(waiting[0].services[0].source, count === 5 ? 'add_on' : 'package');
    await shoot(student, 'shooting', 400);
    const clients = artists.slice(0, count);
    const [results, correction] = await Promise.all([
      Promise.all(clients.map((actor) => actor === olderArtist
        ? legacyAction(student, 'claim').then(
          (payload) => ({ status: 200, payload }),
          (error) => ({ status: error.status, payload: error.response }),
        )
        : contest(student, actor, 'claim', null, { version: String(waiting[0].version) }))),
      registrations(student, admin, { department: 'Media' }, null),
    ]);
    assert.ok([200, 409].includes(correction.status));
    if (correction.status === 200) assert.equal((await registrations(student)).payload.department, 'Media');
    assert.equal(results.filter((entry) => entry.status === 200).length, 1, JSON.stringify(results));
    assert.equal(results.filter((entry) => entry.status === 409).length, count - 1);
    assert.ok(results.filter((entry) => entry.status === 409).every((entry) => entry.payload.data.reason?.code === 'already_assigned'), JSON.stringify(results));
    const owner = clients[results.findIndex((entry) => entry.status === 200)];
    const other = clients.find((artist) => artist.id !== owner.id);
    assert.equal((await queue(other)).length, 0);
    const reloaded = { ...owner, token: (await login(owner.username)).token };
    assert.equal((await queue(reloaded))[0].state, 'claimed');
    assert.equal((await registrations(student)).payload.queue_number, null);
    await contest(student, owner, 'claim');
    await contest(student, other, 'start', 403);
    await contest(student, owner, 'start');
    assert.equal((await registrations(student)).payload.queue_number, null);
    await contest(student, owner, 'start');
    await shoot(student, 'done_shooting', 400);
    await contest(student, owner, 'complete');
    const completed = (await registrations(student)).payload;
    assert.equal(completed.job_order_no, paid.job_order_no);
    assert.ok(completed.queue_number > 0);
    await contest(student, owner, 'complete');
    assert.equal((await registrations(student)).payload.queue_number, completed.queue_number);
    if (count === 2) {
      const update = await Promise.race([
        readEvent('registrations/*', ({ record }) => record.id === student.id && record.makeup_state === 'completed'),
        delay(4000, 'timeout', { ref: false }),
      ]);
      assert.equal(update.action, 'update', 'The photographer receives makeup completion through the existing PocketBase subscription.');
      realtime.abort();
    }
    assert.equal((await queue(owner)).length, 0);
    assert.equal((await send(api + '/queue-count')).payload.count, 1);
    assert.ok((await queue(admin)).some((item) => item.id === student.id && item.artistId === owner.id && item.completedAt));
    await shoot(student, 'shooting');
    await shoot(student, 'done_shooting');
    galleryStudent = completed;
  }
  const paused = await register(prepared);
  await pay(paused, 1000);
  assert.equal((await legacyAction(paused, 'claim')).state, 'claimed');
  assert.equal((await legacyAction(paused, 'start')).state, 'in_progress');
  await send(records('users', artists[0].id), { token: admin, method: 'PATCH', body: { disabled: true } });
  await login(artists[0].username, password, 403);
  await send(api + '/makeup', { token: artists[0].token, status: 403 });

  const cancelledPayment = await register(prepared);
  await pay(cancelledPayment, 1000);
  assert.ok((await queue(artists[2])).some((row) => row.id === cancelledPayment.id));
  const transactions = (await send(records('payments'), { token: admin })).payload.items;
  const receipt = transactions.find((item) => item.registration === cancelledPayment.id);
  // Voids go through the void route (who, when, why); direct edits of a saved payment are refused.
  await send(records('payments', receipt.id), { token: admin, method: 'PATCH', body: { status: 'voided' }, status: 403 });
  await send(`${api}/payments/${receipt.id}/void`, { method: 'POST', token: cashier, body: { reason: 'wrong client' }, status: 403 });
  await send(`${api}/payments/${receipt.id}/void`, { method: 'POST', token: admin, body: { reason: '' }, status: 400 });
  const voided = (await send(`${api}/payments/${receipt.id}/void`, { method: 'POST', token: admin, body: { reason: 'wrong client' } })).payload;
  assert.deepEqual([voided.status, voided.void_reason, Boolean(voided.voided_at && voided.voided_by)], ['voided', 'wrong client', true]);
  await send(`${api}/payments/${receipt.id}/void`, { method: 'POST', token: admin, body: { reason: 'again' }, status: 409 });
  await send(records('payments', receipt.id), { token: admin, method: 'DELETE', status: 403 });
  await contest(cancelledPayment, artists[2], 'claim', 409);
  assert.ok(!(await queue(artists[2])).some((row) => row.id === cancelledPayment.id));
  await contest(paused, admin, 'release', 200, { artistId: artists[0].id });
  station.authStore.save(artists[1].token);
  await assert.rejects(legacyAction(paused, 'claim'), { status: 409 });
  await contest(paused, artists[1], 'claim', 409);
  await contest(paused, artists[1], 'claim', 200, { version: '1' });
  await contest(paused, admin, 'release', 409, { artistId: artists[0].id, version: '1' });
  await contest(paused, admin, 'release', 200, { artistId: artists[1].id, version: '1' });
  await contest(paused, artists[1], 'claim', 200, { version: '2' });
  await contest(paused, admin, 'release', 409, { artistId: artists[1].id, version: '1' });
  await contest(paused, artists[1], 'start', 409, { version: '1' });
  assert.equal((await queue(artists[1])).find((row) => row.id === paused.id).state, 'claimed');
  await send(records('users', artists[0].id), { token: admin, method: 'PATCH', body: { disabled: false, role: 'chooser' } });
  await send(api + '/chooser', { token: artists[0].token });
  await send(api + '/makeup', { token: artists[0].token, status: 403 });

  const folder = (student) => send(`${api}/photo-folder/${student.id}`, { method: 'POST', token: photographer })
    .then(({ payload }) => payload.path);
  const plainFolder = await folder(plain);
  const path = await folder(galleryStudent);
  assert.notEqual(path, plainFolder);
  assert.equal(path, clientFolder(galleryStudent));
  assert.equal(plainFolder, clientFolder(paidPlain));
  assert.equal((await send(api + '/chooser?q=' + plain.student_id, { token: chooser.token })).payload.items[0].availability, 'empty');
  await writeFile(join(plainFolder, 'other.png'), png);
  await writeFile(join(path, 'first.png'), png);
  await writeFile(join(path, 'second.png'), png);
  await writeFile(join(path, 'third.png'), png);
  await writeFile(join(path, 'raw.cr3'), png);
  await writeFile(join(path, 'corrupted.png'), 'This is not a valid picture.');
  const list = (q) => send(api + '/chooser?q=' + encodeURIComponent(q), { token: chooser.token }).then((r) => r.payload.items);
  for (const key of ['Juan Carlos Dela Cruz', 'Workflow Academy', 'Media Arts', galleryStudent.student_id, galleryStudent.job_order_no]) {
    assert.ok((await list(key)).some((item) => item.id === galleryStudent.id && item.availability === 'available'));
  }
  // Search lists only photographed clients: a client not photographed yet is not found.
  assert.deepEqual(await list(unpaid.student_id), []);
  const route = `${api}/chooser/${galleryStudent.id}`;
  const open = (actor = chooser) => send(route + '/open', { token: actor.token, method: 'POST' }).then((r) => r.payload);
  const first = await open();
  const concurrent = await open(otherChooser);
  assert.equal((await list(galleryStudent.student_id))[0].selectionState, 'in_progress');
  assert.equal(first.photos.length, 3);
  assert.equal(first.version, concurrent.version);
  assert.deepEqual((await readdir(join(path, 'Unselected'))).sort(), ['first.png', 'second.png', 'third.png']);
  assert.deepEqual(await readdir(join(path, basename(path))), []);
  const image = route + '/image/' + first.photos[0].id + '?' + new URLSearchParams(first.photos[0]);
  await send(image, { token: artists[1].token, status: 403 });
  assert.deepEqual((await send(image, { token: chooser.token })).payload, png);
  await send(route + '/image/' + first.photos[0].id + '?name=..%2Fsignature.png', { token: chooser.token, status: 404 });
  const choose = (snapshot, photos, actor = chooser, status = 200, requestId = randomUUID()) => send(route + '/confirm', {
    token: actor.token, method: 'POST', status, body: { version: snapshot.version, requestId, selected: photos.map((photo) => photo.id) },
  }).then((r) => r.payload);
  await choose(first, first.photos, chooser, 400);
  const requestId = randomUUID();
  const confirmed = await choose(first, first.photos.slice(0, 2), chooser, 200, requestId);
  assert.equal(confirmed.photos.filter((photo) => photo.selected).length, 2);
  assert.equal((await choose(first, first.photos.slice(0, 2), chooser, 200, requestId)).version, confirmed.version);
  await choose(concurrent, concurrent.photos.slice(-1), otherChooser, 409);
  assert.equal((await list(galleryStudent.student_id))[0].selectionState, 'completed');
  // Chooser filters: already selected / not yet, school or walk-ins, course, with counts.
  const browse = (params) => send(api + '/chooser?' + new URLSearchParams(params), { token: chooser.token }).then((r) => r.payload);
  const ids = (result) => result.items.map((item) => item.id);
  const chosenView = await browse({ done: 'selected' });
  assert.ok(ids(chosenView).includes(galleryStudent.id), 'Already selected lists the client who confirmed.');
  assert.ok(!ids(chosenView).includes(plain.id));
  const waitingView = await browse({ done: 'not_selected' });
  assert.ok(ids(waitingView).includes(plain.id) && !ids(waitingView).includes(galleryStudent.id), 'Not yet selected leaves them out.');
  assert.ok(!ids(waitingView).includes(unpaid.id), 'Clients not photographed yet are not listed without a search.');
  assert.equal(waitingView.counts.all, waitingView.counts.selected + waitingView.counts.notSelected);
  assert.equal(waitingView.counts.selected, chosenView.counts.selected);
  assert.ok(waitingView.counts.selected >= 1 && waitingView.counts.notSelected >= 1);
  assert.ok(ids(await browse({ done: 'selected', school: school.id, course: course.id })).includes(galleryStudent.id));
  assert.equal((await browse({ school: 'walkin', done: 'selected' })).items.length, 0, 'No walk-in has chosen yet.');
  assert.equal((await browse({ course: 'nosuchcourse' })).counts.all, 0);
  assert.ok(ids(await browse({ q: galleryStudent.job_order_no, done: 'selected' })).includes(galleryStudent.id), 'Search combines with the filter.');
  assert.equal((await browse({ q: galleryStudent.job_order_no, done: 'not_selected' })).items.length, 0);
  const choices = (await send(api + '/chooser-filters', { token: chooser.token })).payload.schools;
  const workflowSchool = choices.find((item) => item.id === school.id);
  assert.equal(workflowSchool.name, 'WORKFLOW');
  assert.ok(workflowSchool.courses.some((item) => item.id === course.id && item.name === 'MEDIA' && item.clients >= 2));
  await send(api + '/chooser-filters', { token: photographer, status: 403 });
  // Every active school is offered, with all its courses, even with no photographed clients yet.
  const emptySchool = await create('organizations', { code: 'EMPTY', name: 'Empty Academy', is_active: true });
  const emptyLevel = await create('levels', { organization: emptySchool.id, name: 'College' });
  const emptyCourse = (await send(api + '/school-courses', {
    method: 'POST', token: admin, status: 201, body: { schoolId: emptySchool.id, levelId: emptyLevel.id, name: 'Empty Course', code: 'EMPTYC' },
  })).payload.course_id;
  const offered = (await send(api + '/chooser-filters', { token: chooser.token })).payload.schools.find((item) => item.id === emptySchool.id);
  assert.deepEqual([offered?.clients, offered?.courses.map((item) => [item.id, item.name, item.clients])], [0, [[emptyCourse, 'EMPTYC', 0]]]);
  // Job orders created today (studio day, Manila) / on another day.
  const today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
  assert.ok(ids(await browse({ done: 'selected', day: today })).includes(galleryStudent.id), "Today's job orders");
  assert.equal((await browse({ day: '2020-01-01' })).counts.all, 0);
  await send(api + '/chooser?day=2020-02-31', { token: chooser.token, status: 200 });
  const reopened = await open(otherChooser);
  assert.equal(reopened.photos.filter((photo) => photo.selected).length, 2);
  const revised = await choose(reopened, reopened.photos.filter((photo) => photo.name === 'third.png'), otherChooser);
  assert.deepEqual(await readdir(join(path, basename(path))), ['third.png']);
  assert.deepEqual((await readdir(join(path, 'Unselected'))).sort(), ['first.png', 'second.png']);
  assert.deepEqual(await readFile(join(plainFolder, 'other.png')), png);
  assert.deepEqual(await readFile(join(path, 'raw.cr3')), png);

  // Fixture for a process interrupted after the exclusive hard-link but before
  // source removal. Include a second move blocked by an unrelated destination.
  const source = join(path, 'Unselected', 'first.png');
  const firstDestination = join(path, basename(path), 'first.png');
  await link(source, firstDestination);
  const fingerprint = async (filename) => {
    const info = await stat(filename, { bigint: true });
    return [Number(info.size), String(Number(info.mtimeNs))];
  };
  const blocked = join(path, basename(path), 'second.png');
  await writeFile(blocked, Buffer.from('existing file must be preserved'));
  const journal = { request: { id: randomUUID(), actor: chooser.id }, moves: [
    { from: 'Unselected/first.png', to: `${basename(path)}/first.png`, fingerprint: await fingerprint(source) },
    { from: 'Unselected/second.png', to: `${basename(path)}/second.png`, fingerprint: await fingerprint(join(path, 'Unselected', 'second.png')) },
    { from: `${basename(path)}/third.png`, to: 'Unselected/third.png', fingerprint: await fingerprint(join(path, basename(path), 'third.png')) },
  ], selected: [
    [`${basename(path)}/first.png`, await fingerprint(source)],
    [`${basename(path)}/second.png`, await fingerprint(join(path, 'Unselected', 'second.png'))],
  ] };
  const db = new DatabaseSync(join(data, 'data.db'));
  try {
    db.prepare('UPDATE registrations SET photo_pending = ? WHERE id = ?').run(JSON.stringify(journal), galleryStudent.id);
  } finally { db.close(); }
  await send(route, { token: chooser.token, status: 503 });
  assert.equal(await readFile(blocked, 'utf8'), 'existing file must be preserved');
  assert.deepEqual(await readFile(join(path, 'Unselected', 'second.png')), png);
  await rm(blocked);
  const recovered = (await send(route, { token: chooser.token })).payload;
  assert.notEqual(recovered.version, revised.version);
  assert.equal(recovered.photos.filter((photo) => photo.selected).length, 2);
  assert.deepEqual(await readdir(join(path, 'Unselected')), ['third.png']);
  assert.equal(createHash('sha256').update(await readFile(firstDestination)).digest('hex'), createHash('sha256').update(png).digest('hex'));

  const collisionBytes = Buffer.concat([png, Buffer.from('new export')]);
  await writeFile(join(path, 'first.png'), collisionBytes);
  const withDuplicateName = await open();
  const collision = await choose(withDuplicateName, withDuplicateName.photos.filter((photo) => photo.name === 'first.png'));
  assert.deepEqual((await readdir(join(path, basename(path)))).sort(), ['first.png', 'first_2.png']);
  assert.deepEqual(await readFile(join(path, basename(path), 'first.png')), png);
  assert.deepEqual(await readFile(join(path, basename(path), 'first_2.png')), collisionBytes);
  const race = await Promise.all([
    send(route + '/confirm', { method: 'POST', token: chooser.token, status: null,
      body: { version: collision.version, requestId: randomUUID(), selected: [collision.photos[0].id] } }),
    send(route + '/confirm', { method: 'POST', token: otherChooser.token, status: null,
      body: { version: collision.version, requestId: randomUUID(), selected: [collision.photos[1].id] } }),
  ]);
  assert.deepEqual(race.map(({ status }) => status).sort(), [200, 409]);

  // Configuration is captured at registration and stays attached to the order.
  await patchCatalog('packages', prepared, { name: 'Renamed portrait' });
  await patchCatalog('add_ons', makeup, { name: 'Renamed studio upgrade' });
  const both = await register(prepared, [{ id: makeup.id, requires_mua: false }]);
  assert.equal(both.total_amount, 1100);
  await pay(both, 550, 'initial');
  await pay(both, 550, 'initial', 400);
  await pay(both, 550, 'additional');

  // Official receipts: numbers, balances and change are assigned by the server and frozen.
  const receipts = (await send(records('payments') + '?perPage=500&sort=created', { token: admin })).payload.items
    .filter((item) => item.registration === both.id);
  assert.deepEqual(receipts.map((item) => [item.balance_before, item.balance_after]), [[1100, 550], [550, 0]]);
  assert.ok(receipts.every((item) => /^OR-\d{6}$/.test(item.receipt_no)), JSON.stringify(receipts.map((item) => item.receipt_no)));
  assert.equal(Number(receipts[1].receipt_no.slice(3)), Number(receipts[0].receipt_no.slice(3)) + 1);
  const withChange = await register(standard);
  await pay(withChange, 1000, 'full', 400, { cash_tendered: 900 });
  const changed = await pay(withChange, 1000, 'full', 200, {
    cash_tendered: 1500, change_amount: 0, receipt_no: 'FAKE-1', balance_before: 9, balance_after: 9,
  });
  assert.deepEqual([changed.cash_tendered, changed.change_amount, changed.balance_before, changed.balance_after], [1500, 500, 1000, 0]);
  assert.equal(Number(changed.receipt_no.slice(3)), Number(receipts[1].receipt_no.slice(3)) + 1);
  // Saved payments can't be edited at all through the API (not even remarks); voids use the void route.
  for (const body of [{ receipt_no: 'OR-999999' }, { amount: 900 }, { change_amount: 0 }, { balance_after: 10 }, { remarks: 'Checked' }]) {
    await send(records('payments', changed.id), { token: admin, method: 'PATCH', body, status: 403 });
  }
  // A payment sent as "voided" is saved as a real, completed payment.
  const sneaky = await register(standard);
  assert.equal((await pay(sneaky, 1000, 'full', 200, { status: 'voided' })).status, 'completed');
  // A retried request with the same client_key is refused; the station then finds the saved payment by that key.
  const retried = await register(standard);
  const key = randomUUID();
  await pay(retried, 500, 'initial', 200, { payment_method: 'gcash', cash_tendered: 5000, client_key: key });
  await pay(retried, 100, 'additional', 200, { client_key: 'other-' + key });
  await pay(retried, 100, 'additional', 400, { client_key: 'other-' + key });
  const found = (await send(records('payments') + '?filter=' + encodeURIComponent(`client_key = '${key}'`), { token: cashier })).payload.items;
  assert.deepEqual(found.map((item) => [item.amount, item.cash_tendered, item.change_amount]), [[500, 0, 0]]);
  assert.equal((await registrations(retried)).payload.balance, 400);
  const waitingFor = async (student) => (await queue(artists[2])).filter((row) => row.id === student.id);
  await patchCatalog('packages', prepared, { is_active: false });
  await register(prepared, [], 400);
  assert.equal((await waitingFor(both)).length, 1);
  const beforeCatalogChange = (await waitingFor(both))[0];
  assert.deepEqual(beforeCatalogChange.services.map(({ source, name }) => [source, name]),
    [['package', 'Renamed portrait'], ['add_on', 'Renamed studio upgrade']]);
  await patchCatalog('packages', prepared, { requires_mua: false, is_active: true });
  await patchCatalog('add_ons', makeup, { requires_mua: false, name: 'Hair & Makeup', is_active: false });
  assert.deepEqual((await waitingFor(both))[0].services, beforeCatalogChange.services);
  await pay(unpaid, 1000);
  assert.equal((await waitingFor(unpaid))[0].services[0].name, 'Package D');
  const updated = await register(prepared);
  await register(prepared, [{ id: makeup.id }], 400);
  await patchCatalog('add_ons', makeup, { is_active: true });
  const unflagged = await register(standard, [{ id: makeup.id, requires_mua: true }]);
  await pay(unflagged, 1100);
  assert.equal((await waitingFor(unflagged)).length, 0);
  await pay(updated, 1000);
  assert.equal((await waitingFor(updated)).length, 0);
  const photoCount = () => send(api + '/queue-count').then(({ payload }) => payload.count);
  const priorCount = await photoCount();
  await registrations(updated, cashier, { mua_correction: 'required' }, 403);
  await registrations(updated, admin, { mua_correction: 'required' });
  assert.equal((await waitingFor(updated))[0].services[0].source, 'admin');
  assert.equal(await photoCount(), priorCount - 1);
  await shoot(updated, 'shooting', 400);
  await registrations(updated, admin, { status: 'shooting' }, 400);
  await contest(updated, artists[2], 'claim', 200, { version: '1' });
  await registrations(updated, admin, { mua_correction: 'waived' }, 409);
  await contest(updated, admin, 'release', 200, { artistId: artists[2].id, version: '1' });
  await registrations(updated, admin, { mua_correction: 'waived' });
  assert.equal((await waitingFor(updated)).length, 0);
  assert.equal(await photoCount(), priorCount);
  await shoot(updated, 'shooting');
  await registrations(updated, admin, { mua_correction: 'required' }, 409);
  assert.equal((await registrations(updated)).payload.paid_amount, 1000);

  await send(api + '/mua-service-types', { token: admin, status: 404 });
  await send(records('mua_service_types'), { token: admin, status: 403 });
  const hair = await create('add_ons', {
    code: 'HAIR', name: 'Hair Styling', amount: 150, is_active: true, revenue_category: 'mua', requires_mua: true,
  });
  const report = (date = '') => send(api + '/mua-performance?date=' + date, { token: admin }).then(({ payload }) => payload);
  await send(api + '/mua-performance', { token: artists[2].token, status: 403 });
  await send(api + '/mua-performance?date=2026-02-30', { token: admin, status: 400 });
  const performer = await createStaff('reportartist', 'mua');
  const originalReport = await report();
  assert.equal(originalReport.rows.find((row) => row.id === performer.id).totalClients, 0);
  assert.ok(originalReport.columns.some((column) => column.id === 'add_on:' + hair.id));
  assert.ok(originalReport.rows.every((row) => !row.details.some((detail) => detail.jobId === legacyId)));
  const migrated = (await report('2026-01-06')).rows[0];
  assert.deepEqual([migrated.totalServices, migrated.totalEarnings], [2, 200]);
  const mapped = migrated.details.find((detail) => detail.jobId === 'old-mua-mapped');
  const unmatched = migrated.details.find((detail) => detail.jobId === 'old-mua-overlap');
  assert.equal(mapped.serviceId, 'add_on:' + oldAddOnId);
  assert.equal(mapped.earned, 12000);
  assert.match(unmatched.reviewReason, /no unambiguous catalog match/);
  assert.equal(unmatched.earned, 8000);

  const multiPackage = (await send(records('packages', bundleId))).payload;
  const makeupPackage = await create('packages', {
    code: 'SECOND', name: 'Makeup package', amount: 1000, is_active: true, revenue_category: 'mua',
  });
  await patchCatalog('packages', makeupPackage, { requires_mua: true });
  const duplicateMakeup = await create('add_ons', {
    code: 'TOUCH', name: 'Touch up', amount: 100, is_active: true, revenue_category: 'mua', requires_mua: true,
  });
  const multi = await register(multiPackage, [{ id: duplicateMakeup.id }, { id: hair.id }]);
  await pay(multi, 1250);
  await contest(multi, performer, 'claim');
  await contest(multi, performer, 'start');
  assert.equal((await report()).rows.find((row) => row.id === performer.id).totalClients, 0);
  const dashboard = new AbortController();
  t.after(() => dashboard.abort());
  const readDashboard = readRealtime(await fetch(host + '/api/realtime', { signal: dashboard.signal }));
  const dashboardClient = await readDashboard('PB_CONNECT');
  await send('/api/realtime', { method: 'POST', token: admin, status: 204,
    body: { clientId: dashboardClient.clientId, subscriptions: ['studioflow-workflow'] } });
  await Promise.all([contest(multi, performer, 'complete'), contest(multi, performer, 'complete')]);
  const reportUpdate = await Promise.race([readDashboard('studioflow-workflow'), delay(4000, 'timeout', { ref: false })]);
  assert.deepEqual(reportUpdate, {}, 'Completion invalidates the report for a separate connected admin.');
  dashboard.abort();
  const second = await register(makeupPackage);
  await pay(second, 1000);
  await contest(second, performer, 'claim');
  const onBehalf = { onBehalf: true, artistId: performer.id };
  await contest(second, admin, 'start', 409, { ...onBehalf, artistId: artists[2].id });
  await contest(second, admin, 'start', 200, onBehalf);
  await contest(second, admin, 'complete', 200, onBehalf);
  await contest(second, admin, 'complete', 200, onBehalf);

  const daily = await report();
  const performance = daily.rows.find((row) => row.id === performer.id);
  assert.equal(performance.totalClients, 2);
  assert.equal(daily.totalClients, originalReport.totalClients + 2);
  const bundleKey = 'package:' + multiPackage.id;
  assert.deepEqual(performance.counts, {
    [bundleKey]: 1, ['package:' + makeupPackage.id]: 1, ['add_on:' + duplicateMakeup.id]: 1, ['add_on:' + hair.id]: 1,
  });
  assert.equal(performance.totalServices, 4);
  assert.equal(performance.totalEarnings, 1250);
  const makeupDetail = performance.details.find((detail) => detail.jobId === multi.id && detail.serviceId === bundleKey);
  assert.equal(makeupDetail.actorId, performer.id);
  assert.deepEqual(makeupDetail.sources.map(({ name }) => name), ['Premium Portrait']);
  assert.equal(makeupDetail.earned, 0, 'A portrait bundle requires a verified allocation.');
  assert.match(makeupDetail.reviewReason, /no separately priced MUA charge/);
  const adminDetail = performance.details.find((detail) => detail.jobId === second.id);
  assert.equal(adminDetail.actorRole, 'admin');
  assert.notEqual(adminDetail.actorId, performer.id);
  assert.equal(adminDetail.artistName, performer.username);

  // Place a real completion produced above on an earlier day in the isolated
  // fixture, using UTC timestamps on either side of Manila midnight.
  const reportingModule = { exports: {} };
  runInNewContext(await readFile(join(repo, 'pb_hooks', 'studio_mua_reporting.js'), 'utf8'),
    { module: reportingModule, require: () => ({}), __hooks: '' });
  const { studioDate } = reportingModule.exports;
  assert.equal(studioDate('2026-10-01T15:59:59.999Z'), '2026-10-01');
  assert.equal(studioDate('2026-10-01T16:00:00.000Z'), '2026-10-02');
  const historyDb = new DatabaseSync(join(data, 'data.db'));
  try {
    historyDb.prepare('UPDATE mua_completions SET local_date = ?, completed_at = ? WHERE job_id = ?')
      .run('2026-10-02', '2026-10-01 16:00:00.000Z', multi.id);
  } finally { historyDb.close(); }
  const booked = await register(makeupPackage);
  await patchCatalog('packages', makeupPackage, { name: 'Premium Makeup', amount: 1200, requires_mua: false });
  await patchCatalog('packages', multiPackage, { name: 'Renamed Portrait', is_active: false });
  await patchCatalog('users', performer, { name: 'Renamed Artist', disabled: true });
  const historical = await report('2026-10-02');
  assert.equal(historical.totalClients, 1);
  assert.equal(historical.rows[0].name, performer.username);
  assert.deepEqual(historical.columns.find((column) => column.id === bundleKey), { id: bundleKey, name: 'Premium Portrait' });
  assert.equal(historical.rows[0].details.find((detail) => detail.serviceId === bundleKey).sources[0].name, 'Premium Portrait');
  const historicQueue = (await send(api + '/makeup-completed?date=2026-10-02', { token: admin })).payload;
  assert.deepEqual(historicQueue.map((row) => [row.id, row.artistName, row.completedAt]),
    [[multi.id, performer.username, '2026-10-01 16:00:00.000Z']]);
  assert.equal((await report()).rows.find((row) => row.id === performer.id).totalClients, 1);
  const afterDeactivation = await register(makeupPackage);
  assert.equal(afterDeactivation.makeup_service, '');
  await pay(booked, 1000);
  await contest(booked, artists[3], 'claim');
  await contest(booked, artists[3], 'start');
  await contest(booked, artists[3], 'complete');
  const bookedDetail = (await report()).rows.find((row) => row.id === artists[3].id).details.find((detail) => detail.jobId === booked.id);
  assert.equal(bookedDetail.serviceId, 'package:' + makeupPackage.id);
  assert.equal(bookedDetail.serviceName, 'Makeup package');
  assert.equal(bookedDetail.earned, 100000, 'Already booked services use the original sold price and name.');

  const pickup = await register(standard);
  const dropped = await register(standard);
  assert.deepEqual([dropped.queue_number, pickup.queue_number, dropped.job_order_no, pickup.job_order_no], [null, null, null, null]);

  // Release gate: full payment alone is not enough; production must be marked ready.
  const release = { status: 'released', framing_status: 'released', claimed_by: 'Juan', released_at: new Date().toISOString() };
  await pay(pickup, 1000);
  await registrations(pickup, cashier, release, 400);
  // Production status is set in bulk by admins; unpaid and unshot orders are skipped.
  const production = (body, token = admin, status = 200) =>
    send(api + '/production-status', { method: 'POST', token, body, status }).then((r) => r.payload);
  await production({ ids: [pickup.id], status: 'ready_for_pickup' }, cashier, 403);
  await production({ ids: [pickup.id], status: 'released' }, admin, 400);
  assert.deepEqual(await production({ ids: [pickup.id, dropped.id], status: 'ready_for_pickup' }),
    { updated: 0, unchanged: 0, skipped: { cancelled: 0, released: 0, unpaid: 1, notShot: 1, missing: 0 } });
  await shoot(pickup, 'shooting');
  await shoot(pickup, 'done_shooting');
  await registrations(pickup, cashier, release, 400);
  assert.equal((await production({ ids: [pickup.id], status: 'in_production' })).updated, 1);
  assert.equal((await registrations(pickup)).payload.ready_at, '');
  assert.equal((await production({ ids: [pickup.id], status: 'ready_for_pickup' })).updated, 1);
  let ready = (await send(records('registrations', pickup.id), { token: cashier })).payload;
  assert.deepEqual([ready.status, ready.framing_status, Boolean(ready.ready_at), ready.pickup_notify_count], ['ready_for_pickup', 'ready_for_pickup', true, 0]);
  // Moving production back clears readiness (and the main status follows).
  await production({ ids: [pickup.id], status: 'in_production' });
  ready = (await send(records('registrations', pickup.id), { token: cashier })).payload;
  assert.deepEqual([ready.status, ready.ready_at], ['done_shooting', '']);
  await send(api + '/pickup-notified/' + pickup.id, { method: 'POST', token: cashier, status: 409 });
  await production({ ids: [pickup.id], status: 'ready_for_pickup' });
  // The cashier records each pickup notice; the fields cannot be edited directly.
  await send(api + '/pickup-notified/' + pickup.id, { method: 'POST', token: photographer, status: 403 });
  const notice = (await send(api + '/pickup-notified/' + pickup.id, { method: 'POST', token: cashier })).payload;
  assert.equal(notice.pickup_notify_count, 1);
  assert.ok(notice.pickup_notified_at && notice.pickup_notified_by);
  await registrations(pickup, admin, { pickup_notify_count: 5 }, 403);
  // Fully paid and ready, then the client adds something at the counter: the cashier may add (not
  // remove) add-ons; the order owes the difference, goes back to In production (leaving Ready for
  // Pickup) and the change is logged for the next receipt.
  const pickupFrame = await create('add_ons', { code: 'PICK-FRAME', name: 'Pickup frame', amount: 250, is_active: true, revenue_category: 'studio' });
  const counterAdd = (await registrations(pickup, cashier, { add_ons: [{ id: pickupFrame.id }] })).payload;
  assert.deepEqual([counterAdd.balance, counterAdd.payment_status, counterAdd.status, counterAdd.framing_status, counterAdd.ready_at],
    [250, 'downpayment', 'done_shooting', 'in_production', '']);
  const lastChange = counterAdd.order_changes.at(-1);
  assert.deepEqual([lastChange.added, lastChange.removed, lastChange.total_before, lastChange.total_after],
    [[{ name: 'Pickup frame', amount: 250 }], [], 1000, 1250]);
  await registrations(pickup, cashier, { add_ons: [] }, 403);
  await registrations(pickup, cashier, { other_fees: 50 }, 403);
  // The history is server-written: a request can't replace it.
  assert.equal((await registrations(pickup, admin, { order_changes: [] })).payload.order_changes.length, counterAdd.order_changes.length);
  await registrations(pickup, cashier, release, 400);
  await pay(pickup, 250, 'additional');
  await production({ ids: [pickup.id], status: 'ready_for_pickup' });
  ready = (await send(records('registrations', pickup.id), { token: cashier })).payload;
  assert.deepEqual([ready.status, ready.balance, ready.pickup_notify_count], ['ready_for_pickup', 0, 0], 'a new ready period starts a new pickup notice');
  // Only an administrator removes or changes what is on the order.
  await registrations(pickup, admin, { add_ons: [] }, 200);
  const readded = (await registrations(pickup, admin, { add_ons: [{ id: pickupFrame.id }] }, 200)).payload;
  assert.deepEqual([readded.balance, readded.framing_status, readded.order_changes.length], [0, 'in_production', counterAdd.order_changes.length + 2]);
  await production({ ids: [pickup.id], status: 'ready_for_pickup' });
  // Every release goes through the cashier's Release step with a claimant.
  await registrations(pickup, admin, { framing_status: 'released' }, 400);
  await registrations(pickup, cashier, { ...release, claimed_by: ' ' }, 400);
  assert.equal((await registrations(pickup, cashier, release)).payload.status, 'released');
  ready = (await send(records('registrations', pickup.id), { token: cashier })).payload;
  assert.ok(ready.ready_at, 'the ready time is kept after release');
  assert.deepEqual((await production({ ids: [pickup.id], status: 'in_production' })).skipped.released, 1);

  // Cancelling keeps the job order and its payments; paid orders cannot be deleted.
  await pay(dropped, 500, 'initial');
  const issuedDropped = (await registrations(dropped)).payload;
  await send(records('registrations', dropped.id), { token: admin, method: 'DELETE', status: 409 });
  // Cancel and Restore go through their routes, with a reason; direct status edits are refused.
  await registrations(dropped, admin, { status: 'cancelled' }, 400);
  await send(`${api}/registrations/${dropped.id}/cancel`, { method: 'POST', token: cashier, body: { reason: 'backed out' }, status: 403 });
  const cancelledOrder = (await send(`${api}/registrations/${dropped.id}/cancel`, { method: 'POST', token: admin, body: { reason: 'client backed out' } })).payload;
  assert.deepEqual([cancelledOrder.status, cancelledOrder.status_before_cancel, cancelledOrder.cancel_reason], ['cancelled', 'paid', 'client backed out']);
  await pay(dropped, 500, 'additional', 400);
  await registrations(dropped, cashier, release, 400);
  const ledger = (await send(records('payments') + '?perPage=500', { token: admin })).payload.items;
  assert.ok(ledger.some((item) => item.registration === dropped.id && item.amount === 500));
  // Refunds: money given back is a separate record dated today; the payment stays as it was.
  const refundRoute = (body, token = admin, status = 200) => send(api + '/refunds', { method: 'POST', token, body, status }).then((r) => r.payload);
  await refundRoute({ registrationId: dropped.id, amount: 200, method: 'cash', reason: 'goodwill' }, cashier, 403);
  await refundRoute({ registrationId: dropped.id, amount: 600, method: 'cash', reason: 'too much' }, admin, 409);
  const refund = await refundRoute({ registrationId: dropped.id, amount: 200, method: 'gcash', reason: 'goodwill', clientKey: 'refund-test-1' });
  assert.match(refund.refund_no, /^RF-\d{6}$/);
  assert.equal((await refundRoute({ registrationId: dropped.id, amount: 200, method: 'gcash', reason: 'goodwill', clientKey: 'refund-test-1' })).id, refund.id);
  let droppedNow = (await registrations(dropped)).payload;
  assert.deepEqual([droppedNow.paid_amount, droppedNow.refunded_amount], [300, 200]);
  assert.ok(ledger.find((item) => item.registration === dropped.id).status === 'completed', 'the refunded payment is not changed');
  // The client signs the refund slip on screen: admin only, saved once, a protected file.
  const signRefund = (token, status, withFile = true) => {
    const form = new FormData();
    if (withFile) form.set('signature', new Blob([png], { type: 'image/png' }), 'refund-signature.png');
    return send(`${api}/refunds/${refund.id}/signature`, { method: 'POST', token, body: form, status }).then((r) => r.payload);
  };
  await signRefund(cashier, 403);
  await signRefund(admin, 400, false);
  const signedRefund = await signRefund(admin, 200);
  assert.ok(signedRefund.signature && signedRefund.signed_at && signedRefund.signed_witness, 'the signature, time and witness are saved');
  assert.match((await signRefund(admin, 409)).message, /already signed/);
  const signatureFile = `/api/files/refunds/${refund.id}/${signedRefund.signature}`;
  await send(signatureFile, { status: 404 });
  const fileToken = (await send('/api/files/token', { method: 'POST', token: admin })).payload.token;
  assert.ok((await send(`${signatureFile}?token=${fileToken}`)).payload.length > 0, 'staff can open the signature with a file token');
  // Restore returns to the status before cancelling; the balance counts the refund.
  const restored = (await send(`${api}/registrations/${dropped.id}/restore`, { method: 'POST', token: admin })).payload;
  assert.deepEqual([restored.status, restored.paid_amount, restored.balance], ['paid', 300, 700]);
  await pay(dropped, 700, 'additional');
  droppedNow = (await registrations(dropped)).payload;
  assert.deepEqual([droppedNow.balance, droppedNow.payment_status], [0, 'fully_paid']);
  assert.deepEqual([droppedNow.job_order_no, droppedNow.queue_number], [issuedDropped.job_order_no, issuedDropped.queue_number]);
  await send(`${api}/registrations/${dropped.id}/cancel`, { method: 'POST', token: admin, body: { reason: 'cancel again for later checks' } });
  // Fully refunded before the shoot: Restore puts it back to Pending Payment, not Paid.
  const refundedAll = await register(standard);
  await pay(refundedAll, 500, 'initial');
  await send(`${api}/registrations/${refundedAll.id}/cancel`, { method: 'POST', token: admin, body: { reason: 'client backed out' } });
  await refundRoute({ registrationId: refundedAll.id, amount: 500, method: 'cash', reason: 'full refund' });
  const restoredUnpaid = (await send(`${api}/registrations/${refundedAll.id}/restore`, { method: 'POST', token: admin })).payload;
  assert.deepEqual(
    [restoredUnpaid.status, restoredUnpaid.paid_amount, restoredUnpaid.balance, restoredUnpaid.payment_status],
    ['pending_payment', 0, 1000, 'unpaid']);
  await send(records('registrations', refundedAll.id), { token: admin, method: 'DELETE', status: 409 });
  // Orders restored to "Paid" with nothing held before that fix are repaired by migration 1793802600.
  // Recreate the broken state, mark the repair as not yet applied, and let `migrate up` run it again.
  const brokenDb = new DatabaseSync(join(data, 'data.db'));
  try {
    brokenDb.prepare("UPDATE registrations SET status = 'paid' WHERE id = ?").run(refundedAll.id);
    brokenDb.prepare("DELETE FROM _migrations WHERE file = '1793802600_repair_refunded_restores.js'").run();
  } finally { brokenDb.close(); }
  execFileSync(executable, ['migrate', 'up', ...flags], options);
  assert.equal((await registrations(refundedAll)).payload.status, 'pending_payment', 'the repair sends it back to Pending Payment');
  const mistake = await register(standard);
  await send(records('registrations', mistake.id), { token: admin, method: 'DELETE', status: 409 });
  await send(`${api}/registrations/${mistake.id}/delete`, {
    token: admin, method: 'POST', body: { reason: 'Incorrect Form' }, status: 204,
  });

  // Walk-in clients (family portraits, events outside the studio) next to school registrations.
  assert.equal((await registrations({ id: legacyId })).payload.client_kind, 'school', 'Existing job orders become school clients.');
  assert.equal((await send(records('packages', standard.id))).payload.client_kind || 'school', 'school', 'Packages without a type are school packages.');
  const settings = (await send(records('studio_settings') + "?filter=key='main'")).payload.items[0];
  assert.deepEqual([settings.school_enabled, settings.walkin_enabled], [true, false], 'Walk-ins start switched off.');
  assert.ok(settings.walkin_terms.length > 3);
  const sessionList = (await send(records('session_types') + '?sort=order')).payload.items;
  const family = sessionList.find((type) => type.code === 'FAM');
  const wedding = sessionList.find((type) => type.code === 'WED');
  assert.ok(family && !family.on_location && wedding?.on_location);
  const walkinPackage = await create('packages', { code: 'FAM-1', name: 'Family Session', amount: 2500, is_active: true, revenue_category: 'studio', client_kind: 'walkin' });
  async function walkIn(fields, status = 200) {
    const form = new FormData();
    for (const [key, value] of Object.entries({
      client_kind: 'walkin', family_name: 'Reyes', given_name: 'Family', gender: 'female', email: 'family@example.test', mobile_number: '09170000000',
      terms_accepted: 'true', add_ons: '[]', package: walkinPackage.id, session_type: family.id, ...fields,
    })) form.set(key, value);
    form.set('signature', new Blob([png], { type: 'image/png' }), 'signature.png');
    return (await send(records('registrations'), { method: 'POST', body: form, status })).payload;
  }
  let refused = await walkIn({}, 400);
  assert.match(refused.message, /Walk-in registrations are closed/);
  await send(records('studio_settings', settings.id), { token: cashier, method: 'PATCH', body: { walkin_enabled: true }, status: 404 });
  await send(records('studio_settings', settings.id), { token: admin, method: 'PATCH', body: { walkin_enabled: true } });
  refused = await walkIn({ package: standard.id }, 400);
  assert.ok(refused.data.package, 'A school package is refused for a walk-in client.');
  refused = await walkIn({ session_type: wedding.id }, 400);
  assert.ok(refused.data.event_date && refused.data.event_venue, 'Events outside the studio need a date and venue.');
  const event = await walkIn({
    session_type: wedding.id, event_date: '2026-12-12 00:00:00.000Z', event_venue: 'Marco Polo Plaza', client_org: 'Reyes-Cruz Wedding',
    organization: school.id, course: course.id, student_id: 'SHOULD-CLEAR',
  });
  assert.deepEqual([event.client_kind, event.organization, event.course, event.student_id, event.event_venue],
    ['walkin', '', '', '', 'Marco Polo Plaza'], 'Walk-ins carry no school details.');
  const studio = await walkIn({ event_date: '2026-12-12 00:00:00.000Z', event_venue: 'ignored for studio sessions' });
  assert.deepEqual([studio.event_date, studio.event_venue], ['', ''], 'In-studio sessions drop the event date and venue.');
  // Add-ons are offered to school clients, walk-ins or both, like packages. Existing ones became "both".
  const legacyAddOn = (await send(records('add_ons') + "?filter=code='ADD-HAIRMAKEUP'", { token: admin })).payload.items[0];
  assert.equal(legacyAddOn.client_kind, 'both', 'add-ons from before the setting are offered to everyone');
  const toga = await create('add_ons', { code: 'TOGA', name: 'Toga rental', amount: 200, is_active: true, revenue_category: 'studio', client_kind: 'school' });
  const familyAlbum = await create('add_ons', { code: 'ALBUM', name: 'Family album', amount: 900, is_active: true, revenue_category: 'studio', client_kind: 'walkin' });
  await send(records('add_ons'), { token: admin, method: 'POST', body: { code: 'BAD', name: 'Bad kind', amount: 1, is_active: true, client_kind: 'everyone' }, status: 400 });
  refused = await walkIn({ add_ons: JSON.stringify([{ id: toga.id }]) }, 400);
  assert.match(refused.message, /not offered to walk-in clients/);
  const albumClient = await walkIn({ add_ons: JSON.stringify([{ id: familyAlbum.id }]) });
  assert.deepEqual([albumClient.add_ons[0].name, albumClient.total_amount], ['Family album', 3400]);
  assert.match((await register(standard, [{ id: familyAlbum.id }], 400)).message, /not offered to school clients/);
  assert.match((await registrations(albumClient, admin, { add_ons: [{ id: familyAlbum.id }, { id: toga.id }] }, 400)).payload.message, /not offered to walk-in clients/);
  await pay(event, 2500);
  assert.equal((await registrations(event)).payload.status, 'paid');
  const walkinFolder = (await send(`${api}/photo-folder/${event.id}`, { method: 'POST', token: photographer })).payload.path;
  assert.match(walkinFolder.replaceAll('\\', '/'), /\/WALK-IN\/\d{4}-\d{2}\/\d{5}_Reyes_Family$/, 'Walk-in photos are filed by month, with no record ID in the name.');
  // School clients cannot pick walk-in packages, and each type can be switched off.
  const schoolForm = await register(standard);
  assert.equal(schoolForm.client_kind, 'school');
  await send(records('studio_settings', settings.id), { token: admin, method: 'PATCH', body: { school_enabled: false } });
  await register(standard, [], 400);
  await send(records('studio_settings', settings.id), { token: admin, method: 'PATCH', body: { school_enabled: true, walkin_enabled: false } });
  const bothPackage = await create('packages', { code: 'ANY', name: 'Any client', amount: 900, is_active: true, revenue_category: 'studio', client_kind: 'both' });
  await register(bothPackage);
  // A session type in use can only be switched off; an unused one can be removed.
  await send(records('session_types', wedding.id), { token: admin, method: 'DELETE', status: 409 });
  const unused = await create('session_types', { name: 'Graduation Ball', code: 'BALL', on_location: true, is_active: true });
  await send(records('session_types', unused.id), { token: cashier, method: 'DELETE', status: 404 });
  await send(records('session_types', unused.id), { token: admin, method: 'DELETE', status: 204 });
  // The overall export lists walk-ins on their own sheet with the session code.
  const overall = (await send(api + '/student-excel', { token: admin })).payload;
  const eventNumber = (await registrations(event)).payload.job_order_no;
  const walkinRow = overall.rows.find((row) => row.jobOrder === eventNumber);
  assert.deepEqual([walkinRow.level, walkinRow.course], ['walkin', 'WED']);
  // Cancelled orders carry who, when and why for the CANCELLED sheet; active ones carry nothing.
  const droppedRow = overall.rows.find((row) => row.jobOrder === issuedDropped.job_order_no);
  assert.deepEqual([droppedRow.cancelled, droppedRow.cancellation.reason], [true, 'cancel again for later checks']);
  assert.ok(droppedRow.cancellation.at && droppedRow.cancellation.by && droppedRow.cancellation.statusBefore, 'the export says when, who and the status before');
  assert.equal(walkinRow.cancellation, null);

  // A course can be added under a level the school does not have yet (e.g. Elementary);
  // the level is created once, after the school's existing levels, and reused by name.
  await send(api + '/school-courses', { method: 'POST', token: admin, status: 400, body: { schoolId: school.id, name: 'Grade 6', code: 'G6' } });
  const grade6 = (await send(api + '/school-courses', {
    method: 'POST', token: admin, status: 201, body: { schoolId: school.id, levelName: '  Elementary ', name: 'Grade 6', code: 'G6' },
  })).payload;
  const grade5 = (await send(api + '/school-courses', {
    method: 'POST', token: admin, status: 201, body: { schoolId: school.id, levelName: 'elementary', name: 'Grade 5', code: 'G5' },
  })).payload;
  assert.equal(grade5.level, grade6.level);
  const elementary = (await send(records('levels', grade6.level), { token: admin })).payload;
  assert.deepEqual([elementary.organization, elementary.name, elementary.order > (level.order || 0)], [school.id, 'Elementary', true]);
  // Students at other levels appear in the export under their level's name.
  await register(standard, [], 200, { level: grade6.level, course: grade6.course_id });
  const pupilRow = (await send(api + '/student-excel', { token: admin })).payload.rows.find((row) => row.course === 'G6');
  assert.deepEqual([pupilRow.level, pupilRow.course], ['ELEMENTARY', 'G6']);
  assert.equal(pupilRow.jobOrder, '');

  // Other fees change the price: the public kiosk can't set them; only an admin can, and the total follows.
  const feeClient = await register(standard, [], 200, { other_fees: '-900' });
  assert.deepEqual([feeClient.other_fees, feeClient.total_amount], [0, 1000], 'the kiosk cannot set other fees');
  await pay(feeClient, 500, 'initial');
  await registrations(feeClient, cashier, { other_fees: 150 }, 403);
  await registrations(feeClient, admin, { other_fees: -10 }, 400);
  const withFees = (await registrations(feeClient, admin, { other_fees: 150 })).payload;
  assert.deepEqual([withFees.total_amount, withFees.paid_amount, withFees.balance, withFees.payment_status], [1150, 500, 650, 'downpayment']);
  const feeRow = (await send(api + '/student-excel', { token: admin })).payload.rows.find((row) => row.jobOrder === withFees.job_order_no);
  assert.deepEqual([feeRow.due, feeRow.otherFees, feeRow.packageAmount], [115000, 15000, 100000], 'the export splits the total into package and other fees');

  // Add-ons after registration: catalog-priced, and the total follows. The cashier may add at the
  // counter; removing or changing one stays with an administrator.
  const frame = await create('add_ons', { code: 'FRAME', name: 'Frame upgrade', amount: 400, is_active: true, revenue_category: 'studio' });
  const addOnClient = await register(standard);
  await pay(addOnClient, 500, 'initial');
  const counter = (await registrations(addOnClient, cashier, { add_ons: [{ id: frame.id, amount: 1 }] })).payload;
  assert.deepEqual([counter.add_ons[0].amount, counter.total_amount, counter.balance], [400, 1400, 900], 'the cashier adds at the catalog price');
  await registrations(addOnClient, cashier, { add_ons: [] }, 403);
  await registrations(addOnClient, cashier, { add_ons: [{ id: frame.id }], family_name: 'Changed' }, 403);
  await registrations(addOnClient, admin, { add_ons: [] });
  await registrations(addOnClient, admin, { add_ons: [{ id: 'notarealaddon00', name: 'Free stuff', amount: 9999 }] }, 400);
  await registrations(addOnClient, admin, { add_ons: [{ id: frame.id }, { id: frame.id }] }, 400);
  let priced = (await registrations(addOnClient, admin, { add_ons: [{ id: frame.id, amount: 1 }] })).payload;
  assert.deepEqual([priced.add_ons[0].amount, priced.total_amount, priced.balance], [400, 1400, 900], 'the catalog price is used, not the one sent');
  await patchCatalog('add_ons', frame, { amount: 650 });
  priced = (await registrations(addOnClient, admin, { add_ons: [{ id: frame.id }], family_name: 'Kept Price' })).payload;
  assert.deepEqual([priced.add_ons[0].amount, priced.total_amount], [400, 1400], 'an add-on already on the order keeps the price it was sold at');
  priced = (await registrations(addOnClient, admin, { add_ons: [] })).payload;
  assert.deepEqual([priced.add_ons.length, priced.total_amount, priced.balance], [0, 1000, 500], 'removing an add-on lowers the total');
  // Catalog prices can't be negative.
  await send(records('add_ons'), { token: admin, method: 'POST', body: { code: 'NEG', name: 'Negative', amount: -500, is_active: true }, status: 400 });
  await send(records('packages', standard.id), { token: admin, method: 'PATCH', body: { amount: -1 }, status: 400 });

  // Camera hot-folder import: finished photos move from the camera's output
  // folder into the folder of the client linked to the camera.
  const cameraDir = join(home, 'camera');
  await mkdir(join(cameraDir, 'DCIM'), { recursive: true });
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64), Buffer.from([0xff, 0xd9])]);
  const settled = new Date(Date.now() - 60_000);
  async function drop(name, body = jpeg, fresh = false) {
    const file = join(cameraDir, name);
    await writeFile(file, body);
    if (!fresh) await utimes(file, settled, settled);
  }
  const booth = { name: 'Booth 1', watch_folder: cameraDir, enabled: true, include_subfolders: true, import_raw: true };
  await send(records('camera_stations'), { token: admin, method: 'POST', status: 400, body: { ...booth, watch_folder: photos } });
  await send(records('camera_stations'), { token: admin, method: 'POST', status: 400, body: { ...booth, watch_folder: join(home, 'missing') } });
  await send(records('camera_stations'), { token: cashier, method: 'POST', status: 400, body: booth });
  const camera = await create('camera_stations', { ...booth, active_registration: dropped.id }, photographer);
  assert.equal(camera.active_registration, '', 'Session state cannot be set through the collection API.');
  await send(records('camera_stations'), { token: admin, method: 'POST', status: 400, body: { ...booth, name: 'Booth 2' } });
  const cameraApi = (action, body, { token = photographer, status = 200 } = {}) =>
    send(`${api}/camera/${camera.id}/${action}`, { method: 'POST', token, body, status }).then((r) => r.payload);
  await cameraApi('scan', undefined, { token: cashier, status: 403 });
  await drop('before-session.jpg');
  let camState = await cameraApi('scan');
  assert.equal(camState.client, null);
  assert.equal(camState.waiting, 1);
  const onSet = await register(standard);
  await cameraApi('start', { registration: onSet.id }, { status: 400 });
  await pay(onSet, 1000);
  await shoot(onSet, 'shooting');
  camState = await cameraApi('start', { registration: onSet.id });
  assert.equal(camState.client.id, onSet.id);
  assert.equal(camState.waiting, 1, 'Files from before the session wait for an explicit decision.');
  await drop('IMG_0001.jpg');
  await drop('DCIM/IMG_0002.JPG');
  await drop('IMG_0003.CR3', Buffer.from('raw sensor data'));
  await drop('notes.txt', Buffer.from('not a photo'));
  await drop('fake.jpg', Buffer.from('this is not a jpeg file'));
  await drop('fresh.jpg', jpeg, true);
  camState = await cameraApi('scan');
  assert.equal(camState.sessionImported, 3, camState.lastError);
  const clientDir = (await send(`${api}/photo-folder/${onSet.id}`, { method: 'POST', token: photographer })).payload.path;
  assert.deepEqual((await readdir(clientDir)).sort(), ['IMG_0001.jpg', 'IMG_0002.JPG', 'RAW', basename(clientDir), 'Unselected'].sort());
  assert.deepEqual(await readdir(join(clientDir, 'RAW')), ['IMG_0003.CR3']);
  assert.deepEqual((await readdir(cameraDir)).filter((name) => !name.startsWith('.')).sort(),
    ['DCIM', 'before-session.jpg', 'fake.jpg', 'fresh.jpg', 'notes.txt']);
  assert.equal(camState.client.photoCount, 2);
  await drop('IMG_0001.jpg');
  camState = await cameraApi('scan');
  assert.ok((await readdir(clientDir)).includes('IMG_0001_2.jpg'), 'A repeated file name gets a suffix instead of overwriting.');
  camState = await cameraApi('claim-waiting');
  assert.equal(camState.waiting, 0);
  for (const name of ['before-session.jpg', 'fresh.jpg']) assert.ok((await readdir(clientDir)).includes(name), name);
  // An import interrupted after the file was claimed finishes on the next scan.
  const staged = join(cameraDir, '.studioflow-importing', onSet.id);
  await mkdir(staged, { recursive: true });
  await writeFile(join(staged, 'interrupted.jpg'), jpeg);
  await cameraApi('scan');
  assert.ok((await readdir(clientDir)).includes('interrupted.jpg'));
  // Ending the session flushes the last shot even before it settles.
  const large = Buffer.concat([jpeg.subarray(0, 4), randomBytes(2_500_000), Buffer.from([0xff, 0xd9])]);
  await drop('last.jpg', large, true);
  camState = await cameraApi('end', { registration: onSet.id });
  assert.equal(camState.client, null);
  assert.ok((await readdir(clientDir)).includes('last.jpg'));
  assert.equal(Buffer.compare(await readFile(join(clientDir, 'last.jpg')), large), 0);
  await drop('next-client.jpg');
  camState = await cameraApi('scan');
  assert.equal(camState.waiting, 2, 'Without a linked client nothing is moved.');
  assert.deepEqual((await send(api + '/camera/browse?path=' + encodeURIComponent(home), { token: photographer })).payload.folders
    .map((folder) => folder.name).includes('camera'), true);
  await send(records('camera_stations', camera.id), { token: photographer, method: 'DELETE', status: 404 });

  await t.test('multi-photographer orders wait for both cameras in either completion order', async () => {
    const primaryAccount = (await login('photographer', 'password123')).record;
    const familyAccount = await createStaff('familyphotographer', 'photographer');
    const familyDir = join(home, 'family-camera');
    await mkdir(familyDir);
    const familyCamera = await create('camera_stations', { ...booth, name: 'Family Booth', watch_folder: familyDir });
    const family = await create('catalog_items', {
      name: 'Family Picture', category: 'other', amount: 300, is_active: true, required_photographers: [familyAccount.id],
    });
    const familyAddOn = (await send(records('add_ons') + '?filter=' + encodeURIComponent(`catalog_item = "${family.id}"`),
      { token: admin })).payload.items[0];
    const portraitPackage = await create('packages', {
      code: 'FAMILY', name: 'Family Package', amount: 1300, is_active: true, revenue_category: 'studio',
      structure: { inclusions: [{ type: 'item', id: family.id, qty: 1 }], freebies: [family.id] },
    });
    const primary = { id: primaryAccount.id, token: photographer, camera, dir: cameraDir };
    const second = { ...familyAccount, camera: familyCamera, dir: familyDir };
    const read = async (student) => (await registrations(student)).payload;
    const act = (student, actor, action, taskId, status = 200, fields = {}) => send(`${api}/photography/${student.id}/${action}`, {
      method: 'POST', token: actor.token || actor, status, body: { taskId, cameraId: actor.camera?.id, ...fields },
    });
    const scan = (actor, action = 'scan', status = 200) => send(`${api}/camera/${actor.camera.id}/${action}`,
      { method: 'POST', token: actor.token, status }).then((result) => result.payload);
    const shootImage = async (actor, name, bytes = jpeg, fresh = false) => {
      const path = join(actor.dir, name);
      await writeFile(path, bytes);
      if (!fresh) await utimes(path, settled, settled);
    };
    const finish = async (student, actor, taskId) => {
      const deadline = Date.now() + 20_000;
      while (Date.now() < deadline) {
        const state = await scan(actor);
        if (!state.client) return (await read(student)).photography.tasks.find((task) => task.id === taskId);
        await delay(500);
      }
      assert.fail('The linked camera did not finish syncing.');
    };
    const inChooser = async (student) => (await list(student.student_id)).filter((item) => item.id === student.id).length;

    for (const familyFirst of [false, true]) {
      // The second order references the same item as an inclusion, freebie and add-on.
      const student = await register(familyFirst ? portraitPackage : standard, [{ id: familyAddOn.id }]);
      await pay(student, familyFirst ? 1600 : 1300);
      const { tasks } = (await read(student)).photography;
      assert.deepEqual(tasks.map((task) => task.name), ['Graduation Portrait', 'Family Picture']);
      const familyTask = tasks[1].id;
      await act(student, primary, 'start', familyTask, 403);
      await shoot(student, 'done_shooting', 403);
      await act(student, primary, 'start', 'primary');
      await act(student, second, 'start', familyTask);
      await act(student, primary, 'done', familyTask, 403);
      await scan({ ...primary, camera: familyCamera }, 'end', 403);
      const [first, last] = familyFirst ? [second, primary] : [primary, second];
      const [firstTask, lastTask] = familyFirst ? [familyTask, 'primary'] : ['primary', familyTask];
      await shootImage(first, 'SAME_001.jpg');
      await scan(first);
      assert.equal((await act(student, first, 'done', firstTask)).payload.syncing, true);
      assert.equal(await inChooser(student), 0);
      const firstCompleted = await finish(student, first, firstTask);
      assert.equal(firstCompleted.status, 'completed');
      assert.equal(firstCompleted.photographerId, first.id);
      assert.ok(firstCompleted.completedAt);
      assert.equal((await scan(last)).client.id, student.id, 'The other camera stays linked.');
      assert.equal((await read(student)).status, 'shooting');
      assert.equal(await inChooser(student), 0);
      const familyBytes = Buffer.concat([jpeg.subarray(0, -2), Buffer.from([1, 2, 3, 0xff, 0xd9])]);
      await act(student, last, 'done', lastTask);
      if (familyFirst) {
        const offline = last.dir + '-offline';
        await rename(last.dir, offline);
        try {
          const unavailable = await scan(last);
          assert.match(unavailable.lastError, /camera folder cannot be read/i);
          assert.equal(unavailable.client.id, student.id);
          assert.equal(await inChooser(student), 0);
        } finally {
          await rename(offline, last.dir);
        }
      }
      await shootImage(last, 'SAME_001.jpg', familyBytes, true);
      assert.equal((await scan(last)).finishing, true);
      assert.equal(await inChooser(student), 0);
      const lastCompleted = await finish(student, last, lastTask);
      assert.equal(lastCompleted.status, 'completed');
      assert.equal((await read(student)).status, 'done_shooting');
      assert.equal(await inChooser(student), 1);
      assert.equal((await act(student, last, 'done', lastTask)).payload.official, true);
      const dir = await folder(student);
      const shots = (await readdir(dir)).filter((name) => name.endsWith('-SAME_001.jpg'));
      assert.equal(shots.length, 2);
      assert.deepEqual(await readFile(join(dir, shots.find((name) => name.startsWith(`sf-${lastTask}-${last.id}-`)))), familyBytes);
      assert.deepEqual(await readFile(join(dir, shots.find((name) => name.startsWith(`sf-${firstTask}-${first.id}-`)))), jpeg);
      const duplicate = shots.find((name) => name.startsWith(`sf-${firstTask}-${first.id}-`));
      const retryDir = join(first.dir, '.studioflow-importing', student.id);
      await mkdir(retryDir, { recursive: true });
      await writeFile(join(retryDir, duplicate), jpeg);
      await scan(first);
      assert.deepEqual((await readdir(dir)).filter((name) => name.endsWith('-SAME_001.jpg')), shots, 'Replaying a staged import preserves its filename.');
    }

    const late = await register(standard);
    await pay(late, 1000);
    await shoot(late, 'done_shooting');
    assert.equal(await inChooser(late), 1);
    const lateFolder = await folder(late);
    await writeFile(join(lateFolder, 'original.jpg'), jpeg);
    const lateGallery = `${api}/chooser/${late.id}`;
    const openLate = () => send(lateGallery + '/open', { token: chooser.token, method: 'POST' }).then((result) => result.payload);
    const confirmLate = (gallery) => send(lateGallery + '/confirm', {
      token: chooser.token, method: 'POST',
      body: { version: gallery.version, requestId: randomUUID(), selected: gallery.photos.map((photo) => photo.id) },
    });
    await confirmLate(await openLate());
    await registrations(late, cashier, { add_ons: [{ id: familyAddOn.id }] });
    const latePlan = (await read(late)).photography;
    assert.equal(latePlan.tasks[0].status, 'completed');
    assert.equal(latePlan.tasks[0].photographerId, primary.id);
    assert.equal(await inChooser(late), 0);
    await act(late, second, 'reassign', latePlan.tasks[1].id, 403, { photographerId: primary.id });
    await act(late, admin, 'reassign', latePlan.tasks[1].id, 200, { photographerId: primary.id });
    await registrations(late, admin, { add_ons: [] });
    const removed = (await read(late)).photography.tasks[1];
    assert.ok(removed.removedAt);
    assert.equal(removed.assignments[0].to, primary.id);
    assert.equal(await inChooser(late), 1, 'Removing an outstanding line restores chooser eligibility.');
    await registrations(late, cashier, { add_ons: [{ id: familyAddOn.id }] });
    const reinstated = (await read(late)).photography.tasks.find((task) => task.name === 'Family Picture' && !task.removedAt);
    await act(late, second, 'start', reinstated.id);
    await shootImage(second, 'late-family.jpg');
    await scan(second);
    await act(late, second, 'done', reinstated.id);
    await finish(late, second, reinstated.id);
    const afterLate = await browse({ q: late.student_id, done: 'not_selected' });
    assert.equal(afterLate.items.find((item) => item.id === late.id).selectionState, 'needs_review');
    const updatedGallery = await openLate();
    assert.ok(updatedGallery.photos.find((photo) => photo.name === 'original.jpg').selected);
    await confirmLate(updatedGallery);
    assert.ok(ids(await browse({ q: late.student_id, done: 'selected' })).includes(late.id));

    const midShoot = await register(standard);
    await pay(midShoot, 1000);
    await shoot(midShoot, 'shooting');
    await cameraApi('start', { registration: midShoot.id });
    await shootImage(primary, 'legacy-primary.jpg');
    await scan(primary);
    await registrations(midShoot, cashier, { add_ons: [{ id: familyAddOn.id }] });
    const midShootTasks = (await read(midShoot)).photography.tasks;
    assert.equal(midShootTasks[0].photographerId, primary.id);
    assert.equal((await scan(primary)).taskId, 'primary');
    await act(midShoot, second, 'start', midShootTasks[1].id);
    await shootImage(second, 'concurrent-family.jpg');
    await scan(second);
    await Promise.all([act(midShoot, primary, 'done', 'primary'), act(midShoot, second, 'done', midShootTasks[1].id)]);
    await Promise.all([finish(midShoot, primary, 'primary'), finish(midShoot, second, midShootTasks[1].id)]);
    assert.equal(await inChooser(midShoot), 1, 'Concurrent camera finalization releases one order.');

    await patchCatalog('catalog_items', family, { required_photographers: [primary.id, second.id] });
    const both = await register(standard, [{ id: familyAddOn.id }]);
    assert.deepEqual((await read(both)).photography.tasks.map((task) => task.photographerId), ['', primary.id, second.id]);
    assert.equal((await read(midShoot)).photography.tasks.length, 2, 'Catalog edits never add tasks to earlier sales.');
  });

  // MUA note: the preferred-look choices are retired, but the optional note remains.
  const lookPackage = await create('packages', {
    code: 'LOOK', name: 'Look Portrait', amount: 1000, is_active: true, requires_mua: true, revenue_category: 'mua',
  });
  const lookAddOn = await create('add_ons', {
    code: 'LOOK-ADD', name: 'Look grooming', amount: 100, is_active: true, revenue_category: 'mua', requires_mua: true,
  });
  assert.ok((await register(lookPackage, [], 400, { makeup_look_note: 'x'.repeat(201) })).data.makeup_look_note);
  const lookClient = await register(lookPackage, [], 200, { makeup_look: 'grooming', makeup_look_note: '  no lipstick  ' });
  assert.deepEqual([lookClient.makeup_look, lookClient.makeup_look_note], ['', 'no lipstick']);
  // No makeup in the order: the note is not kept.
  const noMakeup = await register(standard, [], 200, { makeup_look: 'full', makeup_look_note: 'ignored' });
  assert.deepEqual([noMakeup.makeup_look, noMakeup.makeup_look_note], ['', '']);
  // An MUA add-on keeps its optional note without a preferred-look choice.
  const addOnNote = await register(standard, [{ id: lookAddOn.id }], 200, { makeup_look: '', makeup_look_note: 'sensitive skin' });
  assert.equal(addOnNote.makeup_look_note, 'sensitive skin');
  // The MUA station shows the note and no preferred look.
  await pay(lookClient, 1000);
  const lookRow = (await queue(artists[1])).find((row) => row.id === lookClient.id);
  assert.deepEqual([lookRow.look, lookRow.lookNote], ['', 'no lipstick']);
  // Historical client-type look settings remain readable, but no longer gate registration.
  await patchCatalog('organizations', school, { makeup_look_off: true });
  const skipped = await register(lookPackage, [], 200, { makeup_look: '' });
  assert.equal((await register(lookPackage, [], 200, { makeup_look: 'full' })).makeup_look, '');
  await patchCatalog('organizations', school, { makeup_look_off: false });
  // Switched off for all school clients.
  const studioSettings = (await send(records('studio_settings'))).payload.items[0];
  assert.deepEqual([studioSettings.makeup_look_school, studioSettings.makeup_look_walkin], [true, true], 'On after the upgrade.');
  await send(records('studio_settings', studioSettings.id), { token: cashier, method: 'PATCH', body: { makeup_look_school: false }, status: 404 });
  await send(records('studio_settings', studioSettings.id), { token: admin, method: 'PATCH', body: { makeup_look_school: false } });
  await register(lookPackage, [], 200, { makeup_look: '' });
  await send(records('studio_settings', studioSettings.id), { token: admin, method: 'PATCH', body: { makeup_look_school: true } });
  // Admin can set or clear it in Edit Client; only known looks; other stations can't change it.
  assert.equal((await registrations(skipped, admin, { makeup_look: 'light', makeup_look_note: ' sensitive skin ' })).payload.makeup_look_note, 'sensitive skin');
  await registrations(skipped, admin, { makeup_look: 'glam' }, 400);
  assert.equal((await registrations(skipped, admin, { makeup_look: '' })).payload.makeup_look, '');
  await registrations(skipped, cashier, { makeup_look: 'full' }, 403);

  // Concurrent registration consumes no numbers. Concurrent first payments allocate both sequences.
  const together = await Promise.all(Array.from({ length: 6 }, () => register(standard)));
  assert.ok(together.every((student) => student.job_order_no === null && student.queue_number === null));
  const concurrentPayments = await Promise.all(together.map((student) => pay(student, 1000)));
  const concurrentPaid = await Promise.all(together.map(async (student) => (await registrations(student)).payload));
  const numbers = concurrentPaid.map((student) => student.job_order_no);
  assert.equal(new Set(numbers).size, numbers.length, numbers.join(', '));
  assert.deepEqual(numbers.map(Number).sort((a, b) => a - b),
    Array.from({ length: 6 }, (_, index) => Math.min(...numbers.map(Number)) + index), 'Numbers are consecutive.');
  const queues = concurrentPaid.map((student) => student.queue_number);
  assert.ok(queues.every((number) => number > 0));
  assert.equal(new Set(concurrentPaid.map((student) => student.queue_issued_at.slice(0, 10) + '/' + student.queue_number)).size, together.length);
  const indexDb = new DatabaseSync(join(data, 'data.db'), { readOnly: true });
  try {
    assert.ok(indexDb.prepare("SELECT 1 FROM sqlite_master WHERE name = 'idx_registration_job_order_no'").get(), 'Unique job order index');
  } finally { indexDb.close(); }

  // PDF copies of the paperwork go to <client folder>/RECEIPTS, under names taken from the database.
  const docsClient = concurrentPaid[0];
  const docsPayment = concurrentPayments[0];
  const pdf = (text) => new Blob([Buffer.from('%PDF-1.4\n' + text + '\n%%EOF')], { type: 'application/pdf' });
  const documents = (student, files, token = cashier, status = 200) => {
    const form = new FormData();
    for (const [name, blob] of files) form.append('files', blob, name);
    return send(`${api}/registrations/${student.id}/documents`, { method: 'POST', token, body: form, status }).then((r) => r.payload);
  };
  const jobPdf = `JO-${docsClient.job_order_no}.pdf`;
  const receiptPdf = `${docsPayment.receipt_no}.pdf`;
  const saved = await documents(docsClient, [[jobPdf, pdf('job order v1')], [receiptPdf, pdf('receipt')]]);
  assert.deepEqual(saved.saved, [jobPdf, receiptPdf]);
  const receiptsDir = join(clientFolder(docsClient), 'RECEIPTS');
  assert.deepEqual((await readdir(receiptsDir)).sort(), [jobPdf, receiptPdf].sort());
  // A later save replaces the copy (e.g. the job order after a cancel, with its stamp).
  await documents(docsClient, [[jobPdf, pdf('job order v2')]], admin);
  assert.match(await readFile(join(receiptsDir, jobPdf), 'utf8'), /job order v2/);
  assert.deepEqual((await readdir(receiptsDir)).sort(), [jobPdf, receiptPdf].sort(), 'No temporary files are left behind.');
  // Only this job order's own documents, only PDFs, only cashier / admin, and only once there is a folder.
  await documents(docsClient, [['JO-99999.pdf', pdf('other')]], cashier, 400);
  await documents(docsClient, [['../../escape.pdf', pdf('escape')]], cashier, 400);
  await documents(docsClient, [[jobPdf, pdf('fine')], [receiptPdf, new Blob(['not a pdf'])]], cashier, 400);
  assert.match(await readFile(join(receiptsDir, jobPdf), 'utf8'), /job order v2/, 'A rejected request writes nothing.');
  await documents(docsClient, [[jobPdf, pdf('x')]], photographer, 403);
  await documents(await register(standard), [['JO-00000.pdf', pdf('unpaid')]], cashier, 409);

  // Financial tests use the same implementation as Analytics and the workbooks, with real PocketBase records.
  const vite = await (await import('vite')).createServer({
    root: repo, configFile: false, appType: 'custom', cacheDir: join(home, 'vite-test-cache'),
    optimizeDeps: { noDiscovery: true }, server: { middlewareMode: true, watch: null, ws: false },
  });
  t.after(() => vite.close());
  await t.test('items added after a payment show on the next receipt', async () => {
    const { paymentAdditions } = await vite.ssrLoadModule('/src/features/receipts/receiptData.ts');
    const order = (await registrations(pickup)).payload;
    const payments = (await send(records('payments') + '?sort=created&filter=' + encodeURIComponent(`registration="${pickup.id}"`), { token: admin })).payload.items;
    const data = { registration: order, payments, refunds: [], terms: [] };
    assert.deepEqual(payments.map((payment) => paymentAdditions(data, payment)),
      [[], ['Pickup frame ₱250.00']]);
  });
  await t.test('revenue allocation and managed MUA queue', async () => {
    const { buildAudit } = await vite.ssrLoadModule('/src/features/admin/auditData.ts');
    const { buildAuditWorkbook } = await vite.ssrLoadModule('/src/features/admin/auditWorkbook.ts');
    const { buildStudentWorkbook } = await vite.ssrLoadModule('/src/features/admin/studentExcel.ts');
    const { receiptRevenueLine, orderExtras } = await vite.ssrLoadModule('/src/features/receipts/receiptData.ts');
    const { registrationAddOns } = await vite.ssrLoadModule('/src/features/registration/registrationAddOns.ts');
    const { buildRegistrationsCsv } = await vite.ssrLoadModule('/src/utils/csv.ts');
    const studio = await create('packages', {
      code: 'STUDIO-1500', name: 'Portrait', amount: 1500, is_active: true, revenue_category: 'studio',
    });
    const pureMua = await create('packages', {
      code: 'MUA-300', name: 'Makeup session', amount: 300, is_active: true, requires_mua: true, revenue_category: 'mua',
    });
    const muaAddOn = await create('add_ons', {
      code: 'MUA-300', name: 'Makeup session', amount: 300, is_active: true, requires_mua: true,
      revenue_category: 'mua',
    });
    const groomingAddOn = await create('add_ons', {
      code: 'MUA-150', name: 'Grooming session', amount: 150, is_active: true, requires_mua: true,
      revenue_category: 'mua',
    });
    const recordsFor = async (collection, job) => (await send(
      records(collection) + '?filter=' + encodeURIComponent(`registration = "${job.id}"`), { token: admin },
    )).payload.items;
    const auditFor = async (job) => {
      const current = (await registrations(job)).payload;
      return buildAudit([current], await recordsFor('payments', job), await recordsFor('refunds', job));
    };

    const wardrobeFields = {
      name: 'Wardrobe', amount: 50, is_active: true, client_kind: 'school',
      revenue_category: 'mua', default_when_no_mua: true,
    };
    const wardrobe = await create('add_ons', { ...wardrobeFields, code: 'WARDROBE' });
    await send(records('add_ons'), {
      method: 'POST', token: admin, status: 400, body: { ...wardrobeFields, code: 'OVERLAP', client_kind: 'both' },
    });
    await send(records('add_ons', groomingAddOn.id), {
      method: 'PATCH', token: admin, status: 400, body: { default_when_no_mua: true },
    });
    const walkinDefault = await create('add_ons', { ...wardrobeFields, code: 'WALK-WARDROBE', amount: 65, client_kind: 'walkin' });
    await patchCatalog('studio_settings', settings, { walkin_enabled: true });
    const walkinWithDefault = await walkIn({ no_mua_default_quote: walkinDefault.id + ':6500' });
    assert.deepEqual(walkinWithDefault.add_ons.map(({ id, amount }) => [id, amount]), [[walkinDefault.id, 65]]);
    await patchCatalog('studio_settings', settings, { walkin_enabled: false });
    const catalog = (await send(api + '/registration-catalog')).payload;
    const offered = catalog.addOns.filter((item) => item.client_kind !== 'walkin');
    const portrait = catalog.packages.find((item) => item.id === studio.id);
    const muaPortrait = catalog.packages.find((item) => item.id === pureMua.id);
    const preview = (selections, pkg = portrait) => {
      const { defaultAddOn, totalAmount } = registrationAddOns(pkg, offered, selections);
      return [defaultAddOn?.id, totalAmount];
    };
    assert.deepEqual(preview([]), [wardrobe.id, 1550]);
    assert.deepEqual(preview([groomingAddOn.id]), [undefined, 1650]);
    assert.deepEqual(preview([]), [wardrobe.id, 1550]);
    assert.deepEqual(preview([], muaPortrait), [undefined, 300]);
    assert.deepEqual(preview([wardrobe.id, wardrobe.id]), [wardrobe.id, 1550]);

    const included = await register(studio, [{ id: wardrobe.id, amount: 0 }], 200, {
      no_mua_default_quote: wardrobe.id + ':5000',
    });
    // Wardrobe is a shared MUA charge: money for the MUA team, not a service an artist completes.
    assert.deepEqual([included.total_amount, included.balance, included.makeup_service], [1550, 1550, '']);
    assert.deepEqual(included.add_ons, [{
      id: wardrobe.id, code: 'WARDROBE', name: 'Wardrobe', amount: 50, revenue_category: 'mua', auto_applied: true,
    }]);
    assert.deepEqual((await register(pureMua, [], 200, { no_mua_default_quote: 'none' })).add_ons, []);
    const withGrooming = await register(studio, [{ id: groomingAddOn.id }, { id: wardrobe.id }], 200, {
      no_mua_default_quote: 'none',
    });
    assert.deepEqual(withGrooming.add_ons.map((item) => item.id), [groomingAddOn.id]);
    await patchCatalog('add_ons', wardrobe, { amount: 75 });
    await register(studio, [], 400, { no_mua_default_quote: wardrobe.id + ':5000' });
    assert.equal((await register(studio)).total_amount, 1575);
    await patchCatalog('add_ons', wardrobe, { is_active: false });
    assert.equal((await register(studio, [], 200, { no_mua_default_quote: 'none' })).total_amount, 1500);
    await patchCatalog('add_ons', walkinDefault, { is_active: false });
    const discount = (job, percentage, status = 200) => send(api + '/registrations/' + job.id + '/discount', {
      method: 'POST', token: cashier, status, body: { percentage, reason: 'Student Council Officer' },
    }).then(({ payload }) => payload);
    const complimentary = await register(studio);
    const complimentarySettled = await discount(complimentary, 100);
    assert.deepEqual([complimentarySettled.paid_amount, complimentarySettled.balance, complimentarySettled.payment_status], [0, 0, 'fully_paid']);
    assert.ok(complimentarySettled.job_order_no && complimentarySettled.queue_number);
    assert.equal((await discount(complimentary, 100)).revenue_discount.at, complimentarySettled.revenue_discount.at);
    assert.equal((await recordsFor('payments', complimentary)).length, 0);
    const complimentaryAudit = await auditFor(complimentary);
    assert.equal(complimentaryAudit.totals.analyticsCollected, 1500);
    // A 100% discount: no Studio revenue (cash), the whole charge is the group's discount.
    assert.deepEqual(['collected', 'discount', 'balance'].map((key) => complimentaryAudit.byPackage.find((group) => group.key === studio.id)[key]), [0, 1500, 0]);
    await send(`${api}/registrations/${complimentary.id}/cancel`, {
      method: 'POST', token: admin, body: { reason: 'Client postponed' },
    });
    assert.equal((await auditFor(complimentary)).totals.analyticsCollected, 0);
    const restoredComplimentary = (await send(`${api}/registrations/${complimentary.id}/restore`, { method: 'POST', token: admin })).payload;
    assert.equal(restoredComplimentary.queue_number, complimentarySettled.queue_number);
    await shoot(complimentary, 'shooting');
    await shoot(complimentary, 'done_shooting');
    const half = await register(studio);
    const partial = await discount(half, 50);
    assert.deepEqual([partial.paid_amount, partial.balance, partial.payment_status], [0, 750, 'downpayment']);
    assert.equal((await auditFor(half)).totals.analyticsCollected, 750);
    await pay(half, 750);
    const halfAudit = (await auditFor(half)).totals;
    assert.deepEqual([halfAudit.analyticsCollected, halfAudit.netCollections, halfAudit.discountCredits], [1500, 750, 750]);
    await discount(half, 100, 400);
    await discount(half, 0);
    assert.equal((await auditFor(half)).totals.analyticsCollected, 750);
    const defaultArtist = await createStaff('defaultartist', 'mua');
    const wardrobePayment = await pay(included, 1550);
    const includedPaid = (await registrations(included, cashier)).payload;
    assert.equal(includedPaid.total_amount, 1550);
    assert.equal(includedPaid.balance, 0);
    assert.ok(includedPaid.queue_number > 0, 'A shared MUA charge does not hold the client at the MUA station.');
    assert.equal((await queue(defaultArtist)).some((row) => row.id === included.id), false);
    assert.equal((await send(api + '/makeup?completed=0', { token: admin })).payload.some((row) => row.id === included.id), false);
    await send(api + '/makeup-completed?date=2026-02-30', { token: admin, status: 400 });
    assert.deepEqual(orderExtras(includedPaid), [['Wardrobe (MUA)', 50]]);
    assert.equal(wardrobePayment.balance_before, 1550);
    assert.deepEqual((await auditFor(included)).totals.revenue, { studio: 1500, mua: 50, unallocated: 0 });
    const includedReport = (await send(api + '/student-excel', { token: admin })).payload;
    assert.equal(includedReport.rows.find((row) => row.jobOrder === includedPaid.job_order_no).addOns[wardrobe.id], 5000);
    // The master Excel's MUA pages list it as the team's shared money, never credited to one artist.
    assert.deepEqual(includedReport.mua.shared.filter((line) => line.jobId === included.id).map((line) => [line.item, line.amount, line.paidInFull]),
      [['Wardrobe', 50, true]]);
    assert.equal(includedReport.mua.lines.some((line) => line.jobId === included.id), false);
    const today = studioDate(new Date().toISOString());
    const todayPayouts = (await send(`${api}/mua-payouts?from=${today}&to=${today}`, { token: admin })).payload;
    assert.ok(todayPayouts.shared.some((line) => line.jobId === included.id && line.amount === 50));
    await send(`${api}/mua-payouts?from=${today}&to=2000-01-01`, { token: admin, status: 400 });
    await send(`${api}/mua-payouts?from=${today}&to=${today}`, { token: cashier, status: 403 });

    // Catalog price determines new earnings, including three separately completed purchases.
    const rateArtist = await createStaff('earningsartist', 'mua');
    const rateAddOn = await create('add_ons', {
      code: 'IND-MAKEUP', name: 'Catalog Makeup', amount: 200, revenue_category: 'mua', is_active: true,
    });
    assert.equal((await register(studio, [{ id: rateAddOn.id }])).makeup_service, '',
      'MUA revenue classification alone does not activate the queue.');
    await send(records('add_ons', rateAddOn.id), { token: admin, method: 'PATCH', status: 400,
      body: { requires_mua: true, revenue_category: 'studio' } });
    await patchCatalog('add_ons', rateAddOn, { requires_mua: true });
    const serviceCatalog = (await send(api + '/registration-catalog')).payload;
    assert.equal(serviceCatalog.addOns.find((item) => item.id === rateAddOn.id).requires_mua, true);
    const serviceId = 'add_on:' + rateAddOn.id;
    const artistReport = async () => (await report()).rows.find((row) => row.id === rateArtist.id);
    const jobs = [];
    for (let count = 1; count <= 3; count++) {
      const job = await register(studio, [{ id: rateAddOn.id }]);
      const payment = await pay(job, 1700);
      await contest(job, rateArtist, 'claim');
      await contest(job, rateArtist, 'start');
      assert.equal((await artistReport()).totalEarnings, (count - 1) * 200);
      await contest(job, rateArtist, 'complete');
      await contest(job, rateArtist, 'complete');
      const row = await artistReport();
      assert.equal(row.counts[serviceId], count);
      assert.equal(row.earnings[serviceId], count * 200);
      jobs.push({ job, payment, detail: row.details.find((item) => item.jobId === job.id) });
    }
    await patchCatalog('add_ons', rateAddOn, { amount: 275, is_active: false });
    assert.equal((await artistReport()).earnings[serviceId], 600);
    await register(studio, [{ id: rateAddOn.id }], 400);

    const first = jobs[0];
    await send(`${api}/registrations/${first.job.id}/cancel`, { method: 'POST', token: admin, body: { reason: 'Refund approved after service' } });
    const refund = await refundRoute({ registrationId: first.job.id, amount: 75, method: 'cash', reason: 'Refund part of makeup charge' });
    const secondJob = jobs[1];
    await send(`${api}/payments/${secondJob.payment.id}/void`, { method: 'POST', token: admin, body: { reason: 'Incorrect collection recorded' } });
    assert.equal((await artistReport()).earnings[serviceId], 600, 'Ledger activity awaits an explicit service allocation.');
    const apiAdjust = (completion, body, token = admin, status = 200) =>
      send(`${api}/mua-completions/${completion.id}/adjustments`, { method: 'POST', token, body, status }).then((r) => r.payload);
    const refundAdjustment = { kind: 'refund', reference: refund.refund_no, amount: -7500,
      reason: 'Entire refund attributable to makeup', clientKey: randomUUID() };
    await apiAdjust(first.detail, refundAdjustment, rateArtist.token, 403);
    await apiAdjust(secondJob.detail, refundAdjustment, admin, 400);
    assert.equal((await apiAdjust(first.detail, refundAdjustment)).reference, refund.refund_no);
    await apiAdjust(first.detail, refundAdjustment);
    await apiAdjust(first.detail, { ...refundAdjustment, clientKey: randomUUID() }, admin, 409);
    await apiAdjust(secondJob.detail, { kind: 'void', reference: secondJob.payment.receipt_no, amount: -20000,
      reason: 'Reverse verified makeup share of void', clientKey: randomUUID() });
    await apiAdjust(jobs[2].detail, { kind: 'correction', amount: -2500,
      reason: 'Verified service price correction', clientKey: randomUUID() });
    const reviewedEarnings = await artistReport();
    assert.deepEqual([reviewedEarnings.counts[serviceId], reviewedEarnings.earnings[serviceId]], [3, 300]);
    assert.ok(reviewedEarnings.details.every((item) => item.basis.earned === 20000 && !item.pendingReview.length));

    // Payouts: the studio records paying an artist for a period (optional); those lines are then paid.
    const period = `from=${today}&to=${today}`;
    // Report pickers start at the studio's first day (here: the legacy MUA completion seeded on 2026-01-06) and end today.
    const calendar = (await send(api + '/studio-calendar', { token: cashier })).payload;
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(calendar.start) && calendar.start === '2026-01-06' && calendar.today === today);
    await send(api + '/studio-calendar', { status: 401 });
    const payoutLines = async () => (await send(`${api}/mua-payouts?${period}`, { token: admin })).payload.lines
      .filter((line) => line.artistId === rateArtist.id);
    assert.deepEqual((await payoutLines()).map((line) => [line.earned, line.payoutNo]), [[125, ''], [0, ''], [175, '']]);
    const payFor = (token, status = 200, extra = {}) => send(`${api}/mua-payouts`, { method: 'POST', token, status,
      body: { artistId: rateArtist.id, from: today, to: today, ...extra } }).then((r) => r.payload);
    await payFor(rateArtist.token, 403);
    const payout = await payFor(admin, 200, { note: 'Cash after the event' });
    assert.deepEqual([payout.payoutNo, payout.amount, payout.lines.length, payout.note], ['MP-000001', 300, 2, 'Cash after the event']);
    assert.deepEqual((await payoutLines()).map((line) => line.payoutNo), ['MP-000001', '', 'MP-000001']);
    await payFor(admin, 400);
    await send(records('mua_payouts', payout.id), { method: 'DELETE', token: admin, status: 403 });
    await send(`${api}/mua-payouts/${payout.id}/void`, { method: 'POST', token: admin, body: { reason: '' }, status: 400 });
    assert.ok((await send(`${api}/mua-payouts/${payout.id}/void`, { method: 'POST', token: admin,
      body: { reason: 'Recorded for the wrong week' } })).payload.voidedAt);
    assert.deepEqual((await payoutLines()).map((line) => line.payoutNo), ['', '', '']);
    assert.equal((await payFor(admin)).payoutNo, 'MP-000002');
    // MUA pages: the payout export and the master Excel (same sheets, the master follows its own scope).
    const { addMuaPayoutSheets } = await vite.ssrLoadModule('/src/features/admin/muaPayoutSheets.ts');
    const { default: ExcelJS } = await import('exceljs');
    const payoutBook = new ExcelJS.Workbook();
    const periodReport = (await send(`${api}/mua-payouts?${period}`, { token: admin })).payload;
    addMuaPayoutSheets(payoutBook, { ...periodReport, period: 'test period', name: (wanted) => wanted.slice(0, 28) });
    const artistName = periodReport.lines.find((line) => line.artistId === rateArtist.id).artistName;
    const summaryRow = (book) => {
      let found;
      book.getWorksheet('MUA SUMMARY').eachRow((row) => { if (row.getCell(1).value === artistName) found = row; });
      return [3, 4, 5, 6].map((column) => { const value = found.getCell(column).value; return value && typeof value === 'object' ? value.result : value; });
    };
    assert.deepEqual(summaryRow(payoutBook), [3, 300, 300, 0], 'services, earned, paid out, unpaid');
    assert.ok(payoutBook.getWorksheet('MUA WARDROBE & SHARED') && payoutBook.getWorksheet('MUA PAYOUT LOG'));
    assert.ok(payoutBook.getWorksheet(('MUA - ' + artistName).slice(0, 28)));
    const overallBook = buildStudentWorkbook((await send(api + '/student-excel', { token: admin })).payload, { kind: 'master' });
    assert.deepEqual(summaryRow(overallBook), [3, 300, 300, 0], 'the master Excel has the same MUA pages');
    assert.ok(overallBook.getWorksheet('MUA WARDROBE & SHARED') && !overallBook.getWorksheet('MUA PAYOUT LOG'));
    // The daily MUA Performance Excel (earnings) starts with the same summary and Wardrobe page.
    const { buildMuaWorkbook: buildDailyMuaWorkbook } = await vite.ssrLoadModule('/src/features/admin/muaPerformanceExport.ts');
    const dailyBook = await buildDailyMuaWorkbook(await report(today), 'earnings', periodReport);
    assert.deepEqual(dailyBook.worksheets.slice(0, 1).map((sheet) => sheet.name), ['MUA SUMMARY']);
    assert.ok(dailyBook.getWorksheet('MUA WARDROBE & SHARED') && dailyBook.getWorksheet('MUA Earnings') && dailyBook.getWorksheet('Earnings Audit'));
    const priceReport = await report();
    const { muaReportCsv, buildMuaWorkbook } = await import('../src/features/admin/muaPerformanceExport.ts');
    const { muaEarningsTable } = await import('../src/features/admin/muaPerformance.ts');
    const earningsMatrix = muaEarningsTable(priceReport);
    const earningsBook = await buildMuaWorkbook(priceReport, 'earnings');
    const artistIndex = priceReport.rows.findIndex((row) => row.id === rateArtist.id);
    const columnIndex = priceReport.columns.findIndex((col) => col.id === serviceId);
    assert.equal(earningsBook.getWorksheet('MUA Earnings').getCell(artistIndex + 2, columnIndex + 3).value, 300);
    assert.equal(earningsBook.getWorksheet('Earnings Audit').getSheetValues().filter(Boolean)
      .filter((row) => row.includes(refund.refund_no) && row.includes(-75)).length, 1);
    assert.match(muaReportCsv(priceReport, 'earnings').split('\r\n')[artistIndex + 1], /,300$/);
    assert.equal(earningsMatrix.rows[artistIndex][columnIndex + 2], 300);

    const studioOnly = await register(studio);
    await pay(studioOnly, 1500);
    assert.deepEqual((await auditFor(studioOnly)).totals.revenue, { studio: 1500, mua: 0, unallocated: 0 });
    const muaOnly = await register(pureMua);
    await pay(muaOnly, 300);
    assert.deepEqual((await auditFor(muaOnly)).totals.revenue, { studio: 0, mua: 300, unallocated: 0 });
    const mixed = await register(studio, [{ id: muaAddOn.id, revenue_category: 'studio', amount: 0 }, { id: groomingAddOn.id }], 200,
      { revenue_terms: JSON.stringify({ studio: 0, mua: 1, unallocated: 0 }) });
    assert.deepEqual(mixed.revenue_terms, { studio: 150000, mua: 45000, unallocated: 0 });
    const mixedFirst = await pay(mixed, 975, 'initial');
    assert.deepEqual((await auditFor(mixed)).totals.revenue, { studio: 0, mua: 0, unallocated: 975 });
    const mixedLast = await pay(mixed, 975, 'additional');
    const settled = await auditFor(mixed);
    assert.equal(settled.totals.netCollections, 1950);
    assert.equal(settled.totals.outstanding, 0);
    assert.deepEqual(settled.totals.revenue, { studio: 1500, mua: 450, unallocated: 0 });
    assert.equal(settled.bySchool[0].collected, 1500);
    assert.equal(settled.byPackage[0].collected, 1500);
    const periodAudit = buildAudit([settled.orders[0].registration], [
      { ...mixedFirst, created: '2026-11-20 15:59:00.000Z' },
      { ...mixedLast, created: '2026-11-20 16:00:00.000Z' },
    ], [], '2026-11-20 16:00:00.000Z');
    assert.deepEqual(periodAudit.totals.revenue, { studio: 1500, mua: 450, unallocated: -975 });
    assert.equal(periodAudit.totals.netCollections, 975);
    const auditBook = buildAuditWorkbook(settled, { label: 'All time' });
    const excel = await import('exceljs');
    const auditReadback = new excel.default.Workbook();
    await auditReadback.xlsx.load(await auditBook.xlsx.writeBuffer());
    const allocationRows = auditReadback.getWorksheet('Revenue').getRows(5, 2).map((row) => row.values.slice(4, 8));
    assert.deepEqual(allocationRows, [[0, 0, 975, 975], [1500, 450, -975, 975]]);
    const receipt = { registration: settled.orders[0].registration, payments: [mixedFirst, mixedLast], refunds: [], terms: [] };
    assert.equal(receiptRevenueLine(receipt, mixedLast), 'Studio ₱1,500.00 / MUA ₱450.00 / Unallocated ₱-975.00');
    assert.deepEqual(buildRegistrationsCsv([receipt.registration], receipt.payments).split('\r\n')
      .slice(1).map((line) => line.split(',').slice(-5)), [['1500.00', '450.00', '0.00', '0.00', '1950.00'], ['1500.00', '450.00', '0.00', '0.00', '1950.00']]);

    // Sold prices and ownership are independent from later catalog edits.
    await patchCatalog('packages', studio, { amount: 1800, revenue_category: 'mua' });
    await patchCatalog('add_ons', groomingAddOn, { amount: 180, revenue_category: 'studio', requires_mua: false, is_active: false });
    await register(studio, [{ id: groomingAddOn.id }], 400);
    assert.deepEqual((await auditFor(mixed)).totals.revenue, settled.totals.revenue);
    await patchCatalog('packages', studio, { amount: 1500, revenue_category: 'studio' });
    await send(records('add_ons', groomingAddOn.id), { token: admin, method: 'DELETE', status: 409 }); // sold on `mixed`
    assert.deepEqual((await auditFor(mixed)).totals.revenue, settled.totals.revenue);
    await registrations(mixed, cashier, { order_discount: { studio: 0, mua: 50, reason: 'staff discount' } }, 403);
    await registrations(mixed, admin, { order_discount: { studio: 0, mua: 50, reason: '' } }, 400);
    const discounted = (await registrations(mixed, admin, {
      order_discount: { studio: 0, mua: 150, reason: 'Complimentary grooming' },
    })).payload;
    assert.deepEqual(discounted.revenue_terms, { studio: 150000, mua: 30000, unallocated: 0 });
    assert.deepEqual([discounted.total_amount, discounted.balance], [1800, 0]);
    assert.deepEqual(orderExtras(discounted).at(-1), ['Discount credit (Fixed amount) · Complimentary grooming', -150]);
    assert.equal(discounted.revenue_discount.fixed, true);
    assert.equal((await auditFor(mixed)).orders[0].overpaid, 150);
    await refundRoute({ registrationId: mixed.id, amount: 150, method: 'cash', reason: 'Approved complimentary service' });
    assert.deepEqual((await auditFor(mixed)).totals.revenue, { studio: 1500, mua: 300, unallocated: 0 });

    const discountReport = (await send(api + '/student-excel', { token: admin })).payload;
    const exportRow = discountReport.rows.find((row) => row.jobOrder === discounted.job_order_no);
    assert.deepEqual([exportRow.packageAmount, exportRow.discount, exportRow.due], [150000, 15000, 180000]);
    const discountBook = buildStudentWorkbook({ ...discountReport, rows: [exportRow] });
    const discountSheet = discountBook.worksheets[0];
    const discountHeaders = discountSheet.getRow(1).values;
    for (const [heading, amount] of [['STUDIO REVENUE', 1500], ['OTHER PAYMENT - MUA', 300], ['DISCOUNT', -150]]) {
      assert.equal(discountSheet.getRow(2).getCell(discountHeaders.indexOf(heading)).value, amount, heading);
    }
    // The discount's reason travels with it: a note on the Overall Excel's DISCOUNT cell, the ledger CSV,
    // and the Audit Export (a Discounts sheet whose total is DISCOUNT CREDITS, checked on the Summary).
    assert.match(exportRow.discountNote, /Complimentary grooming/);
    assert.match(String(discountSheet.getRow(2).getCell(discountHeaders.indexOf('DISCOUNT')).note), /Complimentary grooming/);
    const discountCsv = buildRegistrationsCsv([discounted], []).split('\r\n');
    const csvCells = (line) => line.split(',').map((value) => value.replace(/^"|"$/g, ''));
    assert.equal(csvCells(discountCsv[1])[csvCells(discountCsv[0]).indexOf('Discount reason')], 'Complimentary grooming');
    const discountAudit = await auditFor(mixed);
    assert.deepEqual(discountAudit.discounts.map((row) => [row.registration.id, row.reason]), [[mixed.id, 'Complimentary grooming']]);
    assert.equal(discountAudit.discounts.reduce((sum, row) => sum + row.credit, 0), discountAudit.totals.discountCredits);
    const discountAuditBook = new excel.default.Workbook();
    await discountAuditBook.xlsx.load(await buildAuditWorkbook(discountAudit, { label: 'All time' }).xlsx.writeBuffer());
    const discountsSheet = discountAuditBook.getWorksheet('Discounts');
    assert.equal(discountsSheet.getRow(5).getCell(9).value, 'Complimentary grooming');
    const jobOrdersSheet = discountAuditBook.getWorksheet('Job Orders');
    assert.deepEqual([jobOrdersSheet.getRow(4).getCell(15).value, jobOrdersSheet.getRow(5).getCell(15).value], ['Discount', 1.5 * 100]);
    const summaryChecks = [];
    discountAuditBook.getWorksheet('Summary').eachRow((row) => {
      if (String(row.getCell(1).value).startsWith('Operational collected −')) summaryChecks.push(row.getCell(3).value.result);
    });
    assert.deepEqual(summaryChecks, ['OK - balanced']);
    await send(records('payments', mixedLast.id), { token: admin, method: 'PATCH', body: { amount: 825 }, status: 403 });
    await send(`${api}/payments/${mixedLast.id}/void`, { method: 'POST', token: admin, body: { reason: 'Incorrect receipt amount' } });
    assert.equal((await registrations(mixed)).payload.balance, 975);
    await pay(mixed, 975, 'additional');
    assert.deepEqual((await auditFor(mixed)).totals.revenue, { studio: 1500, mua: 300, unallocated: 0 });
    assert.equal((await registrations(mixed)).payload.balance, 0);
    const free = await create('add_ons', { code: 'FREE', name: 'Free MUA service', amount: 0, is_active: true, revenue_category: 'mua' });
    const withFree = await register(studio, [{ id: free.id }]);
    await pay(withFree, 1500);
    assert.deepEqual((await auditFor(withFree)).totals.revenue, { studio: 1500, mua: 0, unallocated: 0 });

    const legacyJob = { id: legacyId };
    assert.deepEqual((await auditFor(legacyJob)).totals.revenue, { studio: 0, mua: 0, unallocated: 1000 });
    await registrations(legacyJob, admin, { review_mua_amount: 2000, review_revenue_reason: 'Original invoice' }, 400);
    const reviewed = (await registrations(legacyJob, admin, { review_mua_amount: 0, review_revenue_reason: 'Original invoice confirms studio' })).payload;
    assert.deepEqual(reviewed.revenue_terms, { studio: 150000, mua: 0, unallocated: 0 });
    assert.deepEqual((await auditFor(legacyJob)).totals.revenue, { studio: 1000, mua: 0, unallocated: 0 });

    // A paid mixed order joins the Parent's waiting queue; assignment is separate from completion and revenue.
    const parent = artists[2];
    const child = artists[3];
    const replacement = artists[4];
    const disabled = artists[5];
    const setTeam = (actor, parentId, allowSelf, status = 200) => send(api + '/makeup-team', {
      method: 'POST', token: actor.token || actor, body: { parentId, allowSelf }, status,
    });
    const getTeam = (actor, overview = false, date = '') => send(api + '/makeup-team?' + new URLSearchParams({
      overview: overview ? '1' : '0', date,
    }), { token: actor.token || actor }).then((response) => response.payload);
    await send(records('users', disabled.id), { token: admin, method: 'PATCH', body: { disabled: true } });
    await setTeam(child, child.id, true, 403);
    await setTeam(admin, chooser.id, true, 400);
    await setTeam(admin, parent.id, false);
    assert.equal((await getTeam(parent)).manage, true);
    assert.equal((await getTeam(child)).manage, false);
    const childOverview = await getTeam(child, true);
    assert.equal(childOverview.manage, false);
    assert.deepEqual(childOverview.artists, []);
    assert.equal(childOverview.report, undefined);
    assert.equal(childOverview.workload, undefined);
    await send(api + '/makeup-team?overview=1', { token: cashier, status: 403 });
    await send(api + '/makeup-team?overview=1&date=2026-02-30', { token: parent.token, status: 400 });
    await send(api + '/mua-performance', { token: parent.token, status: 403 });
    const beforeAssignment = await getTeam(parent, true);
    assert.ok(beforeAssignment.artists.some((artist) => artist.parent && artist.id === parent.id));
    assert.ok(!beforeAssignment.artists.some((artist) => artist.id === disabled.id));
    assert.equal(beforeAssignment.report.rows.find((row) => row.id === defaultArtist.id)?.earnings['add_on:' + wardrobe.id] ?? 0, 0,
      'Shared MUA charges are not credited to an artist.');
    assert.ok((await queue(parent)).some((row) => row.id === mixed.id && row.state === 'waiting'));
    assert.ok(!(await queue(child)).some((row) => row.id === mixed.id));
    const detailPath = `${api}/makeup/${mixed.id}/details`;
    const waitingDetail = (await send(detailPath, { token: parent.token })).payload;
    assert.deepEqual([waitingDetail.details.school, waitingDetail.details.level, waitingDetail.details.paymentConfirmed], ['Workflow Academy', 'College', true]);
    await send(detailPath, { token: child.token, status: 404 });
    await contest(mixed, child, 'claim', 403);
    await contest(mixed, child, 'assign', 403, { artistId: replacement.id });
    await contest(mixed, parent, 'assign', 403, { artistId: parent.id });
    await contest(mixed, parent, 'assign', 400, { artistId: disabled.id });
    const winning = await Promise.all([
      contest(mixed, parent, 'assign', null, { artistId: child.id }),
      contest(mixed, admin, 'assign', null, { artistId: replacement.id }),
    ]);
    assert.deepEqual(winning.map(({ status }) => status).sort(), [200, 409]);
    const firstArtist = winning[0].status === 200 ? child : replacement;
    const nextArtist = firstArtist === child ? replacement : child;
    const assignedOverview = await getTeam(parent, true);
    assert.equal(assignedOverview.workload.pending, beforeAssignment.workload.pending + 2);
    assert.equal(assignedOverview.report.totalServices, beforeAssignment.report.totalServices);
    await contest(mixed, parent, 'assign', 200, { artistId: firstArtist.id }); // retry of version zero
    assert.ok((await queue(firstArtist)).some((row) => row.id === mixed.id && row.state === 'claimed'));
    assert.ok(!(await queue(nextArtist)).some((row) => row.id === mixed.id));
    assert.ok(!(await report()).rows.flatMap((row) => row.details).some((detail) => detail.jobId === mixed.id));
    await contest(mixed, firstArtist, 'start', 200, { version: '1' });
    const startedOverview = await getTeam(parent, true);
    assert.equal(startedOverview.workload.inProgress, beforeAssignment.workload.inProgress + 2);
    await contest(mixed, parent, 'assign', 200, { artistId: nextArtist.id, version: '1' });
    await contest(mixed, firstArtist, 'complete', 409, { version: '1' });
    assert.ok((await queue(nextArtist)).some((row) => row.id === mixed.id && row.state === 'claimed'));
    await contest(mixed, nextArtist, 'start', 200, { version: '2' });
    await contest(mixed, nextArtist, 'complete', 200, { version: '2' });
    await contest(mixed, nextArtist, 'complete', 200, { version: '2' });
    await contest(mixed, parent, 'assign', 409, { artistId: firstArtist.id, version: '2' });
    const performed = (await report()).rows.find((row) => row.id === nextArtist.id).details.filter((row) => row.jobId === mixed.id);
    assert.deepEqual(performed.map((row) => row.serviceName).sort(), ['Grooming session', 'Makeup session']);
    assert.deepEqual(performed.map((row) => row.earned).sort((a, b) => a - b), [10000, 20000]);
    const completedOverview = await getTeam(parent, true);
    const adminReport = await report(completedOverview.date);
    const teamIds = new Set(completedOverview.artists.map(({ id }) => id));
    const sharedRows = adminReport.rows.filter(({ id }) => teamIds.has(id)).map((row) => ({ ...row, details: [] }));
    assert.deepEqual(completedOverview.report.rows, sharedRows);
    assert.deepEqual(completedOverview.workload, beforeAssignment.workload);
    assert.equal(completedOverview.artists.find(({ id }) => id === nextArtist.id).completed,
      completedOverview.report.rows.find(({ id }) => id === nextArtist.id).totalServices);
    assert.equal(completedOverview.report.totalServices, beforeAssignment.report.totalServices + 2);
    const teamEarnings = (overview) => overview.report.rows.reduce((sum, row) => sum + row.totalEarnings, 0);
    assert.equal(teamEarnings(completedOverview) - teamEarnings(beforeAssignment), 300);
    assert.equal(teamEarnings(await getTeam(admin, true)), teamEarnings(completedOverview));
    for (const actor of [parent, firstArtist]) {
      await send(api + '/mua-completions/' + performed[0].id + '/adjustments', {
        method: 'POST', token: actor.token, status: 403,
        body: { kind: 'correction', clientKey: 'overview-denied', amount: 100, reason: 'Unauthorized correction' },
      });
    }
    assert.ok((await getTeam(parent)).artists.find((artist) => artist.id === nextArtist.id).completed > 0);
    const history = (await send(records('mua_assignment_events') + '?sort=created&filter='
      + encodeURIComponent(`job_id = "${mixed.id}"`), { token: admin })).payload.items;
    assert.deepEqual(history.map((event) => event.action), ['assign', 'start', 'reassign', 'start', 'complete']);
    assert.equal(history[2].previous_artist_id, firstArtist.id);
    assert.equal(history[2].actor_id, parent.id);
    assert.equal(history[4].artist_id, nextArtist.id);
    const historyDb = new DatabaseSync(join(data, 'data.db'));
    const historicalDate = '2026-10-04';
    const makeupSnapshot = historyDb.prepare('SELECT makeup_services FROM registrations WHERE id = ?').get(mixed.id).makeup_services;
    try {
      historyDb.prepare('UPDATE mua_assignment_events SET created = ? WHERE id = ?').run('2026-10-04 08:00:00.000Z', history[0].id);
      historyDb.prepare('UPDATE mua_assignment_events SET created = ? WHERE id = ?').run('2026-10-04 09:00:00.000Z', history[1].id);
      historyDb.prepare('UPDATE registrations SET makeup_services = ? WHERE id = ?').run('[]', mixed.id);
      const historic = await getTeam(parent, true, historicalDate);
      assert.equal(historic.date, historicalDate);
      assert.equal(historic.artists.find(({ id }) => id === firstArtist.id).inProgress, 1);
      assert.equal(historic.workload.inProgress, 2);
      assert.equal(historic.report.totalServices, 0);
      assert.deepEqual(historic.report.rows, []);
      assert.equal(history[1].service_count, 2);
    } finally {
      for (const event of history.slice(0, 2)) {
        historyDb.prepare('UPDATE mua_assignment_events SET created = ? WHERE id = ?').run(event.created, event.id);
      }
      historyDb.prepare('UPDATE registrations SET makeup_services = ? WHERE id = ?').run(makeupSnapshot, mixed.id);
      historyDb.close();
    }
    const assignedHistory = (await send(detailPath, { token: parent.token })).payload.history;
    assert.deepEqual(assignedHistory.map((event) => event.action), ['complete', 'start', 'reassign', 'start', 'assign']);
    const personalHistory = (await send(detailPath, { token: nextArtist.token })).payload.history;
    assert.deepEqual(personalHistory.map((event) => event.action), ['complete', 'start', 'reassign']);
    await send(detailPath, { token: firstArtist.token, status: 404 });
    const mixedCompletionDate = studioDate((await registrations(mixed)).payload.makeup_completed_at);
    const mixedCompletions = (await send(api + '/makeup-completed?date=' + mixedCompletionDate, { token: nextArtist.token }))
      .payload.filter((row) => row.id === mixed.id);
    assert.equal(mixedCompletions.length, 1, 'A completion with multiple service lines occupies one row');
    assert.deepEqual(mixedCompletions[0].services.map((service) => service.name).sort(), ['Grooming session', 'Makeup session']);
    await setTeam(admin, parent.id, true);
    const parentJob = await register(pureMua, [], 200, { no_mua_default_quote: 'none' });
    await pay(parentJob, parentJob.total_amount);
    await contest(parentJob, parent, 'assign', 200, { artistId: parent.id });
    await contest(parentJob, parent, 'start', 200, { version: '1' });
    await contest(parentJob, parent, 'complete', 200, { version: '1' });
    const parentOwn = await getTeam(parent, true);
    assert.ok(parentOwn.report.rows.some((row) => row.id === parent.id && row.earnings['package:' + pureMua.id] > 0));
    await contest(muaOnly, parent, 'assign', 200, { artistId: parent.id });
    await setTeam(admin, parent.id, false);
    await contest(muaOnly, parent, 'start', 200, { version: '1' });
    await setTeam(admin, replacement.id, false);
    await contest(muaOnly, parent, 'complete', 200, { version: '1' });
    assert.equal((await getTeam(parent)).manage, false);
    assert.equal((await getTeam(parent, true)).report, undefined);
    assert.equal((await getTeam(replacement)).manage, true);
    assert.ok((await report()).rows.some((row) => row.id === parent.id && row.details.some((detail) => detail.jobId === muaOnly.id)));
    await shoot(mixed, 'shooting');
    await send(records('packages', studio.id), { token: admin, method: 'DELETE', status: 409 }); // sold on `mixed`
    await patchCatalog('packages', studio, { name: 'Renamed later', is_active: false });
    const retained = await auditFor(mixed);
    assert.equal(retained.orders[0].registration.package_snapshot.name, 'Portrait');
    assert.equal(retained.byPackage[0].key, studio.id);
    assert.deepEqual(retained.totals.revenue, { studio: 1500, mua: 300, unallocated: 0 });
  });

  // Admin edits of a job order's package and add-ons at each stage.
  {
    const plainPkg = await create('packages', { code: 'EDIT', name: 'Edit Portrait', amount: 1000, is_active: true, revenue_category: 'studio' });
    const retiredPkg = await create('packages', { code: 'RETIRED', name: 'Retired Portrait', amount: 500, is_active: false, revenue_category: 'studio' });
    const walkinPkg = await create('packages', { code: 'WALK-ONLY', name: 'Walk-in Portrait', amount: 700, is_active: true, client_kind: 'walkin', revenue_category: 'studio' });
    const lateMakeup = await create('add_ons', { code: 'LATE-MU', name: 'Late makeup', amount: 200, is_active: true, revenue_category: 'mua', requires_mua: true });
    const lateGrooming = await create('add_ons', { code: 'LATE-GR', name: 'Late grooming', amount: 150, is_active: true, revenue_category: 'mua', requires_mua: true });
    const lateFrame = await create('add_ons', { code: 'LATE-FR', name: 'Late frame', amount: 300, is_active: true, revenue_category: 'studio' });
    const editArtist = await createStaff('editartist', 'mua');
    const edit = (job, body, status = 200) => registrations(job, admin, body, status).then((r) => r.payload);
    const ids = (job) => job.add_ons.map((item) => item.id);
    const doMakeup = async (job) => {
      const version = String((await queue(admin)).find((row) => row.id === job.id).version);
      await contest(job, admin, 'assign', 200, { artistId: editArtist.id, version });
      const next = String(Number(version) + 1);
      await contest(job, admin, 'start', 200, { onBehalf: true, artistId: editArtist.id, version: next });
      await contest(job, admin, 'complete', 200, { onBehalf: true, artistId: editArtist.id, version: next });
    };
    // Completion logs are superuser-only through the API: read them from the database.
    const credited = async (job) => {
      const db = new DatabaseSync(join(data, 'data.db'), { readOnly: true });
      try {
        return db.prepare('SELECT service_name FROM mua_completions WHERE job_id = ? ORDER BY completed_at, rowid')
          .all(job.id).map((row) => row.service_name);
      } finally { db.close(); }
    };

    // A changed package must be on sale and offered to the client's type.
    const basic = await register(plainPkg);
    assert.match((await edit(basic, { package: retiredPkg.id }, 400)).message, /no longer offered/);
    assert.match((await edit(basic, { package: walkinPkg.id }, 400)).message, /not offered to school clients/);

    // The automatic add-on follows the order when makeup is added or removed.
    const autoFee = await create('add_ons', {
      code: 'AUTO-FEE', name: 'Styling fee', amount: 40, is_active: true, client_kind: 'school',
      revenue_category: 'mua', default_when_no_mua: true,
    });
    const withFee = await register(plainPkg, [], 200, { no_mua_default_quote: autoFee.id + ':4000' });
    assert.deepEqual([ids(withFee), withFee.total_amount], [[autoFee.id], 1040]);
    await pay(withFee, 1040);
    const addedMakeup = await edit(withFee, { add_ons: [{ id: autoFee.id }, { id: lateMakeup.id }] });
    assert.deepEqual([ids(addedMakeup), addedMakeup.total_amount, addedMakeup.balance, addedMakeup.makeup_service],
      [[lateMakeup.id], 1200, 160, 'Late makeup'], 'Makeup replaces the automatic add-on.');
    const removedMakeup = await edit(withFee, { add_ons: [] });
    assert.deepEqual([ids(removedMakeup), removedMakeup.total_amount, removedMakeup.balance, removedMakeup.makeup_service],
      [[autoFee.id], 1040, 0, ''], 'Without makeup the automatic add-on comes back (a shared MUA charge: no queue step).');
    assert.equal(removedMakeup.add_ons[0].auto_applied, true);
    await patchCatalog('add_ons', autoFee, { is_active: false });

    // Fully paid, mid-shoot, the client asks for makeup: back to the MUA queue, then to the shoot.
    const midShoot = await register(plainPkg);
    await pay(midShoot, 1000);
    await shoot(midShoot, 'shooting');
    const queueNumber = (await registrations(midShoot)).payload.queue_number;
    assert.equal((await cameraApi('start', { registration: midShoot.id })).client.id, midShoot.id);
    await drop('before-makeup.jpg');
    const sentBack = await edit(midShoot, { add_ons: [{ id: lateMakeup.id }] });
    assert.deepEqual(
      [sentBack.status, sentBack.makeup_service, sentBack.makeup_state, sentBack.payment_status, sentBack.balance, sentBack.queue_number],
      ['paid', 'Late makeup', '', 'downpayment', 200, queueNumber]);
    assert.equal((await cameraApi('scan')).client, null, 'The camera is unlinked when the client leaves for makeup.');
    const midFolder = (await send(`${api}/photo-folder/${midShoot.id}`, { method: 'POST', token: photographer })).payload.path;
    assert.ok((await readdir(midFolder)).includes('before-makeup.jpg'), 'Shots taken before the pause stay with the client.');
    await shoot(midShoot, 'shooting', 400);
    assert.ok((await queue(admin)).some((row) => row.id === midShoot.id));
    await doMakeup(midShoot);
    assert.deepEqual(await credited(midShoot), ['Late makeup']);
    await shoot(midShoot, 'shooting');

    // A second round mid-shoot credits only the new service.
    const secondRound = await edit(midShoot, { add_ons: [{ id: lateMakeup.id }, { id: lateGrooming.id }] });
    const priorCompletion = (await send(api + '/makeup-completed?date=' + studioDate(Date.now()), { token: admin })).payload
      .find((row) => row.id === midShoot.id);
    assert.deepEqual(priorCompletion.services.map((service) => service.name), ['Late makeup'],
      'Earlier work stays in completed services when the client returns for another service');
    assert.deepEqual([secondRound.status, secondRound.makeup_state, secondRound.makeup_service],
      ['paid', '', 'Late makeup + Late grooming']);
    await doMakeup(midShoot);
    assert.deepEqual(await credited(midShoot), ['Late makeup', 'Late grooming'], 'Earlier makeup is not credited twice.');
    await shoot(midShoot, 'shooting');
    await shoot(midShoot, 'done_shooting');

    // After the shoot: no new makeup, but other add-ons still bill the client.
    const lateTouch = await create('add_ons', { code: 'LATE-TU', name: 'Late touch up', amount: 100, is_active: true, revenue_category: 'mua', requires_mua: true });
    assert.match((await edit(midShoot, { add_ons: [{ id: lateMakeup.id }, { id: lateGrooming.id }, { id: lateTouch.id }] }, 409)).message,
      /Photos are already done/);
    const framed = await edit(midShoot, { add_ons: [{ id: lateMakeup.id }, { id: lateGrooming.id }, { id: lateFrame.id }] });
    assert.deepEqual([framed.status, framed.balance, framed.payment_status], ['done_shooting', 650, 'downpayment']);
    await pay(midShoot, 650, 'additional');

    // Released and cancelled orders keep their items.
    await send(api + '/production-status', { method: 'POST', token: admin, body: { ids: [midShoot.id], status: 'ready_for_pickup' } });
    await registrations(midShoot, cashier, { status: 'released', claimed_by: 'Client' });
    assert.match((await edit(midShoot, { add_ons: [] }, 400)).message, /already released/);
    await pay(basic, 1000);
    await send(`${api}/registrations/${basic.id}/cancel`, { method: 'POST', token: admin, body: { reason: 'Client left' } });
    assert.match((await edit(basic, { add_ons: [{ id: lateFrame.id }] }, 400)).message, /Restore it/);
  }

  // Both export formats use the same row matrix as the dashboard.
  const { muaReportTable } = await import('../src/features/admin/muaPerformance.ts');
  const { buildMuaWorkbook, muaReportCsv } = await import('../src/features/admin/muaPerformanceExport.ts');
  const matrix = muaReportTable(historical);
  const expected = [matrix.headers, ...matrix.rows, matrix.total];
  assert.deepEqual(muaReportCsv(historical).split('\r\n').map((line) => line.split(',').map((cell) =>
    cell.startsWith('"') ? JSON.parse(cell) : Number(cell))), expected);
  const workbook = await buildMuaWorkbook(historical);
  const Excel = require('exceljs');
  const readback = new Excel.Workbook();
  await readback.xlsx.load(await workbook.xlsx.writeBuffer());
  assert.deepEqual(readback.worksheets[0].getRows(1, expected.length).map((row) => row.values.slice(1)), expected);

  // A server restart keeps both issued identifiers and the high-water mark.
  const beforeRestart = (await registrations(docsClient)).payload;
  server.kill();
  await once(server, 'exit');
  const oldSelected = join(legacyPath, 'selected');
  await writeFile(join(oldSelected, 'kept.png'), png);
  const kept = await stat(join(oldSelected, 'kept.png'), { bigint: true });
  const migrationDb = join(data, 'data.db');
  const setupMigration = new DatabaseSync(migrationDb);
  try {
    setupMigration.prepare('UPDATE registrations SET photo_selection = ? WHERE id = ?')
      .run(JSON.stringify([['selected/kept.png', [Number(kept.size), String(kept.mtimeNs)]]]), legacyId);
  } finally { setupMigration.close(); }
  const migrateArgs = [join(repo, 'scripts', 'migrate-photo-folders.cjs'), migrationDb, photos];
  assert.match(execFileSync(process.execPath, migrateArgs, { encoding: 'utf8' }), /Preview only/);
  assert.deepEqual(await readFile(join(oldSelected, 'kept.png')), png);
  assert.match(execFileSync(process.execPath, [...migrateArgs, '--apply'], { encoding: 'utf8' }), /Committed 1 repositories/);
  const migratedLeaf = '00050_Corrected_Name_Juan_Carlos';
  const migratedPath = join(photos, 'ORGANIZATION', 'COURSE', migratedLeaf);
  assert.deepEqual(await readFile(join(migratedPath, migratedLeaf, 'kept.png')), png);
  assert.deepEqual(await readFile(join(migratedPath, 'legacy.png')), png);
  assert.ok((await readdir(migratedPath)).includes('Unselected'));
  await assert.rejects(stat(legacyPath), { code: 'ENOENT' });
  assert.match(execFileSync(process.execPath, migrateArgs, { encoding: 'utf8' }), /0 repositories ready/);
  const orphanLeaf = '999999_Empty_Client';
  const orphan = join(photos, 'ORGANIZATION', 'COURSE', orphanLeaf);
  await mkdir(join(orphan, orphanLeaf), { recursive: true });
  await mkdir(join(orphan, 'Unselected'));
  const scanner = join(repo, 'scripts', 'clean_orphan_folders.cjs');
  assert.match(execFileSync(process.execPath, [scanner, '--scan', migrationDb, photos], { encoding: 'utf8' }), /1 empty orphan folders found/);
  assert.ok((await stat(orphan)).isDirectory());
  assert.match(execFileSync(process.execPath, [scanner, '--prune', migrationDb, photos], { encoding: 'utf8' }), /1 empty orphan folders removed/);
  await assert.rejects(stat(orphan), { code: 'ENOENT' });
  assert.deepEqual(await readFile(join(migratedPath, migratedLeaf, 'kept.png')), png);
  const verifiedDb = new DatabaseSync(migrationDb, { readOnly: true });
  try {
    const migrated = verifiedDb.prepare('SELECT photo_folder, photo_selection FROM registrations WHERE id = ?').get(legacyId);
    assert.equal(migrated.photo_folder, 'ORGANIZATION/COURSE/' + migratedLeaf);
    assert.equal(JSON.parse(migrated.photo_selection)[0][0], migratedLeaf + '/kept.png');
  } finally { verifiedDb.close(); }
  await startServer();
  assert.equal(await folder({ id: legacyId }), migratedPath);
  const migratedRoute = api + '/chooser/' + legacyId;
  const { photos: migratedPhotos } = (await send(migratedRoute, { token: chooser.token })).payload;
  const keptPhoto = migratedPhotos.find((photo) => photo.name === 'kept.png');
  assert.equal(keptPhoto.selected, true);
  assert.deepEqual((await send(migratedRoute + '/image/' + keptPhoto.id + '?' + new URLSearchParams(keptPhoto),
    { token: chooser.token })).payload, png);
  const afterRestart = (await registrations(docsClient, (await login('cashier', 'password123')).token)).payload;
  assert.deepEqual([afterRestart.job_order_no, afterRestart.queue_number], [beforeRestart.job_order_no, beforeRestart.queue_number]);
  const afterRestartClient = await register(standard, [], 200, { middle_name: '' });
  await pay(afterRestartClient, 1000);
  const { job_order_no: finalJob } = (await registrations(afterRestartClient)).payload;
  assert.ok(Number(finalJob) > Math.max(...numbers.map(Number)));
  const finalLeaf = finalJob + '_Dela_Cruz_Juan_Carlos';
  assert.deepEqual((await readdir(join(photos, 'WORKFLOW', 'MEDIA', finalLeaf))).sort(), [finalLeaf, 'Unselected'].sort());

  await t.test('only eligible unpaid forms can be archived, with an audit trail', async () => {
    const eligible = async () => (await send(api + '/deletable-registrations', { token: cashier })).payload;
    const remove = (job, status, token = cashier, reason = 'Duplicate Registration') =>
      send(`${api}/registrations/${job.id}/delete`, { method: 'POST', token, body: { reason }, status });
    const filters = new URLSearchParams({ filter: "family_name = 'Deletion Test'" });
    const list = async (token) => (await send(records('registrations') + '?' + filters, { token })).payload;
    const name = { family_name: 'Deletion Test' };
    const wrong = await register(prepared, [], 200, name);
    const correct = await register(standard, [], 200, name);
    const original = (await registrations(correct)).payload;
    assert.deepEqual([wrong.job_order_no, wrong.queue_number], [null, null]);
    const before = await eligible();
    assert.ok(before.includes(wrong.id) && before.includes(correct.id));
    assert.equal((await list(cashier)).totalItems, 2);
    await remove(wrong, 400, cashier, ' ');
    for (const token of [photographer, artists[0].token, chooser.token]) await remove(wrong, 403, token);
    await remove(wrong, 401, '');
    await registrations(wrong, admin, { deleted_by_id: 'forged' });
    assert.ok((await eligible()).includes(wrong.id), 'Direct PATCH cannot set the hidden archive marker');

    const notifications = new AbortController();
    t.after(() => notifications.abort());
    const readDeletion = readRealtime(await fetch(host + '/api/realtime', {
      signal: AbortSignal.any([notifications.signal, AbortSignal.timeout(8000)]),
    }));
    const connection = await readDeletion('PB_CONNECT');
    const topic = 'studioflow-registration-deleted';
    await send('/api/realtime', { method: 'POST', token: admin, status: 204,
      body: { clientId: connection.clientId, subscriptions: [topic] } });
    const duplicate = await Promise.all([remove(wrong, null), remove(wrong, null, admin)]);
    assert.deepEqual(duplicate.map(({ status }) => status).sort(), [204, 409]);
    assert.deepEqual(await readDeletion(topic), {});
    notifications.abort();
    await remove(wrong, 409);
    await registrations(wrong, admin, undefined, 404);
    await registrations(wrong, admin, { family_name: 'Still deleted' }, 404);
    await send(`${api}/registrations/${wrong.id}/restore`, { token: admin, method: 'POST', status: 409 });
    assert.match((await pay(wrong, 1000, 'full', 409)).message, /deleted/);
    for (const token of [admin, cashier]) {
      const active = await list(token);
      assert.equal(active.totalItems, 1);
      assert.equal(active.items[0].id, correct.id);
    }
    assert.deepEqual((await registrations(correct)).payload, original);
    const historyPath = api + '/registration-deletions';
    await send(historyPath, { token: cashier, status: 403 });
    const { items } = (await send(historyPath, { token: admin })).payload;
    const entry = items.find((item) => item.id === wrong.id);
    assert.equal(items.filter((item) => item.id === wrong.id).length, 1);
    assert.deepEqual([entry.name, entry.reason, entry.previousStatus], [
      'Juan Carlos D Deletion Test', 'Duplicate Registration', 'pending_payment',
    ]);
    const winnerToken = duplicate[0].status === 204 ? cashier : admin;
    const winner = (await send('/api/collections/users/auth-refresh', { token: winnerToken, method: 'POST' })).payload.record;
    assert.deepEqual([entry.deletedById, entry.deletedBy], [winner.id, winner.name || winner.username]);
    assert.ok(Number.isFinite(Date.parse(entry.deletedAt.replace(' ', 'T'))));
    const archiveDb = new DatabaseSync(migrationDb);
    try {
      const archived = archiveDb.prepare('SELECT status, package, signature FROM registrations WHERE id = ?').get(wrong.id);
      assert.deepEqual([archived.status, archived.package], ['cancelled', prepared.id]);
      assert.ok(archived.signature);
    } finally { archiveDb.close(); }
    const { rows } = (await send(api + '/student-excel', { token: admin })).payload;
    assert.deepEqual(rows.filter((row) => row.name.startsWith('Deletion Test,')).map((row) => row.packageId), [standard.id]);
    assert.ok(!(await eligible()).includes(wrong.id));
    await pay(correct, original.balance);
    const paid = (await registrations(correct)).payload;
    assert.ok(paid.job_order_no);
    assert.ok(paid.queue_number);
    await remove(correct, 409);

    const partial = await register(standard);
    await pay(partial, 500, 'initial');
    await remove(partial, 409);
    const classified = await create('packages', {
      code: 'DELETE-CREDIT', name: 'Deletion Credit Test', amount: 1000, is_active: true, revenue_category: 'studio',
    });
    const complimentary = await register(classified);
    await send(`${api}/registrations/${complimentary.id}/discount`, {
      method: 'POST', token: cashier, body: { percentage: 100, reason: 'Complimentary settlement' },
    });
    await remove(complimentary, 409);
    const discounted = await register(classified);
    for (const percentage of [20, 0]) {
      await send(`${api}/registrations/${discounted.id}/discount`, {
        method: 'POST', token: cashier, body: { percentage, reason: 'Discount correction' },
      });
    }
    assert.equal((await registrations(discounted)).payload.job_order_no, null);
    assert.ok(!(await eligible()).includes(discounted.id));
    await remove(discounted, 409);

    // Model inconsistent imports where station or ledger history survived without identifiers.
    const [jobOnly, queueOnly, assigned, photographed, creditOnly, voided] =
      await Promise.all(Array.from({ length: 6 }, () => register(standard)));
    const voidedReceipt = await pay(voided, 1000);
    await send(`${api}/payments/${voidedReceipt.id}/void`, {
      token: admin, method: 'POST', body: { reason: 'Receipt recorded by mistake' },
    });
    const inconsistent = new DatabaseSync(migrationDb);
    try {
      inconsistent.prepare("UPDATE registrations SET job_order_no = '99998' WHERE id = ?").run(jobOnly.id);
      inconsistent.prepare('UPDATE registrations SET queue_number = 777 WHERE id = ?').run(queueOnly.id);
      inconsistent.prepare("UPDATE registrations SET makeup_state = 'claimed', makeup_artist = ? WHERE id = ?").run(artists[0].id, assigned.id);
      inconsistent.prepare("UPDATE registrations SET photo_status = 'shot_raw' WHERE id = ?").run(photographed.id);
      inconsistent.prepare("UPDATE registrations SET revenue_discount = '{\"studio\":100}' WHERE id = ?").run(creditOnly.id);
      inconsistent.prepare(`UPDATE registrations SET job_order_no = '', queue_number = 0, queue_issued_at = '',
        status = 'pending_payment', photo_folder = '', photo_folder_key = '', prepared_by = '' WHERE id = ?`).run(voided.id);
    } finally { inconsistent.close(); }
    const currentlyEligible = await eligible();
    for (const protectedJob of [jobOnly, queueOnly, assigned, photographed, creditOnly, voided]) {
      assert.ok(!currentlyEligible.includes(protectedJob.id));
      await remove(protectedJob, 409);
    }
    assert.equal((await send(records('payments', voidedReceipt.id), { token: admin })).payload.status, 'voided');

    const race = await register(standard);
    assert.ok((await eligible()).includes(race.id));
    const [deletion, payment] = await Promise.all([
      remove(race, null),
      send(records('payments'), { method: 'POST', token: cashier, status: null, body: {
        registration: race.id, amount: race.balance, payment_type: 'full',
        payment_method: 'cash', cash_tendered: race.balance,
      } }),
    ]);
    assert.ok((deletion.status === 204 && payment.status === 409) || (deletion.status === 409 && payment.status === 200));
    const ledgerFilter = new URLSearchParams({ filter: `registration = '${race.id}'` });
    const ledger = (await send(records('payments') + '?' + ledgerFilter, { token: cashier })).payload;
    assert.equal(ledger.totalItems, payment.status === 200 ? 1 : 0);
    await registrations(race, admin, undefined, deletion.status === 204 ? 404 : 200);
  });
  await t.test('Cashier confirms discount and payment atomically and replays only the same attempt', async () => {
    const studio = await create('packages', {
      code: 'POS-STUDIO', name: 'POS Studio Test', amount: 750, is_active: true, revenue_category: 'studio',
    });
    const grooming = await create('add_ons', {
      code: 'POS-GROOM', name: 'POS Grooming Test', amount: 200, is_active: true, revenue_category: 'mua', requires_mua: true,
    });
    const load = async (job) => (await registrations(job, cashier)).payload;
    const entries = (collection, job, token = admin) => send(records(collection) + '?' + new URLSearchParams({
      filter: "registration = '" + job.id + "'",
    }), { token }).then(({ payload }) => payload.items);
    const request = (job, key, due, percentage, amount, reason = 'SSC President') => ({
      clientKey: key, updated: job.updated, balanceDue: due * 100,
      discount: percentage == null ? undefined : { percentage, reason },
      payment: amount == null ? undefined : { amount, type: 'full', method: 'cash', cash: amount, cashierName: 'Test Cashier' },
    });
    const confirm = (job, body, status = 200, token = cashier) => send(api + '/registrations/' + job.id + '/confirm-payment', {
      method: 'POST', token, status, body,
    }).then(({ payload }) => payload);

    const mixed = await load(await register(studio, [{ id: grooming.id }]));
    assert.deepEqual([mixed.balance, mixed.revenue_terms], [950, { studio: 75000, mua: 20000, unallocated: 0 }]);
    const draft = request(mixed, 'pos-mixed', 575, 50, 575);
    await confirm(mixed, draft, 403, artists[0].token);
    await confirm(mixed, { ...draft, updated: 'stale' }, 409);
    await confirm(mixed, { ...draft, balanceDue: 57400 }, 409);
    await confirm(mixed, { ...draft, discount: { percentage: 101, reason: 'Out of range' } }, 400);
    await confirm(mixed, { ...draft, discount: { percentage: 50, reason: ' ' } }, 400);
    await confirm(mixed, { ...draft, payment: { ...draft.payment, method: 'invalid' } }, 400);
    // Rejected by the standard payment hook after the proposed discount was saved inside the transaction.
    await confirm(mixed, { ...draft, payment: { ...draft.payment, amount: 574 } }, 400);
    const rolledBack = await load(mixed);
    assert.deepEqual([rolledBack.balance, rolledBack.revenue_discount, rolledBack.job_order_no], [950, null, null]);
    assert.equal((await entries('payments', mixed)).length, 0);
    assert.equal((await entries('cashier_confirmations', mixed)).length, 0);

    const [first, retry] = await Promise.all([confirm(mixed, draft), confirm(mixed, draft)]);
    assert.ok(first.paymentId && first.registration.job_order_no);
    assert.equal(first.registration.queue_number, null, 'Purchased grooming still precedes photography');
    assert.equal(retry.paymentId, first.paymentId);
    await confirm(mixed, { ...draft, discount: { percentage: 50, reason: 'Changed request' } }, 409);
    const [payment] = await entries('payments', mixed);
    assert.equal((await entries('payments', mixed)).length, 1);
    assert.match(payment.receipt_no, /^OR-/);
    assert.deepEqual([payment.amount, payment.balance_before, payment.balance_after], [575, 575, 0]);
    assert.deepEqual([payment.discount_snapshot.studio, payment.discount_snapshot.mua,
      payment.discount_snapshot.percentage, payment.discount_snapshot.reason], [37500, 0, 50, 'SSC President']);
    const [audit] = await entries('cashier_confirmations', mixed);
    assert.equal((await entries('cashier_confirmations', mixed)).length, 1);
    assert.deepEqual([audit.discount_before, audit.discount_after.studio, audit.payment_id], [null, 37500, payment.id]);
    const settled = await load(mixed);
    assert.deepEqual([settled.total_amount, settled.paid_amount, settled.balance, settled.payment_status], [575, 575, 0, 'fully_paid']);
    assert.deepEqual(settled.revenue_terms, { studio: 37500, mua: 20000, unallocated: 0 });
    const { buildAudit } = await vite.ssrLoadModule('/src/features/admin/auditData.ts');
    const { analyticsCollected, netCollections, discountCredits, revenue } = buildAudit([settled], [payment], []).totals;
    assert.deepEqual([analyticsCollected, netCollections, discountCredits], [950, 575, 375]);
    assert.deepEqual(revenue, { studio: 375, mua: 200, unallocated: 0 });
    // The school / package breakdowns: cash revenue (equal to Studio revenue) and the discount apart,
    // and billed − discount − revenue − still to settle = 0.
    const [school] = buildAudit([settled], [payment], []).bySchool.filter((group) => group.count);
    assert.deepEqual([school.billed, school.discount, school.collected, school.balance], [750, 375, 375, 0]);
    const reasonEdit = request(settled, 'pos-reason', 0, 50, null);
    reasonEdit.discount = { reason: 'Student council representative' };
    const corrected = await confirm(settled, reasonEdit);
    assert.deepEqual([corrected.registration.revenue_discount.studio, corrected.registration.revenue_discount.reason],
      [37500, 'Student council representative']);
    assert.equal(corrected.registration.revenue_discount.at, settled.revenue_discount.at);
    assert.equal((await entries('payments', mixed))[0].discount_snapshot.reason, 'SSC President');

    const mixedComplimentaryStudio = await load(await register(studio, [{ id: grooming.id }]));
    const mixedFullyDiscounted = await confirm(mixedComplimentaryStudio, request(mixedComplimentaryStudio, 'pos-mua-due', 200, 100, 200));
    assert.deepEqual([mixedFullyDiscounted.registration.paid_amount, mixedFullyDiscounted.registration.revenue_discount.mua], [200, 0]);

    const standardJob = await load(await register(studio));
    const ordinary = await confirm(standardJob, request(standardJob, 'pos-ordinary', 750, null, 750));
    assert.ok(ordinary.paymentId && ordinary.registration.job_order_no && ordinary.registration.queue_number);
    assert.equal(ordinary.registration.balance, 0);

    const complimentary = await load(await register(studio));
    const compDraft = request(complimentary, 'pos-comp', 0, 100, null);
    const comp = await confirm(complimentary, compDraft);
    assert.equal((await confirm(complimentary, compDraft)).registration.job_order_no, comp.registration.job_order_no);
    assert.ok(comp.registration.job_order_no && comp.registration.queue_number);
    assert.deepEqual([comp.paymentId, comp.registration.paid_amount, comp.registration.balance,
      comp.registration.payment_status, (await entries('payments', complimentary)).length], ['', 0, 0, 'fully_paid', 0]);
    await documents(complimentary, [[`JO-${comp.registration.job_order_no}.pdf`, pdf('complimentary settlement')]], cashier);

    const editable = await load(await register(studio));
    const initial = request(editable, 'pos-initial', 600, 20, 300);
    initial.payment.type = 'initial';
    await confirm(editable, initial);
    const old = await load(editable);
    assert.deepEqual([old.balance, old.revenue_discount.studio], [300, 15000]);
    const overpayment = request(old, 'pos-overpayment', 0, 80, null);
    await confirm(editable, overpayment, 400);
    assert.equal((await load(editable)).revenue_discount.studio, 15000);
    const replacement = request(old, 'pos-replacement', 75, 50, 75, 'Corrected discount reason');
    replacement.payment.type = 'additional';
    const revised = await confirm(editable, replacement);
    assert.deepEqual([revised.registration.balance, revised.registration.paid_amount,
      revised.registration.revenue_discount.studio], [0, 375, 37500]);
    const replacementAudit = (await entries('cashier_confirmations', editable)).find((event) => event.payment_id === revised.paymentId);
    assert.deepEqual([replacementAudit.discount_before.studio, replacementAudit.discount_after.studio], [15000, 37500]);
    const ledger = await entries('payments', editable);
    assert.equal(ledger.find((p) => p.id !== revised.paymentId).discount_snapshot.studio, 15000);

    // A fixed peso discount: comes off the Studio charges, so it works even while another charge has
    // no revenue type (where a percentage is refused); it can't exceed the Studio charges.
    const unclassifiedAddOn = await create('add_ons', { code: 'POS-UNCL', name: 'POS Unclassified Test', amount: 400, is_active: true, revenue_category: 'studio' });
    const blankDb = new DatabaseSync(join(data, 'data.db'));
    try { blankDb.prepare("UPDATE add_ons SET revenue_category = '' WHERE id = ?").run(unclassifiedAddOn.id); } finally { blankDb.close(); }
    // Saving it again needs a type.
    await send(records('add_ons', unclassifiedAddOn.id), { token: admin, method: 'PATCH', status: 400, body: { amount: 400 } });
    const partly = await load(await register(studio, [{ id: unclassifiedAddOn.id }]));
    assert.deepEqual(partly.revenue_terms, { studio: 75000, mua: 0, unallocated: 40000 });
    await confirm(partly, request(partly, 'pos-uncl-pct', 1035, 10, 1035), 400);
    const fixed = (amount, due, key, pay = due) => ({
      clientKey: key, updated: partly.updated, balanceDue: due * 100, discount: { amount, reason: 'Loyal client' },
      payment: { amount: pay, type: 'full', method: 'cash', cash: pay, cashierName: 'Test Cashier' },
    });
    await confirm(partly, fixed(751, 399, 'pos-fixed-too-much'), 400);
    await confirm(partly, fixed(0, 1150, 'pos-fixed-zero'), 400);
    await confirm(partly, fixed(12.5, 1137.5, 'pos-fixed-decimal'), 400);
    const fixedPaid = await confirm(partly, fixed(200, 950, 'pos-fixed'));
    assert.deepEqual([fixedPaid.registration.total_amount, fixedPaid.registration.balance], [950, 0]);
    assert.deepEqual([fixedPaid.registration.revenue_discount.studio, fixedPaid.registration.revenue_discount.fixed,
      fixedPaid.registration.revenue_discount.reason], [20000, true, 'Loyal client']);
    assert.deepEqual(fixedPaid.registration.revenue_terms, { studio: 55000, mua: 0, unallocated: 40000 });
    const [fixedPayment] = await entries('payments', partly);
    assert.deepEqual([fixedPayment.discount_snapshot.studio, fixedPayment.discount_snapshot.fixed], [20000, true]);
    const { orderExtras: extrasOf } = await vite.ssrLoadModule('/src/features/receipts/receiptData.ts');
    assert.deepEqual(extrasOf(fixedPaid.registration).at(-1), ['Discount credit (Fixed amount) · Loyal client', -200]);

    // A percentage that lands on centavos (50% of ₱3,845 = ₱1,922.50) is rounded to the nearest whole peso,
    // so the balance stays payable: payments are whole pesos.
    const oddPackage = await create('packages', { code: 'ODD-3845', name: 'Odd price', amount: 3845, is_active: true, revenue_category: 'studio' });
    const odd = await load(await register(oddPackage));
    const oddPaid = await confirm(odd, request(odd, 'pos-odd-50', 1922, 50, 1922));
    assert.deepEqual([oddPaid.registration.revenue_discount.studio, oddPaid.registration.total_amount, oddPaid.registration.balance],
      [192300, 1922, 0]);
    // A payment with centavos is refused with a clear reason (the payments table only takes whole pesos).
    const cents = await load(await register(oddPackage));
    const refusedCents = await confirm(cents, { ...request(cents, 'pos-cents', 3845, null, 100), payment: { amount: 100.5, type: 'full', method: 'cash', cash: 101, cashierName: 'Test Cashier' } }, 400);
    assert.doesNotMatch(refusedCents.message, /Something went wrong/);
  });

});
