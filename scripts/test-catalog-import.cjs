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
// The flyer's inclusions: the heading over its quantity lines becomes a section.
const BASIC_INCLUSIONS = ['15 PCS HARD PRINTOUT COPY',
  { title: 'Colored Toga w/out cap', items: ['1pc-8r', '2 pcs - wallet sizes', '4 pcs - 2x2', '8 pcs - 1x1'] }];
// The same flyer as the server renders it: the print count is added up from the print set.
// "Colored Toga w/out cap" is read as the attire Toga w/out cap on the Colored background: its prints
// are grouped under the attire, and the attire is listed with the shoot.
const BASIC_RENDERED = [
  { title: 'Frame and Prints', items: ['15 pcs hard printout copy',
    { title: 'Toga w/out cap', items: [{ title: 'Colored', items: ['1 pc - 8r', '2 pcs - wallet sizes', '4 pcs - 2x2', '8 pcs - 1x1'] }] }] },
  'Unlimited shots (choose your best 1)',
  'Toga w/out cap',
];
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
    inclusions: BASIC_INCLUSIONS,
    freebies: [],
    optionGroups: [],
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

test('parser: print sets under a heading become inclusion sections', async () => {
  const { parseCatalogText } = await loadApp();
  // The "Frame and Prints" flyer: two headings, each over its quantity lines.
  const pkg = parseCatalogText([
    'PREMIER PACKAGE', 'PHP 2,995', 'INCLUSIONS:', 'Frame and Prints', 'WITH 10X12 FREE FRAME', '33 PCS HARD PRINTOUT COPY',
    'Unlimited shots (select 2 shots)', 'Toga w/out cap',
    'COLORED TOGA W/OUT CAP', '1 pc - 8r', '2 pcs - wallet sizes', '4 pcs - 2x2', '8 pcs - 1x1',
    'TOGA W/OUT CAP WITH BW BACKGROUND', '4 pcs - passport size', '4 pcs - 2x2', '7 pcs - 1x1',
  ].join('\n')).packages[0];
  assert.equal(pkg.photoLimit, 2);
  assert.deepEqual(pkg.inclusions, [
    'Frame and Prints', 'WITH 10X12 FREE FRAME', '33 PCS HARD PRINTOUT COPY', 'Toga w/out cap',
    { title: 'COLORED TOGA W/OUT CAP', items: ['1 pc - 8r', '2 pcs - wallet sizes', '4 pcs - 2x2', '8 pcs - 1x1'] },
    { title: 'TOGA W/OUT CAP WITH BW BACKGROUND', items: ['4 pcs - passport size', '4 pcs - 2x2', '7 pcs - 1x1'] },
  ]);
});

test('parser: options stop at the freebies and skip lines read twice', async () => {
  const { parseCatalogText } = await loadApp();
  const pkg = parseCatalogText([
    'STANDARD PACKAGE A', 'PHP2895', 'Toga w/out cap', 'OPTIONS', '* Glamour shots (girls)',
    "* Glamour shots (girls) nk: g '4 : * -olored Toga w/out cap", '* Coat and tie or Barong (boys)', '4 pcs - 2x2',
    'Pe FREEBIES —', 'FREE FAMILY PICTURE', 'FREE RAW COPIES',
  ].join('\n')).packages[0];
  assert.deepEqual(pkg.optionGroups[0].choices.map((c) => [c.label, c.for]), [['Glamour shots', 'female'], ['Coat and tie or Barong', 'male']]);
  assert.deepEqual(pkg.freebies, ['FREE FAMILY PICTURE', 'FREE RAW COPIES']);
});

test('parser: package options and who each one is for', async () => {
  const { parseCatalogText, parseCatalogRows } = await loadApp();
  const shape = (groups) => groups.map((g) => [g.name, g.pick, g.choices.map((c) => [c.label, c.for])]);
  // The flyer's list: "or glamour shots (girls)" also makes the Filipiniana line before it for girls.
  const flyer = parseCatalogText([
    'PREMIER PACKAGE', 'PHP 2,995', '33 PCS HARD PRINTOUT COPY', 'Unlimited shots (select 2 shots)', 'Toga w/out cap',
    'OPTIONS:', '• Toga w/cap', '• Filipiniana', '• or glamour shots (girls)', '• Coat and tie or Barong (boys)',
  ].join('\n'));
  const pkg = flyer.packages[0];
  assert.deepEqual([pkg.name, pkg.amount, pkg.inclusions, pkg.photoLimit], ['PREMIER PACKAGE', 2995, ['33 PCS HARD PRINTOUT COPY', 'Toga w/out cap'], 2]);
  assert.deepEqual(shape(pkg.optionGroups), [['Options', 1, [
    ['Toga w/cap', 'all'], ['Filipiniana', 'female'], ['Glamour shots', 'female'], ['Coat and tie or Barong', 'male'],
  ]]]);
  // "Attire options (choose 2):" sets the group's pick count.
  const two = parseCatalogText('Plan B - 1500\nAttire options (choose 2):\nToga\nBarong (for boys)\nFilipiniana - ladies');
  assert.deepEqual(shape(two.packages[0].optionGroups), [['Options', 2, [['Toga', 'all'], ['Barong', 'male'], ['Filipiniana', 'female']]]]);

  const sheet = parseCatalogRows([
    ['Type', 'Name', 'Price', 'Options'],
    ['Package', 'Sheet Package', '1500', 'Attire (choose 1): Toga w/ cap | Filipiniana (girls) | Coat and tie (boys); Backdrop: Gold, Pastel'],
    ['Option', 'Glamour shots (girls)', '', ''],
  ]);
  assert.deepEqual(shape(sheet.packages[0].optionGroups), [
    ['Attire', 1, [['Toga w/ cap', 'all'], ['Filipiniana', 'female'], ['Coat and tie', 'male'], ['Glamour shots', 'female']]],
    ['Backdrop', 1, [['Gold', 'all'], ['Pastel', 'all']]],
  ]);
});

