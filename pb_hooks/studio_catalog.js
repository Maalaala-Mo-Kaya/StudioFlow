// The package builder: ① single items (catalog_items), ② saved poses (item_packages: a title and
// items with quantities, used as templates), ③ packages. A package owns its poses: choosing a saved
// pose copies it in, so two packages (or two poses in one package, like the two "Colored toga
// w/out cap" on a flyer) can hold different quantities under the same title. A package keeps:
//
//   { frame_item: <item id>, unlimited_shots: true,
//     inclusions: [{ type: "pose", id, title, attire?, background?, items: [{ item, qty }] }, { type: "item", id, qty }],
//     freebies: [<item id>],
//     exchanges: [{ id, name, pose: <pose id in inclusions>, keep_for: "all"|"female"|"male",
//                   options: [{ id, title, attire?, for: "all"|"female"|"male", items, background? }] }],
//     (an option is the exchanged pose in another attire: it always gets that pose's prints and
//      background, so only its attire (or a typed title) is chosen)
//     freebie_choices: [{ id, item: <a freebie's item id>, choices: [{ id, label }] }],
//     choice_groups: [<older option groups, kept as they were>] }
//
// A freebie with choices ("Free 7x9 classic frame: Family / Barkada / Couple") renders as a
// pick-one option group marked `freebie`, so the kiosk asks for it and the job order keeps the pick.
//
// A pose is usually an attire (an "attire" single item: Toga w/out cap) on a background (a
// "background" item: Colored, B&W) with its prints; its title is then made from those names
// ("Toga w/out cap · Colored"). Print poses are grouped by attire under Frame and Prints, and
// every attire shot is listed with the shoot. Poses without an attire keep a typed title.
//
// Older structures referring to saved poses ({ type: "set", id }, exchange `set`, option `set`)
// are copied into the package when checked (validate). The server renders the structure into the
// package's `inclusions` (tree), `freebies` and `option_groups`, which the kiosk, job order
// snapshot and stations already read. Renaming a single item re-renders every package; sold job
// orders keep their snapshot. A single item has its own price for selling it on its own at the
// kiosk (syncItemAddOn); a package's price is set on the package.
// Keep render rules in step with src/utils/catalogRender.ts.

const CATEGORIES = ["print", "frame", "other", "attire", "background"];
const FOR = ["all", "female", "male"];

function readJson(value) {
  let out = value;
  for (let i = 0; i < 2 && typeof out === "string"; i++) {
    try { out = JSON.parse(out || "null"); } catch (_) { return null; }
  }
  return out;
}
const text = (value) => (typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "");
const key = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const newId = () => $security.randomStringWithAlphabet(10, "abcdefghijklmnopqrstuvwxyz0123456789");
const qtyOf = (qty) => Math.max(1, Math.floor(Number(qty) || 1));

/** Items and saved poses by id. */
function loadCatalog(app) {
  const items = new Map();
  for (const r of app.findAllRecords("catalog_items")) {
    items.set(r.id, { id: r.id, name: r.getString("name"), category: r.getString("category") || "other" });
  }
  const sets = new Map();
  for (const r of app.findAllRecords("item_packages")) {
    const list = readJson(r.getString("items"));
    sets.set(r.id, { id: r.id, name: r.getString("name"), items: Array.isArray(list) ? list : [] });
  }
  return { items, sets };
}

/** "1 pc - 11R" for prints; "2 × Toga" or "Toga" for other items. */
function itemLine(item, qty) {
  const n = qtyOf(qty);
  if (item.category === "print") return `${n} ${n === 1 ? "pc" : "pcs"} - ${item.name}`;
  return n > 1 ? `${n} × ${item.name}` : item.name;
}

function rowLines(rows, catalog) {
  return (rows || []).flatMap((entry) => {
    const item = catalog.items.get(entry.item);
    return item ? [itemLine(item, entry.qty)] : [];
  });
}

const rowPrints = (rows, catalog) => (rows || []).reduce((sum, entry) => {
  const item = catalog.items.get(entry.item);
  return sum + (item && item.category === "print" ? qtyOf(entry.qty) : 0);
}, 0);

