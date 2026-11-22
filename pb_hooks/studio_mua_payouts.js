// MUA payouts. The client pays the studio everything; the studio pays the makeup artists.
// - Artist lines: each logged MUA completion (studio_mua_reporting.logCompletion) with what the artist
//   earned for it (sold price, less its MUA discount share, plus later adjustments), whether the client
//   has paid the order in full, and whether the studio already paid it out (a payout, MP-000001…).
// - Shared lines: MUA charges that are not a service (an MUA item without "MUA service", e.g. the
//   automatic Wardrobe add-on). That money belongs to the MUA team as a whole and is split outside the
//   system, so it is listed as a pool and never credited to one artist.
// When the studio pays an artist is its choice (after the gig, after an event): earnings count from the
// completion, and the client's payment status is shown beside each line.
const workflow = require(__hooks + "/studio_workflow.js");
const earnings = require(__hooks + "/studio_mua_earnings.js");
const { cents, savedAddOns } = require(__hooks + "/studio_pricing.js");

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function validDay(value) {
  if (!DAY.test(value || "")) return false;
  const instant = new Date(value + "T00:00:00Z");
  return Number.isFinite(instant.getTime()) && instant.toISOString().slice(0, 10) === value;
}

/** Manila day → UTC bounds as PocketBase stores datetimes ("2026-11-21 16:00:00.000Z"). */
function dayStart(day) {
  return new Date(Date.parse(day + "T00:00:00+08:00")).toISOString().replace("T", " ");
}
function dayAfter(day) {
  return new Date(Date.parse(day + "T00:00:00+08:00") + 86400000).toISOString().replace("T", " ");
}
function studioDate(value) {
  const time = Date.parse(String(value).replace(" ", "T"));
  return Number.isFinite(time) ? new Date(time + 8 * 3600000).toISOString().slice(0, 10) : "";
}

function makeLookups(app) {
  const cache = new Map();
  const find = (collection, id) => {
    if (!id) return null;
    const key = collection + ":" + id;
    if (!cache.has(key)) cache.set(key, workflow.catalogItem(app, collection, id));
    return cache.get(key);
  };
  const order = (id) => {
    const job = find("registrations", id);
    if (!job) return { jobId: id, jobOrder: "", client: "Removed job order", group: "", status: "", paidInFull: false, balance: 0 };
    const walkin = job.getString("client_kind") === "walkin";
    const group = walkin
      ? "Walk-in" + (find("session_types", job.getString("session_type")) ? " · " + find("session_types", job.getString("session_type")).getString("name") : "")
      : find("organizations", job.getString("organization"))?.getString("code") || find("organizations", job.getString("organization"))?.getString("name") || "";
    const balance = cents(job.getFloat("balance"));
    return {
      jobId: job.id, jobOrder: job.getString("job_order_no"),
      client: [job.getString("family_name") + ",", job.getString("given_name")].filter(Boolean).join(" "),
      group, status: job.getString("status"),
      paidInFull: job.getString("status") !== "cancelled" && balance === 0 && job.getString("payment_status") === "fully_paid",
      balance: balance / 100,
    };
  };
  return { find, order };
}

/** Payouts by id (voided ones included, so a line can say its payout was voided). */
function payoutsById(app) {
  return new Map(app.findRecordsByFilter("mua_payouts", "id != ''", "created", 0, 0).map((record) => [record.id, record]));
}

/** Net earnings of a completion in centavos (basis + adjustments), and why it needs review, if it does. */
function earned(log) {
  const basis = earnings.basisFor(log);
  const adjustments = earnings.adjustmentsFor(log);
  return {
    amount: basis.earned + adjustments.reduce((sum, entry) => sum + entry.amount, 0),
    review: basis.kind === "review" ? basis.reviewReason || "Needs review" : "",
  };
}

