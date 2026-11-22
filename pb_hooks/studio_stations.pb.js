/// <reference path="../pb_data/types.d.ts" />

routerAdd("GET", "/api/studioflow/queue-count", (e) => {
  const { photoQueue } = require(__hooks + "/studio_workflow.js");
  return e.json(200, { count: e.app.countRecords("registrations", $dbx.exp(photoQueue)) });
});

routerAdd("GET", "/api/studioflow/makeup", (e) => {
  const workflow = require(__hooks + "/studio_workflow.js");
  const team = require(__hooks + "/studio_mua_team.js");
  const account = workflow.staff(e.app, e.auth, ["admin", "mua"]);
  const perms = team.permissions(team.settings(e.app), account);
  const waiting = "status = 'paid' && " + workflow.paymentFilter + " && makeup_service != '' && makeup_state = ''";
  const assigned = "(makeup_state = 'claimed' || makeup_state = 'in_progress')";
  const completed = e.request.url.query().get("completed");
  const showCompleted = completed !== "0" && (!perms.canClaim || completed === "1");
  const personal = `makeup_artist = {:artist} && ((${assigned} && status != 'cancelled')${showCompleted ? " || makeup_state = 'completed'" : ""})`;
  const filter = perms.manage ? `(${waiting}) || ${assigned}${completed !== "0" ? " || makeup_state = 'completed'" : ""}`
    : perms.canClaim ? `(${waiting}) || (${personal})` : personal;
  const registrations = e.app.findRecordsByFilter("registrations", filter, "created,queue_number,id", 0, 0, { artist: account.id });
  e.response.header().set("Cache-Control", "private, no-store");
  return e.json(200, registrations.map((record) => {
    const artistId = record.getString("makeup_artist");
    const artist = perms.manage ? workflow.catalogItem(e.app, "users", artistId) : null;
    return {
      ...workflow.summary(e.app, record),
      service: record.getString("makeup_service"),
      services: workflow.makeupServices(record),
      // The client's preferred look and note from the kiosk (empty when not asked).
      look: record.getString("makeup_look"),
      lookNote: record.getString("makeup_look_note"),
      state: record.getString("makeup_state") || "waiting",
      version: record.getInt("makeup_version"),
      artistId,
      artistName: artist?.getString("name") || artist?.getString("username") || (artistId === account.id
        ? account.getString("name") || account.getString("username") : artistId),
      completedAt: record.getString("makeup_completed_at"),
      eligible: record.getString("status") === "paid" && workflow.paymentEligible(record) && !!record.getString("makeup_service"),
    };
  }));
}, $apis.requireAuth("users"));

