/// <reference path="../pb_data/types.d.ts" />

// Poses become attire + background: catalog_items gets two more kinds, "attire" (Toga w/out cap,
// Toga w/ cap, Filipiniana…) and "background" (Colored, B&W). Existing package poses are converted
// where the typed title says so: "Colored toga w/out cap" → Toga w/out cap on Colored, "Toga w/out
// cap with bw background" → Toga w/out cap on B&W. Then plain poses and single items named like one
// of those attires ("Toga w/ cap") become that attire. Anything else keeps its typed title.
// Packages are re-rendered (prints grouped by attire); sold job orders keep their snapshots.
migrate((app) => {
  const items = app.findCollectionByNameOrId("catalog_items");
  const category = items.fields.getByName("category");
  category.values = ["print", "frame", "other", "attire", "background"];
  app.save(items);

  const catalog = require(__hooks + "/studio_catalog.js");
  // The studio's two backgrounds, ready to choose in the builder.
  for (const name of ["Colored", "B&W"]) catalog.findOrCreateItem(app, name, "background");
  const key = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const packages = app.findAllRecords("packages").filter((p) => p.getString("structure"));
  const attires = new Set();
  const structures = new Map();
  const convert = (pose) => {
    if (!pose || pose.attire) return;
    const split = catalog.splitPoseTitle(app, pose.title, attires);
    if (split) Object.assign(pose, split);
  };
  // Pass 1: titles naming a background create the attires.
  for (const pkg of packages) {
    const s = catalog.readJson(pkg.getString("structure"));
    if (!s || typeof s !== "object") continue;
    structures.set(pkg.id, s);
    for (const e of s.inclusions || []) if (e.type === "pose") convert(e);
    for (const ex of s.exchanges || []) for (const o of ex.options || []) convert(o);
  }
  // Pass 2: poses and single items named like one of those attires.
  const names = new Map(app.findAllRecords("catalog_items").map((r) => [r.id, r.getString("name")]));
  for (const pkg of packages) {
    const s = structures.get(pkg.id);
    if (!s) continue;
    s.inclusions = (s.inclusions || []).map((e) => {
      if (e.type === "pose") { convert(e); return e; }
      if (e.type === "item" && (Number(e.qty) || 1) === 1 && attires.has(key(names.get(e.id)))) {
        const pose = { type: "pose", id: $security.randomStringWithAlphabet(10, "abcdefghijklmnopqrstuvwxyz0123456789"), title: names.get(e.id), items: [] };
        convert(pose);
        return pose;
      }
      return e;
    });
    for (const ex of s.exchanges || []) for (const o of ex.options || []) convert(o);
    const checked = catalog.validate(app, s);
    if (checked.problem) {
      console.warn(`[attire/background] ${pkg.getString("code") || pkg.id}: ${checked.problem} Left as it was.`);
      continue;
    }
    const out = catalog.render(app, checked.structure, pkg.getInt("photo_selection_limit"));
    pkg.set("structure", checked.structure);
    pkg.set("inclusions", out.inclusions);
    pkg.set("freebies", out.freebies);
    pkg.set("option_groups", out.option_groups);
    app.save(pkg);
  }
}, (app) => {
  app.db().newQuery("UPDATE catalog_items SET category = 'other' WHERE category IN ('attire', 'background')").execute();
  const items = app.findCollectionByNameOrId("catalog_items");
  items.fields.getByName("category").values = ["print", "frame", "other"];
  app.save(items);
});
