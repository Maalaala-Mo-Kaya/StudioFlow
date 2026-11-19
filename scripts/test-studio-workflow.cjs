const assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');
const { once } = require('node:events');
const { mkdtemp, mkdir, writeFile, readdir, readFile, copyFile, link, stat, rm } = require('node:fs/promises');
const { createHash, randomUUID } = require('node:crypto');
const { createServer } = require('node:net');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { test } = require('node:test');
const { setTimeout: delay } = require('node:timers/promises');

const repo = resolve(__dirname, '..');
const executable = process.env.POCKETBASE_TEST_BINARY || join(repo, 'pocketbase.exe');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aUoUAAAAASUVORK5CYII=', 'base64');
const password = 'Isolated-Test-Password!';
const api = '/api/studioflow';

async function port() {
  const socket = createServer();
  await new Promise((done, reject) => socket.once('error', reject).listen(0, '127.0.0.1', done));
  const number = socket.address().port;
  await new Promise((done) => socket.close(done));
  return number;
}

test('StudioFlow staff workflow on PocketBase and real photo folders', { timeout: 120_000 }, async (t) => {
  const home = await mkdtemp(join(tmpdir(), 'studioflow-workflow-'));
  const data = join(home, 'db');
  const photos = join(home, 'photos');
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
  await writeFile(join(legacyPath, 'legacy.png'), png);
  const legacyDb = new DatabaseSync(join(data, 'data.db'));
  try {
    const legacyAddon = legacyDb.prepare("SELECT id, name, code, amount FROM add_ons WHERE code = 'ADD-HAIRMAKEUP'").get();
    legacyDb.prepare(`INSERT INTO registrations
      (id, job_order_no, family_name, given_name, status, add_ons, paid_amount, total_amount, balance, payment_status)
      VALUES (?, '00050', 'Dela Cruz', 'Juan Carlos', 'done_shooting', ?, 1000, 1500, 500, 'downpayment')`)
      .run(legacyId, JSON.stringify([legacyAddon]));
  } finally { legacyDb.close(); }
  server = spawn(executable, ['serve', '--http', host.slice(7), ...flags], options);
  for (const stream of [server.stdout, server.stderr]) stream.on('data', (chunk) => { logs += chunk; });
  for (let attempt = 0; attempt < 60; attempt++) {
    if (await fetch(host + '/api/health').then((res) => res.ok).catch(() => false)) break;
    assert.equal(server.exitCode, null, logs);
    if (attempt === 59) assert.fail(logs);
    await delay(150);
  }

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
    amount: 1000, is_active: true, requires_mua: false,
  });
  const prepared = await create('packages', {
    code: 'PKG-D', name: 'Package D', amount: 1000, is_active: true, photo_selection_limit: 2, requires_mua: true,
  });
  const makeup = await create('add_ons', { code: 'EXTRA', name: 'Studio upgrade', amount: 100, is_active: true, requires_mua: true });
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
  async function register(pkg, addOns = [], expected = 200) {
    const studentId = 'WF-' + ++sequence;
    const form = new FormData();
    for (const [key, value] of Object.entries({
      family_name: 'Dela Cruz', given_name: 'Juan Carlos', middle_name: 'D',
      organization: school.id, level: level.id, course: course.id, package: pkg.id, student_id: studentId,
      terms_accepted: 'true', email: 'person@example.test', add_ons: JSON.stringify(addOns),
      status: 'shooting', paid_amount: '1000',
    })) form.set(key, value);
    form.set('signature', new Blob([png], { type: 'image/png' }), 'signature.png');
    const { payload } = await send(records('registrations'), { method: 'POST', body: form, status: expected });
    if (expected !== 200) return payload;
    assert.equal(payload.status, 'pending_payment');
    assert.equal(payload.paid_amount, 0);
    return payload;
  }
  async function pay(student, amount, type = 'full', status = 200) {
    await send(records('payments'), { token: cashier, method: 'POST', status, body: {
      registration: student.id, amount, cashier_name: 'Test cashier', payment_type: type,
      payment_method: 'cash', cash_tendered: amount, receipt_no: `RECEIPT-${student.id}-${type}`,
    } });
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
  assert.equal(legacy.status, 'done_shooting');
  const builtInAddOn = (await send(records('add_ons'))).payload.items.find((item) => item.code === 'ADD-HAIRMAKEUP');
  assert.equal(builtInAddOn.requires_mua, true);
  await registrations(legacy, admin, { family_name: 'Corrected Name' });
  assert.equal((await send(`${api}/photo-folder/${legacyId}`, { method: 'POST', token: photographer })).payload.path, legacyPath);
  await registrations(legacy, cashier, { status: 'released', framing_status: 'released' }, 400);

  const stream = await fetch(host + '/api/realtime', { signal: realtime.signal });
  const reader = stream.body.getReader();
  let pendingEvents = '';
  async function readEvent(name, matches = () => true) {
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
  }
  const connect = await readEvent('PB_CONNECT');
  await send('/api/realtime', { method: 'POST', token: photographer, status: 204,
    body: { clientId: connect.clientId, subscriptions: ['studioflow-workflow', 'registrations/*'] } });

  const plain = await register(standard);
  const liveUpdate = await Promise.race([readEvent('studioflow-workflow'), delay(4000, 'timeout', { ref: false })]);
  assert.deepEqual(liveUpdate, {}, 'The server must notify connected realtime clients.');
  const unpaid = await register(prepared);
  await pay(plain, 1000);
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
    await contest(student, owner, 'claim');
    await contest(student, other, 'start', 403);
    await contest(student, owner, 'start');
    await contest(student, owner, 'start');
    await shoot(student, 'done_shooting', 400);
    await contest(student, owner, 'complete');
    await contest(student, owner, 'complete');
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
    galleryStudent = student;
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
  await send(records('payments', receipt.id), { token: admin, method: 'PATCH', body: { status: 'voided' } });
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
  assert.ok(path.endsWith('_' + galleryStudent.id), path);
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
  assert.equal((await list(unpaid.student_id))[0].availability, 'pending_shoot');
  const route = `${api}/chooser/${galleryStudent.id}`;
  const open = (actor = chooser) => send(route + '/open', { token: actor.token, method: 'POST' }).then((r) => r.payload);
  const first = await open();
  const concurrent = await open(otherChooser);
  assert.equal((await list(galleryStudent.student_id))[0].selectionState, 'in_progress');
  assert.equal(first.photos.length, 3);
  assert.equal(first.version, concurrent.version);
  assert.deepEqual((await readdir(join(path, 'unselected'))).sort(), ['first.png', 'second.png', 'third.png']);
  assert.deepEqual(await readdir(join(path, 'selected')), []);
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
  const reopened = await open(otherChooser);
  assert.equal(reopened.photos.filter((photo) => photo.selected).length, 2);
  const revised = await choose(reopened, reopened.photos.filter((photo) => photo.name === 'third.png'), otherChooser);
  assert.deepEqual(await readdir(join(path, 'selected')), ['third.png']);
  assert.deepEqual((await readdir(join(path, 'unselected'))).sort(), ['first.png', 'second.png']);
  assert.deepEqual(await readFile(join(plainFolder, 'other.png')), png);
  assert.deepEqual(await readFile(join(path, 'raw.cr3')), png);

  // Fixture for a process interrupted after the exclusive hard-link but before
  // source removal. Include a second move blocked by an unrelated destination.
  const source = join(path, 'unselected', 'first.png');
  const firstDestination = join(path, 'selected', 'first.png');
  await link(source, firstDestination);
  const fingerprint = async (filename) => {
    const info = await stat(filename, { bigint: true });
    return [Number(info.size), String(Number(info.mtimeNs))];
  };
  const blocked = join(path, 'selected', 'second.png');
  await writeFile(blocked, Buffer.from('existing file must be preserved'));
  const journal = { request: { id: randomUUID(), actor: chooser.id }, moves: [
    { from: 'unselected/first.png', to: 'selected/first.png', fingerprint: await fingerprint(source) },
    { from: 'unselected/second.png', to: 'selected/second.png', fingerprint: await fingerprint(join(path, 'unselected', 'second.png')) },
    { from: 'selected/third.png', to: 'unselected/third.png', fingerprint: await fingerprint(join(path, 'selected', 'third.png')) },
  ], selected: [
    ['selected/first.png', await fingerprint(source)],
    ['selected/second.png', await fingerprint(join(path, 'unselected', 'second.png'))],
  ] };
  const db = new DatabaseSync(join(data, 'data.db'));
  try {
    db.prepare('UPDATE registrations SET photo_pending = ? WHERE id = ?').run(JSON.stringify(journal), galleryStudent.id);
  } finally { db.close(); }
  await send(route, { token: chooser.token, status: 503 });
  assert.equal(await readFile(blocked, 'utf8'), 'existing file must be preserved');
  assert.deepEqual(await readFile(join(path, 'unselected', 'second.png')), png);
  await rm(blocked);
  const recovered = (await send(route, { token: chooser.token })).payload;
  assert.notEqual(recovered.version, revised.version);
  assert.equal(recovered.photos.filter((photo) => photo.selected).length, 2);
  assert.deepEqual(await readdir(join(path, 'unselected')), ['third.png']);
  assert.equal(createHash('sha256').update(await readFile(firstDestination)).digest('hex'), createHash('sha256').update(png).digest('hex'));

  const collisionBytes = Buffer.concat([png, Buffer.from('new export')]);
  await writeFile(join(path, 'first.png'), collisionBytes);
  const withDuplicateName = await open();
  const collision = await choose(withDuplicateName, withDuplicateName.photos.filter((photo) => photo.name === 'first.png'));
  assert.deepEqual((await readdir(join(path, 'selected'))).sort(), ['first.png', 'first_2.png']);
  assert.deepEqual(await readFile(join(path, 'selected', 'first.png')), png);
  assert.deepEqual(await readFile(join(path, 'selected', 'first_2.png')), collisionBytes);
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
});