routerAdd("POST", "/api/studioflow/makeup/{id}/{action}", (e) => {
  const workflow = require(__hooks + "/studio_workflow.js");
  const team = require(__hooks + "/studio_mua_team.js");
  const action = e.request.pathValue("action");
  if (!["assign", "claim", "start", "complete", "release"].includes(action)) throw new NotFoundError();
  const input = new DynamicModel({ artistId: "", version: "", onBehalf: false });
  e.bindBody(input);
  // Older MUA tabs omit the version. Treat those requests as version zero so
  // they can never act on a new assignment after an admin release.
  const requestedVersion = input.version || (["release", "assign"].includes(action) || input.onBehalf ? "" : "0");
  if (!/^\d+$/.test(requestedVersion)) {
    throw new BadRequestError("Reload the makeup queue page before updating this assignment.");
  }
  const stateAfter = workflow.withRegistration(e.app, e.request.pathValue("id"), (tx, record) => {
    const onBehalf = input.onBehalf && (action === "start" || action === "complete");
    const managerAction = ["assign", "release"].includes(action);
    const account = workflow.staff(tx, e.auth, onBehalf ? ["admin"] : managerAction ? ["admin", "mua"] : ["mua"]);
    const perms = team.permissions(team.settings(tx), account);
    if (managerAction && !perms.manage) throw new ForbiddenError("Only Admin or the Parent MUA can manage assignments.");
    if (action === "claim" && !perms.canClaim) throw new ForbiddenError("Clients must be assigned from the team queue.");
    const state = record.getString("makeup_state");
    const artistId = record.getString("makeup_artist");
    const version = record.getInt("makeup_version");
    const eligible = record.getString("status") === "paid" && workflow.paymentEligible(record) && !!record.getString("makeup_service");
    if (action === "assign") {
      const target = team.availableArtist(tx, input.artistId);
      if (!target) throw new BadRequestError("Select an enabled MUA account.");
      if (target.id === perms.parentId && !perms.allowSelf) throw new ForbiddenError("Admin has disabled Parent MUA self-assignment.");
      if (!eligible || state === "completed") throw new ApiError(409, "This order is no longer available for assignment.");
      if (artistId === target.id && workflow.activeMakeup.includes(state)
        && [version, version - 1].includes(Number(requestedVersion))) return state;
      if (requestedVersion !== String(version)) throw new ApiError(409, "The assignment changed. Refresh the queue and try again.");
      record.set("makeup_version", version + 1);
      record.set("makeup_artist", target.id);
      record.set("makeup_state", "claimed");
      team.log(tx, record, target.id, account, artistId ? "reassign" : "assign", artistId);
      tx.save(record);
      return "claimed";
    }
    if (requestedVersion !== String(version)) {
      throw new ApiError(409, "The assignment changed. Reload the makeup queue page and try again.");
    }
    if (action === "release") {
      if (!input.artistId) throw new BadRequestError("The current assignment is required.");
      if (workflow.activeMakeup.includes(state) && artistId === input.artistId) {
        record.set("makeup_state", "");
        record.set("makeup_artist", "");
        record.set("makeup_version", version + 1);
        team.log(tx, record, artistId, account, "release", artistId);
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
    if (!eligible) {
      throw new ApiError(409, "This student is no longer eligible for makeup or grooming.");
    }
    if (action === "claim") {
      if (artistId === account.id && workflow.activeMakeup.includes(state)) return state;
      if (state || artistId) throw new ApiError(409, "This student is no longer waiting.");
      record.set("makeup_artist", account.id);
      record.set("makeup_state", "claimed");
      team.log(tx, record, account.id, account, "assign");
    } else if (action === "start") {
      if (state === "in_progress") return state;
      if (state !== "claimed") throw new ApiError(409, "The assignment is no longer waiting to start.");
      record.set("makeup_state", "in_progress");
      team.log(tx, record, artistId, account, "start");
    } else {
      const defaultOnly = workflow.makeupServices(record).length > 0
        && workflow.makeupServices(record).every((service) => service.defaultService);
      if (state !== "in_progress" && !(defaultOnly && state === "claimed")) {
        throw new ApiError(409, "Start makeup or grooming before marking it complete.");
      }
      const artist = onBehalf ? workflow.catalogItem(tx, "users", artistId) : account;
      if (!artist || artist.getString("role") !== "mua") {
        throw new ApiError(409, "The performing MUA could not be verified.");
      }
      const completedAt = new Date().toISOString();
      require(__hooks + "/studio_mua_reporting.js").logCompletion(tx, record, artist, account, completedAt);
      record.set("makeup_state", "completed");
      record.set("makeup_completed_at", completedAt);
      require(__hooks + "/studio_numbering.js").handoffToPhotography(tx, record, completedAt);
      team.log(tx, record, artistId, account, "complete");
    }
    tx.save(record);
    return record.getString("makeup_state");
  });
  return e.json(200, { state: stateAfter });
}, $apis.requireAuth("users"));

onRecordAfterCreateSuccess((e) => {
  e.next();
  require(__hooks + "/studio_station_events.js").notify(e.app);
}, "registrations", "packages", "add_ons");

onRecordAfterUpdateSuccess((e) => {
  e.next();
  require(__hooks + "/studio_station_events.js").notify(e.app);
}, "registrations", "packages", "add_ons", "users");

onRecordAfterDeleteSuccess((e) => {
  e.next();
  require(__hooks + "/studio_station_events.js").notify(e.app);
}, "registrations", "packages", "add_ons", "users");
