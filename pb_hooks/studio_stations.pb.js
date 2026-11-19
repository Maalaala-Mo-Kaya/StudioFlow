/// <reference path="../pb_data/types.d.ts" />

routerAdd("GET", "/api/studioflow/queue-count", (e) => {
  const { photoQueue } = require(__hooks + "/studio_workflow.js");
  return e.json(200, { count: e.app.countRecords("registrations", $dbx.exp(photoQueue)) });
});

routerAdd("GET", "/api/studioflow/makeup", (e) => {
  const workflow = require(__hooks + "/studio_workflow.js");
  const account = workflow.staff(e.app, e.auth, ["admin", "mua"]);
  const admin = account.getString("role") === "admin";
  const waiting = "status = 'paid' && paid_amount > 0 && makeup_service != '' && makeup_state = ''";
  const assigned = "(makeup_state = 'claimed' || makeup_state = 'in_progress')";
  const filter = admin ? `(${waiting}) || ${assigned} || makeup_state = 'completed'`
    : `(${waiting}) || (${assigned} && makeup_artist = {:artist})`;
  const registrations = e.app.findRecordsByFilter("registrations", filter, "created,queue_number,id", 0, 0, { artist: account.id });
  e.response.header().set("Cache-Control", "private, no-store");
  return e.json(200, registrations.map((record) => {
    const artistId = record.getString("makeup_artist");
    const artist = admin ? workflow.catalogItem(e.app, "users", artistId) : null;
    return {
      ...workflow.summary(e.app, record),
      service: record.getString("makeup_service"),
      services: workflow.makeupServices(record),
      state: record.getString("makeup_state") || "waiting",
      version: record.getInt("makeup_version"),
      artistId,
      artistName: artist?.getString("name") || artist?.getString("username") || artistId,
      completedAt: record.getString("makeup_completed_at"),
      eligible: record.getString("status") === "paid" && record.getFloat("paid_amount") > 0 && !!record.getString("makeup_service"),
    };
  }));
}, $apis.requireAuth("users"));

routerAdd("POST", "/api/studioflow/makeup/{id}/{action}", (e) => {
  const workflow = require(__hooks + "/studio_workflow.js");
  const action = e.request.pathValue("action");
  if (!["claim", "start", "complete", "release"].includes(action)) throw new NotFoundError();
  const input = new DynamicModel({ artistId: "", version: "", onBehalf: false });
  e.bindBody(input);
  // Older MUA tabs omit the version. Treat those requests as version zero so
  // they can never act on a new assignment after an admin release.
  const requestedVersion = input.version || (action === "release" || input.onBehalf ? "" : "0");
  if (!/^\d+$/.test(requestedVersion)) {
    throw new BadRequestError("Reload the makeup queue page before updating this assignment.");
  }
  const stateAfter = workflow.withRegistration(e.app, e.request.pathValue("id"), (tx, record) => {
    const onBehalf = input.onBehalf && (action === "start" || action === "complete");
    const account = workflow.staff(tx, e.auth, action === "release" || onBehalf ? ["admin"] : ["mua"]);
    const state = record.getString("makeup_state");
    const artistId = record.getString("makeup_artist");
    const version = record.getInt("makeup_version");
    if (requestedVersion !== String(version)) {
      throw new ApiError(409, "The assignment changed. Reload the makeup queue page and try again.");
    }
    if (action === "release") {
      if (!input.artistId) throw new BadRequestError("The current assignment is required.");
      if (workflow.activeMakeup.includes(state) && artistId === input.artistId) {
        record.set("makeup_state", "");
        record.set("makeup_artist", "");
        record.set("makeup_version", version + 1);
        tx.save(record);
        return "waiting";
      }
      throw new ApiError(409, "The assignment changed. Refresh the queue and try again.");
    }
    if (action === "claim" && artistId && artistId !== account.id) {
      throw new ApiError(409, "Student already assigned", {
        reason: new ValidationError("already_assigned", "Another makeup artist claimed this student."),
      });
    }
    if (onBehalf && (!input.artistId || input.artistId !== artistId)) {
      throw new ApiError(409, "Confirm the currently assigned MUA before recording this action.");
    }
    if (!onBehalf && action !== "claim" && artistId !== account.id) {
      throw new ForbiddenError("Only the assigned makeup artist can update this student.");
    }
    if (state === "completed" && action === "complete") return state;
    if (record.getString("status") !== "paid" || record.getFloat("paid_amount") <= 0 || !record.getString("makeup_service")) {
      throw new ApiError(409, "This student is no longer eligible for makeup or grooming.");
    }
    if (action === "claim") {
      if (artistId === account.id && workflow.activeMakeup.includes(state)) return state;
      if (state || artistId) throw new ApiError(409, "This student is no longer waiting.");
      record.set("makeup_artist", account.id);
      record.set("makeup_state", "claimed");
    } else if (action === "start") {
      if (state === "in_progress") return state;
      if (state !== "claimed") throw new ApiError(409, "The assignment is no longer waiting to start.");
      record.set("makeup_state", "in_progress");
    } else {
      if (state !== "in_progress") throw new ApiError(409, "Start makeup or grooming before marking it complete.");
      const artist = onBehalf ? workflow.catalogItem(tx, "users", artistId) : account;
      if (!artist || artist.getString("role") !== "mua") {
        throw new ApiError(409, "The performing MUA could not be verified.");
      }
      const completedAt = new Date().toISOString();
      require(__hooks + "/studio_mua_reporting.js").logCompletion(tx, record, artist, account, completedAt);
      record.set("makeup_state", "completed");
      record.set("makeup_completed_at", completedAt);
    }
    tx.save(record);
    return record.getString("makeup_state");
  });
  return e.json(200, { state: stateAfter });
}, $apis.requireAuth("users"));

onRecordAfterCreateSuccess((e) => {
  e.next();
  require(__hooks + "/studio_station_events.js").notify(e.app);
}, "registrations", "mua_service_types");

onRecordAfterUpdateSuccess((e) => {
  e.next();
  require(__hooks + "/studio_station_events.js").notify(e.app);
}, "registrations", "packages", "add_ons", "users", "mua_service_types");

onRecordAfterDeleteSuccess((e) => {
  e.next();
  require(__hooks + "/studio_station_events.js").notify(e.app);
}, "registrations", "packages", "users");
