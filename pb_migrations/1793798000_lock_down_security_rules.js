/// <reference path="../pb_data/types.d.ts" />

/**
 * PocketBase Migration: Enforce Zero-Trust Collection Rules (SEC-01 through SEC-04)
 * - Public catalog (organizations, levels, courses, packages, add_ons): Read-only for public, admin-only for edits.
 * - Registrations: Public kiosk can CREATE; staff only can UPDATE and browse full list; admin only can DELETE.
 *   Public queue count allowed for status = 'paid' || status = 'shooting'.
 * - Payments: Cashier and Admin only for CREATE, VIEW, LIST; Admin only for UPDATE and DELETE.
 * - Master Lists: Authenticated staff only to prevent student PII exfiltration (RA 10173).
 */
migrate((app) => {
  // 1. organizations
  try {
    const orgs = app.findCollectionByNameOrId("organizations");
    orgs.listRule = "";
    orgs.viewRule = "";
    orgs.createRule = "@request.auth.role = 'admin'";
    orgs.updateRule = "@request.auth.role = 'admin'";
    orgs.deleteRule = "@request.auth.role = 'admin'";
    app.save(orgs);
  } catch (e) {
    console.error("Failed locking organizations:", e);
  }

  // 2. levels
  try {
    const levels = app.findCollectionByNameOrId("levels");
    levels.listRule = "";
    levels.viewRule = "";
    levels.createRule = "@request.auth.role = 'admin'";
    levels.updateRule = "@request.auth.role = 'admin'";
    levels.deleteRule = "@request.auth.role = 'admin'";
    app.save(levels);
  } catch (e) {
    console.error("Failed locking levels:", e);
  }

  // 3. courses
  try {
    const courses = app.findCollectionByNameOrId("courses");
    courses.listRule = "";
    courses.viewRule = "";
    courses.createRule = "@request.auth.role = 'admin'";
    courses.updateRule = "@request.auth.role = 'admin'";
    courses.deleteRule = "@request.auth.role = 'admin'";
    app.save(courses);
  } catch (e) {
    console.error("Failed locking courses:", e);
  }

  // 4. packages
  try {
    const packages = app.findCollectionByNameOrId("packages");
    packages.listRule = "";
    packages.viewRule = "";
    packages.createRule = "@request.auth.role = 'admin'";
    packages.updateRule = "@request.auth.role = 'admin'";
    packages.deleteRule = "@request.auth.role = 'admin'";
    app.save(packages);
  } catch (e) {
    console.error("Failed locking packages:", e);
  }

  // 5. add_ons
  try {
    const addOns = app.findCollectionByNameOrId("add_ons");
    addOns.listRule = "";
    addOns.viewRule = "";
    addOns.createRule = "@request.auth.role = 'admin'";
    addOns.updateRule = "@request.auth.role = 'admin'";
    addOns.deleteRule = "@request.auth.role = 'admin'";
    app.save(addOns);
  } catch (e) {
    console.error("Failed locking add_ons:", e);
  }

  // 6. master_lists (Strict PII protection under RA 10173)
  try {
    const masterLists = app.findCollectionByNameOrId("master_lists");
    masterLists.listRule = "@request.auth.id != ''";
    masterLists.viewRule = "@request.auth.id != ''";
    masterLists.createRule = "@request.auth.role = 'admin'";
    masterLists.updateRule = "@request.auth.role = 'admin'";
    masterLists.deleteRule = "@request.auth.role = 'admin'";
    app.save(masterLists);
  } catch (e) {
    console.error("Failed locking master_lists:", e);
  }

  // 7. registrations
  try {
    const registrations = app.findCollectionByNameOrId("registrations");
    // Public kiosk can create, and can list active queue items; staff can list all
    registrations.createRule = "";
    registrations.listRule = "@request.auth.id != '' || status = 'paid' || status = 'shooting'";
    registrations.viewRule = "@request.auth.id != ''";
    registrations.updateRule = "@request.auth.id != ''";
    registrations.deleteRule = "@request.auth.role = 'admin'";
    app.save(registrations);
  } catch (e) {
    console.error("Failed locking registrations:", e);
  }

  // 8. payments (Financial ledger protection)
  try {
    const payments = app.findCollectionByNameOrId("payments");
    payments.createRule = "@request.auth.role = 'cashier' || @request.auth.role = 'admin'";
    payments.listRule = "@request.auth.role = 'cashier' || @request.auth.role = 'admin'";
    payments.viewRule = "@request.auth.role = 'cashier' || @request.auth.role = 'admin'";
    payments.updateRule = "@request.auth.role = 'admin'";
    payments.deleteRule = "@request.auth.role = 'admin'";
    app.save(payments);
  } catch (e) {
    console.error("Failed locking payments:", e);
  }
}, (app) => {
  // Rollback to blank rules
  const collections = ["organizations", "levels", "courses", "packages", "add_ons", "master_lists", "registrations", "payments"];
  for (const name of collections) {
    try {
      const col = app.findCollectionByNameOrId(name);
      col.listRule = "";
      col.viewRule = "";
      col.createRule = "";
      col.updateRule = "";
      col.deleteRule = "";
      app.save(col);
    } catch (_) {}
  }
});
