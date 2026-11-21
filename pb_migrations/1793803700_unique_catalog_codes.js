/// <reference path="../pb_data/types.d.ts" />

// Package and add-on codes must be unique (ignoring upper/lower case), so two admins saving
// at the same moment, or a repeated catalog import, can't create two items with one code.
// Add-ons may still have no code. Codes are also trimmed, matching registration_billing.pb.js.
// A database that already holds duplicates keeps the oldest item's code and gives each later
// one a free "-2", "-3"… suffix. Job orders are untouched: they keep the code they were sold
// with in package_snapshot / add_ons.
// Safe to run again (it was first numbered 1793803600): codes are already unique, and adding an
// index that exists replaces it.
migrate((app) => {
  for (const table of ["packages", "add_ons"]) {
    const rows = arrayOf(new DynamicModel({ id: "", code: "" }));
    app.db().newQuery(`SELECT id, code FROM ${table} ORDER BY created, id`).all(rows);

    const taken = new Set(rows.map((row) => row.code.trim().toUpperCase()).filter(Boolean));
    const seen = new Set();
    for (const row of rows) {
      const code = row.code.trim();
      const key = code.toUpperCase();
      let next = code;
      if (key && seen.has(key)) {
        let n = 2;
        while (taken.has(`${key}-${n}`)) n++;
        next = `${code}-${n}`;
        taken.add(next.toUpperCase());
        console.log(`StudioFlow: ${table} ${row.id} had duplicate code "${code}"; renamed to "${next}".`);
      }
      seen.add(next.toUpperCase());
      if (next !== row.code) {
        app.db().newQuery(`UPDATE ${table} SET code = {:code} WHERE id = {:id}`).bind({ code: next, id: row.id }).execute();
      }
    }
  }

  const packages = app.findCollectionByNameOrId("packages");
  packages.addIndex("idx_packages_code", true, "`code` COLLATE NOCASE", "");
  app.save(packages);
  const addOns = app.findCollectionByNameOrId("add_ons");
  addOns.addIndex("idx_add_ons_code", true, "`code` COLLATE NOCASE", "code != ''");
  app.save(addOns);
}, (app) => {
  const packages = app.findCollectionByNameOrId("packages");
  packages.removeIndex("idx_packages_code");
  app.save(packages);
  const addOns = app.findCollectionByNameOrId("add_ons");
  addOns.removeIndex("idx_add_ons_code");
  app.save(addOns);
});
