/// <reference path="../pb_data/types.d.ts" />

routerAdd("GET", "/api/studioflow/mua-performance", (e) => {
  const workflow = require(__hooks + "/studio_workflow.js");
  const reporting = require(__hooks + "/studio_mua_reporting.js");
  workflow.staff(e.app, e.auth, ["admin"]);
  const today = reporting.studioDate(Date.now());
  const date = e.request.url.query().get("date") || today;
  const instant = new Date(date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(instant.getTime())
    || instant.toISOString().slice(0, 10) !== date) {
    throw new BadRequestError("Choose a valid report date.");
  }
  // Read counters, names, and details from one database snapshot.
  let report;
  e.app.runInTransaction((tx) => { report = reporting.dailyReport(tx, date, today); });
  e.response.header().set("Cache-Control", "private, no-store");
  return e.json(200, report);
}, $apis.requireAuth("users"));

routerAdd("GET", "/api/studioflow/mua-service-types", (e) => {
  require(__hooks + "/studio_workflow.js").staff(e.app, e.auth, ["admin"]);
  e.response.header().set("Cache-Control", "private, no-store");
  return e.json(200, e.app.findAllRecords("mua_service_types")
    .map((record) => ({ id: record.id, name: record.getString("name"), is_active: record.getBool("is_active"), payout_rate: record.getFloat("payout_rate") || 0 }))
    .sort((a, b) => a.name.localeCompare(b.name)));
}, $apis.requireAuth("users"));

onRecordCreateRequest((e) => {
  e.record.set("name", e.record.getString("name").trim());
  return e.next();
}, "mua_service_types");

// Studio-revenue add-ons must never create an MUA queue requirement.
function normalizeAddonMuaRequirement(e) {
  if (e.record.getString("revenue_category") !== "mua") {
    e.record.set("requires_mua", false);
    e.record.set("mua_service_types", []);
  }
  return e.next();
}

onRecordCreateRequest(normalizeAddonMuaRequirement, "add_ons");
onRecordUpdateRequest(normalizeAddonMuaRequirement, "add_ons");

onRecordUpdateRequest((e) => {
  if ("payout_rate" in (e.requestInfo().body || {})) {
    const rate = e.record.getFloat("payout_rate");
    if (!Number.isFinite(rate) || rate < 0) throw new BadRequestError("Payout rate must be a nonnegative amount.");
    e.record.set("payout_rate", Math.round(rate * 100) / 100);
  }
  e.record.set("name", e.record.getString("name").trim());
  return e.next();
}, "mua_service_types");

onRecordCreateRequest((e) => {
  const rate = e.record.getFloat("payout_rate");
  if (!Number.isFinite(rate) || rate < 0) throw new BadRequestError("Payout rate must be a nonnegative amount.");
  e.record.set("payout_rate", Math.round(rate * 100) / 100);
  e.record.set("name", e.record.getString("name").trim());
  return e.next();
}, "mua_service_types");