/** "Toga w/out cap · Colored" from the pose's attire and background; a typed title otherwise. */
function poseTitle(pose, catalog) {
  const attire = pose.attire ? catalog.items.get(pose.attire) : null;
  if (!attire) return pose.title;
  const background = pose.background ? catalog.items.get(pose.background) : null;
  return background ? `${attire.name} · ${background.name}` : attire.name;
}

/** A pose's print rows only (an option takes the prints, not the exchanged attire's own items). */
const printRows = (rows, catalog) => (rows || []).filter((r) => { const item = catalog.items.get(r.item); return item && item.category === "print"; });

/** A pose as clients see it: a titled list, or a plain line when it is just itself ("Filipiniana"). */
function poseNode(title, lines) {
  return !lines.length || (lines.length === 1 && key(lines[0]) === key(title)) ? title : { title, items: lines };
}

/**
 * The package's inclusions tree, freebies and option groups from its structure.
 * "Frame and Prints" holds the frame and the print count, with the poses that have prints.
 */
function render(app, structure, photoLimit) {
  const catalog = loadCatalog(app);
  const s = structure || {};
  const frame = s.frame_item ? catalog.items.get(s.frame_item) : null;
  const framePrints = [];
  const others = [];
  const poses = new Map();
  // Print poses of one attire share a section: "Toga w/out cap" › "Colored" › 1 pc - 11R.
  const attireGroups = new Map();
  const shot = (name) => { if (!others.some((o) => typeof o === "string" && key(o) === key(name))) others.push(name); };
  let prints = 0;
  for (const entry of Array.isArray(s.inclusions) ? s.inclusions : []) {
    if (entry.type === "pose") {
      const title = poseTitle(entry, catalog);
      poses.set(entry.id, { ...entry, title });
      const lines = rowLines(entry.items, catalog);
      const count = rowPrints(entry.items, catalog);
      prints += count;
      const attire = entry.attire ? catalog.items.get(entry.attire) : null;
      if (attire) {
        shot(attire.name);
        if (!count) continue;
        let group = attireGroups.get(attire.id);
        if (!group) { group = { title: attire.name, items: [] }; attireGroups.set(attire.id, group); framePrints.push(group); }
        const background = entry.background ? catalog.items.get(entry.background) : null;
        if (background) group.items.push({ title: background.name, items: lines });
        else group.items.push(...lines);
        continue;
      }
      if (count) framePrints.push(poseNode(title, lines));
      else { const node = poseNode(title, lines); if (typeof node === "string") shot(node); else others.push(node); }
    } else if (entry.type === "item") {
      const item = catalog.items.get(entry.id);
      if (!item) continue;
      if (item.category === "print") {
        prints += qtyOf(entry.qty);
        framePrints.push(itemLine(item, entry.qty));
      } else {
        shot(itemLine(item, entry.qty));
      }
    }
  }
  const inclusions = [];
  if (frame || prints) {
    const head = [];
    if (frame) head.push(/^with\b/i.test(frame.name) ? frame.name : `With ${frame.name}`);
    if (prints) head.push(`${prints} pcs hard printout copy`);
    inclusions.push({ title: "Frame and Prints", items: [...head, ...framePrints] });
  }
  if (s.unlimited_shots !== false) {
    const n = Math.max(0, Math.floor(Number(photoLimit) || 0));
    inclusions.push(n ? `Unlimited shots (choose your best ${n})` : "Unlimited shots");
  }
  inclusions.push(...others);

  const freebies = (Array.isArray(s.freebies) ? s.freebies : [])
    .map((id) => catalog.items.get(id)).filter(Boolean).map((item) => item.name);

  const groups = [];
  for (const ex of Array.isArray(s.exchanges) ? s.exchanges : []) {
    const target = poses.get(ex.pose);
    const choices = (ex.options || []).map((option) => {
      // The same prints and background as the pose it replaces; only the attire differs.
      const opt = target ? { ...option, background: option.attire ? target.background : undefined, items: printRows(target.items, catalog) } : option;
      const lines = rowLines(opt.items, catalog);
      const label = poseTitle(opt, catalog);
      return lines.length ? { id: opt.id, label, for: opt.for || "all", items: lines } : { id: opt.id, label, for: opt.for || "all" };
    });
    if (!target || !choices.length) continue;
    groups.push({ id: ex.id, name: ex.name || "Options", pick: 1, replaces: target.title, replaces_for: ex.keep_for || "all", choices });
  }
  for (const fc of Array.isArray(s.freebie_choices) ? s.freebie_choices : []) {
    const item = (s.freebies || []).includes(fc.item) ? catalog.items.get(fc.item) : null;
    const choices = (fc.choices || []).map((c) => ({ id: c.id, label: c.label, for: "all" }));
    if (!item || choices.length < 2) continue;
    groups.push({ id: fc.id, name: item.name.slice(0, 60), pick: 1, freebie: true, choices });
  }
  for (const g of Array.isArray(s.choice_groups) ? s.choice_groups : []) groups.push(g);
  return { inclusions, freebies, option_groups: groups };
}

