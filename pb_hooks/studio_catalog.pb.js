/// <reference path="../pb_data/types.d.ts" />

// ① Single items and ② saved poses (item_packages) for the package builder (studio_catalog.js).
// Names are cleaned and unique; a saved pose's items must exist, with quantities 1–999.
// Saved poses are templates: a package copies one in, so editing or deleting a saved pose never
// changes a package. Editing a single item re-renders every package, so the kiosk shows the
// change; an item a package or saved pose uses can't be deleted. Sold job orders keep their snapshots.

// A single item has its own price (one piece) and is sold at the kiosk only while the admin
// switches it on (is_active); studio_catalog.syncItemAddOn keeps its linked add-on in step.
const checkCatalogItem = (e) => {
  const catalog = require(__hooks + "/studio_catalog.js");
  const name = e.record.getString("name").trim().replace(/\s+/g, " ");
  if (!name) throw new BadRequestError("Enter the item's name.");
  if (!catalog.CATEGORIES.includes(e.record.getString("category"))) throw new BadRequestError("Choose Print, Frame, Other, Attire or Background.");
  e.record.set("name", name);
  const same = e.app.findAllRecords("catalog_items").find((r) => r.id !== e.record.id
    && r.getString("name").toLowerCase() === name.toLowerCase() && r.getString("category") === e.record.getString("category"));
  if (same) throw new BadRequestError(`"${name}" already exists.`);
  const amount = e.record.getFloat("amount");
  if (!(amount >= 0 && amount <= 1000000)) throw new BadRequestError("Enter a price from 0 to 1,000,000.");
  e.record.set("amount", Math.round(amount * 100) / 100);
  // Which kiosk form sells it: school, walk-in or both (empty means both).
  const kind = e.record.getString("client_kind") || "both";
  if (!["school", "walkin", "both"].includes(kind)) throw new BadRequestError("Choose School, Walk-in or Both.");
  e.record.set("client_kind", kind);
  if (e.record.getString("category") !== "other") e.record.set("required_photographers", []);
  if (e.record.isNew() || e.record.getString("required_photographers") !== e.record.original().getString("required_photographers")) {
    const photography = require(__hooks + "/studio_photography.js");
    if (e.record.getStringSlice("required_photographers").some((id) => !photography.enabledPhotographer(e.app, id))) {
      throw new BadRequestError("Select enabled photographer accounts for the item.");
    }
  }
  if (e.record.getBool("is_active") && !(amount > 0)) {
    throw new BadRequestError(`Set a price for "${name}" before selling it at the kiosk.`);
  }
  e.next();
  catalog.syncItemAddOn(e.app, e.record);
};
onRecordCreateRequest(checkCatalogItem, "catalog_items");
onRecordUpdateRequest(checkCatalogItem, "catalog_items");

// The add-on of a sold item is managed from its single item only (syncItemAddOn saves it
// without a request, so these never see it).
const linkedAddOn = (e) => {
  const original = e.record.original();
  if (e.record.getString('catalog_item') || (original && original.getString('catalog_item'))) {
    throw new BadRequestError('This add-on is a single item sold at the kiosk. Change it under Packages & Add-ons → Single items.');
  }
  return e.next();
};
onRecordCreateRequest(linkedAddOn, 'add_ons');
onRecordUpdateRequest(linkedAddOn, 'add_ons');
onRecordDeleteRequest(linkedAddOn, 'add_ons');

const checkItemPackage = (e) => {
  const catalog = require(__hooks + "/studio_catalog.js");
  const name = e.record.getString("name").trim().replace(/\s+/g, " ");
  if (!name) throw new BadRequestError("Name the pose, such as Colored toga w/out cap.");
  e.record.set("name", name);
  const raw = catalog.readJson(e.record.getString("items"));
  const items = [];
  for (const entry of Array.isArray(raw) ? raw : []) {
    if (!entry || !entry.item) continue;
    let item;
    try { item = e.app.findRecordById("catalog_items", entry.item); } catch (_) {
      throw new BadRequestError("An item in this pose no longer exists. Remove it and save again.");
    }
    const qty = entry.qty === undefined || entry.qty === null || entry.qty === "" ? 1 : Math.floor(Number(entry.qty));
    if (!(qty >= 1 && qty <= 999)) throw new BadRequestError(`Enter a quantity from 1 to 999 for "${item.getString("name")}".`);
    const existing = items.find((i) => i.item === item.id);
    if (existing) existing.qty += qty;
    else items.push({ item: item.id, qty });
  }
  if (items.length > 50) throw new BadRequestError("A pose can hold up to 50 items.");
  // The same name is fine when the contents differ; an exact copy is refused.
  const copy = e.app.findAllRecords("item_packages").find((r) => r.id !== e.record.id
    && r.getString("name").toLowerCase() === name.toLowerCase() && catalog.sameItems(catalog.readJson(r.getString("items")), items));
  if (copy) throw new BadRequestError(`"${name}" with these items already exists.`);
  e.record.set("items", items);
  return e.next();
};
onRecordCreateRequest(checkItemPackage, "item_packages");
onRecordUpdateRequest(checkItemPackage, "item_packages");

// Editing a single item updates every package that shows it (saved poses are copied, not linked).
onRecordAfterUpdateSuccess((e) => {
  const catalog = require(__hooks + "/studio_catalog.js");
  for (const pkg of e.app.findAllRecords("packages")) {
    if (pkg.getString("structure")) catalog.rerender(e.app, pkg);
  }
  require(__hooks + "/studio_station_events.js").notify(e.app);
  return e.next();
}, "catalog_items");

// A single item in use stays (packages and saved poses never point at nothing).
onRecordDeleteRequest((e) => {
  const catalog = require(__hooks + "/studio_catalog.js");
  const users = catalog.packagesUsing(e.app, e.record.id).map((p) => p.getString("name"));
  const inSets = e.app.findAllRecords("item_packages").filter((s) => s.getString("items").includes(`"${e.record.id}"`))
    .map((s) => s.getString("name"));
  const all = [...inSets, ...users];
  if (all.length) {
    throw new ApiError(409, `"${e.record.getString("name")}" is used in ${all.slice(0, 3).join(", ")}${all.length > 3 ? "…" : ""}. Remove it there first.`);
  }
  // Sold on its own: job orders keep its add-on, so keep the item too (switch it off instead).
  const linked = e.app.findRecordsByFilter("add_ons", "catalog_item = {:id}", "", 1, 0, { id: e.record.id })[0];
  if (linked) {
    const used = new DynamicModel({ n: 0 });
    e.app.db().newQuery(`SELECT COUNT(*) AS n FROM registrations
      WHERE json_valid(add_ons) AND json_type(add_ons) = 'array'
        AND EXISTS (SELECT 1 FROM json_each(registrations.add_ons) WHERE json_extract(value, '$.id') = {:id})`)
      .bind({ id: linked.id }).one(used);
    if (used.n) {
      throw new ApiError(409, `"${e.record.getString("name")}" was sold on ${used.n} job order${used.n === 1 ? "" : "s"}. Stop selling it at the kiosk instead of deleting it.`);
    }
  }
  e.app.runInTransaction((tx) => {
    if (linked) tx.delete(tx.findRecordById("add_ons", linked.id));
    e.app = tx;
    e.next();
  });
}, "catalog_items");
