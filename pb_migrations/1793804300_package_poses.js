/// <reference path="../pb_data/types.d.ts" />

// Packages own their poses. Until now a package linked to item packages, so one item package's
// quantities were shared by every package using it; the same title with other quantities (the two
// "Colored toga w/out cap" on a flyer, or 11R in Package A vs 8R in Package B) needed another
// item package. Each linked item package (in inclusions, exchanges and exchange options) is copied
// into the package as a pose with the same title and contents, keeping its id, so what clients see
// and saved package picks stay the same. Item packages stay as saved poses: templates to copy from.
// Job orders keep their snapshots.
migrate((app) => {
  const catalog = require(__hooks + "/studio_catalog.js");
  for (const pkg of app.findAllRecords("packages")) {
    const raw = catalog.readJson(pkg.getString("structure"));
    if (!raw || typeof raw !== "object") continue;
    const checked = catalog.validate(app, raw);
    if (checked.problem) {
      console.warn(`[package poses] ${pkg.getString("code") || pkg.id}: ${checked.problem} Left as it was.`);
      continue;
    }
    const out = catalog.render(app, checked.structure, pkg.getInt("photo_selection_limit"));
    pkg.set("structure", checked.structure);
    pkg.set("inclusions", out.inclusions);
    pkg.set("freebies", out.freebies);
    pkg.set("option_groups", out.option_groups);
    app.save(pkg);
  }
}, () => {
  // Poses copied into packages stay; the saved poses they came from were never changed.
});
