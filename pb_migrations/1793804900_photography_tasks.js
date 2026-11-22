/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const items = app.findCollectionByNameOrId("catalog_items");
  items.fields.add(new RelationField({
    name: "required_photographers", collectionId: app.findCollectionByNameOrId("users").id, maxSelect: 50,
  }));
  app.save(items);
  const registrations = app.findCollectionByNameOrId("registrations");
  registrations.fields.add(new JSONField({ name: "photography", maxSize: 2000000 }));
  app.save(registrations);
  const stations = app.findCollectionByNameOrId("camera_stations");
  stations.fields.add(new TextField({ name: "session_task" }), new TextField({ name: "session_photographer" }),
    new NumberField({ name: "session_finishing", onlyInt: true }));
  app.save(stations);
}, (app) => {
  for (const [name, fields] of Object.entries({
    catalog_items: ["required_photographers"],
    registrations: ["photography"],
    camera_stations: ["session_task", "session_photographer", "session_finishing"],
  })) {
    const collection = app.findCollectionByNameOrId(name);
    for (const field of fields) collection.fields.removeByName(field);
    app.save(collection);
  }
});
