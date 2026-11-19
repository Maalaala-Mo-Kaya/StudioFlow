const workflow = require(__hooks + "/studio_workflow.js");
const uncategorized = { id: "uncategorized", name: "Uncategorized" };

function studioDate(instant) {
  // Asia/Manila uses UTC+08:00 for all dates StudioFlow records.
  return new Date(new Date(instant).getTime() + 8 * 3600000).toISOString().slice(0, 10);
}

function staffName(record) {
  return record.getString("name") || record.getString("username") || record.id;
}

function logCompletion(app, job, artist, actor, completedAt) {
  const categorySources = new Map();
  for (const { types, ...source } of workflow.makeupServices(job)) {
    for (const type of types?.length ? types : [uncategorized]) {
      let entry = categorySources.get(type.id);
      if (!entry) {
        const category = type.id === uncategorized.id ? null : workflow.catalogItem(app, "mua_service_types", type.id);
        entry = { name: category?.getString("name") || type.name, sources: [] };
        categorySources.set(type.id, entry);
      }
      entry.sources.push(source);
    }
  }
  const collection = app.findCollectionByNameOrId("mua_completions");
  const pkg = workflow.json(job, "package_snapshot");
  for (const [serviceId, entry] of categorySources) {
    const record = new Record(collection);
    const values = {
      job_id: job.id, job_order: job.getString("job_order_no"),
      student_id: job.getString("student_id"),
      student_name: ["given_name", "middle_name", "family_name"].map((key) => job.getString(key)).filter(Boolean).join(" "),
      artist_id: artist.id, artist_name: staffName(artist),
      actor_id: actor.id, actor_name: staffName(actor), actor_role: actor.getString("role"),
      service_id: serviceId, service_name: entry.name, sources: entry.sources,
      package_id: pkg?.id || job.getString("package"), package_name: pkg?.name || "",
      local_date: studioDate(completedAt), completed_at: completedAt,
    };
    for (const [field, value] of Object.entries(values)) record.set(field, value);
    app.save(record);
  }
}

function dailyReport(app, date, today) {
  const columns = new Map();
  const artists = new Map();
  const allJobs = new Set();
  const totals = {};
  const logs = app.findRecordsByFilter("mua_completions", "local_date = {:date}", "completed_at,id", 0, 0, { date });
  for (const log of logs) {
    const id = log.getString("artist_id");
    const serviceId = log.getString("service_id");
    const serviceName = log.getString("service_name");
    const jobId = log.getString("job_id");
    columns.set(serviceId, serviceName);
    const row = artists.get(id) || { id, jobs: new Set(), counts: {}, details: [] };
    row.name = log.getString("artist_name");
    row.jobs.add(jobId);
    row.counts[serviceId] = (row.counts[serviceId] || 0) + 1;
    row.details.push({
      id: log.id, jobId, jobOrder: log.getString("job_order"), studentId: log.getString("student_id"),
      studentName: log.getString("student_name"), artistName: row.name,
      actorId: log.getString("actor_id"), actorName: log.getString("actor_name"), actorRole: log.getString("actor_role"),
      serviceId, serviceName, sources: workflow.json(log, "sources"),
      packageId: log.getString("package_id"), packageName: log.getString("package_name"),
      completedAt: log.getString("completed_at"),
    });
    artists.set(id, row);
    allJobs.add(jobId);
    totals[serviceId] = (totals[serviceId] || 0) + 1;
  }
  if (date === today) {
    for (const type of app.findRecordsByFilter("mua_service_types", "is_active = true", "name", 0, 0)) {
      columns.set(type.id, type.getString("name"));
    }
    for (const artist of app.findRecordsByFilter("users", "role = 'mua'", "name,id", 0, 0)) {
      const row = artists.get(artist.id) || { id: artist.id, jobs: new Set(), counts: {}, details: [] };
      row.name = staffName(artist);
      artists.set(artist.id, row);
    }
  }
  return {
    date, today, columns: Array.from(columns, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
    rows: Array.from(artists.values(), ({ jobs, ...row }) => ({ ...row, totalClients: jobs.size }))
      .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)),
    totals, totalClients: allJobs.size,
  };
}

module.exports = { dailyReport, logCompletion, studioDate };