/**
 * Checks a pose's rows ({ item, qty }): items must exist, quantities 1–999, up to 50 rows.
 * The same item twice is added up. Returns { items } or { problem }.
 */
function checkRows(rows, catalog, title) {
  const items = [];
  for (const entry of Array.isArray(rows) ? rows : []) {
    if (!entry || !entry.item) continue;
    const item = catalog.items.get(entry.item);
    if (!item) return { problem: `An item in "${title}" no longer exists. Remove it and save again.` };
    const qty = entry.qty === undefined || entry.qty === null || entry.qty === "" ? 1 : Math.floor(Number(entry.qty));
    if (!(qty >= 1 && qty <= 999)) return { problem: `Enter a quantity from 1 to 999 for "${item.name}" in "${title}".` };
    const existing = items.find((i) => i.item === item.id);
    if (existing) existing.qty = Math.min(999, existing.qty + qty);
    else items.push({ item: item.id, qty });
  }
  if (items.length > 50) return { problem: `"${title}" can hold up to 50 items.` };
  return { items };
}

/**
 * A pose, option or saved-pose copy: its attire and background (or a typed title) and checked
 * rows. Returns { pose } or { problem }.
 */
function checkPose(raw, catalog, what) {
  const kind = (id, category) => { const item = id ? catalog.items.get(id) : null; return item && item.category === category ? item : null; };
  const attire = kind(raw && raw.attire, "attire");
  if (raw && raw.attire && !attire) return { problem: `An attire in this package no longer exists. Choose another for the ${what}.` };
  const background = attire ? kind(raw.background, "background") : null;
  if (attire && raw.background && !background) return { problem: `A background in this package no longer exists. Choose another for "${attire.name}".` };
  const title = attire ? poseTitle({ attire: attire.id, background: background && background.id }, catalog) : text(raw && raw.title);
  if (!title) return { problem: `Choose an attire (or type a title) for each ${what}.` };
  if (title.length > 120) return { problem: `Keep ${what} titles under 120 characters.` };
  const rows = checkRows(raw.items, catalog, title);
  if (rows.problem) return rows;
  const pose = { title, items: rows.items };
  if (attire) { pose.attire = attire.id; if (background) pose.background = background.id; }
  return { pose };
}

