/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const types = app.findCollectionByNameOrId("mua_service_types");
  types.fields.add(new NumberField({ name: "payout_rate", min: 0 }));
  app.save(types);
  const logs = app.findCollectionByNameOrId("mua_completions");
  logs.fields.add(new NumberField({ name: "payout_rate", min: 0 }));
  app.save(logs);
}, (app) => {
  const logs = app.findCollectionByNameOrId("mua_completions");
  logs.fields.removeByName("payout_rate");
  app.save(logs);
  const types = app.findCollectionByNameOrId("mua_service_types");
  types.fields.removeByName("payout_rate");
  app.save(types);
});
