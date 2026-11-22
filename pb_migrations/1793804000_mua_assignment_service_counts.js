/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const events = app.findCollectionByNameOrId("mua_assignment_events");
  events.fields.add(new NumberField({ name: "service_count", min: 0, onlyInt: true }));
  app.save(events);
}, (app) => {
  const events = app.findCollectionByNameOrId("mua_assignment_events");
  events.fields.removeByName("service_count");
  app.save(events);
});
