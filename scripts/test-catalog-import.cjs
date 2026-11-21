// Admin → Packages & Add-ons → Import from File, end to end: text read from a flyer / Word file /
// spreadsheet is parsed into drafts (src/features/admin/catalogImport/catalogParser.ts) and saved
// with the screen's own save code (saveCatalog.ts) into a throwaway PocketBase with the repo's
// hooks and migrations. The app's TypeScript is loaded through Vite's runnerImport.
// Run: npm run test:catalog   (set POCKETBASE_TEST_BINARY to use another PocketBase binary)
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { mkdtemp, mkdir, rm } = require('node:fs/promises');
const { createServer } = require('node:net');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { test } = require('node:test');
const { setTimeout: delay } = require('node:timers/promises');

const repo = resolve(__dirname, '..');
const executable = process.env.POCKETBASE_TEST_BINARY || join(repo, 'pocketbase.exe');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aUoUAAAAASUVORK5CYII=', 'base64');

// Text as the browser's OCR read the Hi-light Studio "Basic Package" flyer, with an add-on list.
const FLYER = [
  'CAPTURING MOMENTS, CREATING MEMORIES', '| GRADUATION', 'BASIC', 'PACKAGE', 'PHP1395',
  '15 PCS HARD PRINTOUT COPY', '® Colored Toga w/out cap', 'o 1pc-8r', 'o 2 pcs - wallet sizes',
  '4 pcs - 2x2', '8 pcs - 1x1', 'choose 1 Best Pose', 'Add-ons:', 'Extra 8R print - 150',
  'Hair and makeup ..... 500', 'Call us: 0917 123 4567',
].join('\n');

// The Hi-light "Additional freebies" panel as the browser's OCR read it.
const FREEBIES_PANEL = [
  'ADDITIONAL FRE', 'FREE 10x12 FRAME', 'FREE FAMILY PICTURE', 'FREE BARKADA, COUPLE SHOT AND GROUP SHOTS',
  'FREE USE OF TOGA, ACCESSORIES AND FILIPINIANA,', 'BARONG AND COAT AND TIE',
  'FREE ENHANCE SOFT COPIES (CHOSEN IMAGES)', 'FREE RAW COPIES (UNEDITED PICTURES)',
].join('\n');
const FREEBIES = [
  'FREE 10x12 FRAME', 'FREE FAMILY PICTURE', 'FREE BARKADA, COUPLE SHOT AND GROUP SHOTS',
  'FREE USE OF TOGA, ACCESSORIES AND FILIPINIANA, BARONG AND COAT AND TIE',
  'FREE ENHANCE SOFT COPIES (CHOSEN IMAGES)', 'FREE RAW COPIES (UNEDITED PICTURES)',
];

const port = () => new Promise((done, fail) => {
  const probe = createServer().listen(0, '127.0.0.1', () => {
    const { port: free } = probe.address();
    probe.close(() => done(free));
  }).on('error', fail);
});

async function loadApp() {
  const { runnerImport } = await import('vite');
  const config = { configFile: false, root: repo, logLevel: 'silent' };
  const load = async (file) => (await runnerImport(join(repo, 'src/features/admin/catalogImport', file), config)).module;
  return { ...await load('catalogParser.ts'), ...await load('saveCatalog.ts') };
}

