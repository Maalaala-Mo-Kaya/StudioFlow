// Package options: named groups of choices on a package ("Attire — choose 1: Toga w/cap,
// Filipiniana, Glamour shots (female), Coat and tie or Barong (male)"). The client picks from each
// group at the kiosk; the picks are saved on the job order (registrations.package_options) with
// their labels, so later package edits don't change them. Options never change the price.
// A group may exchange one inclusion ("replaces"): the client keeps it or swaps it for a choice,
// and a choice may list what it comes with ("items": "1 pc - 3R", "2 pcs - wallet").
// Keep the rules in step with src/utils/packageOptions.ts.

const MAX_GROUPS = 10;
const MAX_CHOICES = 30;
const FOR = ["all", "female", "male"];

function readJson(value) {
  let out = value;
  for (let i = 0; i < 2 && typeof out === "string"; i++) {
    try { out = JSON.parse(out || "null"); } catch (_) { return null; }
  }
  return out;
}

const text = (value) => (typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "");
const newId = () => $security.randomStringWithAlphabet(10, "abcdefghijklmnopqrstuvwxyz0123456789");

/**
 * A group can exchange one of the package's inclusions ("Attire" replaces "Colored toga w/out
 * cap"). Then keeping that inclusion is itself a choice, with this id, offered to everyone.
 */
const KEEP = "keep";

/** "1 pc - 3R; 2 pcs - wallet" or a list: what a choice comes with. */
function cleanItems(value) {
  const list = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[;\n]/) : [];
  const items = list.map(text).filter(Boolean);
  if (items.some((item) => item.length > 120)) return { problem: "Keep each item an option comes with under 120 characters." };
  if (items.length > 20) return { problem: "An option can come with up to 20 items." };
  return { items };
}

/**
 * Cleans option groups sent for a package: trims text, gives missing ids, and refuses lists the
 * kiosk could not use. Returns { groups } or { problem }.
 */
function normalizeGroups(raw) {
  const value = readJson(raw);
  if (value === null || value === undefined || value === "") return { groups: [] };
  if (!Array.isArray(value)) return { problem: "Package options must be a list of option groups." };
  const groups = [];
  const groupIds = new Set();
  for (const item of value) {
    if (!item || typeof item !== "object") return { problem: "Each option group needs a name and choices." };
    const name = text(item.name);
    const choices = [];
    const choiceIds = new Set();
    const labels = new Set();
    for (const choice of Array.isArray(item.choices) ? item.choices : []) {
      const label = text(choice && choice.label);
      if (!label) continue;
      if (label.length > 120) return { problem: "Keep each option under 120 characters." };
      if (labels.has(label.toLowerCase())) continue;
      labels.add(label.toLowerCase());
      const forWhom = FOR.includes(choice.for) ? choice.for : "all";
      let id = text(choice.id);
      if (!id || id === KEEP || choiceIds.has(id)) id = newId();
      choiceIds.add(id);
      const comesWith = cleanItems(choice.items);
      if (comesWith.problem) return comesWith;
      choices.push(comesWith.items.length ? { id, label, for: forWhom, items: comesWith.items } : { id, label, for: forWhom });
    }
    if (!name && !choices.length) continue;
    if (!name) return { problem: "Give each option group a name, such as Attire." };
    if (name.length > 60) return { problem: "Keep option group names under 60 characters." };
    if (!choices.length) return { problem: `Add at least one choice to "${name}".` };
    if (choices.length > MAX_CHOICES) return { problem: `"${name}" can have up to ${MAX_CHOICES} choices.` };
    const replaces = text(item.replaces);
    if (replaces.length > 120) return { problem: `"${name}": keep the exchanged inclusion under 120 characters.` };
    // Who may keep it ("Filipiniana" is kept by girls only; boys must exchange it).
    const keepFor = FOR.includes(item.replaces_for) ? item.replaces_for : "all";
    // Keeping the exchanged inclusion counts as one of the choices.
    const offered = choices.length + (replaces ? 1 : 0);
    const pick = Math.floor(Number(item.pick) || 1);
    if (pick < 1 || pick > offered) {
      return { problem: `"${name}": the client can choose from 1 to ${offered} option(s).` };
    }
    let id = text(item.id);
    if (!id || groupIds.has(id)) id = newId();
    groupIds.add(id);
    // A free extra the client picks a version of (rendered from a package's freebie choices).
    const extra = item.freebie === true && !replaces ? { freebie: true } : {};
    groups.push(replaces ? { id, name, pick, replaces, replaces_for: keepFor, choices } : { id, name, pick, ...extra, choices });
  }
  if (groups.length > MAX_GROUPS) return { problem: `A package can have up to ${MAX_GROUPS} option groups.` };
  return { groups };
}

