// Auto-send rules (src/features/camera/autoSend/engine.ts) against an in-memory folder and a fake
// server: half-written shots, files another program holds open, outages, refusals, retries and
// shots taken before the client was linked. Run: npm run test:autosend
const assert = require('node:assert/strict');
const { join, resolve } = require('node:path');
const { test } = require('node:test');

const repo = resolve(__dirname, '..');

async function loadEngine() {
  const { runnerImport } = await import('vite');
  const config = { configFile: false, root: repo, logLevel: 'silent' };
  return (await runnerImport(join(repo, 'src/features/camera/autoSend/engine.ts'), config)).module;
}

/** A laptop folder: files with a size and time; `writing` / `locked` stand for EOS holding them. */
function fakeFolder(clock) {
  const files = new Map();
  return {
    files,
    put(path, size, { age = 10_000, writing = false, locked = false } = {}) {
      files.set(path, { size, lastModified: clock.now - age, writing, locked });
    },
    async list() {
      return [...files].map(([path, file]) => ({ path, name: path.split('/').pop(), size: file.size, lastModified: file.lastModified }));
    },
    async read(path) {
      const file = files.get(path);
      if (!file) throw new Error('gone');
      if (file.writing) throw new Error('The file is being used by another process.');
      return new Blob([new Uint8Array(file.size)]);
    },
    async remove(path) {
      const file = files.get(path);
      if (file?.locked) throw new Error('The file is being used by another process.');
      files.delete(path);
    },
  };
}

/** The server: remembers upload ids like studio_camera_sender.js does. */
function fakeServer() {
  const received = new Map();
  const server = {
    calls: [],
    fail: null,
    async upload(name, body, id) {
      server.calls.push({ name, id, size: body.size });
      const failure = server.fail?.(name);
      if (failure) throw failure;
      if (received.has(id)) return { status: 'already', name: received.get(id) };
      received.set(id, name);
      return { status: 'saved', name };
    },
    received,
  };
  return server;
}

async function setup(overrides = {}) {
  const { createEngine, UploadError, LINK_GRACE_MS } = await loadEngine();
  const clock = { now: 1_000_000 };
  const folder = fakeFolder(clock);
  const server = fakeServer();
  let linked = clock.now - 60_000;
  let type = 'TOGA CAP';
  const engine = createEngine({
    folder, upload: (...args) => server.upload(...args), deviceId: 'laptop-1',
    typeAt: overrides.typeAt ?? (() => type), linkedSince: () => linked, now: () => clock.now, settleMs: 2_000,
  });
  return {
    engine, folder, server, clock, UploadError, LINK_GRACE_MS,
    link: (at) => { linked = at; },
    setType: (code) => { type = code; },
    tick: (ms = 1_500) => { clock.now += ms; },
  };
}

test('a finished shot is sent once, with its type, and the laptop copy deleted', async () => {
  const { engine, folder, server, tick } = await setup();
  folder.put('IMG_0001.JPG', 5000);
  folder.put('IMG_0001.CR3', 9000);
  let state = await engine.round();
  assert.equal(server.calls.length, 0, 'Seen once: not sent yet.');
  assert.equal(state.waiting, 2);
  tick();
  state = await engine.round();
  assert.deepEqual(server.calls.map((call) => call.name).sort(), ['IMG_0001 [TOGA CAP].JPG', 'IMG_0001.CR3'], 'RAW files are never tagged.');
  assert.equal(folder.files.size, 0);
  assert.deepEqual([state.phase, state.sent, state.waiting], ['idle', 2, 0]);
});

test('a shot still being written waits until it stops changing', async () => {
  const { engine, folder, server, tick } = await setup();
  folder.put('A.JPG', 1000, { age: 0 });
  await engine.round();
  tick();
  folder.put('A.JPG', 3000, { age: 0 });
  await engine.round();
  assert.equal(server.calls.length, 0, 'The size changed.');
  tick(1000);
  await engine.round();
  assert.equal(server.calls.length, 0, 'Unchanged but newer than the settle time.');
  tick(1500);
  await engine.round();
  assert.equal(server.calls.length, 1);
  // A file the camera software still holds for writing can't be read: it just waits.
  folder.put('B.JPG', 2000, { writing: true });
  await engine.round();
  tick();
  await engine.round();
  assert.equal(server.calls.length, 1);
  folder.files.get('B.JPG').writing = false;
  tick();
  await engine.round();
  assert.equal(server.calls.length, 2);
});

