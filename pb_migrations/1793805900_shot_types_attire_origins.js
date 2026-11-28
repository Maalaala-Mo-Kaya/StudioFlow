/// <reference path="../pb_data/types.d.ts" />

// Shot types, second step (after 1793805800):
// - The attire types photographers tell apart on set: Filipiniana or Glamour shot (women), Barong or
//   Coat and tie (men). Added only when no type has their file label yet, linked to catalog items whose
//   name matches exactly (ignoring case). The list is ordered in pairs; a type the admin has already
//   moved keeps its place.
// - shot_origins: which camera (or whose card upload) each kept photo of a client came from, so each
//   photographer reviews only their own shots and only the one who took a shot may change it.
//   Written by the server only.
migrate((app) => {
  const types = app.findCollectionByNameOrId("shot_types");
  const byName = new Map();
  for (const item of app.findRecordsByFilter("catalog_items", "", "", 0, 0)) {
    const key = item.getString("name").trim().toLowerCase();
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(item.id);
  }
  const link = (...names) => [...new Set(names.flatMap((name) => byName.get(name.toLowerCase()) || []))];
  const existing = new Map(app.findRecordsByFilter("shot_types", "", "", 0, 0).map((record) => [record.getString("code").toUpperCase(), record]));
  const added = [
    ["Filipiniana", "FILIPINIANA", 42, link("Filipiniana")],
    ["Glamour shot", "GLAMOUR", 44, link("Glamor shots", "Glamour shots", "Glamor shot", "Glamour shot")],
    ["Barong", "BARONG", 46, link("Barong")],
    ["Coat and tie", "COAT TIE", 48, link("Coat and Tie", "Coat & Tie")],
  ];
  for (const [name, code, sort, items] of added) {
    if (existing.has(code)) continue;
    if (app.findRecordsByFilter("shot_types", "name = {:name}", "", 1, 0, { name }).length) continue;
    const record = new Record(types);
    record.set("name", name);
    record.set("code", code);
    record.set("items", items);
    record.set("sort", sort);
    record.set("is_active", true);
    app.save(record);
  }
  // The group pictures in the order photographers name them: Family, Barkada, Couple, Group.
  const regroup = { FAMILY: [60, 50], BARKADA: [80, 60], COUPLE: [70, 70], GROUP: [50, 80] };
  for (const [code, [before, after]] of Object.entries(regroup)) {
    const record = existing.get(code);
    if (record && record.getInt("sort") === before && before !== after) {
      record.set("sort", after);
      app.save(record);
    }
  }

  if (!app.hasTable("shot_origins")) {
    const registrations = app.findCollectionByNameOrId("registrations");
    const origins = new Collection({ type: "base", name: "shot_origins" });
    origins.fields.add(
      new RelationField({ name: "registration", collectionId: registrations.id, maxSelect: 1, required: true, cascadeDelete: true }),
      // The photo's file name without its shot type label, lower case.
      new TextField({ name: "shot", required: true, max: 300 }),
      // A camera_stations id, or "card" for a card upload.
      new TextField({ name: "camera", max: 30 }),
      new TextField({ name: "photographer", max: 30 }),
      new AutodateField({ name: "created", onCreate: true }),
    );
    origins.addIndex("idx_shot_origins_shot", true, "registration, shot", "");
    app.save(origins);
  }
}, (app) => {
  if (app.hasTable("shot_origins")) app.delete(app.findCollectionByNameOrId("shot_origins"));
  for (const code of ["FILIPINIANA", "GLAMOUR", "BARONG", "COAT TIE"]) {
    for (const record of app.findRecordsByFilter("shot_types", "code = {:code}", "", 0, 0, { code })) app.delete(record);
  }
});
