/// <reference path="../pb_data/types.d.ts" />

// registrations.order_changes: a server-written log of what was added to or removed from a job
// order after it was made (add-ons, package, other fees), with who, when and the totals before and
// after. The payment receipt prints what was added since the previous payment ("Added · Extra 8R
// Frame ₱350"). Written only by registration_billing.pb.js; clients can't set it.
migrate((app) => {
  const orders = app.findCollectionByNameOrId("registrations");
  if (!orders.fields.getByName("order_changes")) orders.fields.add(new JSONField({ name: "order_changes" }));
  app.save(orders);
}, (app) => {
  const orders = app.findCollectionByNameOrId("registrations");
  orders.fields.removeByName("order_changes");
  app.save(orders);
});