test('save: imported packages and add-ons reach the database and the kiosk', async (t) => {
  const { parseCatalogText, parseCatalogJson, assignCodes, newDraftPackage, newDraftAddOn, lineKey, saveCatalogDrafts } = await loadApp();
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
    assert.deepEqual(basic.inclusions, BASIC_RENDERED);
    assert.ok(basic.structure && basic.structure.inclusions.length, 'converted into items and item packages');
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
  async function register(packageId, addOns = [], extra = {}) {
    if (!school) {
      school = await pb.collection('organizations').create({ code: 'IMPORT', name: 'Import Academy', is_active: true });
      level = await pb.collection('levels').create({ organization: school.id, name: 'College' });
      ({ course_id: course } = await pb.send('/api/studioflow/school-courses', {
        method: 'POST', body: { schoolId: school.id, levelId: level.id, name: 'Catalog Import Course', code: 'CATIMPORT' },
      }));
    }
    const form = new FormData();
    for (const [key, value] of Object.entries({
      family_name: 'Dela Cruz', given_name: 'Juan', middle_name: 'D', gender: 'male', organization: school.id, level: level.id, course,
      package: packageId, student_id: 'IMPORT-' + ++students, terms_accepted: 'true', mobile_number: '0917-000-0000',
      makeup_look: 'full', add_ons: JSON.stringify(addOns), ...extra,
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
    const tooLong = await pb.collection('packages').update(basic.id, { freebies: ['x'.repeat(121)] }).catch((err) => err);
    assert.match(tooLong.response.message, /under 120 characters/);

    // A new package imported with freebies keeps them, and the kiosk shows them.
    const fresh = assignCodes({ packages: [{ ...newDraftPackage({ name: 'Freebie Package', amount: 999 }), freebies: FREEBIES }], addOns: [] }, ...await codes());
    assert.deepEqual(await saveCatalogDrafts(pb, fresh.packages, []), { created: 1, updated: 0, failed: [] });
    const listed = (await kiosk.collection('packages').getFullList({ filter: 'is_active = true' })).find((p) => p.name === 'Freebie Package');
    assert.deepEqual(listed.freebies, FREEBIES);

    // Merging into a package that no longer exists is reported, not silently skipped.
    const gone = await saveCatalogDrafts(pb, [{ ...merge, mergeInto: 'doesnotexist123' }], []);
    assert.deepEqual([gone.updated, gone.failed.length], [0, 1]);
  });

  await t.test('inclusion sections: saved, cleaned, frozen on the order, merged by title', async () => {
    const fail = (promise) => promise.then(() => assert.fail('expected the server to refuse'), (err) => err.response);
    const tree = [
      '  Unlimited shots ', 'Toga w/out cap', '',
      { title: ' Frame and Prints ', items: ['With 10x12 free frame', '33 pcs hard printout copy', '  ',
        { title: 'Colored toga w/out cap', items: ['1 pc - 8R', '2 pcs - wallet size'] },
        { title: '', items: [] }] },
    ];
    const pkg = await pb.collection('packages').create({ code: 'PKG-TREE', name: 'Tree Package', amount: 2595, is_active: true, revenue_category: 'studio',
      photo_selection_limit: 2, inclusions: tree });
    // Converted: the frame, the print set (its 3 prints counted), unlimited shots, then the other item.
    const cleaned = [{ title: 'Frame and Prints', items: ['With 10x12 free frame', '3 pcs hard printout copy',
      { title: 'Toga w/out cap', items: [{ title: 'Colored', items: ['1 pc - 8r', '2 pcs - wallet size'] }] }] }, 'Unlimited shots (choose your best 2)', 'Toga w/out cap'];
    assert.deepEqual(pkg.inclusions, cleaned);

    // Deeper than section > sub-section > sub-section, or a section with items but no title: refused.
    const deep = await fail(pb.collection('packages').update(pkg.id, { inclusions: [{ title: 'A', items: [{ title: 'B', items: [{ title: 'C', items: [{ title: 'D', items: ['x'] }] }] }] }] }));
    assert.match(deep.message, /not deeper/);
    const untitled = await fail(pb.collection('packages').update(pkg.id, { inclusions: [{ title: ' ', items: ['x'] }] }));
    assert.match(untitled.message, /title/);
    // The admin screen's older format (a JSON-encoded list of text) still saves as a list.
    const old = await pb.collection('packages').create({ code: 'PKG-OLDLIST', name: 'Old list', amount: 100, is_active: true, revenue_category: 'studio',
      inclusions: JSON.stringify(['8x10 frame', 'Soft copies']) });
    assert.deepEqual(old.inclusions, [{ title: 'Frame and Prints', items: ['With 8x10 frame'] }, 'Soft copies']);

    // A sold order keeps the sections as they were.
    const order = await register(pkg.id);
    assert.deepEqual(order.package_snapshot.inclusions, cleaned);
    await pb.collection('packages').update(pkg.id, { inclusions: ['Changed later'] });
    assert.deepEqual((await pb.collection('registrations').getOne(order.id)).package_snapshot.inclusions, cleaned);

    // "Add to an existing package": a section with the same title gets the new items; known items are skipped.
    await pb.collection('packages').update(pkg.id, { inclusions: cleaned });
    const draft = { ...newDraftPackage({ name: 'x' }), mergeInto: pkg.id, inclusions: [
      '33 PCS HARD PRINTOUT COPY', 'Pastel backdrop',
      { title: 'frame and prints', items: ['1 pc - 8R', '1 pc - 5R', { title: 'Toga w/out cap with BW background', items: ['4 pcs - passport size'] }] },
    ] };
    assert.deepEqual(await saveCatalogDrafts(pb, [draft], []), { created: 0, updated: 1, failed: [] });
    assert.deepEqual((await pb.collection('packages').getOne(pkg.id)).inclusions, [
      // Both backgrounds of Toga w/out cap share its section.
      { title: 'Frame and Prints', items: ['With 10x12 free frame', '8 pcs hard printout copy',
        { title: 'Toga w/out cap', items: [{ title: 'Colored', items: ['1 pc - 8r', '2 pcs - wallet size'] }, { title: 'B&W', items: ['4 pcs - passport size'] }] },
        '1 pc - 5R'] },
      'Unlimited shots (choose your best 2)', 'Toga w/out cap', 'Pastel backdrop',
    ]);
  });

  await t.test('exchange options: keep the included one or swap it; what each choice comes with', async () => {
    const fail = (promise) => promise.then(() => assert.fail('expected the server to refuse'), (err) => err.response);
    const pkg = await pb.collection('packages').create({ code: 'PKG-SWAP', name: 'Swap Package', amount: 2995, is_active: true, revenue_category: 'studio',
      inclusions: ['Toga w/out cap', { title: 'Colored toga w/out cap', items: ['1 pc - 8R', '2 pcs - wallet size'] }],
      option_groups: [{ name: 'Attire', pick: 1, replaces: ' Colored toga w/out cap ', choices: [
        { id: 'keep', label: 'Filipiniana', for: 'female', items: '1 pc - 3R; 2 pcs - wallet size' },
        { label: 'Coat and tie or Barong', for: 'male', items: ['1 pc - 3R', ' 2 pcs - wallet size ', ''] },
      ] }] });
    const [group] = pkg.option_groups;
    assert.equal(group.replaces, 'Toga w/out cap · Colored', 'the exchanged print set, named by attire and background');
    assert.notEqual(group.choices[0].id, 'keep', 'a real choice never takes the keep id');
    // An option is the exchanged pose in another attire: it takes that pose's prints (not its own).
    assert.deepEqual(group.choices.map((c) => [c.label, c.for, c.items]), [
      ['Filipiniana', 'female', ['1 pc - 8r', '2 pcs - wallet size']],
      ['Coat and tie or Barong', 'male', ['1 pc - 8r', '2 pcs - wallet size']],
    ]);
    assert.equal(group.pick, 1, 'an exchange swaps one item package');

    const [filipiniana, coat] = group.choices;
    // Nothing chosen: the client keeps the included set.
    const kept = await register(pkg.id, [], { gender: 'female', package_options: '[]' });
    assert.deepEqual(kept.package_options, [{ group_id: group.id, group: 'Attire', replaces: 'Toga w/out cap · Colored',
      choices: [{ id: 'keep', label: 'Toga w/out cap · Colored', keep: true }] }]);
    // Exchanged: saved with what it comes with, and still the same price.
    const swapped = await register(pkg.id, [], { gender: 'female', package_options: JSON.stringify([{ group: group.id, choices: [filipiniana.id] }]) });
    assert.deepEqual(swapped.package_options[0].choices, [{ id: filipiniana.id, label: 'Filipiniana', items: ['1 pc - 8r', '2 pcs - wallet size'] }]);
    assert.equal(swapped.total_amount, 2995);
    // Choices stay gender-checked; keep plus an exchange in a one-pick group is too many.
    const wrong = await fail(register(pkg.id, [], { gender: 'female', package_options: JSON.stringify([{ group: group.id, choices: [coat.id] }]) }));
    assert.match(wrong.data.package_options.message, /options shown for this client/);
    const both = await fail(register(pkg.id, [], { gender: 'male', package_options: JSON.stringify([{ group: group.id, choices: ['keep', coat.id] }]) }));
    assert.match(both.data.package_options.message, /choose 1 option/);
  });

  await t.test('Standard Package A file: saved as a package; girls keep Filipiniana, boys exchange it', async () => {
    const fail = (promise) => promise.then(() => assert.fail('expected the server to refuse'), (err) => err.response);
    const file = require('node:fs').readFileSync(join(repo, 'imports', 'Standard Package A.json'), 'utf8');
    const draft = assignCodes(parseCatalogJson(file), ...await codes());
    assert.deepEqual(await saveCatalogDrafts(pb, draft.packages, draft.addOns), { created: 1, updated: 0, failed: [] });
    const pkg = await pb.collection('packages').getFirstListItem('code = "STD-PKG-A"');
    assert.deepEqual([pkg.name, pkg.amount, pkg.photo_selection_limit, pkg.freebies.length], ['Standard Package A', 2895, 3, 6]);
    // The flyer's "36 PCS HARD PRINTOUT COPY" is the sum of its print sets.
    const frame = pkg.inclusions.find((e) => e.title === 'Frame and Prints');
    const lines = (list) => list.flatMap((e) => (typeof e === 'string' ? [e] : lines(e.items)));
    const pieces = lines(frame.items.filter((e) => e.title)).reduce((sum, line) => sum + Number(/^(\d+)/.exec(line)[1]), 0);
    assert.equal(pieces, 36);
    const [attire] = pkg.option_groups;
    assert.deepEqual([attire.replaces, attire.replaces_for], ['Filipiniana', 'female']);
    const [glamour, coat] = attire.choices;
    const order = (gender, picks) => register(pkg.id, [], { gender, ...(picks ? { package_options: JSON.stringify(picks) } : {}) });

    // A girl keeps Filipiniana unless she picks Glamour shots.
    assert.deepEqual((await order('female')).package_options[0].choices, [{ id: 'keep', label: 'Filipiniana', keep: true }]);
    assert.equal((await order('female', [{ group: attire.id, choices: [glamour.id] }])).package_options[0].choices[0].label, 'Glamour shots');
    // A boy can't keep Filipiniana: he gets Coat and tie or Barong, chosen for him when nothing is sent.
    const boy = await order('male');
    assert.deepEqual(boy.package_options, [{ group_id: attire.id, group: 'Attire', replaces: 'Filipiniana', choices: [{ id: coat.id, label: 'Coat and tie or Barong' }] }]);
    assert.equal(boy.total_amount, 2895);
    const keeps = await fail(order('male', [{ group: attire.id, choices: ['keep'] }]));
    assert.match(keeps.data.package_options.message, /options shown for this client/);
    const glam = await fail(order('male', [{ group: attire.id, choices: [glamour.id] }]));
    assert.match(glam.data.package_options.message, /options shown for this client/);
  });

  await t.test('builder: saved poses copied into a package with frame, prints, exchange and freebies', async () => {
    const fail = (promise) => promise.then(() => assert.fail('expected the server to refuse'), (err) => err.response);
    const item = (name, category) => pb.collection('catalog_items').create({ name, category });
    const [r11, r5, r3, wallet, passport, twoByTwo, oneByOne] = await Promise.all(
      ['11R', '5R', '3R', 'Wallet size', 'Passport size', '2x2', '1x1'].map((n) => item('B ' + n, 'print')));
    const frame = await item('13x16 classic frame', 'frame');
    const [freeFrame, family] = await Promise.all([item('B Free 13x16 frame', 'other'), item('B Free family picture', 'other')]);
    const toga = await item('B Toga w/out cap', 'other');
    assert.match((await fail(item('b 11r', 'print'))).message, /already exists/);

    const set = (name, items) => pb.collection('item_packages').create({ name, items: items.map(([it, qty]) => ({ item: it.id, qty })), is_active: true });
    const colored = await set('B Colored toga w/out cap', [[r11, 1], [wallet, 2]]);
    const bw = await set('B Toga w/out cap with BW background', [[passport, 4], [twoByTwo, 4], [oneByOne, 7]]);
    const ids = await set('B Colored toga w/out cap', [[twoByTwo, 4], [oneByOne, 8]]); // same name, other contents: allowed
    const cap = await set('B Colored toga w/ cap', [[r5, 1], [wallet, 2]]);
    const filipiniana = await set('B Filipiniana', [[r3, 1], [wallet, 2]]);
    const glamour = await set('B Glamour shots', [[r3, 1], [wallet, 2]]);
    const coat = await set('B Coat and tie or Barong', [[r3, 1], [wallet, 2]]);
    assert.match((await fail(set('B Filipiniana', [[r3, 1], [wallet, 2]]))).message, /already exists/);
    assert.match((await fail(set('B Bad qty', [[r3, 1000]]))).message, /1 to 999/);

    const structure = {
      frame_item: frame.id, unlimited_shots: true,
      inclusions: [{ type: 'set', id: colored.id }, { type: 'set', id: bw.id }, { type: 'set', id: ids.id }, { type: 'set', id: cap.id },
        { type: 'set', id: filipiniana.id }, { type: 'item', id: toga.id, qty: 1 }],
      freebies: [freeFrame.id, family.id],
      exchanges: [{ id: 'attire', name: 'Attire', set: filipiniana.id, keep_for: 'female',
        options: [{ set: glamour.id, for: 'female' }, { set: coat.id, for: 'male' }] }],
    };
    const pkg = await pb.collection('packages').create({ code: 'B-STD-A', name: 'Builder Standard A', amount: 2895, is_active: true,
      client_kind: 'school', revenue_category: 'studio', photo_selection_limit: 3, structure });
    // Frame and Prints: the frame, 36 prints added up from the item packages, then the sets with prints.
    assert.deepEqual(pkg.inclusions, [
      { title: 'Frame and Prints', items: ['With 13x16 classic frame', '36 pcs hard printout copy',
        { title: 'B Colored toga w/out cap', items: ['1 pc - B 11R', '2 pcs - B Wallet size'] },
        { title: 'B Toga w/out cap with BW background', items: ['4 pcs - B Passport size', '4 pcs - B 2x2', '7 pcs - B 1x1'] },
        { title: 'B Colored toga w/out cap', items: ['4 pcs - B 2x2', '8 pcs - B 1x1'] },
        { title: 'B Colored toga w/ cap', items: ['1 pc - B 5R', '2 pcs - B Wallet size'] },
        { title: 'B Filipiniana', items: ['1 pc - B 3R', '2 pcs - B Wallet size'] }] },
      'Unlimited shots (choose your best 3)',
      'B Toga w/out cap',
    ]);
    assert.deepEqual(pkg.freebies, ['B Free 13x16 frame', 'B Free family picture']);
    assert.deepEqual(pkg.option_groups.map((g) => [g.id, g.name, g.replaces, g.replaces_for, g.choices.map((c) => [c.id, c.label, c.for, c.items])]), [
      ['attire', 'Attire', 'B Filipiniana', 'female', [
        [glamour.id, 'B Glamour shots', 'female', ['1 pc - B 3R', '2 pcs - B Wallet size']],
        [coat.id, 'B Coat and tie or Barong', 'male', ['1 pc - B 3R', '2 pcs - B Wallet size']]]],
    ]);

    // The server refuses structures the kiosk could not use.
    const bad = (patch) => fail(pb.collection('packages').update(pkg.id, { structure: { ...structure, ...patch } }));
    assert.match((await bad({ exchanges: [{ ...structure.exchanges[0], set: glamour.id }] })).message, /included in this package/);
    assert.match((await bad({ exchanges: [{ ...structure.exchanges[0], options: [{ set: filipiniana.id }] }] })).message, /for itself/);
    assert.match((await bad({ inclusions: [{ type: 'set', id: 'nosuchpackage00' }] })).message, /no longer exists/);
    assert.match((await bad({ inclusions: [{ type: 'item', id: toga.id, qty: 0 }] })).message, /1 to 999/);

    // A girl keeps Filipiniana by default; a boy gets Coat and tie; the price never changes.
    const girl = await register(pkg.id, [], { gender: 'female' });
    assert.deepEqual(girl.package_options[0].choices, [{ id: 'keep', label: 'B Filipiniana', keep: true }]);
    const boy = await register(pkg.id, [], { gender: 'male' });
    assert.deepEqual(boy.package_options[0].choices, [{ id: coat.id, label: 'B Coat and tie or Barong', items: ['1 pc - B 3R', '2 pcs - B Wallet size'] }]);
    assert.equal(boy.total_amount, 2895);

    // Saved poses were copied in (keeping their ids), so editing a saved pose doesn't change the package.
    const saved = await pb.collection('packages').getOne(pkg.id);
    assert.deepEqual(saved.structure.inclusions.slice(0, 2).map((e) => [e.type, e.id, e.title]),
      [['pose', colored.id, 'B Colored toga w/out cap'], ['pose', bw.id, 'B Toga w/out cap with BW background']]);
    assert.deepEqual(saved.structure.exchanges[0].options.map((o) => [o.id, o.title]), [[glamour.id, 'B Glamour shots'], [coat.id, 'B Coat and tie or Barong']]);
    await pb.collection('item_packages').update(colored.id, { items: [{ item: r11.id, qty: 2 }, { item: wallet.id, qty: 2 }] });
    assert.equal((await pb.collection('packages').getOne(pkg.id)).inclusions[0].items[1], '36 pcs hard printout copy');
    // The package's own pose changes it (prints recounted); the sold order keeps its snapshot.
    const inclusions = saved.structure.inclusions.map((e) => (e.id === colored.id ? { ...e, items: [{ item: r11.id, qty: 2 }, { item: wallet.id, qty: 2 }] } : e));
    const updated = await pb.collection('packages').update(pkg.id, { structure: { ...saved.structure, inclusions } });
    assert.equal(updated.inclusions[0].items[1], '37 pcs hard printout copy');
    assert.equal((await pb.collection('registrations').getOne(girl.id)).package_snapshot.inclusions[0].items[1], '36 pcs hard printout copy');
    // Renaming an item shows everywhere it is used.
    await pb.collection('catalog_items').update(family.id, { name: 'B Free family portrait' });
    assert.deepEqual((await pb.collection('packages').getOne(pkg.id)).freebies, ['B Free 13x16 frame', 'B Free family portrait']);
    // A single item in use can't be deleted; a saved pose can (packages keep their copies).
    assert.match((await fail(pb.collection('catalog_items').delete(wallet.id))).message, /is used in/);
    await pb.collection('item_packages').delete(coat.id);
    assert.deepEqual((await pb.collection('packages').getOne(pkg.id)).option_groups[0].choices.map((c) => c.label), ['B Glamour shots', 'B Coat and tie or Barong']);
  });

  await t.test('poses: same title with other quantities, in one package and across packages', async () => {
    const fail = (promise) => promise.then(() => assert.fail('expected the server to refuse'), (err) => err.response);
    const item = (name, category) => pb.collection('catalog_items').create({ name, category });
    const [r8, r11, wallet, twoByTwo, oneByOne, r3] = await Promise.all(['8R', '11R', 'Wallet', '2x2', '1x1', '3R'].map((n) => item('P ' + n, 'print')));
    const frame = await item('P 10x12 premium frame', 'frame');
    const pose = (id, title, rows) => ({ type: 'pose', id, title, items: rows.map(([it, qty]) => ({ item: it.id, qty })) });
    const structure = {
      frame_item: frame.id, unlimited_shots: true, freebies: [],
      inclusions: [
        pose('a', 'P Colored toga w/out cap', [[r11, 1], [wallet, 2]]),
        pose('b', 'P Colored toga w/out cap', [[twoByTwo, 4], [oneByOne, 8]]),
        pose('c', 'P Filipiniana', [[r3, 1], [wallet, 2]]),
        { type: 'pose', id: 'd', title: 'P Toga w/ cap', items: [] },
      ],
      exchanges: [{ id: 'attire', name: 'Attire', pose: 'c', keep_for: 'female',
        options: [{ id: 'coat', title: 'P Coat and tie', for: 'male', items: [{ item: r3.id, qty: 1 }, { item: wallet.id, qty: 2 }] }] }],
    };
    const a = await pb.collection('packages').create({ code: 'P-STD-A', name: 'Poses A', amount: 2895, is_active: true,
      client_kind: 'school', revenue_category: 'studio', photo_selection_limit: 3, structure });
    assert.deepEqual(a.inclusions, [
      { title: 'Frame and Prints', items: ['With P 10x12 premium frame', '18 pcs hard printout copy',
        { title: 'P Colored toga w/out cap', items: ['1 pc - P 11R', '2 pcs - P Wallet'] },
        { title: 'P Colored toga w/out cap', items: ['4 pcs - P 2x2', '8 pcs - P 1x1'] },
        { title: 'P Filipiniana', items: ['1 pc - P 3R', '2 pcs - P Wallet'] }] },
      'Unlimited shots (choose your best 3)',
      'P Toga w/ cap',
    ]);
    assert.deepEqual(a.option_groups.map((g) => [g.replaces, g.choices.map((c) => [c.id, c.label, c.items])]),
      [['P Filipiniana', [['coat', 'P Coat and tie', ['1 pc - P 3R', '2 pcs - P Wallet']]]]]);
    // Package B: the same pose title with 8R instead of 11R; Package A is untouched.
    const inB = structure.inclusions.map((e) => (e.id === 'a' ? pose('a', e.title, [[r8, 1], [wallet, 2]]) : e));
    const b = await pb.collection('packages').create({ code: 'P-PRM-B', name: 'Poses B', amount: 3950, is_active: true,
      client_kind: 'school', revenue_category: 'studio', photo_selection_limit: 3, structure: { ...structure, inclusions: inB } });
    assert.deepEqual(b.inclusions[0].items[2], { title: 'P Colored toga w/out cap', items: ['1 pc - P 8R', '2 pcs - P Wallet'] });
    assert.deepEqual((await pb.collection('packages').getOne(a.id)).inclusions[0].items[2].items, ['1 pc - P 11R', '2 pcs - P Wallet']);
    // Renaming a single item shows in both packages.
    await pb.collection('catalog_items').update(wallet.id, { name: 'P Wallet size' });
    assert.equal((await pb.collection('packages').getOne(b.id)).inclusions[0].items[2].items[1], '2 pcs - P Wallet size');
    // The kiosk line under the price is trimmed; empty stays empty (the kiosk shows the frame).
    assert.equal((await pb.collection('packages').update(b.id, { tagline: '  with 10x12   PREMIUM frame ' })).tagline, 'with 10x12 PREMIUM frame');
    assert.equal(a.tagline, '');
    // A boy gets the option picked for him; the price never changes.
    const boy = await register(b.id, [], { gender: 'male' });
    assert.deepEqual(boy.package_options[0].choices, [{ id: 'coat', label: 'P Coat and tie', items: ['1 pc - P 3R', '2 pcs - P Wallet size'] }]);
    assert.equal(boy.total_amount, 3950);
    // The server refuses poses it could not show.
    const bad = (patch) => fail(pb.collection('packages').update(a.id, { structure: { ...structure, ...patch } }));
    assert.match((await bad({ inclusions: [{ type: 'pose', id: 'x', title: '  ', items: [] }] })).message, /title/);
    assert.match((await bad({ inclusions: [pose('x', 'P Bad', [[r3, 0]])] })).message, /1 to 999/);
    assert.match((await bad({ exchanges: [{ ...structure.exchanges[0], pose: 'nope' }] })).message, /included in this package/);
    assert.match((await bad({ exchanges: [{ ...structure.exchanges[0], options: [{ title: 'P Filipiniana', items: [] }] }] })).message, /for itself/);
    // An item a package's pose uses can't be deleted.
    assert.match((await fail(pb.collection('catalog_items').delete(r8.id))).message, /Poses B/);
  });

  await t.test('single items: own price, sold at the kiosk only when switched on', async () => {
    const fail = (promise) => promise.then(() => assert.fail('expected the server to refuse'), (err) => err.response);
    const kioskList = async () => (await kiosk.send('/api/studioflow/registration-catalog', {})).addOns;
    // New items start off the kiosk; a price alone doesn't sell it.
    const print = await pb.collection('catalog_items').create({ name: 'S 8R', category: 'print', amount: 120 });
    assert.equal(print.is_active, false);
    assert.equal((await kioskList()).some((a) => a.catalog_item === print.id), false);
    // No price: can't be switched on. A negative price is refused.
    const free = await pb.collection('catalog_items').create({ name: 'S Keychain', category: 'other' });
    assert.match((await fail(pb.collection('catalog_items').update(free.id, { is_active: true }))).message, /Set a price/);
    assert.ok(await fail(pb.collection('catalog_items').update(free.id, { amount: -5 })));

    // Switched on: the kiosk lists it (as "1 pc - S 8R") and an order is priced from the catalog.
    await pb.collection('catalog_items').update(print.id, { is_active: true });
    const listed = (await kioskList()).find((a) => a.catalog_item === print.id);
    assert.deepEqual([listed.name, listed.amount, listed.client_kind, listed.revenue_category], ['1 pc - S 8R', 120, 'both', 'studio']);
    const basic = (await kiosk.collection('packages').getFullList({ filter: 'is_active = true' })).find((pk) => pk.code === 'PKG-BASIC');
    const order = await register(basic.id, [{ id: listed.id, amount: 1 }]);
    assert.equal(order.total_amount, 1395 + 120);

    // The linked add-on follows the item; it can't be edited or deleted as an add-on.
    assert.match((await fail(pb.collection('add_ons').update(listed.id, { amount: 1 }))).message, /single item/);
    assert.match((await fail(pb.collection('add_ons').delete(listed.id))).message, /single item/);
    assert.match((await fail(pb.collection('add_ons').create({ name: 'Sneaky', amount: 1, catalog_item: print.id }))).message, /single item/);
    await pb.collection('catalog_items').update(print.id, { amount: 150, name: 'S 8R glossy' });
    const after = await pb.collection('add_ons').getOne(listed.id);
    assert.deepEqual([after.name, after.amount, after.is_active], ['1 pc - S 8R glossy', 150, true]);
    // The sold order keeps the price it was sold at.
    assert.equal((await pb.collection('registrations').getOne(order.id)).add_ons[0].amount, 120);

    // Offered to walk-in clients only: the add-on follows, and a school order is refused.
    await pb.collection('catalog_items').update(print.id, { client_kind: 'walkin' });
    assert.equal((await pb.collection('add_ons').getOne(listed.id)).client_kind, 'walkin');
    assert.match((await fail(register(basic.id, [{ id: listed.id }]))).message, /not offered to school/);
    assert.ok(await fail(pb.collection('catalog_items').update(print.id, { client_kind: 'everyone' })));
    await pb.collection('catalog_items').update(print.id, { client_kind: 'both' });

    // Switched off: gone from the kiosk and refused on new orders.
    await pb.collection('catalog_items').update(print.id, { is_active: false });
    assert.equal((await kioskList()).some((a) => a.catalog_item === print.id), false);
    assert.match((await fail(register(basic.id, [{ id: listed.id }]))).data.add_ons?.message
      ?? (await fail(register(basic.id, [{ id: listed.id }]))).message, /no longer available/);
    // Sold on a job order: can't be deleted. Never sold: deleted with its add-on.
    assert.match((await fail(pb.collection('catalog_items').delete(print.id))).message, /sold on 1 job order/);
    await pb.collection('catalog_items').update(free.id, { amount: 10, is_active: true });
    const freeAddOn = await pb.collection('add_ons').getFirstListItem(`catalog_item = "${free.id}"`);
    await pb.collection('catalog_items').delete(free.id);
    assert.ok(await fail(pb.collection('add_ons').getOne(freeAddOn.id)));
  });

  await t.test('attire and background: print poses grouped by attire, every attire listed with the shoot', async () => {
    const fail = (promise) => promise.then(() => assert.fail('expected the server to refuse'), (err) => err.response);
    const item = (name, category) => pb.collection('catalog_items').create({ name, category });
    const [r11, r5, wallet, passport, twoByTwo, oneByOne, r3] = await Promise.all(
      ['A 11R', 'A 5R', 'A Wallet', 'A Passport', 'A 2x2', 'A 1x1', 'A 3R'].map((n) => item(n, 'print')));
    const [noCap, withCap, filipiniana, glamour] = await Promise.all(
      ['A Toga w/out cap', 'A Toga w/ cap', 'A Filipiniana', 'A Glamour shots'].map((n) => item(n, 'attire')));
    const [colored, bw] = await Promise.all(['A Colored', 'A B&W'].map((n) => item(n, 'background')));
    const rows = (list) => list.map(([it, qty]) => ({ item: it.id, qty }));
    const pose = (id, attire, background, list) => ({ type: 'pose', id, title: 'ignored', attire: attire.id, ...(background ? { background: background.id } : {}), items: rows(list) });
    const structure = {
      frame_item: '', unlimited_shots: true, freebies: [],
      inclusions: [
        pose('p1', noCap, colored, [[r11, 1], [wallet, 2]]),
        pose('p2', noCap, bw, [[passport, 4], [twoByTwo, 4], [oneByOne, 7]]),
        pose('p3', noCap, colored, [[twoByTwo, 4], [oneByOne, 8]]),
        pose('p4', withCap, colored, [[r5, 1], [wallet, 2]]),
        pose('p5', filipiniana, null, []),
      ],
      exchanges: [{ id: 'attire', name: 'Attire', pose: 'p5', keep_for: 'female',
        options: [{ id: 'glam', title: 'ignored', attire: glamour.id, for: 'female', items: rows([[r3, 1], [wallet, 2]]) }] }],
    };
    const pkg = await pb.collection('packages').create({ code: 'ATTIRE-A', name: 'Attire A', amount: 2895, is_active: true,
      client_kind: 'school', revenue_category: 'studio', photo_selection_limit: 3, structure });
    assert.deepEqual(pkg.inclusions, [
      { title: 'Frame and Prints', items: ['33 pcs hard printout copy',
        { title: 'A Toga w/out cap', items: [
          { title: 'A Colored', items: ['1 pc - A 11R', '2 pcs - A Wallet'] },
          { title: 'A B&W', items: ['4 pcs - A Passport', '4 pcs - A 2x2', '7 pcs - A 1x1'] },
          { title: 'A Colored', items: ['4 pcs - A 2x2', '8 pcs - A 1x1'] }] },
        { title: 'A Toga w/ cap', items: [{ title: 'A Colored', items: ['1 pc - A 5R', '2 pcs - A Wallet'] }] }] },
      'Unlimited shots (choose your best 3)',
      'A Toga w/out cap', 'A Toga w/ cap', 'A Filipiniana',
    ]);
    // Titles are made from the names; the exchange reads the same way.
    assert.deepEqual(pkg.structure.inclusions.map((e) => e.title), ['A Toga w/out cap · A Colored', 'A Toga w/out cap · A B&W', 'A Toga w/out cap · A Colored', 'A Toga w/ cap · A Colored', 'A Filipiniana']);
    assert.deepEqual([pkg.option_groups[0].replaces, pkg.option_groups[0].choices[0].label], ['A Filipiniana', 'A Glamour shots']);
    // An option is the exchanged pose in another attire: the pose's prints and background, whatever is sent.
    const capSwap = await pb.collection('packages').update(pkg.id, { structure: { ...structure, exchanges: [{ id: 'cap', name: 'Cap', pose: 'p4', keep_for: 'all',
      options: [{ id: 'g2', title: 'x', attire: glamour.id, background: bw.id, for: 'all', items: rows([[r11, 9]]) }] }] } });
    assert.deepEqual([capSwap.option_groups[0].choices[0].label, capSwap.option_groups[0].choices[0].items],
      ['A Glamour shots · A Colored', ['1 pc - A 5R', '2 pcs - A Wallet']]);
    await pb.collection('packages').update(pkg.id, { structure });
    // Renaming the background renames it everywhere.
    await pb.collection('catalog_items').update(bw.id, { name: 'A Black and white' });
    assert.equal((await pb.collection('packages').getOne(pkg.id)).inclusions[0].items[1].items[1].title, 'A Black and white');
    // An attire must be an attire, a background a background.
    const bad = (inclusions) => fail(pb.collection('packages').update(pkg.id, { structure: { ...structure, exchanges: [], inclusions } }));
    assert.match((await bad([{ type: 'pose', id: 'x', title: '', attire: r11.id, items: [] }])).message, /attire/);
    assert.match((await bad([{ type: 'pose', id: 'x', title: '', attire: noCap.id, background: withCap.id, items: [] }])).message, /background/);
    // A sold order keeps the grouped prints.
    const order = await register(pkg.id, [], { gender: 'female', package_options: '[]' });
    assert.equal(order.package_snapshot.inclusions[0].items[1].title, 'A Toga w/out cap');
  });

  await t.test('freebie choices: the client picks a version of a freebie, saved on the job order', async () => {
    const fail = (promise) => promise.then(() => assert.fail('expected the server to refuse'), (err) => err.response);
    const frame = await pb.collection('catalog_items').create({ name: 'F Free 7x9 classic frame', category: 'other' });
    const family = await pb.collection('catalog_items').create({ name: 'F Free family picture', category: 'other' });
    const structure = {
      frame_item: '', unlimited_shots: true, inclusions: [], exchanges: [], freebies: [frame.id, family.id],
      freebie_choices: [{ id: 'pick7x9', item: frame.id, choices: [{ label: 'Family' }, { label: ' Barkada ' }, { label: 'Couple' }, { label: 'family' }] }],
    };
    const pkg = await pb.collection('packages').create({ code: 'F-CHOICE', name: 'Freebie Choice', amount: 1500, is_active: true,
      client_kind: 'school', revenue_category: 'studio', structure });
    // Cleaned (trimmed, repeats dropped, ids given) and shown as a pick-one group marked as a freebie.
    assert.deepEqual(pkg.structure.freebie_choices[0].choices.map((c) => c.label), ['Family', 'Barkada', 'Couple']);
    const [group] = pkg.option_groups;
    assert.deepEqual([group.id, group.name, group.pick, group.freebie, group.replaces, group.choices.map((c) => c.label)],
      ['pick7x9', 'F Free 7x9 classic frame', 1, true, undefined, ['Family', 'Barkada', 'Couple']]);
    assert.deepEqual(pkg.freebies, ['F Free 7x9 classic frame', 'F Free family picture']);
    // The kiosk must send a pick; the pick is saved with its label.
    const missing = await fail(register(pkg.id, [], { gender: 'female', package_options: '[]' }));
    assert.match(missing.data.package_options.message, /F Free 7x9 classic frame/);
    const barkada = group.choices.find((c) => c.label === 'Barkada');
    const order = await register(pkg.id, [], { gender: 'female', package_options: JSON.stringify([{ group: group.id, choices: [barkada.id] }]) });
    assert.deepEqual(order.package_options, [{ group_id: 'pick7x9', group: 'F Free 7x9 classic frame', choices: [{ id: barkada.id, label: 'Barkada' }] }]);
    assert.equal(order.total_amount, 1500);
    // Refused: fewer than two choices, or choices for something that isn't one of the freebies.
    const bad = (patch) => fail(pb.collection('packages').update(pkg.id, { structure: { ...structure, ...patch } }));
    assert.match((await bad({ freebie_choices: [{ item: frame.id, choices: [{ label: 'Family' }] }] })).message, /at least two choices/);
    assert.match((await bad({ freebies: [family.id] })).message, /one of this package's freebies/);
    // Switching the choices off removes the group; the freebie stays.
    const plain = await pb.collection('packages').update(pkg.id, { structure: { ...structure, freebie_choices: [] } });
    assert.deepEqual([plain.option_groups, plain.freebies.length], [[], 2]);
    // Freebies show in the order the admin set (moved with ↑ ↓ in the builder).
    const moved = await pb.collection('packages').update(pkg.id, { structure: { ...structure, freebies: [family.id, frame.id], freebie_choices: [] } });
    assert.deepEqual(moved.freebies, ['F Free family picture', 'F Free 7x9 classic frame']);
  });

  await t.test('options: the client picks some of a list (part of the package, nothing exchanged)', async () => {
    const fail = (promise) => promise.then(() => assert.fail('expected the server to refuse'), (err) => err.response);
    const p8r = await pb.collection('catalog_items').create({ name: 'Opt 8R', category: 'print' });
    const p5r = await pb.collection('catalog_items').create({ name: 'Opt 5R', category: 'print' });
    const structure = {
      frame_item: '', unlimited_shots: true, inclusions: [], exchanges: [], freebies: [],
      picks: [
        { id: 'backdrop', name: ' Backdrop ', pick: 2, choices: [{ label: 'Blue' }, { label: 'Gray' }, { label: 'Black', for: 'male' }, { label: 'blue' }] },
        { id: 'print', name: 'Choose your print', pick: 1, choices: [{ item: p8r.id, qty: 1 }, { item: p5r.id, qty: 2, for: 'female' }] },
      ],
    };
    const pkg = await pb.collection('packages').create({ code: 'P-PICKS', name: 'Picks Package', amount: 1800, is_active: true,
      client_kind: 'school', revenue_category: 'studio', structure });
    // Rendered as option groups with no "instead of": labels from the items (or the typed text), repeats dropped.
    assert.deepEqual(pkg.option_groups.map((g) => [g.id, g.name, g.pick, g.replaces, g.choices.map((c) => [c.label, c.for])]), [
      ['backdrop', 'Backdrop', 2, undefined, [['Blue', 'all'], ['Gray', 'all'], ['Black', 'male']]],
      ['print', 'Choose your print', 1, undefined, [['1 pc - Opt 8R', 'all'], ['2 pcs - Opt 5R', 'female']]],
    ]);
    assert.deepEqual(pkg.inclusions, ['Unlimited shots'], 'options are not added to the inclusions or the print count');
    // The kiosk sends the picks; the job order keeps them; the price never changes.
    const [backdrop, print] = pkg.option_groups;
    const id = (group, label) => group.choices.find((c) => c.label === label).id;
    const order = await register(pkg.id, [], { gender: 'female', package_options: JSON.stringify([
      { group: 'backdrop', choices: [id(backdrop, 'Blue'), id(backdrop, 'Gray')] },
      { group: 'print', choices: [id(print, '2 pcs - Opt 5R')] },
    ]) });
    assert.deepEqual(order.package_options.map((g) => [g.group, g.choices.map((c) => c.label)]),
      [['Backdrop', ['Blue', 'Gray']], ['Choose your print', ['2 pcs - Opt 5R']]]);
    assert.equal(order.total_amount, 1800);
    const tooFew = await fail(register(pkg.id, [], { gender: 'female', package_options: JSON.stringify([
      { group: 'backdrop', choices: [id(backdrop, 'Blue')] }, { group: 'print', choices: [id(print, '1 pc - Opt 8R')] }]) }));
    assert.match(tooFew.data.package_options.message, /Backdrop/);
    // Nothing picked (an empty list, or the field left out): refused, the kiosk can't skip an option.
    assert.match((await fail(register(pkg.id, [], { gender: 'female', package_options: '[]' }))).data.package_options.message, /Backdrop: choose 2|"Backdrop": choose 2/);
    assert.match((await fail(register(pkg.id, [], { gender: 'male' }))).data.package_options.message, /choose 2/);
    // Refused: no name, fewer than two choices, picking all of them, a missing item.
    const bad = (pick) => fail(pb.collection('packages').update(pkg.id, { structure: { ...structure, picks: [pick] } }));
    assert.match((await bad({ name: '', pick: 1, choices: [{ label: 'A' }, { label: 'B' }] })).message, /Give each option a name/);
    assert.match((await bad({ name: 'One', pick: 1, choices: [{ label: 'A' }] })).message, /at least two choices/);
    assert.match((await bad({ name: 'All', pick: 2, choices: [{ label: 'A' }, { label: 'B' }] })).message, /from 1 to 1 of its 2/);
    assert.match((await bad({ name: 'Gone', pick: 1, choices: [{ item: 'nosuchitem00000' }, { label: 'B' }] })).message, /no longer exists/);
    // Attire choices: an attire (on a background) with its own prints; the client gets the prints of the attires picked.
    const glam = await pb.collection('catalog_items').create({ name: 'Opt Glamour', category: 'attire' });
    const filipiniana = await pb.collection('catalog_items').create({ name: 'Opt Filipiniana', category: 'attire' });
    const coat = await pb.collection('catalog_items').create({ name: 'Opt Coat and tie', category: 'attire' });
    const colored = await pb.collection('catalog_items').create({ name: 'Opt Colored', category: 'background' });
    const attires = await pb.collection('packages').update(pkg.id, { structure: { ...structure, picks: [{ id: 'attires', name: 'Choose 2 attires', pick: 2, choices: [
      { attire: glam.id, background: colored.id, items: [{ item: p5r.id, qty: 1 }], for: 'female' },
      { attire: filipiniana.id, items: [{ item: p8r.id, qty: 1 }, { item: p5r.id, qty: 2 }], for: 'female' },
      { attire: coat.id, items: [{ item: p8r.id, qty: 1 }], for: 'male' },
      { title: 'Opt Barong', items: [], for: 'male' },
    ] }] } });
    assert.deepEqual(attires.option_groups[0].choices.map((c) => [c.label, c.for, c.items]), [
      ['Opt Glamour · Opt Colored', 'female', ['1 pc - Opt 5R']],
      ['Opt Filipiniana', 'female', ['1 pc - Opt 8R', '2 pcs - Opt 5R']],
      ['Opt Coat and tie', 'male', ['1 pc - Opt 8R']],
      ['Opt Barong', 'male', undefined],
    ]);
    assert.deepEqual(attires.structure.picks[0].choices[0].title, 'Opt Glamour · Opt Colored');
    const [attireGroup] = attires.option_groups;
    const picked = await register(pkg.id, [], { gender: 'female', package_options: JSON.stringify([
      { group: 'attires', choices: attireGroup.choices.filter((c) => c.for === 'female').map((c) => c.id) }]) });
    assert.deepEqual(picked.package_options[0].choices.map((c) => [c.label, c.items]),
      [['Opt Glamour · Opt Colored', ['1 pc - Opt 5R']], ['Opt Filipiniana', ['1 pc - Opt 8R', '2 pcs - Opt 5R']]]);
    assert.match((await bad({ name: 'Twice', pick: 1, choices: [{ attire: glam.id, items: [] }, { attire: glam.id, items: [] }] })).message, /twice/);
    assert.match((await bad({ name: 'No attire', pick: 1, choices: [{ attire: '', title: '', items: [] }, { attire: glam.id, items: [] }] })).message, /Choose an attire/);
    await pb.collection('packages').update(pkg.id, { structure });
    // Renaming the item re-renders the package's choices.
    await pb.collection('catalog_items').update(p8r.id, { name: 'Opt 8R glossy' });
    const renamed = await pb.collection('packages').getOne(pkg.id);
    assert.deepEqual(renamed.option_groups[1].choices.map((c) => c.label), ['1 pc - Opt 8R glossy', '2 pcs - Opt 5R']);
  });

  await t.test('package photos: uploaded by the admin, ordered, public to the kiosk', async () => {
    const fail = (promise) => promise.then(() => assert.fail('expected the server to refuse'), (err) => err.response);
    const pkg = await pb.collection('packages').create({ code: 'PHOTO-PKG', name: 'Photo Package', amount: 1000, is_active: true,
      client_kind: 'school', revenue_category: 'studio' });
    const form = new FormData();
    for (const name of ['flyer.png', 'sample.png']) form.append('photos+', new Blob([png], { type: 'image/png' }), name);
    let saved = await pb.collection('packages').update(pkg.id, form);
    assert.equal(saved.photos.length, 2);
    // Reordered (cover first) and one removed by sending the names to keep.
    saved = await pb.collection('packages').update(pkg.id, { photos: [saved.photos[1], saved.photos[0]] });
    const [cover, flyer] = saved.photos;
    assert.match(cover, /^sample/);
    saved = await pb.collection('packages').update(pkg.id, { photos: [cover] });
    assert.deepEqual(saved.photos, [cover]);
    // The kiosk sees the photos and can load them (and the card thumb) without signing in.
    const listed = (await kiosk.send('/api/studioflow/registration-catalog', {})).packages.find((x) => x.id === pkg.id);
    assert.deepEqual([listed.photos, listed.collectionName], [[cover], 'packages']);
    for (const thumb of ['', '?thumb=480x360', '?thumb=1200x0']) {
      const res = await fetch(`${host}/api/files/${listed.collectionId}/${pkg.id}/${cover}${thumb}`);
      assert.equal(res.status, 200, 'photo ' + (thumb || 'original'));
    }
    assert.ok(flyer);
    // Only images, at most 12, and only the admin can change them.
    const text = new FormData();
    text.append('photos+', new Blob(['not a picture'], { type: 'text/plain' }), 'notes.txt');
    assert.ok(await fail(pb.collection('packages').update(pkg.id, text)));
    const many = new FormData();
    for (let i = 0; i < 12; i++) many.append('photos+', new Blob([png], { type: 'image/png' }), `p${i}.png`);
    assert.ok(await fail(pb.collection('packages').update(pkg.id, many)));
    const anon = new FormData();
    anon.append('photos+', new Blob([png], { type: 'image/png' }), 'x.png');
    assert.ok(await fail(kiosk.collection('packages').update(pkg.id, anon)));
    assert.deepEqual((await pb.collection('packages').getOne(pkg.id)).photos, [cover]);
  });

  await t.test('package options: saved on the package, picked at the kiosk, checked by the server', async () => {
    const fail = (promise) => promise.then(() => assert.fail('expected the server to refuse'), (err) => err.response);
    // The package's groups are cleaned: blank choices dropped, ids given.
    const attire = { name: ' Attire ', pick: 1, choices: [
      { label: 'Toga w/ cap' }, { label: 'Filipiniana', for: 'female' }, { label: 'Glamour shots', for: 'female' },
      { label: 'Coat and tie or Barong', for: 'male' }, { label: '   ' },
    ] };
    const backdrop = { name: 'Backdrop', pick: 2, choices: [{ label: 'Gold' }, { label: 'Pink', for: 'female' }] };
    const pkg = await pb.collection('packages').create({ code: 'PKG-OPTIONS', name: 'Options Package', amount: 2995, is_active: true, revenue_category: 'studio',
      option_groups: [attire, backdrop] });
    assert.deepEqual(pkg.option_groups.map((g) => [g.name, g.pick, g.choices.map((c) => [c.label, c.for, !!c.id])]), [
      ['Attire', 1, [['Toga w/ cap', 'all', true], ['Filipiniana', 'female', true], ['Glamour shots', 'female', true], ['Coat and tie or Barong', 'male', true]]],
      ['Backdrop', 2, [['Gold', 'all', true], ['Pink', 'female', true]]],
    ]);
    const tooMany = await fail(pb.collection('packages').create({ code: 'PKG-BAD-OPT', name: 'Bad', amount: 1, is_active: true, revenue_category: 'studio',
      option_groups: [{ name: 'Attire', pick: 3, choices: [{ label: 'A' }, { label: 'B' }] }] }));
    assert.match(tooMany.message, /choose from 1 to 2/);

    const [groupA, groupB] = pkg.option_groups;
    const id = (group, label) => group.choices.find((c) => c.label === label).id;
    const registerWith = (gender, picks) => register(pkg.id, [], { gender, package_options: JSON.stringify(picks) });

    // Nothing chosen, a choice for the other gender, a wrong count, a group from another package: refused.
    const none = await fail(registerWith('male', []));
    assert.equal(none.data.package_options.message, '"Attire": choose 1 option.');
    const wrongGender = await fail(registerWith('male', [{ group: groupA.id, choices: [id(groupA, 'Filipiniana')] }, { group: groupB.id, choices: [id(groupB, 'Gold')] }]));
    assert.match(wrongGender.data.package_options.message, /Attire.*options shown for this client/);
    const tooFew = await fail(registerWith('female', [{ group: groupA.id, choices: [id(groupA, 'Filipiniana')] }, { group: groupB.id, choices: [id(groupB, 'Gold')] }]));
    assert.equal(tooFew.data.package_options.message, '"Backdrop": choose 2 options.');
    const stranger = await fail(registerWith('male', [{ group: 'notagroup', choices: ['x'] }]));
    assert.match(stranger.data.package_options.message, /not part of the selected package/);

    // A man sees one backdrop (Pink is for women), so he picks just that one; labels are saved.
    const man = await registerWith('male', [{ group: groupA.id, choices: [id(groupA, 'Coat and tie or Barong')] }, { group: groupB.id, choices: [id(groupB, 'Gold')] }]);
    assert.deepEqual(man.package_options.map((g) => [g.group, g.choices.map((c) => c.label)]), [['Attire', ['Coat and tie or Barong']], ['Backdrop', ['Gold']]]);
    assert.equal(man.total_amount, 2995, 'options never change the price');
    const woman = await registerWith('female', [{ group: groupA.id, choices: [id(groupA, 'Glamour shots')] }, { group: groupB.id, choices: [id(groupB, 'Gold'), id(groupB, 'Pink')] }]);
    assert.deepEqual(woman.package_options[1].choices.map((c) => c.label), ['Gold', 'Pink']);

    // Renaming a choice later does not change what was sold.
    const renamed = pkg.option_groups.map((g) => ({ ...g, choices: g.choices.map((c) => (c.label === 'Gold' ? { ...c, label: 'Classic Gold' } : c)) }));
    await pb.collection('packages').update(pkg.id, { option_groups: renamed });
    assert.equal((await pb.collection('registrations').getOne(man.id)).package_options[1].choices[0].label, 'Gold');

    // Admin edits: valid picks are saved, invalid ones refused; editing other details keeps the saved picks.
    const edited = await pb.collection('registrations').update(man.id, { package_options: [{ group: groupA.id, choices: [id(groupA, 'Toga w/ cap')] }, { group: groupB.id, choices: [id(groupB, 'Gold')] }] });
    assert.deepEqual(edited.package_options.map((g) => g.choices[0].label), ['Toga w/ cap', 'Classic Gold']);
    const badEdit = await fail(pb.collection('registrations').update(man.id, { package_options: [{ group: groupA.id, choices: [id(groupA, 'Glamour shots')] }] }));
    assert.match(badEdit.message, /Attire/);
    assert.deepEqual((await pb.collection('registrations').update(man.id, { notes: 'Edited' })).package_options, edited.package_options);

    // A new package needs its options picked with it; a package without options clears them.
    const basic = await pb.collection('packages').getFirstListItem('code = "PKG-BASIC"');
    const plain = await pb.collection('packages').create({ code: 'PKG-PLAIN', name: 'Plain', amount: 500, is_active: true, revenue_category: 'studio' });
    const switched = await pb.collection('registrations').update(man.id, { package: plain.id });
    assert.deepEqual(switched.package_options, []);
    const needsPicks = await fail(pb.collection('registrations').update(man.id, { package: pkg.id }));
    assert.match(needsPicks.message, /Attire.*choose 1/);
    const back = await pb.collection('registrations').update(man.id, { package: pkg.id,
      package_options: [{ group: groupA.id, choices: [id(groupA, 'Toga w/ cap')] }, { group: groupB.id, choices: [id(groupB, 'Gold')] }] });
    assert.equal(back.package_options.length, 2);
    assert.ok(basic, 'packages without options still register without picks (earlier tests)');

    // Imported options are saved, and "Add to an existing package" adds new choices to a group of the same name.
    const draft = parseCatalogText('Options Import - 1000\nOPTIONS:\nToga w/cap\nBarong (boys)').packages[0];
    const saved = await saveCatalogDrafts(pb, assignCodes({ packages: [draft], addOns: [] }, ...await codes()).packages, []);
    assert.deepEqual([saved.created, saved.failed], [1, []]);
    const imported = await pb.collection('packages').getFirstListItem('name = "Options Import"');
    assert.deepEqual(imported.option_groups[0].choices.map((c) => [c.label, c.for]), [['Toga w/cap', 'all'], ['Barong', 'male']]);
    const extra = { ...draft, mergeInto: pkg.id, inclusions: [], freebies: [],
      optionGroups: [{ id: 'x', name: 'attire', pick: 1, choices: [{ id: 'y', label: 'Toga W/ Cap', for: 'all' }, { id: 'z', label: 'Pastel gown', for: 'female' }] }] };
    assert.deepEqual(await saveCatalogDrafts(pb, [extra], []), { created: 0, updated: 1, failed: [] });
    const mergedGroups = (await pb.collection('packages').getOne(pkg.id)).option_groups;
    assert.deepEqual(mergedGroups.map((g) => [g.name, g.choices.map((c) => c.label)]), [
      ['Attire', ['Toga w/ cap', 'Filipiniana', 'Glamour shots', 'Coat and tie or Barong', 'Pastel gown']],
      ['Backdrop', ['Classic Gold', 'Pink']],
    ]);
  });
});

/** A throwaway PocketBase with the repo's hooks and migrations, signed in as the seeded admin. */
async function startServer(t) {
  const { default: PocketBase } = await import('pocketbase');
  const home = await mkdtemp(join(tmpdir(), 'studioflow-backup-'));
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
  return pb;
}

test('backup: an exported price list (Excel, CSV or Word) restores the catalog into an empty system', async (t) => {
  const { runnerImport } = await import('vite');
  const config = { configFile: false, root: repo, logLevel: 'silent' };
  const { priceListFile } = (await runnerImport(join(repo, 'src/features/admin/priceListExport.ts'), config)).module;
  const { findBackupInFile, restoreCatalog } = (await runnerImport(join(repo, 'src/features/admin/catalogBackup.ts'), config)).module;
  const source = await startServer(t);

  // A catalog with everything the builder makes.
  const item = (name, category, extra = {}) => source.collection('catalog_items').create({ name, category, ...extra });
  const r8 = await item('8R', 'print', { amount: 150, is_active: true, client_kind: 'both' });
  const wallet = await item('Wallet size', 'print', { amount: 20 });
  const frame = await item('10x12 classic frame', 'frame', { amount: 450, client_kind: 'school' });
  const [toga, fil, glam] = await Promise.all(['Toga w/out cap', 'Filipiniana', 'Glamour shots'].map((n) => item(n, 'attire')));
  const colored = (await source.collection('catalog_items').getFullList({ filter: 'name = "Colored" && category = "background"' }))[0];
  const free = await item('Free 7x9 classic frame', 'other');
  await source.collection('item_packages').create({ name: 'Colored toga', items: [{ item: r8.id, qty: 1 }, { item: wallet.id, qty: 2 }] });
  const structure = {
    frame_item: frame.id, unlimited_shots: true, freebies: [free.id],
    freebie_choices: [{ id: 'fc', item: free.id, choices: [{ label: 'Family' }, { label: 'Barkada' }] }],
    inclusions: [
      { type: 'pose', id: 'p1', title: '', attire: toga.id, background: colored.id, items: [{ item: r8.id, qty: 1 }, { item: wallet.id, qty: 2 }] },
      { type: 'pose', id: 'p2', title: '', attire: fil.id, background: colored.id, items: [{ item: wallet.id, qty: 4 }] },
    ],
    exchanges: [{ id: 'ex', name: 'Attire', pose: 'p2', keep_for: 'female', options: [{ id: 'g', title: '', attire: glam.id, for: 'female' }] }],
  };
  await source.collection('packages').create({ code: 'STD-B', name: 'Standard Package B', amount: 2595, is_active: true, client_kind: 'school',
    revenue_category: 'studio', photo_selection_limit: 2, tagline: 'with 10x12 CLASSIC frame', structure });
  await source.collection('packages').create({ code: 'OLD-TEXT', name: 'Old text package', amount: 999, is_active: false, revenue_category: 'studio',
    inclusions: ['Soft copies', 'Toga'], freebies: ['Free raw copies'] });
  await source.collection('add_ons').create({ code: 'MUA', name: 'Hair and makeup', amount: 500, revenue_category: 'mua', requires_mua: true, is_active: true });

  const snapshot = async (pb) => {
    // Empty "offered to" means both for items and school for packages: compare the meaning.
    const items = (await pb.collection('catalog_items').getFullList({ sort: 'name' })).map((i) => [i.name, i.category, i.amount, i.client_kind || 'both', i.is_active]);
    const packages = (await pb.collection('packages').getFullList({ sort: 'code' })).map((x) => ({
      code: x.code, name: x.name, amount: x.amount, active: x.is_active, kind: x.client_kind || 'school', revenue: x.revenue_category, limit: x.photo_selection_limit,
      tagline: x.tagline, inclusions: x.inclusions, freebies: x.freebies,
      options: x.option_groups.map((g) => [g.name, g.replaces, g.freebie, g.choices.map((c) => [c.label, c.for, c.items])]),
    }));
    const addOns = (await pb.collection('add_ons').getFullList({ sort: 'name' })).map((a) => [a.name, a.code, a.amount, a.is_active, a.revenue_category, a.requires_mua, !!a.catalog_item]);
    const poses = (await pb.collection('item_packages').getFullList()).map((x) => [x.name, x.items.length]);
    return { items, packages, addOns, poses };
  };
  const expected = await snapshot(source);
  const data = {
    items: await source.collection('catalog_items').getFullList(), poses: await source.collection('item_packages').getFullList(),
    packages: await source.collection('packages').getFullList(), addOns: await source.collection('add_ons').getFullList(),
  };
  const mime = { xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', csv: 'text/csv', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };

  for (const format of ['xlsx', 'csv', 'docx']) {
    const blob = await priceListFile(data, format);
    const backup = await findBackupInFile(new File([await blob.arrayBuffer()], 'StudioFlow-Price-List.' + format, { type: mime[format] }));
    assert.ok(backup, format + ': the backup is found in the file');
    // Restored into an empty system: the same catalog, exactly.
    const target = await startServer(t);
    const result = await restoreCatalog(target, backup, false);
    assert.deepEqual(result.failed, [], format + ': nothing failed');
    assert.deepEqual(await snapshot(target), expected, format + ': restored catalog matches');
    // Running it again changes nothing.
    const again = await restoreCatalog(target, backup, false);
    assert.equal(again.created + again.updated + again.failed.length, 0, format + ': a second restore only keeps');
    if (format === 'csv') await t.test('photographer assignments are resolved against target staff before restore', async () => {
      const photographer = (pb, username, extra = {}) => pb.collection('users').create({
        username, name: username, email: username + '@example.test', password: 'password123', passwordConfirm: 'password123',
        role: 'photographer', ...extra,
      });
      const original = await photographer(source, 'source-camera');
      const shared = await photographer(source, 'shared-camera');
      const targetShared = await photographer(target, 'shared-camera', { id: shared.id });
      const replacement = await photographer(target, 'target-camera');
      const disabled = await photographer(target, 'disabled-camera', { disabled: true });
      const ordinary = await item('On-location print', 'print', { amount: 200 });
      const assigned = await item('On-location coverage', 'other', {
        amount: 2500, is_active: true, required_photographers: [original.id, shared.id],
      });
      const file = await priceListFile({ items: [ordinary, assigned], poses: [], packages: [], addOns: [] }, 'csv');
      const assignedBackup = await findBackupInFile(new File([file], 'assigned.csv'));
      assert.ok(assignedBackup);
      assert.deepEqual(assignedBackup.items[1].required_photographers, [original.id, shared.id]);

      await assert.rejects(restoreCatalog(target, assignedBackup, false), /enabled replacement photographer.*On-location coverage/);
      await assert.rejects(restoreCatalog(target, assignedBackup, false, undefined, new Map([[original.id, disabled.id]])),
        /enabled replacement photographer/);
      await assert.rejects(target.collection('catalog_items').getOne(ordinary.id), { status: 404 });

      const remapping = new Map([[original.id, replacement.id]]);
      const restored = await restoreCatalog(target, assignedBackup, false, undefined, remapping);
      assert.deepEqual(restored.failed, []);
      assert.equal(restored.created, 2);
      const saved = await target.collection('catalog_items').getOne(assigned.id);
      assert.deepEqual(saved.required_photographers, [replacement.id, targetShared.id]);
      const listing = await target.collection('add_ons').getFirstListItem('catalog_item = "' + assigned.id + '"');
      assert.deepEqual([saved.amount, listing.amount, listing.is_active], [2500, 2500, true]);
      assert.equal((await restoreCatalog(target, assignedBackup, false)).kept, 2);
      await assert.rejects(restoreCatalog(target, assignedBackup, true), /enabled replacement photographer/);
      assert.equal((await restoreCatalog(target, assignedBackup, true, undefined, remapping)).updated, 2);
    });
    if (format !== 'xlsx') continue;
    // A changed price stays unless "update existing" is chosen.
    const changed = (await target.collection('catalog_items').getFullList({ filter: 'name = "8R"' }))[0];
    await target.collection('catalog_items').update(changed.id, { amount: 999 });
    await restoreCatalog(target, backup, false);
    assert.equal((await target.collection('catalog_items').getOne(changed.id)).amount, 999);
    const updated = await restoreCatalog(target, backup, true);
    assert.deepEqual(updated.failed, []);
    assert.equal((await target.collection('catalog_items').getOne(changed.id)).amount, 150);
    const kioskAddOn = (await target.collection('add_ons').getFullList({ filter: 'catalog_item = "' + changed.id + '"' }))[0];
    assert.deepEqual([kioskAddOn.amount, kioskAddOn.is_active], [150, true], 'the kiosk sells it at the restored price');
  }

  // A file without a backup (a plain spreadsheet) is read as before.
  assert.equal(await findBackupInFile(new File(['Package,Price\nBasic,100'], 'list.csv', { type: 'text/csv' })), null);
});
