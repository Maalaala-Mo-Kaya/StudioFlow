/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const admin = "@request.auth.role = 'admin' && @request.auth.disabled = false";
  const types = new Collection({
    type: "base", name: "mua_service_types",
    listRule: admin, viewRule: admin, createRule: admin, updateRule: admin,
  });
  types.fields.add(new TextField({ name: "name", required: true, max: 100 }), new BoolField({ name: "is_active" }));
  types.addIndex("idx_mua_service_name", true, "name COLLATE NOCASE", "");
  app.save(types);
  let makeupId;
  for (const name of ["Makeup", "Grooming"]) {
    const category = new Record(types);
    category.set("name", name);
    category.set("is_active", true);
    app.save(category);
    if (name === "Makeup") makeupId = category.id;
  }
  for (const name of ["packages", "add_ons"]) {
    const collection = app.findCollectionByNameOrId(name);
    collection.fields.add(new RelationField({ name: "mua_service_types", collectionId: types.id, maxSelect: 99 }));
    app.save(collection);
  }
  app.db().newQuery("UPDATE add_ons SET mua_service_types = {:types} WHERE code = {:code} AND requires_mua = true")
    .bind({ types: JSON.stringify([makeupId]), code: "ADD-HAIRMAKEUP" }).execute();

  const logs = new Collection({ type: "base", name: "mua_completions" });
  // Snapshot identifiers as text so deleting a registration, user, or catalog
  // item cannot cascade into the historical log.
  for (const name of [
    "job_id", "job_order", "student_id", "student_name", "artist_id", "artist_name",
    "actor_id", "actor_name", "actor_role", "service_id", "service_name", "local_date", "package_id", "package_name",
  ]) logs.fields.add(new TextField({ name }));
  logs.fields.add(new DateField({ name: "completed_at", required: true }), new JSONField({ name: "sources" }));
  logs.addIndex("idx_mua_completion_service", true, "job_id, service_id", "");
  logs.addIndex("idx_mua_completion_day", false, "local_date, completed_at", "");
  app.save(logs);
}, (app) => {
  if (app.countRecords("mua_completions")) {
    throw new Error("Back up and retain the MUA completion history before removing this schema.");
  }
  app.delete(app.findCollectionByNameOrId("mua_completions"));
  for (const name of ["add_ons", "packages"]) {
    const collection = app.findCollectionByNameOrId(name);
    collection.fields.removeByName("mua_service_types");
    app.save(collection);
  }
  app.delete(app.findCollectionByNameOrId("mua_service_types"));
});
