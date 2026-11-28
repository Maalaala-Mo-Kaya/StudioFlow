// Shot types: what kind of picture a photo is (Toga with cap, Family, Barkada…).
//
// The type lives in the photo's file name, as " [CODE]" at the end of its stem:
//   IMG_0001 [TOGA CAP].JPG      sf-…-IMG_0002 [FAMILY].JPG      IMG_0003 [GROUP]_2.JPG
// so it moves with the photo through every folder (job folder, selected, unselected, _DELETED)
// and the editor sees it too. A "_2" added later to make a name unique may follow the tag.
// RAW files are never tagged: a JPEG and its RAW twin are matched with the tag left out.
//
// A client's package includes a type when the sold package (package_snapshot: its inclusions,
// freebies and the client's option picks) names one of the catalog items linked to that type.
const workflow = require(__hooks + "/studio_workflow.js");

const codePattern = /^[A-Z0-9](?:[A-Z0-9 -]{0,22}[A-Z0-9])?$/;
const tagPattern = / \[([A-Z0-9](?:[A-Z0-9 -]{0,22}[A-Z0-9])?)\](?=(?:_\d+)?$)/;

function split(name) {
  const value = String(name || "");
  const dot = value.lastIndexOf(".");
  return dot > 0 ? [value.slice(0, dot), value.slice(dot)] : [value, ""];
}

/** The type code in a file name, or "". */
function tagOf(name) {
  const match = split(name)[0].match(tagPattern);
  return match ? match[1] : "";
}

/** The file name without its type. */
function untagged(name) {
  const [stem, ext] = split(name);
  return stem.replace(tagPattern, "") + ext;
}

/** The file name with `code` as its type ("" removes the type). */
function tagged(name, code) {
  const [stem, ext] = split(untagged(name));
  return code ? stem + " [" + code + "]" + ext : stem + ext;
}

function all(app) {
  return app.findRecordsByFilter("shot_types", "", "sort,name", 0, 0);
}

function describe(record) {
  return {
    id: record.id, name: record.getString("name"), code: record.getString("code"),
    sort: record.getInt("sort"), active: record.getBool("is_active"), items: record.getStringSlice("items"),
  };
}

/** Checks a code sent by a station: "" (no type) or an active type's code. */
function checkCode(app, raw) {
  const code = String(raw || "").trim().toUpperCase();
  if (!code) return "";
  if (!codePattern.test(code)) throw new BadRequestError("Unknown shot type.");
  const found = all(app).find((record) => record.getString("code").toUpperCase() === code && record.getBool("is_active"));
  if (!found) throw new BadRequestError("This shot type is turned off or was removed. Reload the page.");
  return found.getString("code");
}

const normal = (value) => String(value || "").replace(/\s+/g, " ").trim().toLowerCase();

// Every name the sold package mentions: inclusion lines and section titles ("Toga with cap"),
// freebies ("FAMILY PICTURE"), and the client's option picks ("Glamor shots · B&W" → also
// "Glamor shots"); an exchanged inclusion is taken out.
function packageNames(record) {
  const names = [];
  const walk = (node) => {
    if (typeof node === "string") names.push(node);
    else if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === "object") {
      if (typeof node.title === "string") names.push(node.title);
      walk(node.items);
    }
  };
  const sold = workflow.json(record, "package_snapshot");
  if (sold) {
    walk(sold.inclusions);
    walk(sold.freebies);
  }
  const set = new Set(names.map(normal).filter(Boolean));
  const picks = workflow.json(record, "package_options");
  for (const pick of Array.isArray(picks) ? picks : []) {
    const choices = Array.isArray(pick?.choices) ? pick.choices : [];
    const exchanged = pick?.replaces && choices.some((choice) => choice && !choice.keep);
    if (exchanged) set.delete(normal(pick.replaces));
    for (const choice of choices) {
      if (!choice || choice.keep) continue;
      const label = normal(choice.label);
      if (!label) continue;
      set.add(label);
      set.add(normal(label.split(" · ")[0]));
    }
  }
  return set;
}

/** The codes of the active types the client's package includes, in list order. */
function packageCodes(app, record) {
  const names = packageNames(record);
  if (!names.size) return [];
  const types = all(app).filter((type) => type.getBool("is_active"));
  const ids = [...new Set(types.flatMap((type) => type.getStringSlice("items")))];
  const itemNames = new Map();
  if (ids.length) {
    for (const item of app.findRecordsByIds("catalog_items", ids)) itemNames.set(item.id, normal(item.getString("name")));
  }
  return types
    .filter((type) => type.getStringSlice("items").some((id) => names.has(itemNames.get(id))))
    .map((type) => type.getString("code"));
}

