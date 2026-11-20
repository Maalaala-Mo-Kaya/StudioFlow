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
  e.record.set("add_ons", pricing.priceAddOns(e.app, selections, [], clientKind));
  return e.next();
}, "registrations");

onRecordCreate((e) => {
  const pricing = require(__hooks + "/studio_pricing.js");
  const packageId = e.record.getString("package");
  const pkg = packageId ? e.app.findRecordById("packages", packageId) : null;
  const base = pkg ? pkg.getFloat("amount") : 0;
  e.record.set("package_snapshot", pkg ? {
    id: pkg.id, code: pkg.getString("code"), name: pkg.getString("name"), amount: base,
    revenue_category: pkg.getString("revenue_category"),
  } : null);
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

  // Add-ons: admin only. Ones already on the order keep their price; new ones come from the catalog.
  const previousAddOns = pricing.savedAddOns(original);
  let addOns = previousAddOns;
  let addOnsChanged = false;
  if ("add_ons" in (e.requestInfo().body || {})) {
    let selections;
    try { selections = JSON.parse(e.record.getString("add_ons") || "null") ?? []; } catch (_) { throw new BadRequestError("Invalid add-on selection."); }
    addOns = pricing.priceAddOns(e.app, selections, previousAddOns, e.record.getString("client_kind") === "walkin" ? "walkin" : "school");
    // Changed = a different set of add-ons or prices (resending the same list is not a change).
    const key = (items) => JSON.stringify(items.map((item) => [item.id ?? item.name, pricing.cents(item.amount)]));
    addOnsChanged = key(addOns) !== key(previousAddOns);
  }
  if (addOnsChanged && !isAdmin) throw new ForbiddenError("Only administrators can change add-ons.");
  // Unchanged: keep exactly what was saved (older records may carry extra fields such as quantity).
  e.record.set("add_ons", addOnsChanged ? addOns : original.get("add_ons"));

  const packageId = e.record.getString("package");
  const packageChanged = Boolean(packageId) && packageId !== original.getString("package");
  const originalDiscount = require(__hooks + "/studio_workflow.js").json(original, "revenue_discount");
  const subtotal = cents(original.getFloat("total_amount")) + (originalDiscount?.studio || 0) + (originalDiscount?.mua || 0);
  let total = subtotal;
  if (packageChanged) {
    const pkg = e.app.findRecordById("packages", packageId);
    const base = pkg.getFloat("amount");
    e.record.set("package_snapshot", {
      id: pkg.id, code: pkg.getString("code"), name: pkg.getString("name"), amount: base,
      revenue_category: pkg.getString("revenue_category"),
    });
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
