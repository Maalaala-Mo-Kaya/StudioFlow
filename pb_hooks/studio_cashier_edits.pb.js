/// <reference path="../pb_data/types.d.ts" />

routerAdd("GET", "/api/studioflow/cashier-editable-registrations", (e) => {
  require(__hooks + "/studio_workflow.js").staff(e.app, e.auth, ["cashier", "admin"]);
  e.response.header().set("Cache-Control", "no-store");
  return e.json(200, require(__hooks + "/studio_cashier_edits.js").eligibleIds(e.app));
}, $apis.requireAuth("users"));