/** The types this photographer shows on their menu: their choice, or every active type. */
function menu(app, account) {
  const saved = account ? workflow.json(account, "shot_menu") : null;
  const active = all(app).filter((type) => type.getBool("is_active"));
  const chosen = Array.isArray(saved) ? new Set(saved.map(String)) : new Set();
  const picked = active.filter((type) => chosen.has(type.id));
  return (picked.length ? picked : active).map((type) => type.id);
}

function saveMenu(app, auth, ids) {
  const account = workflow.staff(app, auth, ["admin", "photographer"]);
  if (!Array.isArray(ids) || ids.length > 100) throw new BadRequestError("Choose the shot types for your menu.");
  const known = new Set(all(app).map((type) => type.id));
  const kept = [...new Set(ids.map(String))].filter((id) => known.has(id));
  account.set("shot_menu", kept);
  app.save(account);
  return kept;
}

/** Shot types for a station page, with the caller's menu. */
function listing(app, auth) {
  const account = workflow.staff(app, auth, ["admin", "photographer", "chooser"]);
  return { types: all(app).map(describe), menu: menu(app, account) };
}

/** The types of the photos a client has, for the Chooser and the Photo Floor. */
function forClient(app, record) {
  return { types: all(app).map(describe), packageTypes: packageCodes(app, record) };
}

// Shot type records saved through the collection API (admin).
function clean(e, before) {
  const name = e.record.getString("name").replace(/\s+/g, " ").trim();
  if (!name) throw new BadRequestError("Give the shot type a name, such as Toga with cap.");
  e.record.set("name", name);
  const code = e.record.getString("code").replace(/\s+/g, " ").trim().toUpperCase();
  if (!codePattern.test(code)) {
    throw new BadRequestError("Use a short label of letters, numbers, spaces or dashes (up to 24), such as TOGA CAP.");
  }
  // The label is written into photo file names: changing it would split the photos already taken.
  if (before && before.getString("code").toUpperCase() !== code) {
    throw new BadRequestError("The file label of a shot type can't change. Add a new type instead.");
  }
  e.record.set("code", code);
}

// shot_origins: where a kept photo came from (a camera id, or "card"), recorded once when it is filed.
const originKey = (name) => untagged(String(name).split("/").pop()).toLowerCase();

function recordOrigin(app, registrationId, name, camera, photographer) {
  try {
    const shot = originKey(name);
    if (app.findRecordsByFilter("shot_origins", "registration = {:reg} && shot = {:shot}", "", 1, 0, { reg: registrationId, shot }).length) return;
    const record = new Record(app.findCollectionByNameOrId("shot_origins"));
    record.set("registration", registrationId);
    record.set("shot", shot);
    record.set("camera", camera || "");
    record.set("photographer", photographer || "");
    app.save(record);
  } catch (error) {
    app.logger().warn("Shot origin not recorded", "registration", registrationId, "file", String(name), "error", String(error));
  }
}

/** { shot key: { camera, photographer } } for a client's photos. */
function origins(app, registrationId) {
  const map = new Map();
  const names = new Map();
  const nameOf = (id) => {
    if (!id) return "";
    if (!names.has(id)) {
      let name = "";
      try {
        const user = app.findRecordById("users", id);
        name = user.getString("name") || user.getString("username");
      } catch (_) { /* removed account */ }
      names.set(id, name);
    }
    return names.get(id);
  };
  for (const record of app.findRecordsByFilter("shot_origins", "registration = {:reg}", "", 0, 0, { reg: registrationId })) {
    const photographer = record.getString("photographer");
    map.set(record.getString("shot"), { camera: record.getString("camera"), photographer, photographerName: nameOf(photographer) });
  }
  return map;
}

// Only the photographer who took a shot (or an admin) may delete, restore or retype it. Shots with no
// recorded photographer (taken before this was recorded) stay open to any photographer.
function checkOwner(origins, account, name) {
  if (account.getString("role") === "admin") return;
  const origin = origins.get(originKey(name));
  if (origin?.photographer && origin.photographer !== account.id) {
    throw new ForbiddenError("Only " + (origin.photographerName || "the photographer who took it") + " can change " + untagged(name) + ".");
  }
}

module.exports = { checkCode, checkOwner, clean, originKey, origins, recordOrigin, codePattern, describe, forClient, listing, menu, packageCodes, saveMenu, tagOf, tagged, untagged };
