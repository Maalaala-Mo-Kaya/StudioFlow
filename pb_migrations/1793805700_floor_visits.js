/// <reference path="../pb_data/types.d.ts" />

// registrations.floor_visits: which cameras have already shot a single-session client
// ([{ camera, cameraName, photographer, photographerName, shots, at }], one entry per camera and
// photographer). Server-owned: written only when a camera session ends with shots imported
// (studio_camera_import.js endSession). The Photo Floor shows it on the queue cards, so a client can
// go from camera to camera (solo, group) in any order.
migrate((app) => {
  const orders = app.findCollectionByNameOrId("registrations");
  if (!orders.fields.getByName("floor_visits")) orders.fields.add(new JSONField({ name: "floor_visits" }));
  app.save(orders);
}, (app) => {
  const orders = app.findCollectionByNameOrId("registrations");
  orders.fields.removeByName("floor_visits");
  app.save(orders);
});