/** Checks a structure sent by the admin builder. Returns { structure } or { problem }. */
function validate(app, raw) {
  const s = readJson(raw);
  if (!s || typeof s !== "object" || Array.isArray(s)) return { problem: "The package contents could not be read. Reload and try again." };
  const catalog = loadCatalog(app);
  const out = { frame_item: "", unlimited_shots: s.unlimited_shots !== false, inclusions: [], freebies: [], exchanges: [], freebie_choices: [], choice_groups: [] };
  if (s.frame_item) {
    if (!catalog.items.has(s.frame_item)) return { problem: "The frame item no longer exists. Choose another frame." };
    out.frame_item = s.frame_item;
  }
  // An older reference to a saved pose is copied in, keeping the saved pose's id.
  const fromSet = (id, what) => {
    const set = catalog.sets.get(id);
    return set ? { title: set.name, items: set.items } : { problem: `A saved pose used as ${what} no longer exists. Remove it and save again.` };
  };
  const poses = new Map();
  for (const entry of Array.isArray(s.inclusions) ? s.inclusions : []) {
    if (entry && (entry.type === "pose" || entry.type === "set")) {
      const source = entry.type === "set" ? fromSet(entry.id, "an inclusion") : entry;
      if (source.problem) return source;
      const checked = checkPose(source, catalog, "pose");
      if (checked.problem) return checked;
      let id = text(entry.id) || newId();
      if (poses.has(id)) {
        if (entry.type === "set") return { problem: `"${checked.pose.title}" is in the package twice.` };
        id = newId();
      }
      const pose = { type: "pose", id, ...checked.pose };
      poses.set(id, pose);
      out.inclusions.push(pose);
    } else if (entry && entry.type === "item") {
      const item = catalog.items.get(entry.id);
      if (!item) return { problem: "An item in this package no longer exists. Remove it and save again." };
      // Missing means 1; anything given must be a whole number from 1 to 999.
      const qty = entry.qty === undefined || entry.qty === null || entry.qty === "" ? 1 : Math.floor(Number(entry.qty));
      if (!(qty >= 1 && qty <= 999)) return { problem: `Enter a quantity from 1 to 999 for "${item.name}".` };
      out.inclusions.push({ type: "item", id: item.id, qty });
    }
  }
  if (out.inclusions.length > 100) return { problem: "A package can include up to 100 poses and items." };
  for (const id of Array.isArray(s.freebies) ? s.freebies : []) {
    if (!catalog.items.has(id)) return { problem: "A freebie no longer exists. Remove it and save again." };
    if (!out.freebies.includes(id)) out.freebies.push(id);
  }
  const exchanged = new Set();
  for (const ex of Array.isArray(s.exchanges) ? s.exchanges : []) {
    if (!ex || typeof ex !== "object") continue;
    const target = poses.get(text(ex.pose || ex.set));
    if (!target) return { problem: "An exchange must start from a pose included in this package." };
    if (exchanged.has(target.id)) return { problem: `"${target.title}" has two exchanges. Put all its options in one.` };
    exchanged.add(target.id);
    const name = text(ex.name) || "Options";
    if (name.length > 60) return { problem: "Keep exchange names under 60 characters." };
    const options = [];
    for (const opt of Array.isArray(ex.options) ? ex.options : []) {
      if (!opt || typeof opt !== "object") continue;
      const source = opt.set && !opt.title && !opt.attire ? fromSet(opt.set, `an option for "${target.title}"`) : opt;
      if (source.problem) return source;
      // An option is the same product in another attire: the exchanged pose's prints and background.
      const checked = checkPose({ ...source, background: target.background, items: printRows(target.items, catalog) }, catalog, "option");
      if (checked.problem) return checked;
      if (key(checked.pose.title) === key(target.title)) return { problem: `"${target.title}" can't be exchanged for itself.` };
      let id = text(opt.id) || text(opt.set) || newId();
      if (id === "keep" || options.some((o) => o.id === id)) id = newId();
      options.push({ id, ...checked.pose, for: FOR.includes(opt.for) ? opt.for : "all" });
    }
    if (!options.length) return { problem: `Add at least one option to exchange "${target.title}" for.` };
    if (options.length > 20) return { problem: `"${target.title}" can have up to 20 options.` };
    out.exchanges.push({ id: text(ex.id) || newId(), name, pose: target.id, keep_for: FOR.includes(ex.keep_for) ? ex.keep_for : "all", options });
  }
  // Freebies the client chooses a version of: "Free 7x9 classic frame" › Family / Barkada / Couple.
  for (const fc of Array.isArray(s.freebie_choices) ? s.freebie_choices : []) {
    if (!fc || typeof fc !== "object") continue;
    const item = catalog.items.get(fc.item);
    if (!item || !out.freebies.includes(item.id)) return { problem: "A freebie with choices must be one of this package's freebies." };
    if (out.freebie_choices.some((x) => x.item === item.id)) return { problem: `"${item.name}" has its choices listed twice.` };
    const choices = [];
    for (const c of Array.isArray(fc.choices) ? fc.choices : []) {
      const label = text(c && c.label);
      if (!label) continue;
      if (label.length > 120) return { problem: `Keep each choice for "${item.name}" under 120 characters.` };
      if (choices.some((x) => key(x.label) === key(label))) continue;
      let id = text(c.id);
      if (!id || id === "keep" || choices.some((x) => x.id === id)) id = newId();
      choices.push({ id, label });
    }
    if (choices.length < 2) return { problem: `Give "${item.name}" at least two choices, or turn its choices off.` };
    if (choices.length > 30) return { problem: `"${item.name}" can have up to 30 choices.` };
    out.freebie_choices.push({ id: text(fc.id) || newId(), item: item.id, choices });
  }
  if (Array.isArray(s.choice_groups)) out.choice_groups = s.choice_groups;
  return { structure: out };
}