test('parser: flyer text, a Word-style list and a spreadsheet become drafts', async () => {
  const { parseCatalogText, parseCatalogRows, assignCodes } = await loadApp();
  const strip = (draft) => JSON.parse(JSON.stringify(draft, (key, value) => (key === 'key' ? undefined : value)));

  const flyer = strip(assignCodes(parseCatalogText(FLYER), ['PKG-BASIC'], []));
  assert.deepEqual(flyer.packages, [{
    include: true, code: 'PKG-BASIC-2', name: 'BASIC PACKAGE', amount: 1395, photoLimit: 1, clientKind: 'school', revenue: 'studio',
    inclusions: ['15 PCS HARD PRINTOUT COPY', 'Colored Toga w/out cap', '1pc-8r', '2 pcs - wallet sizes', '4 pcs - 2x2', '8 pcs - 1x1'],
    freebies: [],
  }]);

  // The "Additional freebies" panel exactly as the browser's OCR read it: heading cut short, one item
  // wrapped over two lines. It must not become add-ons, and becomes an unnamed package to name or merge.
  const panel = parseCatalogText(FREEBIES_PANEL);
  assert.deepEqual(panel.addOns, []);
  assert.deepEqual(panel.packages.map((p) => [p.name, p.amount, p.inclusions, p.freebies]),
    [['Imported package', 0, [], FREEBIES]]);

  // A full flyer: inclusions, then a freebies heading, plus a "FREE …" line among the inclusions.
  const withFreebies = parseCatalogText([
    'PREMIUM PACKAGE', 'PHP 2,495', '1 pc 8R', 'FREE soft copy of chosen shots', '2 pcs wallet',
    'Additional Freebies:', 'Free 10x12 frame', 'Free family picture', 'Add-ons:', 'Extra 8R - 150',
  ].join('\n'));
  assert.deepEqual(withFreebies.packages.map((p) => [p.name, p.amount, p.inclusions, p.freebies]), [[
    'PREMIUM PACKAGE', 2495, ['1 pc 8R', '2 pcs wallet'], ['FREE soft copy of chosen shots', 'Free 10x12 frame', 'Free family picture'],
  ]]);
  assert.deepEqual(withFreebies.addOns.map((a) => [a.name, a.amount]), [['Extra 8R', 150]]);
  assert.deepEqual(flyer.addOns.map((a) => [a.code, a.name, a.amount, a.revenue]),
    [['ADD-EXTRA-8R', 'Extra 8R print', 150, 'studio'], ['ADD-HAIR-MAKEUP', 'Hair and makeup', 500, 'mua']]);

  const doc = parseCatalogText('Package A - ₱1,395\n- 15 pcs hard copy\n- 1 pc 8R\nChoose 1 best pose\nPremium Package\nPhp 2,495.00\n- 1 pc 8R with frame');
  assert.deepEqual(doc.packages.map((p) => [p.name, p.amount, p.inclusions, p.photoLimit]), [
    ['Package A', 1395, ['15 pcs hard copy', '1 pc 8R'], 1],
    ['Premium Package', 2495, ['1 pc 8R with frame'], 0],
  ]);

  const sheet = parseCatalogRows([
    ['Type', 'Code', 'Name', 'Price', 'Inclusions', 'Freebies', 'Offered To', 'Photo Limit'],
    ['Package', 'PKG-X', 'Sheet Package', '₱1,500.00', '1 pc 8R; 2 pcs wallet', 'Free 10x12 frame; Free raw copies', 'Walk-in', '2'],
    ['Inclusion', '', 'Colored toga', '', '', '', '', ''],
    ['Freebie', '', 'Free family picture', '', '', '', '', ''],
    ['Add-on', '', 'Extra wallet', '80', '', '', 'Both', ''],
  ]);
  assert.deepEqual(sheet.packages.map((p) => [p.code, p.name, p.amount, p.inclusions, p.freebies, p.clientKind, p.photoLimit]),
    [['PKG-X', 'Sheet Package', 1500, ['1 pc 8R', '2 pcs wallet', 'Colored toga'],
      ['Free 10x12 frame', 'Free raw copies', 'Free family picture'], 'walkin', 2]]);
  assert.deepEqual(sheet.addOns.map((a) => [a.name, a.amount, a.clientKind]), [['Extra wallet', 80, 'both']]);
});

