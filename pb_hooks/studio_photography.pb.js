/// <reference path="../pb_data/types.d.ts" />

routerAdd("POST", "/api/studioflow/photography/{id}/{action}", (e) => {
  const workflow = require(__hooks + "/studio_workflow.js");
  const photography = require(__hooks + "/studio_photography.js");
  const camera = require(__hooks + "/studio_camera_import.js");
  const body = e.requestInfo().body || {};
  const action = e.request.pathValue("action");
  if (!["start", "done", "reassign"].includes(action)) throw new NotFoundError();
  const result = workflow.withRegistration(e.app, e.request.pathValue("id"), (tx, record) => {
    const account = workflow.staff(tx, e.auth, action === "reassign" ? ["admin"] : ["photographer"]);
    const plan = photography.data(record);
    if (action === "reassign") {
      const task = photography.active(plan).find((entry) => entry.id === body.taskId);
      const replacement = photography.enabledPhotographer(tx, body.photographerId);
      if (!replacement) throw new BadRequestError("Select an enabled photographer.");
      if (!task || task.status === "completed" || ["cancelled", "released"].includes(record.getString("status"))) {
        throw new ApiError(409, "Only outstanding sessions on active orders can be reassigned.");
      }
      if (task.photographerId === replacement.id) return { reassign: true };
      if (tx.findRecordsByFilter("camera_stations", "active_registration = {:reg} && session_task = {:task} && session_photographer = {:user}",
        "", 1, 0, { reg: record.id, task: task.id, user: replacement.id }).length) {
        throw new ApiError(409, "This photographer's previous camera session is still syncing.");
      }
      task.assignments ??= [];
      task.assignments.push({ from: task.photographerId, fromName: task.photographerName, to: replacement.id,
        toName: photography.label(replacement), by: account.id, at: new Date().toISOString() });
      task.photographerId = replacement.id;
      task.photographerName = photography.label(replacement);
      task.status = "pending";
      delete task.finishingAt;
      delete task.adoptedCamera;
      record.set("photography", plan);
      tx.save(record);
      return { reassign: true };
    }

    const task = photography.availableTask(plan, body.taskId, account, action === "start");
    if (action === "done" && task.status === "completed") return { completed: true, official: workflow.photographyComplete(record) };
    if (!photography.eligible(record) || task.status === "completed") throw new ApiError(409, "This session is no longer available.");
    if (action === "start") {
      if (!body.cameraId) throw new BadRequestError("Choose a camera for this photography session.");
      camera.linkTask(tx, body.cameraId, record, task, account);
      task.photographerId = account.id;
      task.photographerName = photography.label(account);
      task.status = "in_progress";
      record.set("photography", plan);
      record.set("status", "shooting");
      tx.save(record);
      return { started: true };
    }
    const station = tx.findRecordsByFilter("camera_stations",
      "active_registration = {:reg} && session_task = {:task} && session_photographer = {:user}", "", 1, 0,
      { reg: record.id, task: task.id, user: account.id })[0];
    if (!station) throw new ApiError(409, "Link your camera to this session before marking it done.");
    tx.db().newQuery(`UPDATE camera_stations SET session_finishing = CASE WHEN session_finishing = 0 THEN {:now}
      ELSE session_finishing END WHERE id = {:id}`).bind({ now: Date.now(), id: station.id }).execute();
    if (!task.finishingAt) {
      task.finishingAt = new Date().toISOString();
      record.set("photography", plan);
      tx.save(record);
    }
    return { syncing: true };
  });
  require(__hooks + "/studio_station_events.js").notify(e.app);
  return e.json(200, result);
}, $apis.requireAuth("users"));
