/// <reference path="../pb_data/types.d.ts" />

// packages.photos: the flyer and sample shots the kiosk shows (the first is the cover on the
// package card). Not protected: the kiosk is public and the photos are marketing. Thumbs: the
// card cover (480x360, cropped) and the popup carousel (1200 wide). The admin screen shrinks
// photos before uploading, so 8 MB is only a ceiling.
migrate((app) => {
  const packages = app.findCollectionByNameOrId("packages");
  if (!packages.fields.getByName("photos")) {
    packages.fields.add(new FileField({
      name: "photos", maxSelect: 12, maxSize: 8 * 1024 * 1024,
      mimeTypes: ["image/jpeg", "image/png", "image/webp"],
      thumbs: ["480x360", "1200x0"],
    }));
  }
  app.save(packages);
}, (app) => {
  const packages = app.findCollectionByNameOrId("packages");
  packages.fields.removeByName("photos");
  app.save(packages);
});