test('save: imported packages and add-ons reach the database and the kiosk', async (t) => {
  const { parseCatalogText, assignCodes, newDraftPackage, newDraftAddOn, lineKey, saveCatalogDrafts } = await loadApp();
  const { default: PocketBase } = await import('pocketbase');

  const home = await mkdtemp(join(tmpdir(), 'studioflow-catalog-'));
  const publicDir = join(home, 'public');
  await mkdir(publicDir);
  const host = 'http://127.0.0.1:' + await port();
  let logs = '';
  const server = spawn(executable, ['serve', '--http', host.slice(7), '--publicDir', publicDir, '--dir', join(home, 'db'),
    '--hooksDir', join(repo, 'pb_hooks'), '--migrationsDir', join(repo, 'pb_migrations')],
  { env: { ...process.env, STUDIOFLOW_PHOTOS_ROOT: join(home, 'photos') }, windowsHide: true });
  for (const stream of [server.stdout, server.stderr]) stream.on('data', (chunk) => { logs += chunk; });
  t.after(async () => {
    if (server.exitCode === null && server.signalCode === null) { server.kill(); await once(server, 'exit'); }
    await rm(home, { recursive: true, force: true });
  });
  for (let attempt = 0; ; attempt++) {
    if (await fetch(host + '/api/health').then((res) => res.ok).catch(() => false)) break;
    assert.ok(attempt < 80 && server.exitCode === null, logs);
    await delay(150);
  }

  const pb = new PocketBase(host);
  pb.autoCancellation(false);
  await pb.collection('users').authWithPassword('admin', 'password123');
  const catalog = async () => ({ packages: await pb.collection('packages').getFullList(), addOns: await pb.collection('add_ons').getFullList() });
  const codes = async () => {
    const { packages, addOns } = await catalog();
    return [packages.map((p) => p.code), addOns.map((a) => a.code)];
  };
  const before = await catalog();

  await t.test('the flyer saves with its price, inclusions and photo limit, active', async () => {
    const flyer = assignCodes(parseCatalogText(FLYER), ...await codes());
    assert.deepEqual(await saveCatalogDrafts(pb, flyer.packages, flyer.addOns), { created: 3, updated: 0, failed: [] });
    const basic = await pb.collection('packages').getFirstListItem('code = "PKG-BASIC"');
    assert.deepEqual(
      [basic.name, basic.amount, basic.is_active, basic.photo_selection_limit, basic.client_kind, basic.revenue_category, basic.requires_mua],
      ['BASIC PACKAGE', 1395, true, 1, 'school', 'studio', false]);
    assert.deepEqual(typeof basic.inclusions === 'string' ? JSON.parse(basic.inclusions) : basic.inclusions,
      ['15 PCS HARD PRINTOUT COPY', 'Colored Toga w/out cap', '1pc-8r', '2 pcs - wallet sizes', '4 pcs - 2x2', '8 pcs - 1x1']);
    const makeup = await pb.collection('add_ons').getFirstListItem('name = "Hair and makeup"');
    assert.deepEqual([makeup.amount, makeup.revenue_category, makeup.requires_mua, makeup.client_kind, makeup.default_when_no_mua],
      [500, 'mua', true, 'both', false]);
  });

  await t.test('a batch of 60 saves in one go with unique codes', async () => {
    const kinds = ['school', 'walkin', 'both'];
    const batch = assignCodes({
      packages: Array.from({ length: 30 }, (_, i) => newDraftPackage({ name: `Bulk Package ${i + 1}`, amount: 1000 + i * 50, inclusions: ['Soft copy'], clientKind: kinds[i % 3] })),
      addOns: Array.from({ length: 30 }, (_, i) => newDraftAddOn({ name: `Bulk Extra ${i + 1}`, amount: 100 + i })),
    }, ...await codes());
    assert.deepEqual(await saveCatalogDrafts(pb, batch.packages, batch.addOns), { created: 60, updated: 0, failed: [] });
    const { packages, addOns } = await catalog();
    assert.equal(packages.length, before.packages.length + 31);
    assert.equal(addOns.length, before.addOns.length + 32);
    assert.equal(new Set(packages.map((p) => p.code.toUpperCase())).size, packages.length);
  });

  await t.test('items the server refuses are reported by draft key; the rest still save', async () => {
    const mixed = {
      packages: [
        newDraftPackage({ name: 'Good Package', code: 'PKG-GOOD', amount: 2000 }),
        newDraftPackage({ name: 'Negative Package', code: 'PKG-NEG', amount: -5 }),
        newDraftPackage({ name: 'Taken Code', code: 'pkg-basic', amount: 900 }),
        newDraftPackage({ name: 'Same Name', code: 'PKG-SAME-1', amount: 900 }),
        newDraftPackage({ name: 'Same Name', code: 'PKG-SAME-2', amount: 950 }),
      ],
      addOns: [
        newDraftAddOn({ name: 'Bad Kind', code: 'ADD-BAD', amount: 50, clientKind: 'everyone' }),
        newDraftAddOn({ name: 'Good Extra', code: 'ADD-GOOD', amount: 75 }),
        newDraftAddOn({ name: 'No Code', code: '', amount: 20 }),
      ],
    };
    const result = await saveCatalogDrafts(pb, mixed.packages, mixed.addOns);
    assert.equal(result.created, 5);
    assert.deepEqual(result.failed.map((f) => [f.key, f.message]), [
      [mixed.packages[1].key, "The price can't be negative."],
      // Codes are saved upper-case, so "pkg-basic" is checked as PKG-BASIC.
      [mixed.packages[2].key, 'Code PKG-BASIC is already used by another package.'],
      [mixed.addOns[0].key, 'Choose who it is offered to: school, walk-in or both.'],
    ]);
  });

  await t.test('importing the same flyer again never overwrites the saved package', async () => {
    const again = assignCodes(parseCatalogText(FLYER), ...await codes());
    const { packages } = await catalog();
    assert.ok(packages.some((p) => lineKey(p.name) === lineKey(again.packages[0].name)), 'the screen flags it as already in the catalog');
    assert.equal(again.packages[0].code, 'PKG-BASIC-2');
    // Saving the old draft (same code) again is refused by the server.
    const repeat = await saveCatalogDrafts(pb, [newDraftPackage({ name: 'BASIC PACKAGE', code: 'PKG-BASIC', amount: 1395 })], []);
    assert.deepEqual([repeat.created, repeat.failed[0].message], [0, 'Code PKG-BASIC is already used by another package.']);
    assert.equal((await pb.collection('packages').getFullList({ filter: 'code = "PKG-BASIC"' })).length, 1);
  });

  await t.test('two saves racing with one code: exactly one wins', async () => {
    const drafts = [1, 2].map((n) => newDraftPackage({ name: `Race ${n}`, code: 'PKG-RACE', amount: 100 }));
    const results = await Promise.all(drafts.map((draft) => saveCatalogDrafts(pb, [draft], [])));
    assert.deepEqual(results.map((r) => r.created).sort(), [0, 1]);
    assert.match(results.find((r) => !r.created).failed[0].message, /PKG-RACE (is already used|was just used)/i);
    const different = [1, 2].map((n) => newDraftPackage({ name: `Parallel ${n}`, code: `PKG-PARALLEL-${n}`, amount: 100 }));
    const both = await Promise.all(different.map((draft) => saveCatalogDrafts(pb, [draft], [])));
    assert.deepEqual(both.map((r) => r.created), [1, 1]);
  });

  // Kiosk registrations, made the way the public kiosk makes them.
  const kiosk = new PocketBase(host);
  kiosk.autoCancellation(false);
  let school; let level; let course; let students = 0;
  async function register(packageId, addOns = []) {
    if (!school) {
      school = await pb.collection('organizations').create({ code: 'IMPORT', name: 'Import Academy', is_active: true });
      level = await pb.collection('levels').create({ organization: school.id, name: 'College' });
      ({ course_id: course } = await pb.send('/api/studioflow/school-courses', {
        method: 'POST', body: { schoolId: school.id, levelId: level.id, name: 'Catalog Import Course', code: 'CATIMPORT' },
      }));
    }
    const form = new FormData();
    for (const [key, value] of Object.entries({
      family_name: 'Dela Cruz', given_name: 'Juan', middle_name: 'D', organization: school.id, level: level.id, course,
      package: packageId, student_id: 'IMPORT-' + ++students, terms_accepted: 'true', mobile_number: '0917-000-0000',
      makeup_look: 'full', add_ons: JSON.stringify(addOns),
    })) form.set(key, value);
    form.set('signature', new Blob([png], { type: 'image/png' }), 'signature.png');
    return kiosk.collection('registrations').create(form);
  }
  let firstOrder;

  await t.test('the kiosk offers the import and the server prices an order from it', async () => {
    const basic = (await kiosk.collection('packages').getFullList({ filter: 'is_active = true' })).find((p) => p.code === 'PKG-BASIC');
    assert.ok(basic, 'the public kiosk lists the imported package');
    const extra = await pb.collection('add_ons').getFirstListItem('code = "ADD-EXTRA-8R"');
    // The client claims ₱1 for the add-on: the server uses the catalog price.
    firstOrder = await register(basic.id, [{ id: extra.id, name: extra.name, amount: 1 }]);
    assert.equal(firstOrder.total_amount, 1395 + 150);
    assert.deepEqual(firstOrder.package_snapshot.freebies, []);
  });

  await t.test('freebies: added to an existing package, cleaned by the server, frozen on sold orders', async () => {
    const basic = await pb.collection('packages').getFirstListItem('code = "PKG-BASIC"');
    // The freebies panel, merged into BASIC PACKAGE ("Save as: Add to an existing package"), with an
    // inclusion it already has and a freebie typed in another case: neither is added twice.
    const panel = parseCatalogText(FREEBIES_PANEL).packages[0];
    const merge = { ...panel, mergeInto: basic.id, inclusions: ['1PC-8R'], freebies: [...panel.freebies, 'free family picture'] };
    assert.deepEqual(await saveCatalogDrafts(pb, [merge], []), { created: 0, updated: 1, failed: [] });
    const merged = await pb.collection('packages').getOne(basic.id);
    assert.deepEqual(merged.freebies, FREEBIES);
    assert.deepEqual(merged.inclusions, basic.inclusions, 'no inclusion added twice');
    assert.deepEqual([merged.name, merged.code, merged.amount, merged.is_active], [basic.name, basic.code, basic.amount, true]);
    // Doing it again changes nothing.
    assert.deepEqual(await saveCatalogDrafts(pb, [merge], []), { created: 0, updated: 1, failed: [] });
    assert.deepEqual((await pb.collection('packages').getOne(basic.id)).freebies, FREEBIES);

    // The order sold before the freebies keeps what it was sold with; a new order gets them.
    assert.deepEqual((await pb.collection('registrations').getOne(firstOrder.id)).package_snapshot.freebies, []);
    const newOrder = await register(basic.id);
    assert.deepEqual(newOrder.package_snapshot.freebies, FREEBIES);
    assert.equal(newOrder.total_amount, 1395, 'freebies are free');

    // The server trims freebies and drops blank ones, whoever saves them.
    const cleaned = await pb.collection('packages').update(basic.id, { freebies: ['  Free tote bag  ', '', '   '] });
    assert.deepEqual(cleaned.freebies, ['Free tote bag']);
    const tooLong = await pb.collection('packages').update(basic.id, { freebies: ['x'.repeat(201)] }).catch((err) => err);
    assert.match(tooLong.response.message, /under 200 characters/);

    // A new package imported with freebies keeps them, and the kiosk shows them.
    const fresh = assignCodes({ packages: [{ ...newDraftPackage({ name: 'Freebie Package', amount: 999 }), freebies: FREEBIES }], addOns: [] }, ...await codes());
    assert.deepEqual(await saveCatalogDrafts(pb, fresh.packages, []), { created: 1, updated: 0, failed: [] });
    const listed = (await kiosk.collection('packages').getFullList({ filter: 'is_active = true' })).find((p) => p.name === 'Freebie Package');
    assert.deepEqual(listed.freebies, FREEBIES);

    // Merging into a package that no longer exists is reported, not silently skipped.
    const gone = await saveCatalogDrafts(pb, [{ ...merge, mergeInto: 'doesnotexist123' }], []);
    assert.deepEqual([gone.updated, gone.failed.length], [0, 1]);
  });
});
