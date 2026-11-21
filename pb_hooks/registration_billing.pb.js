/// <reference path="../pb_data/types.d.ts" />

// Job order price: package + add-ons + other fees, always from the catalog (studio_pricing.js).

onRecordCreateRequest((e) => {
  const pricing = require(__hooks + "/studio_pricing.js");
  if (!e.hasSuperuserAuth() && e.auth?.getString("role") !== "admin") {
    e.record.set("pictorial_date", "");
  }
  // PocketBase exposes JSON fields as JSONRaw. Read the JSON text before using it as an array.
  let selections;
  try { selections = JSON.parse(e.record.getString("add_ons") || "null") ?? []; } catch (_) { throw new BadRequestError("Invalid add-on selection."); }
  // Runs before registration_validation sets the default client type: empty means a school client.
  const clientKind = e.record.getString("client_kind") === "walkin" ? "walkin" : "school";
  const quote = e.requestInfo().body?.no_mua_default_quote;
  const app = e.app;
  return app.runInTransaction((tx) => {
    // Use one catalog snapshot for the quote, service requirements and sold prices.
    e.app = tx;
    try {
      const workflow = require(__hooks + "/studio_workflow.js");
      const [defaultAddOn] = pricing.defaultAddOns(tx, clientKind);
      const addOns = pricing.priceAddOns(tx, selections, [], clientKind)
        .filter((item) => item.id !== defaultAddOn?.id);
      e.record.set("add_ons", addOns);
      const auto = e.record.getString("package") && defaultAddOn
        && !workflow.purchasedServices(tx, e.record).length ? defaultAddOn : null;
      const expected = auto ? auto.id + ":" + pricing.cents(auto.getFloat("amount")) : "none";
      if (quote !== undefined && quote !== expected) {
        throw new BadRequestError("The automatic add-on changed. Review the updated package total and submit again.");
      }
      if (auto) e.record.set("add_ons", [...addOns, { ...pricing.snapshotAddOn(auto), auto_applied: true }]);
      return e.next();
    } finally { e.app = app; }
  });
}, "registrations");

onRecordCreate((e) => {
  const pricing = require(__hooks + "/studio_pricing.js");
  const packageId = e.record.getString("package");
  const pkg = packageId ? e.app.findRecordById("packages", packageId) : null;
  const base = pkg ? pkg.getFloat("amount") : 0;
  e.record.set("package_snapshot", pkg ? pricing.snapshotPackage(pkg) : null);
  const total = pricing.cents(base) + pricing.addOnCents(pricing.savedAddOns(e.record)) + pricing.cents(e.record.getFloat("other_fees"));
  e.record.set("total_amount", total / 100);
  e.record.set("revenue_terms", require(__hooks + "/studio_revenue.js").terms(e.record, total));
  e.record.set("revenue_review", null);
  e.record.set("revenue_discount", null);
  e.record.set("balance", Math.max(0, total - pricing.cents(e.record.getFloat("paid_amount"))) / 100);
  return e.next();
}, "registrations");