/** A package record's option groups (already cleaned when the package was saved). */
function packageGroups(pkg) {
  const value = readJson(pkg ? pkg.getString("option_groups") : "");
  return Array.isArray(value) ? value : [];
}

/** The choices a client of this gender can pick in a group; "keep" first when it exchanges an inclusion. */
function available(group, gender) {
  const own = (group.choices || []).filter((choice) => choice.for === "all" || !choice.for || choice.for === gender);
  const keepFor = group.replaces_for || "all";
  const canKeep = group.replaces && (keepFor === "all" || keepFor === gender);
  return canKeep ? [{ id: KEEP, label: group.replaces, for: keepFor, keep: true }, ...own] : own;
}

/**
 * Picks used when nothing is sent for a group: keeping the included one, or, when the client
 * can't keep it and exactly as many choices as needed are offered, those (boys get "Coat and tie").
 */
function defaultPicks(group, gender) {
  if (!group.replaces) return [];
  const offered = available(group, gender);
  if (offered.some((choice) => choice.keep)) return [KEEP];
  const need = Math.min(group.pick || 1, offered.length);
  return offered.length === need ? offered.map((choice) => choice.id) : [];
}

/** How many choices the client must pick in a group: its pick count, or every choice they can see. */
function required(group, gender) {
  return Math.min(group.pick || 1, available(group, gender).length);
}

/**
 * Checks a client's picks against the package. `chosen` is what the kiosk or admin sent:
 * [{ group: <group id>, choices: [<choice id>, …] }]. Returns { value } (what to save:
 * [{ group_id, group, choices: [{ id, label }] }]) or { problem }.
 */
function check(pkg, gender, chosen) {
  const groups = packageGroups(pkg);
  const sent = readJson(chosen);
  if (sent !== null && sent !== undefined && sent !== "" && !Array.isArray(sent)) {
    return { problem: "Choose the package options again." };
  }
  const picks = new Map();
  for (const item of Array.isArray(sent) ? sent : []) {
    const groupId = text(item && (item.group || item.group_id));
    const ids = (Array.isArray(item && item.choices) ? item.choices : [])
      .map((choice) => text(typeof choice === "string" ? choice : choice && choice.id))
      .filter(Boolean);
    if (groupId) picks.set(groupId, ids);
  }
  for (const groupId of picks.keys()) {
    if (!groups.some((group) => group.id === groupId)) return { problem: "These options are not part of the selected package." };
  }
  const value = [];
  for (const group of groups) {
    const need = required(group, gender);
    if (!need) continue;
    // Nothing sent for a group that exchanges an inclusion: the client keeps it.
    const ids = [...new Set(picks.get(group.id) || defaultPicks(group, gender))];
    const allowed = available(group, gender);
    const picked = ids.map((id) => allowed.find((choice) => choice.id === id));
    if (picked.some((choice) => !choice)) {
      return { problem: `"${group.name}": choose from the options shown for this client.` };
    }
    if (picked.length !== need) {
      return { problem: `"${group.name}": choose ${need} option${need === 1 ? "" : "s"}.` };
    }
    value.push({
      group_id: group.id,
      group: group.name,
      ...(group.replaces ? { replaces: group.replaces } : {}),
      choices: picked.map((choice) => ({
        id: choice.id,
        label: choice.label,
        ...(choice.keep ? { keep: true } : {}),
        ...(choice.items && choice.items.length ? { items: choice.items } : {}),
      })),
    });
  }
  return { value };
}

module.exports = { KEEP, available, check, normalizeGroups, packageGroups, required };
