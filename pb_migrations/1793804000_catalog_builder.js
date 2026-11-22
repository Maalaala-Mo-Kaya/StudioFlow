/// <reference path="../pb_data/types.d.ts" />

// The package builder (pb_hooks/studio_catalog.js): ① single items, ② item packages (items with
// quantities), ③ packages that reference them through `structure`. Existing packages are
// converted: their inclusions, freebies and exchange options become items and item packages,
// and their shown contents are re-rendered from the structure. Job orders keep their snapshots.
migrate((app) => {
  const admin = "@request.auth.role = 'admin' && @request.auth.disabled = false";

  const items = new Collection({ name: "catalog_items", type: "base",
    listRule: admin, viewRule: admin, createRule: admin, updateRule: admin, deleteRule: admin });
  items.fields.add(
    new TextField({ name: "name", required: true, max: 120 }),
    new SelectField({ name: "category", values: ["print", "frame", "other"], maxSelect: 1, required: true }),
    new BoolField({ name: "is_active" }),
    new AutodateField({ name: "created", onCreate: true }),
    new AutodateField({ name: "updated", onCreate: true, onUpdate: true }),
  );
  items.addIndex("idx_catalog_items_name", true, "`name` COLLATE NOCASE, `category`", "");
  app.save(items);

  const sets = new Collection({ name: "item_packages", type: "base",
    listRule: admin, viewRule: admin, createRule: admin, updateRule: admin, deleteRule: admin });
  sets.fields.add(
    new TextField({ name: "name", required: true, max: 120 }),
    new JSONField({ name: "items" }),
    new BoolField({ name: "is_active" }),
    new AutodateField({ name: "created", onCreate: true }),
    new AutodateField({ name: "updated", onCreate: true, onUpdate: true }),
  );
  sets.addIndex("idx_item_packages_name", false, "`name` COLLATE NOCASE", "");
  app.save(sets);

  const packages = app.findCollectionByNameOrId("packages");
  if (!packages.fields.getByName("structure")) {
    packages.fields.add(new JSONField({ name: "structure" }));
    app.save(packages);
  }

  const catalog = require(__hooks + "/studio_catalog.js");
  for (const pkg of app.findAllRecords("packages")) {
    const structure = catalog.convertLegacy(app, pkg.getString("inclusions"), pkg.getString("freebies"),
      pkg.getString("option_groups"), pkg.getInt("photo_selection_limit"));
    const out = catalog.render(app, structure, pkg.getInt("photo_selection_limit"));
    pkg.set("structure", structure);
    pkg.set("inclusions", out.inclusions);
    pkg.set("freebies", out.freebies);
    pkg.set("option_groups", out.option_groups);
    app.save(pkg);
  }
}, (app) => {
  const packages = app.findCollectionByNameOrId("packages");
  packages.fields.removeByName("structure");
  app.save(packages);
  app.delete(app.findCollectionByNameOrId("item_packages"));
  app.delete(app.findCollectionByNameOrId("catalog_items"));
});
