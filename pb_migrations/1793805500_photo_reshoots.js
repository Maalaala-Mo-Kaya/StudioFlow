/// <reference path="../pb_data/types.d.ts" />

// registrations.photo_reshoots: every time a finished shoot was reopened for a re-shoot
// ([{ at, by, by_name, role, reason, photos }]). Server-owned: written only by
// POST /api/studioflow/shoot/:id/reshoot (studio_shoot_review.js).
migrate((app) => {
  const orders = app.findCollectionByNameOrId("registrations");
  if (!orders.fields.getByName("photo_reshoots")) orders.fields.add(new JSONField({ name: "photo_reshoots" }));
  app.save(orders);
}, (app) => {
  const orders = app.findCollectionByNameOrId("registrations");
  orders.fields.removeByName("photo_reshoots");
  app.save(orders);
});
