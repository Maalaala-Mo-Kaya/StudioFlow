const workflow = require(__hooks + "/studio_workflow.js");
const earnings = require(__hooks + "/studio_mua_earnings.js");

function studioDate(instant) {
  // Asia/Manila uses UTC+08:00 for all dates StudioFlow records.
  return new Date(new Date(instant).getTime() + 8 * 3600000).toISOString().slice(0, 10);
}

function staffName(record) {
  return record.getString("name") || record.getString("username") || record.id;
}

// Which purchased service a completion came from (one add-on, the package, or an admin requirement).
function sourceKey(source) {
  return `${source?.source || ""}:${source?.id || source?.name || ""}`;
}

function uncreditedServices(app, job, before = "") {
  // A client can come back for more makeup (added later on the job order): credit only the services
  // not already logged for this job, so earlier work is never paid twice.
  const credited = new Set();
  const filter = "job_id = {:id}" + (before ? " && completed_at < {:before}" : "");
  for (const log of app.findRecordsByFilter("mua_completions", filter, "", 0, 0, { id: job.id, before })) {
    let sources;
    try { sources = JSON.parse(log.getString("sources") || "[]"); } catch (_) { sources = []; }
    for (const source of Array.isArray(sources) ? sources : []) credited.add(sourceKey(source));
  }
  return new Map(workflow.makeupServices(job)
    .filter((source) => !credited.has(sourceKey(source)))
    .map((source) => [earnings.serviceKey(source), source]));
}

function logCompletion(app, job, artist, actor, completedAt) {
  const basisForService = earnings.purchasedEarnings(job);
  const services = uncreditedServices(app, job);
  const collection = app.findCollectionByNameOrId("mua_completions");
  const pkg = workflow.json(job, "package_snapshot");
  for (const [serviceId, source] of services) {
    const record = new Record(collection);
    const values = {
      job_id: job.id, job_order: job.getString("job_order_no"),
      student_id: job.getString("student_id"),
      student_name: ["given_name", "middle_name", "family_name"].map((key) => job.getString(key)).filter(Boolean).join(" "),
      artist_id: artist.id, artist_name: staffName(artist),
      actor_id: actor.id, actor_name: staffName(actor), actor_role: actor.getString("role"),
      service_id: serviceId, service_name: source.name, sources: [source],
      package_id: pkg?.id || job.getString("package"), package_name: pkg?.name || "",
      earnings_basis: basisForService(source),
      local_date: studioDate(completedAt), completed_at: completedAt,
    };
    for (const [field, value] of Object.entries(values)) record.set(field, value);
    app.save(record);
  }
}

function artistRow(id) {
  return { id, jobs: new Set(), counts: {}, earnings: {}, totalEarnings: 0, totalServices: 0, details: [] };
}

function dailyReport(app, date, today, includeAudit = false, roster) {
  const columns = new Map();
  const artists = new Map();
  const allJobs = new Set();
  const totals = {};
  const eventCache = new Map();
  const logs = app.findRecordsByFilter("mua_completions", "local_date = {:date}", "completed_at,id", 0, 0, { date });
  for (const log of logs) {
    const id = log.getString("artist_id");
    if (roster && !roster.has(id)) continue;
    const basis = earnings.basisFor(log);
    const adjustments = earnings.adjustmentsFor(log);
    const unmatched = basis.kind === "historical" && !basis.groupKey;
    const serviceId = basis.groupKey || (unmatched ? "historical:" : "") + log.getString("service_id");
    const serviceName = log.getString("service_name");
    const jobId = log.getString("job_id");
    if (includeAudit && !eventCache.has(jobId)) eventCache.set(jobId, earnings.financialEvents(app, jobId));
    const pendingReview = (eventCache.get(jobId) || []).filter((event) =>
      !adjustments.some((entry) => entry.kind === event.kind && entry.reference === event.reference));
    columns.set(serviceId, unmatched ? serviceName + " (historical)" : serviceName);
    const row = artists.get(id) || artistRow(id);
    row.name = log.getString("artist_name");
    row.jobs.add(jobId);
    row.counts[serviceId] = (row.counts[serviceId] || 0) + basis.quantity;
    row.totalServices += basis.quantity;
    const earned = basis.earned + adjustments.reduce((sum, entry) => sum + entry.amount, 0);
    row.earnings[serviceId] = (row.earnings[serviceId] || 0) + earned;
    row.totalEarnings += earned;
    if (includeAudit) row.details.push({
      id: log.id, jobId, jobOrder: log.getString("job_order"), studentId: log.getString("student_id"),
      studentName: log.getString("student_name"), artistName: row.name,
      actorId: log.getString("actor_id"), actorName: log.getString("actor_name"), actorRole: log.getString("actor_role"),
      serviceId, serviceName, sources: workflow.json(log, "sources"),
      packageId: log.getString("package_id"), packageName: log.getString("package_name"),
      completedAt: log.getString("completed_at"), basis, adjustments, earned, pendingReview,
      reviewReason: unmatched ? "Historical service has no unambiguous catalog match." : basis.reviewReason,
    });
    artists.set(id, row);
    allJobs.add(jobId);
    totals[serviceId] = (totals[serviceId] || 0) + basis.quantity;
  }
  if (date === today) {
    for (const [collection, source] of [["packages", "package"], ["add_ons", "add_on"]]) {
      const eligible = source === "add_on" ? "(requires_mua = true || default_when_no_mua = true)" : "requires_mua = true";
      for (const item of app.findRecordsByFilter(collection, "is_active = true && " + eligible, "name", 0, 0)) {
        const service = workflow.serviceRequirement(item, source);
        if (service) columns.set(earnings.serviceKey(service), service.name);
      }
    }
    for (const artist of roster?.values() || app.findRecordsByFilter("users", "role = 'mua'", "name,id", 0, 0)) {
      const row = artists.get(artist.id) || artistRow(artist.id);
      row.name = staffName(artist);
      artists.set(artist.id, row);
    }
  }
  return {
    date, today, columns: Array.from(columns, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)),
    rows: Array.from(artists.values(), ({ jobs, ...row }) => ({
      ...row, totalClients: jobs.size, totalEarnings: row.totalEarnings / 100,
      earnings: Object.fromEntries(Object.entries(row.earnings).map(([key, amount]) => [key, amount / 100])),
    }))
      .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)),
    totals, totalClients: allJobs.size, totalServices: Object.values(totals).reduce((sum, count) => sum + count, 0),
  };
}

module.exports = { dailyReport, logCompletion, studioDate, uncreditedServices };
