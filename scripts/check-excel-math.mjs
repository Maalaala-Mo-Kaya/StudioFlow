// Excel math check: builds every money export from a throwaway PocketBase and recalculates it.
//
// Starts PocketBase on :8099 (temp --dir, the repo's pb_hooks and pb_migrations, a temp photo root),
// creates discount / payment / refund / cancel / MUA cases through the real API, then builds with the
// app's own code (loaded through Vite):
//   - Overall Excel (every scope: by level, master, one school) with its MUA sheets
//   - Audit Export (all time and today)
//   - MUA Payouts export and the MUA Performance earnings Excel
// Each workbook is written to .xlsx, read back, and recalculated with HyperFormula (dev dependency,
// GPL-3.0, never shipped). Every formula's saved result must equal the recalculated value, every
// check line must be ₱0 / "OK - balanced", and the discount figures must match the server's records.
//
// Run: npm run check:excel   (-- --verbose lists every workbook and sheet checked)
// Set POCKETBASE_TEST_BINARY to use another PocketBase binary.
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const executable = process.env.POCKETBASE_TEST_BINARY || join(repo, 'pocketbase.exe');
const verbose = process.argv.includes('--verbose');
const host = 'http://127.0.0.1:8099';
const api = '/api/studioflow';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aUoUAAAAASUVORK5CYII=', 'base64');
const problems = [];
const fail = (where, message) => problems.push(`${where}: ${message}`);
const log = (...args) => { if (verbose) console.log(...args); };
const cents = (pesos) => Math.round((Number(pesos) || 0) * 100);
const manilaDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' })
  .format(new Date());

const home = await mkdtemp(join(tmpdir(), 'studioflow-excel-'));
const publicDir = join(home, 'public');
await mkdir(publicDir);
const flags = ['--dir', join(home, 'db'), '--hooksDir', join(repo, 'pb_hooks'), '--migrationsDir', join(repo, 'pb_migrations')];
const options = { env: { ...process.env, STUDIOFLOW_PHOTOS_ROOT: join(home, 'photos') }, windowsHide: true };
let server;
let logs = '';
let vite;

async function cleanup() {
  await vite?.close();
  if (server && server.exitCode === null && server.signalCode === null) {
    server.kill();
    await once(server, 'exit');
  }
  await rm(home, { recursive: true, force: true });
}

try {
  execFileSync(executable, ['superuser', 'upsert', 'excel-check@example.test', randomUUID(), ...flags], options);
  execFileSync(executable, ['migrate', 'up', ...flags], options);
  server = spawn(executable, ['serve', '--http', host.slice(7), '--publicDir', publicDir, ...flags], options);
  for (const stream of [server.stdout, server.stderr]) stream.on('data', (chunk) => { logs += chunk; });
  let up = false;
  for (let attempt = 0; attempt < 80 && !up; attempt++) {
    up = await fetch(host + '/api/health').then((res) => res.ok).catch(() => false);
    if (!up) {
      if (server.exitCode !== null) throw new Error('PocketBase stopped:\n' + logs);
      await delay(150);
    }
  }
  if (!up) throw new Error('PocketBase did not start on ' + host + ' (is the port in use?)\n' + logs);
  await run();
} finally {
  await cleanup();
}

if (problems.length) {
  console.error(`\n✖ Excel math check: ${problems.length} problem(s)`);
  for (const problem of problems) console.error('  - ' + problem);
  process.exit(1);
}
console.log('✔ Excel math check: every workbook recalculates to its saved results and balances.');

