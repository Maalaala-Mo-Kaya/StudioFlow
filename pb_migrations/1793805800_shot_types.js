/// <reference path="../pb_data/types.d.ts" />

// Shot types (Toga with cap, Family, Barkada…): what kind of picture each photo is.
// - shot_types: the admin's list. `code` is the label written into the photo's file name
//   ("IMG_0001 [TOGA CAP].JPG"), so it is short and never contains brackets. `items` links a type
//   to the catalog items that stand for it (the attire "Toga with cap", the freebie "FAMILY
//   PICTURE"…): a client's package "includes" a type when its sold package names one of them.
// - users.shot_menu: the shot types a photographer shows on their Photo Floor menu (their
//   designation). Empty = every active type. Written only through /api/studioflow/shot-menu.
// - camera_stations.shot_type: the code the camera's next shots get. Server-owned session field,
//   set through /api/studioflow/camera/:id/shot-type.
migrate((app) => {
  const signedIn = "@request.auth.id != '' && @request.auth.disabled = false";
  const admin = "@request.auth.role = 'admin' && @request.auth.disabled = false";
  const items = app.findCollectionByNameOrId("catalog_items");
  const types = new Collection({
    type: "base", name: "shot_types",
    listRule: signedIn, viewRule: signedIn, createRule: admin, updateRule: admin, deleteRule: admin,
  });
  types.fields.add(
    new TextField({ name: "name", required: true, max: 60 }),
    new TextField({ name: "code", required: true, max: 24, pattern: "^[A-Z0-9](?:[A-Z0-9 -]*[A-Z0-9])?$" }),
    new RelationField({ name: "items", collectionId: items.id, maxSelect: 100 }),
    new NumberField({ name: "sort", onlyInt: true }),
    new BoolField({ name: "is_active" }),
    new AutodateField({ name: "created", onCreate: true }),
    new AutodateField({ name: "updated", onCreate: true, onUpdate: true }),
  );
  types.addIndex("idx_shot_types_code", true, "code COLLATE NOCASE", "");
  types.addIndex("idx_shot_types_name", true, "name COLLATE NOCASE", "");
  app.save(types);

  // The studio's list to start with. Links are made only to items whose name matches exactly
  // (ignoring case); the admin links the rest in Camera Import → Shot types.
  const byName = new Map();
  for (const item of app.findRecordsByFilter("catalog_items", "", "", 0, 0)) {
    const key = item.getString("name").trim().toLowerCase();
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(item.id);
  }
  const link = (...names) => names.flatMap((name) => byName.get(name.toLowerCase()) || []);
  const defaults = [
    ["With toga", "TOGA", link()],
    ["Without toga", "NO TOGA", link()],
    ["Toga with cap", "TOGA CAP", link("Toga with cap", "Toga w/ cap")],
    ["Toga w/out cap", "TOGA NO CAP", link("Toga w/out cap", "Toga without cap")],
    ["Group", "GROUP", link("FREE BARKADA, COUPLE AND GROUP SHOTS", "GROUP SHOT", "GROUP PICTURE")],
    ["Family", "FAMILY", link("FAMILY PICTURE", "FREE FAMILY PICTURE")],
    ["Couple", "COUPLE", link("COUPLE SHOT", "FREE BARKADA, COUPLE AND GROUP SHOTS")],
    ["Barkada", "BARKADA", link("BARKADA SHOT", "BARKADA PICTURE", "FREE BARKADA, COUPLE AND GROUP SHOTS")],
  ];
  defaults.forEach(([name, code, linked], index) => {
    const record = new Record(types);
    record.set("name", name);
    record.set("code", code);
    record.set("items", [...new Set(linked)]);
    record.set("sort", (index + 1) * 10);
    record.set("is_active", true);
    app.save(record);
  });

  const users = app.findCollectionByNameOrId("users");
  if (!users.fields.getByName("shot_menu")) users.fields.add(new JSONField({ name: "shot_menu", maxSize: 4096 }));
  app.save(users);

  const stations = app.findCollectionByNameOrId("camera_stations");
  if (!stations.fields.getByName("shot_type")) stations.fields.add(new TextField({ name: "shot_type", max: 24 }));
  app.save(stations);

}, (app) => {
  const stations = app.findCollectionByNameOrId("camera_stations");
  stations.fields.removeByName("shot_type");
  app.save(stations);
  const users = app.findCollectionByNameOrId("users");
  users.fields.removeByName("shot_menu");
  app.save(users);
  app.delete(app.findCollectionByNameOrId("shot_types"));
});
