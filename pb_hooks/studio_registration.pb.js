/// <reference path="../pb_data/types.d.ts" />

onRecordCreateRequest((e) => {
  // The kiosk creates a new job only. All workflow and ledger state comes from the server.
  if (e.auth && (e.auth.getBool("disabled") || ["mua", "chooser"].includes(e.auth.getString("role")))) {
    throw new ForbiddenError("This staff account cannot submit registrations.");
  }
  for (const [field, value] of Object.entries({
    job_order_no: "", queue_number: 0, paid_amount: 0, balance: 0,
    status: "pending_payment", payment_status: "unpaid", framing_status: "",
    photo_status: "pending_shoot", claimed_by: "", released_at: "", prepared_by: "",
    makeup_state: "", makeup_artist: "", makeup_completed_at: "", makeup_version: 0,
    photo_edit_until: 0, photo_revision: 0,
    photo_selection: null, photo_pending: null, photo_last_request: null,
  })) e.record.set(field, value);
  return e.next();
}, "registrations");

onRecordCreate((e) => {
  const workflow = require(__hooks + "/studio_workflow.js");
  workflow.saveMakeupServices(e.record, workflow.purchasedServices(e.app, e.record));
  e.record.set("shoot_completed", false);
  return e.next();
}, "registrations");

onRecordUpdate((e) => {
  const status = e.record.getString("status");
  if (["done_shooting", "completed"].includes(status)) e.record.set("shoot_completed", true);
  if (["pending_payment", "paid", "shooting", "cancelled"].includes(status)) e.record.set("shoot_completed", false);
  return e.next();
}, "registrations");

onRecordUpdateRequest((e) => {
  const before = e.record.original();
  const changed = (key) => e.record.getString(key) !== before.getString(key);
  const role = e.auth?.getString("role");
  const correction = e.requestInfo().body.mua_correction;
  if (correction !== undefined) {
    if (role !== "admin" && !e.hasSuperuserAuth()) throw new ForbiddenError("Only administrators can correct the MUA requirement.");
    if (!["required", "waived"].includes(correction)) throw new BadRequestError("Invalid MUA requirement correction.");
  }
  const fields = [
    "makeup_service", "makeup_services", "makeup_state", "makeup_artist", "makeup_completed_at", "makeup_version", "shoot_completed",
    "photo_folder", "photo_folder_key", "photo_edit_until", "photo_revision",
    "photo_selection", "photo_pending", "photo_last_request",
  ];
  if (fields.some(changed)) throw new ForbiddenError("Use the studio workflow to update station assignments or selections.");
  if (role === "photographer" || role === "cashier") {
    const permitted = role === "photographer" ? ["status", "photo_status"]
      : ["status", "framing_status", "claimed_by", "released_at"];
    if (e.record.collection().fields.fieldNames().some((field) => !permitted.includes(field) && changed(field))) {
      throw new ForbiddenError("This station cannot edit registration details.");
    }
    if (changed("status")) {
      const current = before.getString("status");
      const next = e.record.getString("status");
      if (role === "photographer" && !((current === "paid" && ["shooting", "done_shooting"].includes(next))
        || (current === "shooting" && next === "done_shooting"))) {
        throw new BadRequestError("This photography queue transition is no longer available.");
      }
      if (role === "cashier" && next !== "released") throw new ForbiddenError("Only deliverable release is available at this station.");
      if (role === "photographer" && current === "paid"
        && (before.getFloat("paid_amount") <= 0 || (before.getString("makeup_service") && before.getString("makeup_state") !== "completed"))) {
        throw new BadRequestError("The student is still waiting for payment or makeup / grooming.");
      }
    }
  }
  const workflow = require(__hooks + "/studio_workflow.js");
  const app = e.app;
  // PocketBase loaded this PATCH before the hook. Check that its original row
  // is still current while holding the same lock used by the station APIs.
  return workflow.withRegistration(app, e.record.id, (tx, current) => {
    if (current.collection().fields.fieldNames().some((field) => current.getString(field) !== before.getString(field))) {
      throw new ApiError(409, "This registration changed. Refresh the student and try again.");
    }
    if (!e.hasSuperuserAuth()) workflow.staff(tx, e.auth, [role]);
    e.app = tx;
    try {
      const beforePhotography = ["pending_payment", "paid"];
      const canCorrect = beforePhotography.includes(current.getString("status")) && !current.getBool("shoot_completed");
      if (correction && !canCorrect) throw new ApiError(409, "The MUA requirement can only be corrected before photography starts.");
      if (canCorrect && (correction || changed("package") || changed("add_ons"))) {
        const saved = workflow.makeupServices(current);
        let services = workflow.purchasedServices(tx, e.record, current);
        if (correction === "waived") services = [];
        if (correction === "required" && !services.length) services = [{ source: "admin", name: "Makeup / grooming" }];
        if (JSON.stringify(services) !== JSON.stringify(saved)) {
          if (!beforePhotography.includes(e.record.getString("status"))) {
            throw new ApiError(409, "Save the MUA correction before changing the queue status.");
          }
          const state = current.getString("makeup_state");
          if (workflow.activeMakeup.includes(state)) throw new ApiError(409, "Release the active MUA assignment before changing its services.");
          if (state === "completed") throw new ApiError(409, "Makeup or grooming is already complete for this order.");
          workflow.saveMakeupServices(e.record, services);
          e.record.set("makeup_version", current.getInt("makeup_version") + 1);
        }
      }
      return e.next();
    } finally { e.app = app; }
  });
}, "registrations");

onRecordDeleteRequest((e) => {
  const workflow = require(__hooks + "/studio_workflow.js");
  const app = e.app;
  return workflow.withRegistration(app, e.record.id, (tx, current) => {
    if (!e.hasSuperuserAuth()) workflow.staff(tx, e.auth, ["admin"]);
    if (workflow.json(current, "photo_pending")) throw new ApiError(409, "Finish recovering the photo selection before removing this registration.");
    e.app = tx;
    e.record = current;
    try { return e.next(); } finally { e.app = app; }
  });
}, "registrations");

onRecordUpdateRequest((e) => {
  if (e.auth?.id === e.record.id && (e.record.getBool("disabled") ||
    e.record.getString("role") !== e.record.original().getString("role"))) {
    throw new ForbiddenError("Another administrator must change your role or disable your account.");
  }
  return e.next();
}, "users");

onRecordDeleteRequest((e) => {
  if (e.auth?.id === e.record.id) throw new ForbiddenError("You cannot delete your own staff account.");
  return e.next();
}, "users");