function artistLine(log, lookups, payouts) {
  const { amount, review } = earned(log);
  const payout = payouts.get(log.getString("payout_id"));
  const live = payout && !payout.getString("voided_at");
  return {
    completionId: log.id,
    artistId: log.getString("artist_id"), artistName: log.getString("artist_name"),
    date: log.getString("local_date"), completedAt: log.getString("completed_at"),
    service: log.getString("service_name"),
    earned: amount / 100, review,
    payoutId: live ? payout.id : "", payoutNo: live ? payout.getString("payout_no") : "",
    paidAt: live ? payout.getString("paid_at") : "",
    ...lookups.order(log.getString("job_id")),
  };
}

/** A job order's shared MUA charges (MUA items that are not a service). Cancelled orders have none. */
function sharedLines(job, lookups) {
  if (job.getString("status") === "cancelled" || !job.getString("job_order_no")) return [];
  const lines = [];
  const pkg = workflow.json(job, "package_snapshot");
  const isShared = (collection, id) => !lookups.find(collection, id)?.getBool("requires_mua");
  if (pkg?.revenue_category === "mua" && isShared("packages", pkg.id)) lines.push({ item: pkg.name, amount: cents(pkg.amount) });
  for (const item of savedAddOns(job)) {
    if (item.revenue_category === "mua" && isShared("add_ons", item.id)) {
      const quantity = Number.isSafeInteger(item.quantity) && item.quantity > 0 ? item.quantity : 1;
      lines.push({ item: item.name, amount: cents(item.amount) * quantity });
    }
  }
  const info = lookups.order(job.id);
  const date = studioDate(job.getString("created"));
  return lines.map((line) => ({ ...info, date, item: line.item, amount: line.amount / 100 }));
}

function payoutSummary(record) {
  return {
    id: record.id, payoutNo: record.getString("payout_no"),
    artistId: record.getString("artist_id"), artistName: record.getString("artist_name"),
    from: record.getString("period_from"), to: record.getString("period_to"),
    amount: record.getFloat("amount"), lines: workflow.json(record, "lines") || [],
    note: record.getString("note"), paidBy: record.getString("paid_by"), paidAt: record.getString("paid_at"),
    voidedAt: record.getString("voided_at"), voidedBy: record.getString("voided_by"), voidReason: record.getString("void_reason"),
  };
}

/** Payout report for completions on Manila days from..to (inclusive), shared charges on orders made then. */
function periodReport(app, from, to) {
  const lookups = makeLookups(app);
  const payouts = payoutsById(app);
  const logs = app.findRecordsByFilter("mua_completions", "local_date >= {:from} && local_date <= {:to}",
    "local_date,completed_at,id", 0, 0, { from, to });
  const jobs = app.findRecordsByFilter("registrations",
    "deleted_by_id = '' && job_order_no != '' && created >= {:start} && created < {:end}",
    "job_order_no,id", 0, 0, { start: dayStart(from), end: dayAfter(to) });
  return {
    from, to,
    lines: logs.map((log) => artistLine(log, lookups, payouts)),
    shared: jobs.flatMap((job) => sharedLines(job, lookups)),
    payouts: [...payouts.values()].filter((record) => {
      const paid = studioDate(record.getString("paid_at"));
      return paid >= from && paid <= to;
    }).map(payoutSummary),
  };
}

/** The same lines for a set of job orders (the master Excel's MUA pages follow its own scope). */
function ordersReport(app, jobIds) {
  const lookups = makeLookups(app);
  const payouts = payoutsById(app);
  const lines = [];
  const shared = [];
  for (const id of jobIds) {
    for (const log of app.findRecordsByFilter("mua_completions", "job_id = {:id}", "completed_at,id", 0, 0, { id })) {
      lines.push(artistLine(log, lookups, payouts));
    }
    const job = lookups.find("registrations", id);
    if (job) shared.push(...sharedLines(job, lookups));
  }
  return { lines, shared };
}

module.exports = { earned, ordersReport, payoutSummary, periodReport, studioDate, validDay };
