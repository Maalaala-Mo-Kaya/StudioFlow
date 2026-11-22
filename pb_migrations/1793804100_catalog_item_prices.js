/// <reference path="../pb_data/types.d.ts" />

// Single items get their own price and can be sold on their own at the kiosk.
// - catalog_items.amount: the price of one piece.
// - catalog_items.is_active now means "sold at the kiosk". Items were created active before, so
//   every existing item starts switched off; the admin turns on the ones to sell.
// - add_ons.catalog_item: the add-on the server keeps in step with a sold item
//   (studio_catalog.pb.js), so job orders, receipts, the ledger and exports treat it as an add-on.
migrate((app) => {
  const items = app.findCollectionByNameOrId("catalog_items");
  if (!items.fields.getByName("amount")) items.fields.add(new NumberField({ name: "amount", min: 0 }));
  app.save(items);
  app.db().newQuery("UPDATE catalog_items SET is_active = false, amount = COALESCE(amount, 0)").execute();

  const addOns = app.findCollectionByNameOrId("add_ons");
  if (!addOns.fields.getByName("catalog_item")) {
    addOns.fields.add(new RelationField({ name: "catalog_item", collectionId: items.id, maxSelect: 1, cascadeDelete: false }));
  }
  app.save(addOns);
}, (app) => {
  const addOns = app.findCollectionByNameOrId("add_ons");
  addOns.fields.removeByName("catalog_item");
  app.save(addOns);
  const items = app.findCollectionByNameOrId("catalog_items");
  items.fields.removeByName("amount");
  app.save(items);
});
