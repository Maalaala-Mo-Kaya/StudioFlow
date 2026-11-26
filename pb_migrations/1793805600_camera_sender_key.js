/// <reference path="../pb_data/types.d.ts" />

// camera_stations.sender_key: the secret the Photo Sender uses to upload shots over HTTP
// (POST /api/studioflow/camera-sender/:id/upload), instead of copying them into a Windows
// shared folder. Hidden and server-owned: created and reset only through
// /api/studioflow/camera-sender/:id/key (studio_camera_sender.js); the collection API never
// returns it and the request hooks keep it unchanged.
migrate((app) => {
  const stations = app.findCollectionByNameOrId("camera_stations");
  if (!stations.fields.getByName("sender_key")) {
    stations.fields.add(new TextField({ name: "sender_key", hidden: true, max: 100 }));
  }
  app.save(stations);
}, (app) => {
  const stations = app.findCollectionByNameOrId("camera_stations");
  stations.fields.removeByName("sender_key");
  app.save(stations);
});