test('a shot whose laptop copy is still open is never sent again and does not block the rest', async () => {
  // The bug of the first Photo Sender: the first shot was sent, its delete failed, and then it was
  // sent again forever while every later shot waited behind it.
  const { engine, folder, server, tick } = await setup();
  folder.put('IMG_0001.JPG', 5000, { locked: true, age: 20_000 });
  folder.put('IMG_0002.JPG', 5000, { age: 15_000 });
  folder.put('IMG_0003.JPG', 5000);
  await engine.round();
  tick();
  let state = await engine.round();
  assert.deepEqual(server.calls.map((call) => call.name), ['IMG_0001 [TOGA CAP].JPG', 'IMG_0002 [TOGA CAP].JPG', 'IMG_0003 [TOGA CAP].JPG']);
  assert.deepEqual([state.stuck, state.waiting, state.phase], [1, 0, 'idle']);
  for (let n = 0; n < 5; n++) { tick(); state = await engine.round(); }
  assert.equal(server.calls.length, 3, 'Not uploaded again.');
  assert.ok(folder.files.has('IMG_0001.JPG'));
  folder.files.get('IMG_0001.JPG').locked = false;
  tick();
  state = await engine.round();
  assert.equal(folder.files.size, 0, 'Deleted once released.');
  assert.equal(state.stuck, 0);
  assert.equal(server.calls.length, 3);
});

test('a new shot under the name of one that was sent is sent too', async () => {
  const { engine, folder, server, clock, tick } = await setup();
  folder.put('IMG_0001.JPG', 5000, { locked: true });
  await engine.round();
  tick();
  await engine.round();
  assert.equal(server.calls.length, 1);
  // The card's counter started over: same name, a different shot.
  folder.files.set('IMG_0001.JPG', { size: 7000, lastModified: clock.now - 5000, locked: false, writing: false });
  tick();
  await engine.round();
  tick();
  await engine.round();
  assert.equal(server.calls.length, 2);
  assert.notEqual(server.calls[0].id, server.calls[1].id);
  assert.equal(folder.files.size, 0);
});

