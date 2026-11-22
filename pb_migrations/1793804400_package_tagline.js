/// <reference path="../pb_data/types.d.ts" />

// packages.tagline: the line under the price on the kiosk card and popup ("with 10x12 PREMIUM
// frame"). Empty means the kiosk shows "with <frame>" from the package's Frame and Prints.
migrate((app) => {
  const packages = app.findCollectionByNameOrId("packages");
  if (!packages.fields.getByName("tagline")) packages.fields.add(new TextField({ name: "tagline", max: 120 }));
  app.save(packages);
}, (app) => {
  const packages = app.findCollectionByNameOrId("packages");
  packages.fields.removeByName("tagline");
  app.save(packages);
});
