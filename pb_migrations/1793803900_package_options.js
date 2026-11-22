/// <reference path="../pb_data/types.d.ts" />

// Package options: a package lists named groups of choices (packages.option_groups) and the
// client's picks are saved on the job order (registrations.package_options), checked by
// pb_hooks/studio_package_options.js. Existing packages have no options; existing orders, no picks.
migrate((app) => {
  const packages = app.findCollectionByNameOrId("packages");
  if (!packages.fields.getByName("option_groups")) {
    packages.fields.add(new JSONField({ name: "option_groups" }));
    app.save(packages);
  }
  const registrations = app.findCollectionByNameOrId("registrations");
  if (!registrations.fields.getByName("package_options")) {
    registrations.fields.add(new JSONField({ name: "package_options" }));
    app.save(registrations);
  }
}, (app) => {
  const packages = app.findCollectionByNameOrId("packages");
  packages.fields.removeByName("option_groups");
  app.save(packages);
  const registrations = app.findCollectionByNameOrId("registrations");
  registrations.fields.removeByName("package_options");
  app.save(registrations);
});
