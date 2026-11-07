/// <reference path="../pb_data/types.d.ts" />

onRecordCreateRequest((e) => {
  // PocketBase exposes JSON fields as JSONRaw. Read the JSON text before using it as an array.
  const selections = JSON.parse(e.record.getString("add_ons") || "null") ?? [];
  if (!Array.isArray(selections)) throw new BadRequestError("Invalid add-on selection.");

  if (selections.length) {
    const catalog = e.app.findAllRecords("add_ons");
    const used = new Set();
    const addOns = selections.map((selection) => {
      if (!selection || typeof selection !== "object") throw new BadRequestError("Invalid add-on selection.");
      const matches = catalog.filter((item) => {
        if (selection.id) return item.id === selection.id;
        // Accept older registration clients that submit a code or name.
        return selection.code ? item.getString("code") === selection.code
          : item.getString("name") === selection.name;
      });
      const item = matches[0];
      if (matches.length !== 1 || !item.getBool("is_active")) {
        throw new BadRequestError("A selected add-on is no longer available. Refresh the registration form and try again.");
      }
      if (used.has(item.id)) throw new BadRequestError("Each add-on can only be selected once.");
      used.add(item.id);
      return { id: item.id, code: item.getString("code"), name: item.getString("name"), amount: item.getFloat("amount") };
    });
    e.record.set("add_ons", addOns);
  }
  return e.next();
}, "registrations");

onRecordCreate((e) => {
  const packageId = e.record.getString("package");
  const base = packageId ? e.app.findRecordById("packages", packageId).getFloat("amount") : 0;
  const addOns = JSON.parse(e.record.getString("add_ons") || "null");
  const cents = (value) => typeof value === "number" && Number.isFinite(value) ? Math.round(value * 100) : 0;
  const extras = Array.isArray(addOns) ? addOns.reduce((sum, item) => sum + cents(item?.amount), 0) : 0;
  const total = cents(base) + extras + cents(e.record.getFloat("other_fees"));
  e.record.set("total_amount", total / 100);
  e.record.set("balance", Math.max(0, total - cents(e.record.getFloat("paid_amount"))) / 100);
  return e.next();
}, "registrations");

onRecordUpdateRequest((e) => {
  const packageId = e.record.getString("package");
  if (packageId && packageId !== e.record.original().getString("package")) {
    const base = e.app.findRecordById("packages", packageId).getFloat("amount");
    const addOns = JSON.parse(e.record.getString("add_ons") || "null");
    const cents = (value) => typeof value === "number" && Number.isFinite(value) ? Math.round(value * 100) : 0;
    const extras = Array.isArray(addOns) ? addOns.reduce((sum, item) => sum + cents(item?.amount), 0) : 0;
    const total = cents(base) + extras + cents(e.record.getFloat("other_fees"));
    const paid = cents(e.record.getFloat("paid_amount"));
    const balance = Math.max(0, total - paid);
    e.record.set("total_amount", total / 100);
    e.record.set("balance", balance / 100);
    e.record.set("payment_status", balance === 0 ? "fully_paid" : paid > 0 ? "downpayment" : "unpaid");
  }
  return e.next();
}, "registrations");
