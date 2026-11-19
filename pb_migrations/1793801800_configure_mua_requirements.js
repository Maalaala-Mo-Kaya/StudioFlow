/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  for (const name of ["packages", "add_ons"]) {
    const collection = app.findCollectionByNameOrId(name);
    collection.fields.add(new BoolField({ name: "requires_mua" }));
    app.save(collection);
  }

  // This is the stable code used by the original catalog seed.
  app.db().newQuery("UPDATE add_ons SET requires_mua = true WHERE code = {:code}")
    .bind({ code: "ADD-HAIRMAKEUP" }).execute();

  const registrations = app.findCollectionByNameOrId("registrations");
  registrations.fields.add(new JSONField({ name: "makeup_services" }));
  app.save(registrations);
}, (app) => {
  const registrations = app.findCollectionByNameOrId("registrations");
  registrations.fields.removeByName("makeup_services");
  app.save(registrations);

  for (const name of ["add_ons", "packages"]) {
    const collection = app.findCollectionByNameOrId(name);
    collection.fields.removeByName("requires_mua");
    app.save(collection);
  }
});