onRecordUpdateRequest((e) => {
  const pricing = require(__hooks + "/studio_pricing.js");
  const { cents } = pricing;
  const original = e.record.original();
  const isAdmin = e.hasSuperuserAuth() || e.auth?.getString("role") === "admin";
  if (e.record.getString("pictorial_date") !== original.getString("pictorial_date") && !isAdmin) {
    throw new ForbiddenError("Only administrators can schedule pictorial dates.");
  }

  // Other fees change the price: admin only, never negative.
  const fees = cents(e.record.getFloat("other_fees"));
  const feesChanged = fees !== cents(original.getFloat("other_fees"));
  if (feesChanged && !isAdmin) throw new ForbiddenError("Only administrators can change other fees.");
  if (fees < 0) throw new BadRequestError("Other fees can't be negative.");

  const clientKind = e.record.getString("client_kind") === "walkin" ? "walkin" : "school";
  const packageId = e.record.getString("package");
  const packageChanged = Boolean(packageId) && packageId !== original.getString("package");
  // Add-ons: admin only. Ones already on the order keep their price; new ones come from the catalog.
  const previousAddOns = pricing.savedAddOns(original);
  let addOns = previousAddOns;
  const addOnsSent = "add_ons" in (e.requestInfo().body || {});
  if (addOnsSent) {
    let selections;
    try { selections = JSON.parse(e.record.getString("add_ons") || "null") ?? []; } catch (_) { throw new BadRequestError("Invalid add-on selection."); }
    addOns = pricing.priceAddOns(e.app, selections, previousAddOns, clientKind);
  }
  // Changed = a different set of add-ons or prices (resending the same list is not a change).
  const key = (items) => JSON.stringify(items.map((item) => [item.id ?? item.name, pricing.cents(item.amount)]));
  let addOnsChanged = key(addOns) !== key(previousAddOns);
  if (addOnsChanged && !isAdmin) throw new ForbiddenError("Only administrators can change add-ons.");

  // A released order is closed, and a cancelled one owes nothing until it is restored.
  const status = original.getString("status");
  if ((packageChanged || addOnsChanged || feesChanged) && ["released", "cancelled"].includes(status)) {
    throw new BadRequestError(status === "released"
      ? "This order was already released, so its package, add-ons and fees can't change."
      : "This order is cancelled. Restore it before changing its package, add-ons or fees.");
  }
  // A new package must be on sale and offered to this type of client (the same rule as the kiosk).
  const pkg = packageChanged ? e.app.findRecordById("packages", packageId) : null;
  if (pkg && !pkg.getBool("is_active")) {
    throw new BadRequestError(`"${pkg.getString("name")}" is no longer offered. Choose an active package.`);
  }
  if (pkg && ![clientKind, "both"].includes(pkg.getString("client_kind") || "school")) {
    throw new BadRequestError(`"${pkg.getString("name")}" is not offered to ${clientKind === "walkin" ? "walk-in" : "school"} clients.`);
  }

  // The automatic add-on follows the edited order (see studio_pricing.applyAutoAddOn).
  if (packageChanged || addOnsChanged) {
    e.record.set("add_ons", addOns);
    addOns = pricing.applyAutoAddOn(e.app, e.record, clientKind);
    addOnsChanged = key(addOns) !== key(previousAddOns);
  }
  // Unchanged: keep exactly what was saved (older records may carry extra fields such as quantity).
  e.record.set("add_ons", addOnsChanged ? addOns : original.get("add_ons"));

  const originalDiscount = require(__hooks + "/studio_workflow.js").json(original, "revenue_discount");
  const subtotal = cents(original.getFloat("total_amount")) + (originalDiscount?.studio || 0) + (originalDiscount?.mua || 0);
  let total = subtotal;
  if (pkg) {
    const base = pkg.getFloat("amount");
    e.record.set("package_snapshot", pricing.snapshotPackage(pkg));
    total = cents(base) + pricing.addOnCents(addOns) + fees;
  } else {
    e.record.set("package_snapshot", original.get("package_snapshot"));
    // Same package: keep the price it was sold at and swap only what changed.
    if (feesChanged || addOnsChanged) {
      total = subtotal - pricing.addOnCents(previousAddOns) - cents(original.getFloat("other_fees"))
        + pricing.addOnCents(addOns) + fees;
    }
  }
  const itemsChanged = packageChanged || addOnsChanged || feesChanged;
  const body = e.requestInfo().body || {};
  if (itemsChanged || "review_mua_amount" in body || "order_discount" in body) {
    if (("order_discount" in body) && ["cancelled", "released"].includes(original.getString("status"))) {
      throw new BadRequestError("Discounts can only be changed on active, unreleased orders.");
    }
    const final = require(__hooks + "/studio_revenue.js").changes(e, original, total, itemsChanged);
    e.record.set("total_amount", final / 100);
    // Balance and payment status from the receipts and refunds (a cancelled order still owes nothing).
    const ledgerRules = require(__hooks + "/studio_ledger.js");
    ledgerRules.applyTotals(e.record, ledgerRules.ledger(e.app, e.record));
  } else {
    e.record.set("total_amount", original.getFloat("total_amount"));
    for (const field of ["revenue_terms", "revenue_review", "revenue_discount"]) e.record.set(field, original.get(field));
  }
  return e.next();
}, "registrations");