test('no answer stops the round, the shots wait, and they go when the server is back', async () => {
  const { engine, folder, server, tick, UploadError } = await setup();
  for (const name of ['A.JPG', 'B.JPG', 'C.JPG']) folder.put(name, 1000);
  await engine.round();
  tick();
  server.fail = () => new UploadError('Failed to fetch', 0);
  let state = await engine.round();
  assert.equal(server.calls.length, 1, 'One try, not one per shot.');
  assert.deepEqual([state.phase, state.waiting], ['offline', 3]);
  assert.match(state.error, /can't be reached/);
  server.fail = null;
  tick();
  state = await engine.round();
  assert.deepEqual([state.phase, state.waiting, state.sent], ['idle', 0, 3]);
  assert.equal(folder.files.size, 0);
});

test('an upload that arrived but whose answer was lost is not saved twice', async () => {
  const { engine, folder, server, tick, UploadError } = await setup();
  folder.put('A.JPG', 1000);
  await engine.round();
  tick();
  // Saved on the server, but the answer never reaches the laptop.
  server.fail = null;
  const original = server.upload;
  server.upload = async (...args) => { await original(...args); throw new UploadError('Failed to fetch', 0); };
  await engine.round();
  assert.equal(server.received.size, 1);
  assert.ok(folder.files.has('A.JPG'), 'Kept until the server confirms.');
  server.upload = original;
  tick();
  await engine.round();
  assert.equal(server.received.size, 1, 'The retry is answered "already".');
  assert.equal(folder.files.size, 0);
});

test('a refused login or a camera turned off pauses; a refused file is set aside', async () => {
  const { engine, folder, server, tick, UploadError } = await setup();
  folder.put('A.JPG', 1000, { age: 30_000 });
  folder.put('B.JPG', 1000);
  await engine.round();
  tick();
  server.fail = () => new UploadError('This camera is turned off in Camera Import.', 409);
  let state = await engine.round();
  assert.deepEqual([state.phase, state.error], ['paused', 'This camera is turned off in Camera Import.']);
  server.fail = () => new UploadError('Your staff account does not have access to this station.', 403);
  tick();
  state = await engine.round();
  assert.equal(state.phase, 'refused');
  server.fail = (name) => name.startsWith('A') ? new UploadError('Only photo and RAW files can be sent.', 400) : null;
  tick();
  state = await engine.round();
  assert.deepEqual(state.rejected, [{ name: 'A.JPG', reason: 'Only photo and RAW files can be sent.' }]);
  assert.equal(state.sent, 1, 'B goes even though A was refused.');
  const tries = server.calls.length;
  tick();
  await engine.round();
  assert.equal(server.calls.length, tries, 'A refused file is not tried again.');
  assert.ok(folder.files.has('A.JPG'), 'and stays on the laptop.');
});

test('no client linked: nothing is sent; shots from before the link are held until sent on purpose', async () => {
  const { engine, folder, server, clock, tick, link, LINK_GRACE_MS } = await setup();
  link(null);
  folder.put('A.JPG', 1000);
  await engine.round();
  tick();
  let state = await engine.round();
  assert.deepEqual([state.phase, state.waiting, server.calls.length], ['no-client', 1, 0]);
  link(clock.now);
  folder.put('B.JPG', 1000, { age: 0 });
  folder.put('C.JPG', 1000, { age: LINK_GRACE_MS - 1000 });
  for (let n = 0; n < 3; n++) { tick(); state = await engine.round(); }
  assert.deepEqual(server.calls.map((call) => call.name).sort(), ['B [TOGA CAP].JPG', 'C [TOGA CAP].JPG'],
    'A shot from just before the link (clock rounding) still goes.');
  assert.equal(state.held, 1);
  engine.sendHeld();
  tick();
  state = await engine.round();
  assert.equal(state.held, 0);
  tick();
  state = await engine.round();
  assert.equal(server.calls.length, 3);
  // The next client: the earlier shot rule applies again.
  link(clock.now + 60_000);
  tick(70_000);
  folder.put('D.JPG', 1000, { age: 30_000 });
  await engine.round();
  tick();
  state = await engine.round();
  assert.equal(state.held, 1);
});

test('each photo gets the type that was on when it was taken', async () => {
  const changes = [{ at: 0, code: 'TOGA CAP' }];
  const typeAt = (time) => changes.filter((change) => change.at <= time).at(-1).code;
  const { engine, folder, server, clock, tick } = await setup({ typeAt });
  folder.put('A.JPG', 1000, { age: 8000 });
  changes.push({ at: clock.now - 5000, code: 'FAMILY' });
  folder.put('B.JPG', 1000, { age: 3000 });
  folder.put('C [GROUP].JPG', 1000, { age: 3000 });
  await engine.round();
  tick();
  await engine.round();
  assert.deepEqual(server.calls.map((call) => call.name), ['A [TOGA CAP].JPG', 'B [FAMILY].JPG', 'C [GROUP].JPG']);
});

test('flush sends the last shots right away and refuses to finish while they cannot go', async () => {
  const { engine, folder, server, tick, UploadError } = await setup();
  folder.put('LAST.JPG', 1000, { age: 0 });
  const state = await engine.flush(5_000);
  assert.equal(state.waiting, 0);
  assert.equal(server.calls.length, 1, 'Sent without waiting for the settle time.');
  folder.put('NEXT.JPG', 1000, { age: 0 });
  server.fail = () => new UploadError('Failed to fetch', 0);
  await assert.rejects(engine.flush(5_000), /1 shot is still on this laptop/);
  server.fail = null;
  tick();
  await engine.flush(5_000);
  assert.equal(folder.files.size, 0);
});

test('rounds never overlap', async () => {
  const { engine, folder, server, tick } = await setup();
  folder.put('A.JPG', 1000);
  await engine.round();
  tick();
  await Promise.all([engine.round(), engine.round(), engine.round()]);
  assert.equal(server.calls.length, 1);
});

test('the folder going away pauses without losing anything', async () => {
  const { engine, folder, server, tick } = await setup();
  folder.put('A.JPG', 1000);
  const list = folder.list;
  folder.list = async () => { throw new Error('The folder was removed.'); };
  const state = await engine.round();
  assert.equal(state.phase, 'paused');
  assert.match(state.error, /can't be read/);
  folder.list = list;
  await engine.round();
  tick();
  await engine.round();
  assert.equal(server.calls.length, 1);
});

test('the server camera folder is refused with its own message', async () => {
  const { engine, folder, server } = await setup();
  folder.put('A.JPG', 1000);
  folder.list = async () => { throw new Error('This is a StudioFlow camera folder on the server, not the folder EOS Utility saves into on this laptop. Choose the EOS folder.'); };
  const state = await engine.round();
  assert.equal(state.phase, 'paused');
  assert.match(state.error, /^This is a StudioFlow camera folder/);
  assert.equal(server.calls.length, 0, 'Nothing is sent from it.');
});