// ---------- Converting a package written as text (older packages, Import from File) ----------

const QUANTITY_LINE = /^(\d+)\s*(?:pcs?\.?|pieces?|copies|copy)\s*[-–:]?\s*(.+)$/i;
const SKIP_LINE = /^(?:frame\s*(?:and|&)\s*prints?|unlimited\s+shots?\b.*|\d+\s*pcs?\.?\s+hard\s*print.*)$/i;

/** An item with this name (and kind), created when missing. */
function findOrCreateItem(app, name, category) {
  const clean = text(name);
  if (clean.length > 120) throw new BadRequestError(`Keep each item under 120 characters: "${clean.slice(0, 40)}…"`);
  const existing = app.findAllRecords("catalog_items").find((r) => key(r.getString("name")) === key(clean) && (r.getString("category") || "other") === category);
  if (existing) return existing.id;
  const record = new Record(app.findCollectionByNameOrId("catalog_items"));
  record.set("name", clean);
  record.set("category", category);
  app.save(record);
  return record.id;
}

/** The same items in the same amounts, in any order. */
const sameItems = (a, b) => {
  const sig = (list) => JSON.stringify((list || []).map((i) => [i.item, Number(i.qty) || 1]).sort());
  return sig(a) === sig(b);
};

const BACKGROUNDS = [
  { name: "B&W", pattern: /\s*(?:\bwith\s+)?\b(?:b\s*&\s*w|bw|black\s*(?:and|&)\s*white)\b(?:\s*background|\s*bg)?/i },
  { name: "Colored", pattern: /\s*(?:\bwith\s+)?\bcolou?red\b(?:\s*background|\s*bg)?/i },
];

/**
 * A typed pose title read as attire + background: "Colored toga w/out cap" → Toga w/out cap on
 * Colored; "Toga w/out cap with bw background" → Toga w/out cap on B&W. Attires named in
 * `attires` (lower-case keys) also match without a background ("Toga w/ cap"). Creates the
 * attire and background items it needs. Returns { attire, background } ids, or null.
 */
function splitPoseTitle(app, title, attires) {
  const clean = text(title);
  for (const bg of BACKGROUNDS) {
    if (!bg.pattern.test(clean)) continue;
    const rest = clean.replace(bg.pattern, " ").replace(/\s+/g, " ").replace(/^[\s·,-]+|[\s·,-]+$/g, "").trim();
    if (!rest || rest.length > 120) return null;
    const attireName = rest.charAt(0).toUpperCase() + rest.slice(1);
    const attire = findOrCreateItem(app, attireName, "attire");
    if (attires) attires.add(key(attireName));
    return { attire, background: findOrCreateItem(app, bg.name, "background") };
  }
  if (attires && attires.has(key(clean))) return { attire: findOrCreateItem(app, clean, "attire") };
  return null;
}

