/// <reference path="../pb_data/types.d.ts" />

routerAdd("GET", "/api/studioflow/deletable-registrations", (e) => {
  require(__hooks + "/studio_workflow.js").staff(e.app, e.auth, ["cashier", "admin"]);
  e.response.header().set("Cache-Control", "no-store");
  return e.json(200, require(__hooks + "/studio_registration_deletion.js").eligibleIds(e.app));
}, $apis.requireAuth("users"));

routerAdd("POST", "/api/studioflow/registrations/{id}/delete", (e) => {
  const workflow = require(__hooks + "/studio_workflow.js");
  const ledger = require(__hooks + "/studio_ledger.js");
  workflow.staff(e.app, e.auth, ["cashier", "admin"]);
  const body = e.requestInfo().body || {};
  const reason = ledger.readReason(typeof body.reason === "string" ? body.reason : "");
  workflow.withRegistration(e.app, e.request.pathValue("id"), (tx, reg) => {
    const actor = workflow.staff(tx, e.auth, ["cashier", "admin"]);
    const deletion = require(__hooks + "/studio_registration_deletion.js");
    if (!deletion.eligibleIds(tx, reg.id).length) {
      throw new ApiError(409, "This registration can no longer be deleted. A payment, discount, Job Order, MUA assignment, or other workflow activity may have been recorded.");
    }
    reg.set("status_before_cancel", reg.getString("status"));
    reg.set("status", "cancelled");
    reg.set("cancelled_at", new DateTime());
    reg.set("cancelled_by", ledger.actorName(actor));
    reg.set("cancel_reason", reason);
    reg.set("deleted_by_id", actor.id);
    reg.set("balance", 0);
    tx.save(reg);
  });
  require(__hooks + "/studio_station_events.js").notify(e.app, "studioflow-registration-deleted");
  return e.noContent(204);
}, $apis.requireAuth("users"));

routerAdd("GET", "/api/studioflow/registration-deletions", (e) => {
  require(__hooks + "/studio_workflow.js").staff(e.app, e.auth, ["admin"]);
  e.response.header().set("Cache-Control", "no-store");
  const page = Math.max(1, Math.min(1000000, parseInt(e.request.url.query().get("page"), 10) || 1));
  const pageSize = 25;
  const records = e.app.findRecordsByFilter("registrations", "deleted_by_id != ''", "-cancelled_at,-id",
    pageSize + 1, (page - 1) * pageSize);
  return e.json(200, {
    hasNext: records.length > pageSize,
    items: records.slice(0, pageSize).map((reg) => ({
      id: reg.id,
      name: ["given_name", "middle_name", "family_name"].map((field) => reg.getString(field)).filter(Boolean).join(" "),
      deletedAt: reg.getString("cancelled_at"),
      deletedBy: reg.getString("cancelled_by"),
      deletedById: reg.getString("deleted_by_id"),
      reason: reg.getString("cancel_reason"),
      previousStatus: reg.getString("status_before_cancel"),
    })),
  });
}, $apis.requireAuth("users"));
