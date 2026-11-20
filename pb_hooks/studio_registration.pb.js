/// <reference path="../pb_data/types.d.ts" />

onRecordCreateRequest((e) => {
  // The kiosk creates a new job only. All workflow and ledger state comes from the server.
  if (e.auth && (e.auth.getBool("disabled") || ["mua", "chooser"].includes(e.auth.getString("role")))) {
    throw new ForbiddenError("This staff account cannot submit registrations.");
  }
  for (const [field, value] of Object.entries({
    job_order_no: "", queue_number: 0, queue_issued_at: "", paid_amount: 0, balance: 0,
    status: "pending_payment", payment_status: "unpaid", framing_status: "",
    photo_status: "pending_shoot", claimed_by: "", released_at: "", prepared_by: "",
    makeup_state: "", makeup_artist: "", makeup_completed_at: "", makeup_version: 0,
    photo_edit_until: 0, photo_revision: 0,
    photo_selection: null, photo_pending: null, photo_last_request: null,
    refunded_amount: 0, cancelled_at: "", cancelled_by: "", cancel_reason: "", status_before_cancel: "",
    restored_at: "", restored_by: "",
  })) e.record.set(field, value);
  // Other fees change the price: only an admin sets them (the kiosk is public, so it can't).
  if (!e.hasSuperuserAuth() && e.auth?.getString("role") !== "admin") e.record.set("other_fees", 0);
  if (e.record.getFloat("other_fees") < 0) throw new BadRequestError("Other fees can't be negative.");
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
  // Cancelling keeps shoot_completed, so a restored order returns with its photography done.
  if (["pending_payment", "paid", "shooting"].includes(status)) e.record.set("shoot_completed", false);

  // ready_at: when the order became ready for pickup (photographed and production marked ready).
  // The cashier's Ready for Pickup list uses it. A new ready period starts a new pickup notice.
  const waitingForPickup = (record) => !["pending_payment", "cancelled", "released"].includes(record.getString("status"))
    && record.getBool("shoot_completed")
    && (["completed", "ready_for_pickup"].includes(record.getString("status"))
      || ["framed", "ready_for_pickup"].includes(record.getString("framing_status")));
  if (waitingForPickup(e.record)) {
    if (!e.record.getString("ready_at") || !waitingForPickup(e.record.original())) {
      e.record.set("ready_at", new DateTime());
      e.record.set("pickup_notified_at", "");
      e.record.set("pickup_notified_by", "");
      e.record.set("pickup_notify_count", 0);
    }
  } else if (status !== "released") {
    e.record.set("ready_at", "");
  }
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
    "job_order_no", "queue_number", "queue_issued_at",
    "makeup_service", "makeup_services", "makeup_state", "makeup_artist", "makeup_completed_at", "makeup_version", "shoot_completed",
    "photo_folder", "photo_folder_key", "photo_edit_until", "photo_revision",
    "photo_selection", "photo_pending", "photo_last_request",
    // Server-owned pickup tracking (see studio_production.pb.js).
    "ready_at", "pickup_notified_at", "pickup_notified_by", "pickup_notify_count",
  ];
  if (fields.some(changed)) throw new ForbiddenError("Use the studio workflow to update station assignments or selections.");
  // Money and cancellation records are server-owned: payments, refunds, Cancel and Restore set them.
  const body = e.requestInfo().body || {};
  const owned = ["paid_amount", "balance", "payment_status", "refunded_amount", "cancelled_at", "cancelled_by",
    "cancel_reason", "status_before_cancel", "restored_at", "restored_by"];
  if (!e.hasSuperuserAuth() && owned.some((field) => field in body && String(body[field] ?? "") !== before.getString(field))) {
    throw new ForbiddenError("Payments, refunds, Cancel and Restore update these fields. They can't be edited by hand.");
  }
  if (!e.hasSuperuserAuth() && changed("status")
    && (e.record.getString("status") === "cancelled" || before.getString("status") === "cancelled")) {
    throw new BadRequestError("Use the Cancel or Restore button so the reason and the person are recorded.");
  }
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
        && (!before.getInt("queue_number") || before.getFloat("paid_amount") <= 0 || (before.getString("makeup_service") && before.getString("makeup_state") !== "completed"))) {
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
          require(__hooks + "/studio_numbering.js").handoffToPhotography(tx, e.record);
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
    // Payments cascade-delete with their registration. Keep the ledger and receipt
    // numbers intact: a job order with any payment record is cancelled, never deleted.
    if (tx.findRecordsByFilter("payments", "registration = {:id}", "", 1, 0, { id: current.id }).length) {
      throw new ApiError(409, "This job order has payment records. Cancel it instead of deleting it.");
    }
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