/** "2 pcs - wallet size" → the print item "wallet size" × 2; anything else is an item × 1. */
function lineToItem(app, line) {
  const m = QUANTITY_LINE.exec(text(line));
  if (m) return { item: findOrCreateItem(app, m[2], "print"), qty: Number(m[1]) };
  return { item: findOrCreateItem(app, line, "other"), qty: 1 };
}

/** Whether a title only names a background ("Colored", "B&W background"). */
const onlyBackground = (title) => BACKGROUNDS.some((bg) => bg.pattern.test(title) && !text(title.replace(bg.pattern, " ")).replace(/[·,-]/g, "").trim());

/**
 * A section written as text: its lines become a pose; sub-sections become their own. A
 * sub-section naming only a background belongs to its section's attire ("Toga w/out cap" ›
 * "Colored" is Toga w/out cap on Colored), as the server renders print poses.
 */
function sectionToPoses(app, section, add, parentTitle) {
  const own = text(section.title);
  const title = parentTitle && onlyBackground(own) ? `${text(parentTitle)} · ${own}` : own;
  const lines = (section.items || []).filter((e) => typeof e === "string" && text(e) && !SKIP_LINE.test(text(e)));
  const subs = (section.items || []).filter((e) => e && typeof e === "object");
  if (lines.length || !subs.length) add(title.slice(0, 120) || "Pose", lines.map((l) => lineToItem(app, l)));
  for (const sub of subs) sectionToPoses(app, sub, add, title);
}

/** An attire item with this name, if there is one. */
function findAttire(app, name) {
  const found = app.findAllRecords("catalog_items").find((r) => r.getString("category") === "attire" && key(r.getString("name")) === key(name));
  return found ? found.id : "";
}

/**
 * Builds a structure from a package written as text (its inclusions tree, freebies and option
 * groups), creating the single items it needs. Used for older packages and imports.
 */
function convertLegacy(app, inclusionsRaw, freebiesRaw, groupsRaw, photoLimit) {
  const pricing = require(__hooks + "/studio_pricing.js");
  const cleaned = pricing.cleanInclusions(pricing.readList(typeof inclusionsRaw === "string" ? inclusionsRaw : JSON.stringify(inclusionsRaw || [])));
  if (cleaned.problem) throw new BadRequestError(cleaned.problem);
  const tree = cleaned.items;
  const structure = { frame_item: "", unlimited_shots: Number(photoLimit) > 0, inclusions: [], freebies: [], exchanges: [], choice_groups: [] };
  const addPose = (title, items) => {
    const same = structure.inclusions.find((e) => e.type === "pose" && key(e.title) === key(title) && sameItems(e.items, items));
    if (same) return same;
    const pose = { type: "pose", id: newId(), title, items, ...(splitPoseTitle(app, title, null) || {}) };
    structure.inclusions.push(pose);
    return pose;
  };

  const handleLine = (line) => {
    const t = text(line);
    if (/^unlimited\s+shots?/i.test(t)) { structure.unlimited_shots = true; return; }
    if (SKIP_LINE.test(t)) return;
    if (/\bframe\b/i.test(t) && !structure.frame_item && !/^free\b/i.test(t)) {
      structure.frame_item = findOrCreateItem(app, t.replace(/^with\s+/i, ""), "frame");
      return;
    }
    // An attire shot ("Toga w/ cap") listed on its own.
    const attire = findAttire(app, t);
    if (attire) { structure.inclusions.push({ type: "pose", id: newId(), title: t, attire, items: [] }); return; }
    const entry = lineToItem(app, t);
    structure.inclusions.push({ type: "item", id: entry.item, qty: entry.qty });
  };

  for (const entry of tree) {
    if (typeof entry === "string") { handleLine(entry); continue; }
    if (/^frame\s*(?:and|&)\s*prints?$/i.test(text(entry.title))) {
      for (const child of entry.items || []) {
        if (typeof child === "string") handleLine(child);
        else sectionToPoses(app, child, addPose);
      }
    } else {
      sectionToPoses(app, entry, addPose);
    }
  }

  for (const name of pricing.readList(typeof freebiesRaw === "string" ? freebiesRaw : JSON.stringify(freebiesRaw || []))) {
    if (typeof name !== "string" || !text(name)) continue;
    const id = findOrCreateItem(app, name, "other");
    if (!structure.freebies.includes(id)) structure.freebies.push(id);
  }

  const groups = readJson(typeof groupsRaw === "string" ? groupsRaw : JSON.stringify(groupsRaw || []));
  for (const g of Array.isArray(groups) ? groups : []) {
    if (!g || typeof g !== "object") continue;
    if (!text(g.replaces)) { structure.choice_groups.push(g); continue; }
    // The exchanged inclusion becomes a pose (of one item, if it was a single item).
    let target = structure.inclusions.find((e) => e.type === "pose" && key(e.title) === key(g.replaces));
    if (!target) {
      const index = structure.inclusions.findIndex((e) => e.type === "item"
        && key(app.findRecordById("catalog_items", e.id).getString("name")) === key(g.replaces));
      const items = index >= 0 ? [{ item: structure.inclusions[index].id, qty: structure.inclusions[index].qty }] : [];
      target = { type: "pose", id: newId(), title: text(g.replaces).slice(0, 120), items };
      if (index >= 0) structure.inclusions[index] = target;
      else structure.inclusions.push(target);
    }
    const options = (g.choices || []).filter((c) => c && text(c.label)).map((c) => ({
      id: text(c.id) && c.id !== "keep" ? text(c.id) : newId(),
      title: text(c.label).slice(0, 120),
      for: FOR.includes(c.for) ? c.for : "all",
      items: (Array.isArray(c.items) ? c.items : typeof c.items === "string" ? c.items.split(/[;\n]/) : [])
        .filter((l) => text(l)).map((l) => lineToItem(app, l)),
    }));
    if (options.length) {
      structure.exchanges.push({ id: text(g.id) || newId(), name: text(g.name) || "Options", pose: target.id,
        keep_for: FOR.includes(g.replaces_for) ? g.replaces_for : "all", options });
    }
  }
  return structure;
}

