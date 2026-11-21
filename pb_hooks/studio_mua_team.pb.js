/// <reference path="../pb_data/types.d.ts" />

routerAdd("GET", "/api/studioflow/makeup-team", (e) => {
  const workflow = require(__hooks + "/studio_workflow.js");
  const { actorName } = require(__hooks + "/studio_ledger.js");
  const team = require(__hooks + "/studio_mua_team.js");
  const reporting = require(__hooks + "/studio_mua_reporting.js");
  let result;
  const today = reporting.studioDate(Date.now());
  const date = e.request.url.query().get("date") || today;
  const overview = e.request.url.query().get("overview") === "1";
  const instant = new Date(date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(instant.getTime())
    || instant.toISOString().slice(0, 10) !== date) throw new BadRequestError("Choose a valid report date.");
  e.app.runInTransaction((tx) => {
    const account = workflow.staff(tx, e.auth, ["admin", "mua"]);
    const perms = team.permissions(team.settings(tx), account);
    if (!perms.manage) {
      result = { manage: false, canClaim: perms.canClaim, date, today, artists: [] };
      return;
    }
    const staff = tx.findRecordsByFilter("users", "role = 'mua'", "name,id", 0, 0);
    const roster = overview ? new Map(staff.filter((artist) => !artist.getBool("disabled")).map((artist) => [artist.id, artist])) : undefined;
    const until = overview && date < today
      ? new Date(new Date(date + "T00:00:00+08:00").getTime() + 86400000).toISOString().replace("T", " ") : "";
    const assignments = until ? team.assignmentsBefore(tx, until) : overview && date > today ? []
      : tx.findRecordsByFilter("registrations",
        "status = 'paid' && " + workflow.paymentFilter + " && (makeup_state = 'claimed' || makeup_state = 'in_progress')", "", 0, 0)
        .map((job) => ({ id: job.id, artistId: job.getString("makeup_artist"), state: job.getString("makeup_state"), job }));
    const loads = new Map();
    const workload = { pending: 0, inProgress: 0 };
    for (const { artistId: id, state, job, id: jobId, serviceCount } of assignments) {
      if (roster && !roster.has(id)) continue;
      const counts = loads.get(id) || { pending: 0, inProgress: 0 };
      const key = state === "claimed" ? "pending" : "inProgress";
      counts[key]++;
      if (overview) {
        workload[key] += serviceCount || reporting.uncreditedServices(tx, job || tx.findRecordById("registrations", jobId), until).size;
      }
      loads.set(id, counts);
    }
    const report = reporting.dailyReport(tx, date, today, false, roster);
    const completed = new Map(report.rows.map((row) => [row.id, overview ? row.totalServices : row.totalClients]));
    const artists = (roster ? Array.from(roster.values()) : staff).map((artist) => ({
      id: artist.id, name: actorName(artist), disabled: artist.getBool("disabled"),
      parent: artist.id === perms.parentId, pending: loads.get(artist.id)?.pending || 0,
      inProgress: loads.get(artist.id)?.inProgress || 0, completed: completed.get(artist.id) || 0,
    }));
    result = { ...perms, date, today, artists, ...(overview ? { report, workload } : {}) };
  });
  e.response.header().set("Cache-Control", "private, no-store");
  return e.json(200, result);
}, $apis.requireAuth("users"));

routerAdd("POST", "/api/studioflow/makeup-team", (e) => {
  const workflow = require(__hooks + "/studio_workflow.js");
  const team = require(__hooks + "/studio_mua_team.js");
  const input = new DynamicModel({ parentId: "", allowSelf: false });
  e.bindBody(input);
  e.app.runInTransaction((tx) => {
    tx.db().newQuery("UPDATE studio_settings SET id = id WHERE key = 'main'").execute();
    workflow.staff(tx, e.auth, ["admin"]);
    if (input.parentId && !team.availableArtist(tx, input.parentId)) throw new BadRequestError("Select an enabled MUA account.");
    const config = team.settings(tx);
    config.set("mua_parent_id", input.parentId);
    config.set("mua_parent_accepts_clients", !!input.parentId && input.allowSelf);
    tx.save(config);
  });
  require(__hooks + "/studio_station_events.js").notify(e.app);
  return e.json(200, { saved: true });
}, $apis.requireAuth("users"));

onRecordUpdateRequest((e) => {
  for (const field of ["mua_parent_id", "mua_parent_accepts_clients"]) {
    if (field in (e.requestInfo().body || {})) throw new ForbiddenError("Use Staff Accounts to manage the MUA team.");
  }
  return e.next();
}, "studio_settings");
