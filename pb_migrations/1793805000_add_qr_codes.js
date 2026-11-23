/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  // Custom routes are the only public API for these records.
  const codes = new Collection({ name: "qr_codes", type: "base",
    listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null });
  codes.fields.add(
    new TextField({ name: "slug", max: 24 }),
    new SelectField({ name: "kind", required: true, values: ["direct", "protected", "wifi"] }),
    new TextField({ name: "name", max: 120 }),
    new TextField({ name: "destination", max: 1800, hidden: true }),
    new PasswordField({ name: "password", max: 71, hidden: true }),
    new TextField({ name: "expires_on", max: 10 }),
    new BoolField({ name: "disabled" }),
    new TextField({ name: "ssid", max: 32 }),
    new SelectField({ name: "security", values: ["WPA", "WEP", "nopass"] }),
    new BoolField({ name: "hidden_network" }),
    new AutodateField({ name: "created", onCreate: true }),
  );
  codes.addIndex("idx_qr_codes_slug", true, "slug", "slug != ''");
  app.save(codes);
  app.db().newQuery(`
    CREATE TABLE studio_qr_attempts (
      scope TEXT PRIMARY KEY,
      window INTEGER NOT NULL,
      attempts INTEGER NOT NULL
    )
  `).execute();
}, (app) => {
  app.db().newQuery("DROP TABLE studio_qr_attempts").execute();
  app.delete(app.findCollectionByNameOrId("qr_codes"));
});