/** Re-renders a saved package from its structure (after a single item changed). */
function rerender(app, pkg) {
  const structure = readJson(pkg.getString("structure"));
  if (!structure || typeof structure !== "object") return false;
  const out = render(app, structure, pkg.getInt("photo_selection_limit"));
  pkg.set("inclusions", out.inclusions);
  pkg.set("freebies", out.freebies);
  pkg.set("option_groups", out.option_groups);
  app.save(pkg);
  return true;
}

/** Packages whose structure mentions this id (an item in a pose, the frame, a freebie or an option). */
function packagesUsing(app, id) {
  return app.findAllRecords("packages").filter((p) => p.getString("structure").includes(`"${id}"`));
}

/**
 * A single item sold on its own at the kiosk (is_active, with a price) is kept as an add-on
 * linked by add_ons.catalog_item, so job orders, receipts, the ledger and exports read it like any
 * add-on. Created the first time the item is switched on; afterwards its name, price and switch
 * follow the item. Job orders keep the price they were sold at (their add-on snapshot).
 */
function syncItemAddOn(app, item) {
  const linked = app.findRecordsByFilter("add_ons", "catalog_item = {:id}", "", 1, 0, { id: item.id })[0];
  const active = item.getBool("is_active");
  if (!linked && !active) return;
  const record = linked || new Record(app.findCollectionByNameOrId("add_ons"));
  record.set("catalog_item", item.id);
  record.set("name", itemLine({ name: item.getString("name"), category: item.getString("category") || "other" }, 1));
  record.set("amount", item.getFloat("amount"));
  record.set("is_active", active);
  record.set("client_kind", item.getString("client_kind") || "both");
  if (!linked) {
    record.set("code", "");
    record.set("revenue_category", "studio");
    record.set("requires_mua", false);
    record.set("default_when_no_mua", false);
  }
  app.save(record);
}

module.exports = { CATEGORIES, splitPoseTitle, syncItemAddOn, convertLegacy, sameItems, findOrCreateItem, itemLine, loadCatalog, packagesUsing, readJson, render, rerender, validate };
