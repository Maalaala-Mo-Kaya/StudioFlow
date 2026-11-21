/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const packages = app.findCollectionByNameOrId("packages");
  packages.fields.add(new JSONField({ name: "builder", maxSize: 5000000 }));
  packages.fields.add(new JSONField({ name: "builder_draft", hidden: true, maxSize: 5000000 }));
  packages.fields.add(new TextField({ name: "builder_review", hidden: true, max: 5000 }));
  packages.fields.add(new NumberField({ name: "builder_version", onlyInt: true }));
  packages.fields.add(new BoolField({ name: "builder_unpublished" }));
  const draftRule = "(builder_unpublished = false || @request.auth.role = 'admin')";
  for (const key of ["listRule", "viewRule"]) {
    if (packages[key] === null) continue;
    const existing = String(packages[key] ?? "").trim();
    packages[key] = existing ? `(${existing}) && ${draftRule}` : draftRule;
  }
  app.save(packages);
  const legacy = (record, field) => {
    let value = record.getString(field);
    for (let i = 0; i < 2 && typeof value === "string"; i++) {
      try { value = JSON.parse(value || "null"); } catch (_) { return value.trim() ? [value.trim()] : []; }
    }
    return Array.isArray(value) ? value.filter((item) => typeof item === "string" && item.trim()) : [];
  };
  for (const row of app.findAllRecords("packages")) {
    const sections = ["inclusions", "freebies"].flatMap((field) => {
      const items = legacy(row, field).map((name) => ({ name }));
      return items.length ? [{
        id: field, type: "inclusions", title: field === "freebies" ? "Freebies" : "Package inclusions",
        freebies: field === "freebies", items,
      }] : [];
    });
    if (sections.length) app.db().newQuery("UPDATE packages SET builder = {:builder}, builder_version = 1 WHERE id = {:id}")
      .bind({ builder: JSON.stringify({ sections }), id: row.id }).execute();
  }

  const registrations = app.findCollectionByNameOrId("registrations");
  registrations.fields.getByName("package_snapshot").maxSize = 6000000;
  app.save(registrations);
}, (app) => {
  const packages = app.findCollectionByNameOrId("packages");
  const draftRule = "(builder_unpublished = false || @request.auth.role = 'admin')";
  const suffix = ") && " + draftRule;
  for (const key of ["listRule", "viewRule"]) {
    const rule = String(packages[key] ?? "");
    if (rule === draftRule) packages[key] = "";
    else if (rule.endsWith(suffix)) packages[key] = rule.slice(1, -suffix.length);
  }
  for (const field of ["builder", "builder_draft", "builder_review", "builder_version", "builder_unpublished"]) {
    packages.fields.removeByName(field);
  }
  app.save(packages);
});