// Catalog prices can't be negative: a package or add-on below ₱0 would lower every job order that uses it.
// Their client type is "school", "walkin" or "both" (empty: packages mean school, add-ons mean both).
const checkCatalogPrice = (e) => {
  const amount = e.record.getFloat("amount");
  if (!Number.isFinite(amount) || amount < 0) throw new BadRequestError("The price can't be negative.");
  if (!["", "school", "walkin", "both"].includes(e.record.getString("client_kind"))) {
    throw new BadRequestError("Choose who it is offered to: school, walk-in or both.");
  }
  return e.next();
};
onRecordCreateRequest((e) => {
  const value = e.requestInfo().body?.amount;
  if ((typeof value !== "number" && (typeof value !== "string" || !value.trim())) || !Number.isFinite(Number(value))) {
    throw new BadRequestError("Enter a price. Use zero for a free item.");
  }
  return e.next();
}, "packages", "add_ons");
onRecordCreateRequest(checkCatalogPrice, "packages", "add_ons");
onRecordUpdateRequest(checkCatalogPrice, "packages", "add_ons");

onRecordValidate((e) => {
  const item = e.record;
  if (item.getBool("default_when_no_mua")) {
    if (item.getString("revenue_category") !== "mua") {
      throw new BadRequestError("The Default Addon Rule is available only for Other Payment — MUA add-ons.");
    }
    for (const kind of ["school", "walkin"]) {
      const pricing = require(__hooks + "/studio_pricing.js");
      if (item.getBool("is_active") && pricing.offeredTo(item, kind)
        && pricing.defaultAddOns(e.app, kind).some((other) => other.id !== item.id)) {
        throw new BadRequestError(`Turn off the current default for ${kind === "school" ? "school" : "walk-in"} clients before setting another.`);
      }
    }
  }
  return e.next();
}, "add_ons");

// A package or add-on that job orders use stays on record: deactivate it to stop selling it.
// (Handlers run in isolated scopes, so the check is written inside each one.)
onRecordDeleteRequest((e) => {
  const used = new DynamicModel({ n: 0 });
  e.app.db().newQuery("SELECT COUNT(*) AS n FROM registrations WHERE package = {:id}").bind({ id: e.record.id }).one(used);
  if (used.n) {
    throw new ApiError(409, `${used.n} job order${used.n === 1 ? " uses" : "s use"} this package. Deactivate it instead of deleting it.`);
  }
  return e.next();
}, "packages");
onRecordDeleteRequest((e) => {
  const used = new DynamicModel({ n: 0 });
  e.app.db().newQuery(`SELECT COUNT(*) AS n FROM registrations
    WHERE json_valid(add_ons) AND json_type(add_ons) = 'array'
      AND EXISTS (SELECT 1 FROM json_each(registrations.add_ons) WHERE json_extract(value, '$.id') = {:id})`)
    .bind({ id: e.record.id }).one(used);
  if (used.n) {
    throw new ApiError(409, `${used.n} job order${used.n === 1 ? " uses" : "s use"} this add-on. Deactivate it instead of deleting it.`);
  }
  return e.next();
}, "add_ons");

routerAdd("GET", "/api/studioflow/registration-catalog", (e) => {
  const workflow = require(__hooks + "/studio_workflow.js");
  let catalog;
  e.app.runInTransaction((tx) => {
    const list = (collection, source) => tx.findRecordsByFilter(collection, "is_active = true", "created,id", 0, 0)
      .map((item) => ({ ...item.publicExport(), requires_mua: !!workflow.serviceRequirement(item, source) }));
    catalog = { packages: list("packages", "package"), addOns: list("add_ons", "add_on") };
  });
  e.response.header().set("Cache-Control", "no-store");
  return e.json(200, catalog);
});