async function run() {
  // ---- API helpers ---------------------------------------------------------------------------
  async function send(path, { token, method = 'GET', body, status = 200 } = {}) {
    const headers = token ? { Authorization: token } : {};
    if (body && !(body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(body);
    }
    const response = await fetch(host + path, { method, headers, body });
    const payload = response.headers.get('content-type')?.includes('/json') ? await response.json() : await response.text();
    if (status && response.status !== status) {
      throw new Error(`${method} ${path} → ${response.status} (expected ${status}): ${JSON.stringify(payload)}`);
    }
    return payload;
  }
  const records = (collection, id = '') => `/api/collections/${collection}/records${id ? '/' + id : ''}`;
  const login = (identity, password) => send('/api/collections/users/auth-with-password', {
    method: 'POST', body: { identity, password } }).then((r) => r.token);
  const admin = await login('admin', 'password123');
  const cashier = await login('cashier', 'password123');
  const create = (collection, body) => send(records(collection), { method: 'POST', token: admin, body });
  const all = async (collection, extra = '') => (await send(records(collection) + '?perPage=500' + extra, { token: admin })).items;
  const get = (reg) => send(records('registrations', reg.id), { token: admin });

  // ---- Catalog -------------------------------------------------------------------------------
  const school = await create('organizations', { code: 'XLS', name: 'Excel Academy', is_active: true });
  const level = await create('levels', { organization: school.id, name: 'College' });
  const course = { id: (await send(api + '/school-courses', { method: 'POST', token: admin, status: 201,
    body: { schoolId: school.id, levelId: level.id, name: 'Excel Check College', code: 'XLCOL' } })).course_id };
  const shs = await create('levels', { organization: school.id, name: 'Senior High' });
  const shsCourse = { id: (await send(api + '/school-courses', { method: 'POST', token: admin, status: 201,
    body: { schoolId: school.id, levelId: shs.id, name: 'Excel Check SHS', code: 'XLSHS' } })).course_id };
  const studio = await create('packages', { code: 'XL-1750', name: 'Classic', amount: 1750, is_active: true, revenue_category: 'studio' });
  const premium = await create('packages', { code: 'XL-3845', name: 'Premium', amount: 3845, is_active: true, revenue_category: 'studio' });
  const makeup = await create('add_ons', { code: 'XL-MU', name: 'Hair & makeup', amount: 450, is_active: true,
    revenue_category: 'mua', requires_mua: true });
  const print = await create('add_ons', { code: 'XL-8R', name: 'Extra 8R', amount: 150, is_active: true, revenue_category: 'studio' });
  const artistPassword = 'Excel-Check-Password!';
  await create('users', { username: 'xlartist', name: 'Excel Artist', email: 'xlartist@example.test',
    password: artistPassword, passwordConfirm: artistPassword, role: 'mua' });
  const artist = await login('xlartist', artistPassword);

  let sequence = 0;
  async function register(pkg, addOns = [], senior = false) {
    const version = (await send(api + '/registration-catalog')).version;
    const form = new FormData();
    for (const [key, value] of Object.entries({
      family_name: 'Client' + ++sequence, given_name: 'Excel', middle_name: '', gender: 'female', mobile_number: '09170000000',
      organization: school.id, level: senior ? shs.id : level.id, course: senior ? shsCourse.id : course.id, package: pkg.id,
      student_id: 'XL-' + sequence, terms_accepted: 'true', email: 'client@example.test', add_ons: JSON.stringify(addOns.map((a) => ({ id: a.id }))),
      makeup_look: 'full', registration_version: version, registration_request_id: randomUUID(),
    })) form.set(key, value);
    form.set('signature', new Blob([png], { type: 'image/png' }), 'signature.png');
    return send(records('registrations'), { method: 'POST', body: form });
  }

  /** The cashier's payment popup: an optional discount and an optional payment, confirmed together. */
  async function confirm(reg, { percentage, amount: fixed, reason = 'Excel check', pay } = {}) {
    const current = await get(reg);
    const saved = current.revenue_discount;
    const savedCredit = (saved?.studio ?? 0) + (saved?.mua ?? 0);
    const original = cents(current.total_amount) + savedCredit;
    const studioBase = (current.revenue_terms?.studio ?? 0) + (saved?.studio ?? 0);
    const credit = percentage !== undefined ? (percentage === 0 ? 0 : Math.round(studioBase * percentage / 10000) * 100 + (saved?.mua ?? 0))
      : fixed !== undefined ? fixed * 100 + (saved?.mua ?? 0) : savedCredit;
    const total = original - credit;
    const balance = Math.max(0, total - cents(current.paid_amount));
    const discount = percentage !== undefined ? { percentage, reason } : fixed !== undefined ? { amount: fixed, reason } : undefined;
    // 'part': an additional payment of ₱500 that leaves a balance.
    const amount = pay === 'full' || pay === 'additional' ? balance : pay === 'initial' ? Math.min(balance, Math.round(total / 200) * 100)
      : pay === 'part' ? Math.min(balance, 50000) : 0;
    const type = pay === 'part' ? 'additional' : pay;
    return send(`${api}/registrations/${reg.id}/confirm-payment`, { method: 'POST', token: cashier, body: {
      clientKey: randomUUID().replaceAll('-', ''), updated: current.updated, balanceDue: balance, discount,
      payment: pay ? { amount: amount / 100, type, method: 'cash', cash: amount / 100, cashierName: 'Excel cashier', remarks: '' } : undefined,
    } });
  }
  const payBalance = (reg) => confirm(reg, { pay: 'additional' });

  // ---- Money cases ---------------------------------------------------------------------------
  // A: 10% off a Studio order, paid in full with it.
  const a = await register(studio);
  await confirm(a, { percentage: 10, pay: 'full' });
  // B: fixed ₱200 with a downpayment, then the balance.
  const b = await register(premium, [print]);
  await confirm(b, { amount: 200, pay: 'initial' });
  await payBalance(b);
  // C: 15% on Studio + MUA (₱262.50 rounds to ₱263), downpayment only: cash held, not yet split.
  const c = await register(studio, [makeup]);
  await confirm(c, { percentage: 15, pay: 'initial' });
  // D: Studio + MUA, 10% (Studio charges only: MUA is never discounted); paid in full; makeup done.
  const d = await register(premium, [makeup], true);
  await send(records('registrations', d.id), { method: 'PATCH', token: admin, status: 400,
    body: { order_discount: { studio: 0, mua: 50, reason: 'Artist courtesy' } } });
  await confirm(d, { percentage: 10, pay: 'full' });
  const dNow = await get(d);
  if (dNow.revenue_discount?.mua !== 0 || dNow.revenue_discount?.studio !== 38500) {
    fail('case D', `discount is ${JSON.stringify(dNow.revenue_discount)}, expected ₱385 Studio and ₱0 MUA`);
  }
  const waiting = await send(api + '/makeup', { token: artist });
  const entry = waiting.find((row) => row.id === d.id);
  if (!entry) fail('case D', 'paid makeup client is not in the MUA queue');
  else {
    for (const action of ['claim', 'start', 'complete']) {
      const now = (await send(api + '/makeup', { token: artist })).find((row) => row.id === d.id);
      await send(`${api}/makeup/${d.id}/${action}`, { method: 'POST', token: artist, body: { version: String(now?.version ?? entry.version) } });
    }
  }
  // E: 100% complimentary, nothing to collect.
  const e = await register(studio);
  await confirm(e, { percentage: 100 });
  // F: 20% with a downpayment, then cancelled and part refunded.
  const f = await register(premium);
  await confirm(f, { percentage: 20, pay: 'initial' });
  await send(`${api}/registrations/${f.id}/cancel`, { method: 'POST', token: admin, body: { reason: 'Client backed out' } });
  await send(api + '/refunds', { method: 'POST', token: admin, body: { registrationId: f.id, amount: 500, method: 'cash', reason: 'Partial refund', clientKey: randomUUID() } });
  // G: 10% paid in full, then an add-on at the counter and its balance.
  const g = await register(studio);
  await confirm(g, { percentage: 10, pay: 'full' });
  await send(records('registrations', g.id), { method: 'PATCH', token: cashier, body: { add_ons: [{ id: print.id }] } });
  await payBalance(g);
  // H: 5% with a downpayment, then removed (switched off) with a part payment.
  const h = await register(premium);
  await confirm(h, { percentage: 5, pay: 'initial' });
  await confirm(h, { percentage: 0, pay: 'part' });
  // I: no discount, unpaid (balance only).
  await register(studio, [print]);

  // ---- Data, as the admin screen reads it ---------------------------------------------------
  const registrations = await all('registrations', '&expand=organization,course,level,package,session_type');
  const payments = await all('payments');
  const refunds = await all('refunds');
  const organizations = await all('organizations');
  const packages = await all('packages');
  const excelData = await send(api + '/student-excel', { token: admin });
  const payouts = await send(`${api}/mua-payouts?from=${manilaDay}&to=${manilaDay}`, { token: admin });
  const performance = await send(`${api}/mua-performance?date=${manilaDay}`, { token: admin });
  if (!payouts.lines.length) fail('MUA Payouts', 'no artist line for the completed makeup service (case D)');
  const dLine = payouts.lines.find((line) => line.jobId === d.id);
  // The artist is paid the full price even though the client had a discount.
  if (dLine && Math.round(dLine.earned * 100) !== 45000) {
    fail('MUA Payouts', `case D artist earned ${dLine.earned}, expected the full ₱450`);
  }
  for (const reg of await all('registrations')) {
    if (reg.revenue_discount?.mua) fail('MUA discount', `job order ${reg.job_order_no || reg.id} has an MUA discount`);
  }

  vite = await (await import('vite')).createServer({
    root: repo, configFile: false, appType: 'custom', logLevel: 'silent', cacheDir: join(home, 'vite-cache'),
    optimizeDeps: { noDiscovery: true }, server: { middlewareMode: true, watch: null, ws: false },
  });
  const load = (path) => vite.ssrLoadModule(path);
  const { buildStudentWorkbook } = await load('/src/features/admin/studentExcel.ts');
  const { buildAudit } = await load('/src/features/admin/auditData.ts');
  const { buildAuditWorkbook } = await load('/src/features/admin/auditWorkbook.ts');
  const { addMuaPayoutSheets } = await load('/src/features/admin/muaPayoutSheets.ts');
  const { buildMuaWorkbook } = await load('/src/features/admin/muaPerformanceExport.ts');
  const { default: ExcelJS } = await import('exceljs');
  const { HyperFormula } = await import('hyperformula');

  // ---- Discount figures straight from the records --------------------------------------------
  const active = registrations.filter((reg) => reg.status !== 'cancelled');
  const net = (reg) => payments.filter((p) => p.registration === reg.id && (p.status || 'completed') === 'completed')
    .reduce((s, p) => s + cents(p.amount), 0) - refunds.filter((r) => r.registration === reg.id).reduce((s, r) => s + cents(r.amount), 0);
  const granted = (reg) => (reg.revenue_discount?.studio ?? 0) + (reg.revenue_discount?.mua ?? 0);
  const expected = {
    due: active.reduce((s, reg) => s + cents(reg.total_amount), 0),
    discount: active.reduce((s, reg) => s + granted(reg), 0),
    credit: active.reduce((s, reg) => s + Math.min(granted(reg), Math.max(0, cents(reg.total_amount) + granted(reg) - net(reg))), 0),
  };
  log('records:', registrations.length, 'job orders,', payments.length, 'payments,', refunds.length, 'refunds; expected',
    JSON.stringify(Object.fromEntries(Object.entries(expected).map(([k, v]) => [k, v / 100]))));

  // ---- Recalculation -------------------------------------------------------------------------
  /** Writes the workbook, reads it back, recalculates it; returns a reader of recalculated values. */
  async function recalculate(label, built) {
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(await built.xlsx.writeBuffer());
    const sheets = {};
    const formulas = [];
    for (const sheet of book.worksheets) {
      const rows = [];
      sheet.eachRow({ includeEmpty: true }, (row, r) => {
        const cells = [];
        row.eachCell({ includeEmpty: true }, (cell, c) => {
          const v = cell.value;
          let out = null;
          if (v === null || v === undefined) out = null;
          else if (typeof v === 'number' || typeof v === 'boolean') out = v;
          else if (typeof v === 'string') out = v.startsWith('=') ? "'" + v : v;
          else if (v instanceof Date) out = (v.getTime() - Date.UTC(1899, 11, 30)) / 86400000;
          else if (typeof v === 'object' && ('formula' in v || 'sharedFormula' in v)) {
            const formula = cell.formula;
            if (!formula) fail(label, `${sheet.name}!${cell.address} has a shared formula the check can't read`);
            out = '=' + formula;
            formulas.push({ sheet: sheet.name, address: cell.address, row: r - 1, col: c - 1, result: v.result, formula });
          } else if (typeof v === 'object' && 'richText' in v) out = v.richText.map((t) => t.text).join('');
          else if (typeof v === 'object' && 'text' in v) out = v.text;
          else if (typeof v === 'object' && 'error' in v) out = v.error;
          cells[c - 1] = out;
        });
        rows[r - 1] = cells;
      });
      sheets[sheet.name] = Array.from(rows, (row) => Array.from(row ?? [], (cell) => cell ?? null));
    }
    const hf = HyperFormula.buildFromSheets(sheets, { licenseKey: 'gpl-v3' });
    const value = (sheet, row, col) => hf.getCellValue({ sheet: hf.getSheetId(sheet), row, col });
    let checked = 0;
    for (const f of formulas) {
      const got = value(f.sheet, f.row, f.col);
      const where = `${label} ${f.sheet}!${f.address} (=${f.formula})`;
      if (got && typeof got === 'object' && 'type' in got) { fail(where, `formula error ${got.type} ${got.message ?? ''}`); continue; }
      // ExcelJS writes no cached value for a result of 0, so it reads back empty: that means 0.
      const saved = f.result === undefined || f.result === null ? 0
        : typeof f.result === 'object' && 'error' in f.result ? f.result.error : f.result;
      const same = typeof got === 'number' && typeof saved === 'number' ? Math.abs(got - saved) < 0.005 : got === saved;
      if (!same) fail(where, `saved ${JSON.stringify(saved)}, recalculates to ${JSON.stringify(got)}`);
      checked += 1;
    }
    log(`  ${label}: ${book.worksheets.length} sheets (${book.worksheets.map((s) => s.name).join(', ')}), ${checked} formulas recalculated`);
    return { book, value, sheets };
  }
  const near = (a, b) => Math.abs(a - b) < 0.005;
  const num = (v) => (typeof v === 'number' ? v : 0);

  // ---- Overall Excel -------------------------------------------------------------------------
  for (const [label, scope] of [['Overall by level', { kind: 'levels' }], ['Overall master', { kind: 'master' }],
    ['Overall school', { kind: 'school', schoolId: school.id }]]) {
    const { book, value, sheets } = await recalculate(label, buildStudentWorkbook(excelData, scope));
    const muaSheets = ['MUA SUMMARY', 'MUA WARDROBE & SHARED'];
    for (const name of muaSheets) if (scope.kind !== 'levels' && !book.getWorksheet(name)) fail(label, `missing the ${name} sheet`);
    let dueTotal = 0, discountTotal = 0, creditTotal = 0;
    for (const sheet of book.worksheets) {
      const header = sheets[sheet.name][0] ?? [];
      const at = (name) => header.indexOf(name);
      if (at('TOTAL DUE') < 0 || sheet.name === 'CANCELLED') continue;
      const first = at('PACKAGE CODE') + 1;
      const [due, total, credit, operational, discount] = ['TOTAL DUE', 'TOTAL PAYMENT (less refunds)', 'DISCOUNT CREDIT', 'OPERATIONAL COLLECTED', 'DISCOUNT'].map(at);
      for (let r = 1; r < sheets[sheet.name].length; r++) {
        const row = sheets[sheet.name][r] ?? [];
        const name = String(row[at('NAME')] ?? '');
        // Client rows (unpaid ones have no job order number yet); level headings carry no money.
        if (!name || /SUBTOTAL|TOTAL AMOUNT|NO\. (STUDENTS|CLIENTS)/.test(name)) continue;
        // Package + add-ons + other fees − discount = TOTAL DUE on every client row.
        let charges = 0;
        for (let col = first; col < due; col++) charges += num(value(sheet.name, r, col));
        const rowDue = num(value(sheet.name, r, due));
        if (!near(charges, rowDue)) fail(`${label} ${sheet.name} row ${r + 1}`, `charges add up to ${charges}, TOTAL DUE is ${rowDue}`);
        if (!near(num(value(sheet.name, r, operational)), num(value(sheet.name, r, total)) + num(value(sheet.name, r, credit)))) {
          fail(`${label} ${sheet.name} row ${r + 1}`, 'OPERATIONAL COLLECTED ≠ TOTAL PAYMENT + DISCOUNT CREDIT');
        }
        dueTotal += rowDue;
        creditTotal += num(value(sheet.name, r, credit));
        if (discount >= 0) discountTotal -= num(value(sheet.name, r, discount));
      }
    }
    if (!near(dueTotal, expected.due / 100)) fail(label, `TOTAL DUE over client rows is ${dueTotal}, the active job orders total ${expected.due / 100}`);
    if (!near(discountTotal, expected.discount / 100)) fail(label, `DISCOUNT column totals ${discountTotal}, the job orders' discounts total ${expected.discount / 100}`);
    if (!near(creditTotal, expected.credit / 100)) fail(label, `DISCOUNT CREDIT totals ${creditTotal}, expected ${expected.credit / 100}`);
    const summary = sheets.SUMMARY;
    if (summary) {
      const r = summary.findIndex((row) => String(row?.[1] ?? '').startsWith('Check: TOTAL DUE'));
      const due = summary[4].indexOf('TOTAL DUE');
      if (r < 0) fail(label, 'SUMMARY has no check line');
      else if (!near(num(value('SUMMARY', r, due)), 0)) fail(label, `SUMMARY check is ${value('SUMMARY', r, due)}, must be 0`);
    }
  }

  // ---- Audit Export --------------------------------------------------------------------------
  const todayStart = new Date(`${manilaDay}T00:00:00+08:00`).toISOString().replace('T', ' ');
  for (const [label, since] of [['Audit all time', undefined], ['Audit today', todayStart]]) {
    const audit = buildAudit(registrations, payments, refunds, since, { organizations, packages });
    if (!audit.ordersBalanced || !audit.paymentsBalanced) fail(label, `buildAudit does not balance (orders ${audit.ordersBalanced}, payments ${audit.paymentsBalanced})`);
    const { value, sheets } = await recalculate(label, buildAuditWorkbook(audit, { label, since }));
    const summary = sheets.Summary;
    for (let r = 0; r < summary.length; r++) {
      const cell = value('Summary', r, 2);
      if (typeof cell === 'string' && cell.startsWith('CHECK')) fail(label, `Summary row ${r + 1} "${summary[r][0]}": ${cell} (difference ${value('Summary', r, 1)})`);
    }
    if (since === undefined && !near(audit.totals.discountCredits, expected.credit / 100)) {
      fail(label, `DISCOUNT CREDITS ${audit.totals.discountCredits}, expected ${expected.credit / 100}`);
    }
    // Breakdowns: billed − discount − collected − still to settle = 0 per group (all time only:
    // a period mixes orders made then with payments on earlier ones).
    if (since === undefined) {
      for (const group of [...audit.bySchool, ...audit.byPackage]) {
        // Held cash (mixed orders not yet fully paid) is its own column, outside this identity.
        const gap = group.billed - group.discount - group.collected - group.balance;
        if (!near(gap, 0)) fail(label, `${group.code}: billed − discount − collected − balance = ${gap}`);
        const muaGap = group.muaBilled - group.muaDiscount - group.muaCollected - group.muaBalance;
        if (!near(muaGap, 0)) fail(label, `${group.code}: MUA billed − discount − collected − balance = ${muaGap}`);
      }
    }
  }

  // ---- MUA Payouts and MUA Performance -------------------------------------------------------
  const payoutBook = new ExcelJS.Workbook();
  const used = new Set();
  addMuaPayoutSheets(payoutBook, { ...payouts, period: manilaDay, name: (wanted) => {
    let candidate = wanted.slice(0, 28);
    for (let n = 2; used.has(candidate.toLowerCase()); n++) candidate = `${wanted.slice(0, 26)} ${n}`;
    used.add(candidate.toLowerCase());
    return candidate;
  } });
  await recalculate('MUA Payouts', payoutBook);
  await recalculate('MUA Performance earnings', await buildMuaWorkbook(performance, 'earnings', payouts));
  await recalculate('MUA Performance', await buildMuaWorkbook(performance, 'performance'));
}
