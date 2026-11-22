/// <reference path="../pb_data/types.d.ts" />

// catalog_items.client_kind ("school" | "walkin" | "both"; empty means both, as for add-ons):
// which kiosk form offers a single item sold on its own. Its linked add-on follows it
// (studio_catalog.syncItemAddOn), so the kiosk and studio_pricing.offeredTo check it as usual.
migrate((app) => {
  const items = app.findCollectionByNameOrId("catalog_items");
  if (!items.fields.getByName("client_kind")) {
    items.fields.add(new SelectField({ name: "client_kind", values: ["school", "walkin", "both"], maxSelect: 1 }));
  }
  app.save(items);
  app.db().newQuery("UPDATE catalog_items SET client_kind = 'both' WHERE client_kind = '' OR client_kind IS NULL").execute();
}, (app) => {
  const items = app.findCollectionByNameOrId("catalog_items");
  items.fields.removeByName("client_kind");
  app.save(items);
});
