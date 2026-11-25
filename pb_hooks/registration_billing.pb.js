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
  const body = e.requestInfo().body || {};
  const quote = body.no_mua_default_quote;
  const app = e.app;
  return app.runInTransaction((tx) => {
    // Use one catalog snapshot for the quote, service requirements and sold prices.
    e.app = tx;
    try {
      if (!e.auth) {
        const requestId = body.registration_request_id;
        if (typeof requestId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(requestId)) {
          throw new ApiError(409, "Refresh the registration form before submitting.");
        }
        // Acquire the write lock before checking the published configuration or a retried submission.
        tx.db().newQuery("UPDATE studio_settings SET id = id WHERE key = 'main'").execute();
        const [existing] = tx.findRecordsByFilter("registrations", "kiosk_request_id = {:requestId}", "", 1, 0, { requestId });
        if (existing) return e.json(200, { id: existing.id });
        const version = require(__hooks + "/studio_registration_catalog.js").configuration(tx).version;
        if (body.registration_version !== version) {
          throw new ApiError(409, "The registration form was updated. Load the latest configuration and review your answers.");
        }
        e.record.set("kiosk_request_id", requestId);
      } else {
        e.record.set("kiosk_request_id", "");
      }
      const workflow = require(__hooks + "/studio_workflow.js");
      const [defaultAddOn] = pricing.defaultAddOns(tx, clientKind);
      const addOns = pricing.priceAddOns(tx, selections, [], clientKind)
        .filter((item) => item.id !== defaultAddOn?.id);
      if (!e.auth && addOns.filter((item) => item.revenue_category === "mua" ||
        (item.revenue_category !== "studio" && workflow.serviceRequirement(tx.findRecordById("add_ons", item.id), "add_on"))).length > 1) {
        throw new BadRequestError("Choose only one Makeup Artist Service.");
      }
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
  const body = e.requestInfo().body || {};
  const cashierEdits = require(__hooks + "/studio_cashier_edits.js");
  const cashierEdit = Object.hasOwn(body, cashierEdits.versionField);
  if (cashierEdit) cashierEdits.validateRequest(e, body, original);
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
  // The cashier may add add-ons at the counter (at catalog price), but not remove or reprice
  // what is already on the order; package, fees and removals stay with administrators.
  const isCashier = e.auth?.getString("role") === "cashier";
  const itemKey = (item) => item.id ?? item.name;
  if (addOnsChanged && isCashier && !cashierEdit) {
    const kept = new Map(addOns.map((item) => [itemKey(item), item]));
    if (previousAddOns.some((item) => !kept.has(itemKey(item)) || cents(kept.get(itemKey(item)).amount) !== cents(item.amount))) {
      throw new ForbiddenError("The cashier can only add add-ons. Ask an administrator to remove or change one.");
    }
  } else if (addOnsChanged && !isAdmin && !cashierEdit) throw new ForbiddenError("Only administrators can change add-ons.");

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
  // Server-written history (below): never taken from the request.
  e.record.set("order_changes", original.get("order_changes"));
  if ("order_discount" in body && !isAdmin) throw new ForbiddenError("Use the cashier discount action.");
  if (itemsChanged || "review_mua_amount" in body || "order_discount" in body) {
    const final = require(__hooks + "/studio_revenue.js").changes(e, original, total, itemsChanged);
    e.record.set("total_amount", final / 100);
    // Balance and payment status from the receipts and refunds (a cancelled order still owes nothing).
    const ledgerRules = require(__hooks + "/studio_ledger.js");
    ledgerRules.applyTotals(e.record, ledgerRules.ledger(e.app, e.record));
  } else {
    e.record.set("total_amount", original.getFloat("total_amount"));
    for (const field of ["revenue_terms", "revenue_review", "revenue_discount"]) e.record.set(field, original.get(field));
  }

  if (itemsChanged) {
    const workflow = require(__hooks + "/studio_workflow.js");
    if (cashierEdit) {
      // An unpaid client stays pending. Derive their MUA services from the priced selections.
      const saved = workflow.makeupServices(original);
      const services = workflow.purchasedServices(e.app, e.record, original);
      if (JSON.stringify(saved) !== JSON.stringify(services)) {
        workflow.saveMakeupServices(e.record, services);
        e.record.set("makeup_version", original.getInt("makeup_version") + 1);
      }
    }
    // What changed, for the order's history and the next payment receipt ("Added · Extra 8R Frame ₱350").
    const priceOf = (item) => cents(item.amount) / 100;
    const line = (item) => ({ name: item.name, amount: priceOf(item) });
    const beforeKeys = new Set(previousAddOns.map(itemKey));
    const afterKeys = new Set(addOns.map(itemKey));
    const added = addOns.filter((item) => !beforeKeys.has(itemKey(item))).map(line);
    const removed = previousAddOns.filter((item) => !afterKeys.has(itemKey(item))).map(line);
    const oldPackage = workflow.json(original, "package_snapshot");
    const change = {
      at: new Date().toISOString(),
      by: e.auth ? require(__hooks + "/studio_ledger.js").actorName(e.auth) : "Superuser",
      added, removed,
      ...(pkg ? { package: { from: oldPackage?.name || "", to: pkg.getString("name"), amount: pkg.getFloat("amount") } } : {}),
      ...(feesChanged ? { fees: { from: original.getFloat("other_fees"), to: fees / 100 } } : {}),
      total_before: original.getFloat("total_amount"),
      total_after: e.record.getFloat("total_amount"),
    };
    const history = workflow.json(original, "order_changes");
    e.record.set("order_changes", [...(Array.isArray(history) ? history : []), change]);

    // Something new to make: an order whose production was marked ready goes back to In production,
    // so it leaves Ready for Pickup (and its pickup notice resets) until an admin marks it ready again.
    const readyStatus = ["completed", "ready_for_pickup"].includes(status);
    const readyFraming = ["framed", "ready_for_pickup"].includes(original.getString("framing_status"));
    if ((pkg || added.length) && (readyStatus || readyFraming)) {
      e.record.set("framing_status", "in_production");
      if (readyStatus) e.record.set("status", "done_shooting");
    }
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
  const table = e.record.collection().name;
  // A package's freebies are saved as a clean list of text items.
  if (table === "packages") {
    // The kiosk line under the price ("with 10x12 PREMIUM frame"); empty shows the frame.
    e.record.set("tagline", e.record.getString("tagline").trim().replace(/\s+/g, " "));
    // The builder sends `structure` (the package's poses and single items); a package written
    // as text (Import from File, older screens) is converted to one. Either way the shown
    // inclusions, freebies and options are rendered from it (studio_catalog.js).
    const catalog = require(__hooks + "/studio_catalog.js");
    const body = e.requestInfo().body || {};
    let structure = null;
    if (Object.hasOwn(body, "structure")) {
      const checked = catalog.validate(e.app, e.record.getString("structure"));
      if (checked.problem) throw new BadRequestError(checked.problem);
      structure = checked.structure;
    } else if (["inclusions", "freebies", "option_groups"].some((field) => Object.hasOwn(body, field))) {
      structure = catalog.convertLegacy(e.app, e.record.getString("inclusions"), e.record.getString("freebies"),
        e.record.getString("option_groups"), e.record.getInt("photo_selection_limit"));
    } else if (Object.hasOwn(body, "photo_selection_limit") && e.record.getString("structure")) {
      structure = catalog.readJson(e.record.getString("structure"));
    }
    if (structure) {
      const out = catalog.render(e.app, structure, e.record.getInt("photo_selection_limit"));
      e.record.set("structure", structure);
      e.record.set("inclusions", out.inclusions);
      e.record.set("freebies", out.freebies);
      e.record.set("option_groups", out.option_groups);
    }
    const pricing = require(__hooks + "/studio_pricing.js");
    const freebies = pricing.packageInclusions(e.record, "freebies").map((item) => item.trim()).filter(Boolean);
    if (freebies.some((item) => item.length > 200)) throw new BadRequestError("Keep each freebie under 200 characters.");
    e.record.set("freebies", freebies);
    // Inclusions: plain items and titled sections (two levels), cleaned and saved as a list.
    const inclusions = pricing.cleanInclusions(pricing.readList(e.record.getString("inclusions")));
    if (inclusions.problem) throw new BadRequestError(inclusions.problem);
    e.record.set("inclusions", inclusions.items);
    // Option groups the client chooses from (studio_package_options.js), cleaned and given ids.
    const options = require(__hooks + "/studio_package_options.js").normalizeGroups(e.record.getString("option_groups"));
    if (options.problem) throw new BadRequestError(options.problem);
    e.record.set("option_groups", options.groups);
  }
  // Codes are unique per collection, ignoring case (idx_packages_code / idx_add_ons_code are the
  // backstop when two saves race). Checked here first for a clear message.
  const code = e.record.getString("code").trim();
  e.record.set("code", code);
  if (code) {
    const found = new DynamicModel({ n: 0 });
    e.app.db().newQuery(`SELECT COUNT(*) AS n FROM ${table} WHERE code = {:code} COLLATE NOCASE AND id != {:id}`)
      .bind({ code, id: e.record.id }).one(found);
    if (found.n) {
      throw new BadRequestError(`Code ${code} is already used by another ${table === "packages" ? "package" : "add-on"}.`);
    }
  }
  // Where its money goes. Without it, a sale's cash can't be counted as Studio or MUA revenue
  // (it stays unallocated even when the order is fully paid). Older records saved before the field
  // existed must be given one on their next save.
  // (A single item's linked add-on is always Studio; studio_catalog.pb.js refuses saving it directly with its own message.)
  if (!e.record.getString("catalog_item") && !["studio", "mua"].includes(e.record.getString("revenue_category"))) {
    throw new BadRequestError(`Choose where this ${table === "packages" ? "package" : "add-on"}'s money goes: Studio revenue or Other Payment — MUA.`);
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
  // A single item's add-on is refused by studio_catalog.pb.js with its own message.
  if (e.record.getString("catalog_item")) return e.next();
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
  let catalog;
  e.app.runInTransaction((tx) => {
    catalog = require(__hooks + "/studio_registration_catalog.js").configuration(tx);
  });
  e.response.header().set("Cache-Control", "no-store");
  return e.json(200, catalog);
});
