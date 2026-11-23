/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const codes = app.findCollectionByNameOrId("qr_codes");
  codes.fields.add(new TextField({ name: "wifi_ciphertext", max: 512, hidden: true }));
  app.save(codes);
}, (app) => {
  const codes = app.findCollectionByNameOrId("qr_codes");
  codes.fields.removeByName("wifi_ciphertext");
  app.save(codes);
});
