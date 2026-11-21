/// <reference path="../pb_data/types.d.ts" />

// Packages can list freebies (free frame, family picture, raw copies…) apart from their inclusions.
// Like inclusions, they are frozen on the job order at sale (package_snapshot.freebies), so later
// catalog edits don't change what a client was promised. Existing packages and orders get none.
// Safe to run on a database that already has the field (this migration was first numbered 1793803700).
migrate((app) => {
  const packages = app.findCollectionByNameOrId("packages");
  if (packages.fields.getByName("freebies")) return;
  packages.fields.add(new JSONField({ name: "freebies" }));
  app.save(packages);
}, (app) => {
  const packages = app.findCollectionByNameOrId("packages");
  packages.fields.removeByName("freebies");
  app.save(packages);
});
