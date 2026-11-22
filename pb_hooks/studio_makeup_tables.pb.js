/// <reference path="../pb_data/types.d.ts" />

routerAdd("GET", "/api/studioflow/makeup-completed", (e) => {
  const workflow = require(__hooks + "/studio_workflow.js");
  const team = require(__hooks + "/studio_mua_team.js");
  const account = workflow.staff(e.app, e.auth, ["admin", "mua"]);
  const { manage } = team.permissions(team.settings(e.app), account);
  const date = e.request.url.query().get("date");
  const midnight = new Date(date + "T00:00:00+08:00");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(midnight.getTime())
    || require(__hooks + "/studio_mua_reporting.js").studioDate(midnight) !== date) {
    throw new BadRequestError("Choose a valid completion date.");
  }
  const artist = manage ? "" : " && artist_id = {:artist}";
  const groups = new Map();
  const keyFor = (id, artistId, completedAt) => JSON.stringify([id, artistId, Date.parse(completedAt.replace(" ", "T"))]);
  for (const log of e.app.findRecordsByFilter("mua_completions", "local_date = {:date}" + artist, "-completed_at,id", 0, 0,
    { date, artist: account.id })) {
    const id = log.getString("job_id");
    const artistId = log.getString("artist_id");
    const completedAt = log.getString("completed_at");
    const rowKey = keyFor(id, artistId, completedAt);
    if (!groups.has(rowKey)) groups.set(rowKey, {
      rowKey, id, name: log.getString("student_name"), studentId: log.getString("student_id"),
      jobOrder: log.getString("job_order"), packageName: log.getString("package_name"), artistId,
      artistName: log.getString("artist_name"), completedAt, state: "completed", services: [],
    });
    const row = groups.get(rowKey);
    const sources = workflow.json(log, "sources");
    if (Array.isArray(sources) && sources.length) row.services.push(...sources);
    else row.services.push({ source: "legacy", name: log.getString("service_name") });
  }

  // Older jobs can have a completed registration but no matching service log.
  const from = midnight.toISOString().replace("T", " ");
  const until = new Date(midnight.getTime() + 86400000).toISOString().replace("T", " ");
  const filter = "makeup_state = 'completed' && makeup_completed_at >= {:from} && makeup_completed_at < {:until}"
    + (manage ? "" : " && makeup_artist = {:artist}");
  for (const job of e.app.findRecordsByFilter("registrations", filter, "-makeup_completed_at,id", 0, 0,
    { from, until, artist: account.id })) {
    const artistId = job.getString("makeup_artist");
    const completedAt = job.getString("makeup_completed_at");
    const rowKey = keyFor(job.id, artistId, completedAt);
    if (groups.has(rowKey)) continue;
    const performer = workflow.catalogItem(e.app, "users", artistId);
    groups.set(rowKey, {
      ...workflow.summary(e.app, job), rowKey, artistId, completedAt, state: "completed",
      artistName: performer ? require(__hooks + "/studio_ledger.js").actorName(performer) : "",
      service: job.getString("makeup_service"), services: workflow.makeupServices(job),
    });
  }
  e.response.header().set("Cache-Control", "private, no-store");
  return e.json(200, Array.from(groups.values()));
}, $apis.requireAuth("users"));

routerAdd("GET", "/api/studioflow/makeup/{id}/details", (e) => {
  const workflow = require(__hooks + "/studio_workflow.js");
  const team = require(__hooks + "/studio_mua_team.js");
  const account = workflow.staff(e.app, e.auth, ["admin", "mua"]);
  const { manage, canClaim } = team.permissions(team.settings(e.app), account);
  const id = e.request.pathValue("id");
  const job = workflow.catalogItem(e.app, "registrations", id);
  if (job?.getString("deleted_by_id")) throw new NotFoundError("Makeup client not found.");
  const state = job?.getString("makeup_state");
  const eligible = job && job.getString("status") === "paid" && workflow.paymentEligible(job) && !!job.getString("makeup_service");
  const own = job?.getString("makeup_artist") === account.id && (state === "completed"
    || (workflow.activeMakeup.includes(state) && job.getString("status") !== "cancelled"));
  const hasCompletion = () => e.app.findRecordsByFilter("mua_completions",
    "job_id = {:id}" + (manage ? "" : " && artist_id = {:artist}"), "", 1, 0, { id, artist: account.id }).length > 0;
  if (!(manage && (state || eligible)) && !own && !(canClaim && eligible && !state) && !hasCompletion()) {
    throw new NotFoundError("Makeup client not found.");
  }
  // Management retains the full assignment timeline. Artists see only events for their own work.
  const history = e.app.findRecordsByFilter("mua_assignment_events",
    "job_id = {:id}" + (manage ? "" : " && (artist_id = {:artist} || previous_artist_id = {:artist})"),
    "-created,-version,-id", 0, 0, { id, artist: account.id }).map((event) => ({
      id: event.id, action: event.getString("action"), artist: event.getString("artist_name"),
      actor: event.getString("actor_name"), at: event.getString("created"),
    }));
  const details = job ? {
    ...workflow.summary(e.app, job),
    level: workflow.catalogItem(e.app, "levels", job.getString("level"))?.getString("name") || "",
    paymentStatus: job.getString("payment_status"),
    paymentConfirmed: workflow.paymentEligible(job),
    look: job.getString("makeup_look"), lookNote: job.getString("makeup_look_note"),
  } : null;
  e.response.header().set("Cache-Control", "private, no-store");
  return e.json(200, { details, history });
}, $apis.requireAuth("users"));
