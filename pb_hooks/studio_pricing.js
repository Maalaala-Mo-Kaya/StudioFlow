/// <reference path="../pb_data/types.d.ts" />

// Job order pricing shared by the registration hooks (load with require(__hooks + "/studio_pricing.js") inside a handler).
// total_amount = package price + add-ons + other fees; every price comes from the catalog, never from the client.

const cents = (value) => (typeof value === "number" && Number.isFinite(value) ? Math.round(value * 100) : 0);

/** The add-ons saved on a job order (an array, or [] for none / bad data). */
function savedAddOns(record) {
  try {
    const value = JSON.parse(record.getString("add_ons") || "null");
    return Array.isArray(value) ? value : [];
  } catch (_) {
    return [];
  }
}

/** Sum of add-on prices, in centavos. */
function addOnCents(items) {
  return items.reduce((sum, item) => sum + cents(item?.amount), 0);
}

/** Whether a catalog add-on is offered to this type of client ("school" | "walkin"); empty means both. */
function offeredTo(item, clientKind) {
  const kind = item.getString("client_kind") || "both";
  return kind === "both" || kind === (clientKind || "school");
}

function defaultAddOns(app, clientKind) {
  return app.findRecordsByFilter("add_ons", "is_active = true && default_when_no_mua = true", "", 0, 0)
    .filter((item) => offeredTo(item, clientKind));
}

function snapshotAddOn(item) {
  return {
    id: item.id, code: item.getString("code"), name: item.getString("name"), amount: item.getFloat("amount"),
    revenue_category: item.getString("revenue_category"),
  };
}

/** A package's inclusions as a list of text items (saved as a JSON array or a JSON-encoded string). */
function packageInclusions(pkg) {
  let value = pkg.getString("inclusions");
  for (let i = 0; i < 2 && typeof value === "string"; i++) {
    // Not JSON: an old record holding one plain-text inclusion.
    try { value = JSON.parse(value || "null"); } catch (_) { return value.trim() ? [value] : []; }
  }
  return Array.isArray(value) ? value.filter((item) => typeof item === "string" && item.trim()) : [];
}

/**
 * What the client bought, frozen on the job order: price, name and the package contents
 * (inclusions and photo selection limit), so later catalog edits don't change past orders.
 */
function snapshotPackage(pkg) {
  return {
    id: pkg.id, code: pkg.getString("code"), name: pkg.getString("name"), amount: pkg.getFloat("amount"),
    revenue_category: pkg.getString("revenue_category"),
    inclusions: packageInclusions(pkg), photo_selection_limit: pkg.getInt("photo_selection_limit"),
  };
}

/**
 * Turns the client's add-on choices into catalog snapshots { id, code, name, amount }.
 * Add-ons already on the job order (`previous`) keep the price they were sold at; new ones must be
 * active catalog items offered to this type of client, and take today's price.
 * Unknown, inactive, repeated or wrong-client-type add-ons are refused.
 */
function priceAddOns(app, selections, previous = [], clientKind = "school") {
  if (!Array.isArray(selections)) throw new BadRequestError("Invalid add-on selection.");
  const kept = new Map(previous.filter((item) => item?.id).map((item) => [item.id, item]));
  const legacy = previous.filter((item) => item && !item.id);
  let catalog = null;
  const used = new Set();
  return selections.map((selection) => {
    if (!selection || typeof selection !== "object") throw new BadRequestError("Invalid add-on selection.");
    const existing = selection.id ? kept.get(selection.id)
      : legacy.find((item) => selection.code ? item.code === selection.code : item.name === selection.name);
    if (existing) {
      const key = existing.id || "legacy:" + (existing.code || existing.name);
      if (used.has(key)) throw new BadRequestError("Each add-on can only be selected once.");
      used.add(key);
      return existing;
    }
    catalog ??= app.findAllRecords("add_ons");
    // Older registration clients submit a code or name instead of an id.
    const matches = catalog.filter((item) => (selection.id ? item.id === selection.id
      : selection.code ? item.getString("code") === selection.code : item.getString("name") === selection.name));
    const item = matches[0];
    if (matches.length !== 1 || !item.getBool("is_active")) {
      throw new BadRequestError("A selected add-on is no longer available. Refresh the form and try again.");
    }
    if (!offeredTo(item, clientKind)) {
      throw new BadRequestError(`"${item.getString("name")}" is not offered to ${clientKind === "walkin" ? "walk-in" : "school"} clients.`);
    }
    if (used.has(item.id)) throw new BadRequestError("Each add-on can only be selected once.");
    used.add(item.id);
    return snapshotAddOn(item);
  });
}

module.exports = { addOnCents, cents, defaultAddOns, offeredTo, packageInclusions, priceAddOns, savedAddOns, snapshotAddOn, snapshotPackage };
