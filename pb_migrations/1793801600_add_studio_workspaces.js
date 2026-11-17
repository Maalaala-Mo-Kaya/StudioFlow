/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  users.fields.getByName("role").values = ["admin", "cashier", "photographer", "mua", "chooser"];
  users.fields.add(new BoolField({ name: "disabled" }));
  users.authRule = "disabled = false";
  const active = "@request.auth.id != '' && @request.auth.disabled = false";
  const admin = active + " && @request.auth.role = 'admin'";
  users.listRule = admin;
  users.viewRule = admin + " || (" + active + " && id = @request.auth.id)";
  users.createRule = users.updateRule = users.deleteRule = users.manageRule = admin;
  app.save(users);

  const packages = app.findCollectionByNameOrId("packages");
  packages.fields.add(new NumberField({ name: "photo_selection_limit", min: 0, onlyInt: true }));
  app.save(packages);

  const registrations = app.findCollectionByNameOrId("registrations");
  registrations.fields.add(
    new TextField({ name: "student_id" }),
    new TextField({ name: "makeup_service" }),
    new SelectField({ name: "makeup_state", values: ["claimed", "in_progress", "completed"] }),
    new TextField({ name: "makeup_artist" }),
    new DateField({ name: "makeup_completed_at" }),
    new BoolField({ name: "shoot_completed", hidden: true }),
    new TextField({ name: "photo_folder", hidden: true }),
    new TextField({ name: "photo_folder_key", hidden: true }),
    new NumberField({ name: "photo_edit_until", hidden: true }),
    new NumberField({ name: "photo_revision", hidden: true }),
    new JSONField({ name: "photo_selection", hidden: true }),
    new JSONField({ name: "photo_pending", hidden: true }),
    new JSONField({ name: "photo_last_request", hidden: true }),
  );
  registrations.addIndex("idx_registration_photo_folder", true, "photo_folder_key", "photo_folder_key != ''");
  registrations.listRule = registrations.viewRule = registrations.updateRule =
    active + " && (@request.auth.role = 'admin' || @request.auth.role = 'cashier' || @request.auth.role = 'photographer')";
  registrations.deleteRule = admin;
  app.save(registrations);

  for (const name of ["organizations", "levels", "courses", "school_courses", "packages", "add_ons", "master_lists", "payments"]) {
    const collection = app.findCollectionByNameOrId(name);
    for (const key of ["listRule", "viewRule", "createRule", "updateRule", "deleteRule"]) {
      const rule = String(collection[key] ?? "");
      if (rule.trim()) collection[key] = "(" + rule + ") && (" + active + ")";
    }
    if (name === "master_lists") {
      collection.listRule = collection.viewRule = registrations.listRule;
    }
    app.save(collection);
  }

  // Classify legacy purchases and preserve known photo locations without touching the ledger.
  const workflow = require(__hooks + "/studio_workflow.js");
  const storage = require(__hooks + "/studio_photo_storage.js");
  for (const record of app.findAllRecords("registrations")) {
    const service = workflow.purchasedServices(app, record);
    let path = "";
    try {
      const candidate = storage.photoFolder(app, record);
      const root = storage.openStudent(candidate);
      if (root) {
        root.close();
        path = candidate;
      }
    } catch (_) { /* Ambiguous or offline legacy storage is resolved at the station. */ }
    const completed = workflow.finishedShoot.includes(record.getString("status"));
    app.db().newQuery("UPDATE registrations SET makeup_service = {:service}, shoot_completed = {:completed}, photo_folder = {:path}, photo_folder_key = {:key} WHERE id = {:id}")
      .bind({ id: record.id, service, completed, path, key: path.toLowerCase() }).execute();
  }

  // The database checks the current row even if a photographer's PATCH was
  // prepared before a concurrent makeup claim or payment reversal.
  app.db().newQuery(`
    CREATE TRIGGER studio_photo_queue_guard
    BEFORE UPDATE OF status ON registrations
    WHEN NEW.status != OLD.status
      AND (
        (NEW.status IN ('shooting', 'done_shooting', 'completed') AND (
          OLD.status IN ('pending_payment', 'cancelled')
          OR (OLD.status = 'paid' AND OLD.paid_amount <= 0)
          OR (OLD.status = 'paid' AND (OLD.makeup_service != '' OR NEW.makeup_service != '') AND OLD.makeup_state != 'completed')
        ))
        OR (NEW.status IN ('shooting', 'done_shooting', 'completed', 'ready_for_pickup', 'released') AND OLD.makeup_state IN ('claimed', 'in_progress'))
      )
    BEGIN
      SELECT RAISE(ABORT, 'The student is not eligible for photography yet.');
    END
  `).execute();
}, (app) => {
  if (app.countRecords("users", $dbx.exp("role IN ('mua', 'chooser')"))) {
    throw new Error("Reassign or remove Chooser and MUA accounts before removing their role definitions.");
  }
  if (app.countRecords("registrations", $dbx.exp("json_type(photo_pending) = 'object'"))) {
    throw new Error("Recover interrupted photo transfers before removing their journals.");
  }
  app.db().newQuery("DROP TRIGGER IF EXISTS studio_photo_queue_guard").execute();
  const registrations = app.findCollectionByNameOrId("registrations");
  registrations.removeIndex("idx_registration_photo_folder");
  for (const name of [
    "student_id", "makeup_service", "makeup_state", "makeup_artist", "makeup_completed_at", "shoot_completed",
    "photo_folder", "photo_folder_key", "photo_edit_until", "photo_revision",
    "photo_selection", "photo_pending", "photo_last_request",
  ]) registrations.fields.removeByName(name);
  registrations.listRule = "@request.auth.id != '' || status = 'paid' || status = 'shooting'";
  registrations.viewRule = registrations.updateRule = "@request.auth.id != ''";
  registrations.deleteRule = "@request.auth.role = 'admin'";
  app.save(registrations);

  for (const name of ["organizations", "levels", "courses", "school_courses", "packages", "add_ons", "master_lists", "payments"]) {
    const collection = app.findCollectionByNameOrId(name);
    for (const key of ["listRule", "viewRule", "createRule", "updateRule", "deleteRule"]) {
      const rule = String(collection[key] ?? "");
      const end = rule.indexOf(") && (@request.auth.id != '' && @request.auth.disabled = false)");
      if (end > 0) collection[key] = rule.slice(1, end);
    }
    if (name === "master_lists") collection.listRule = collection.viewRule = "@request.auth.id != ''";
    if (name === "packages") collection.fields.removeByName("photo_selection_limit");
    app.save(collection);
  }

  const users = app.findCollectionByNameOrId("users");
  users.fields.getByName("role").values = ["admin", "cashier", "photographer"];
  users.fields.removeByName("disabled");
  users.authRule = "";
  users.listRule = users.viewRule = "@request.auth.id != ''";
  users.createRule = users.deleteRule = users.manageRule = "@request.auth.role = 'admin'";
  users.updateRule = "@request.auth.role = 'admin' || id = @request.auth.id";
  app.save(users);
});
