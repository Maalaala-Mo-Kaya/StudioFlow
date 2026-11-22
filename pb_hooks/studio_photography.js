const workflow = require(__hooks + "/studio_workflow.js");

const data = (record) => record && workflow.json(record, "photography");
const active = (plan) => plan?.tasks.filter((task) => !task.removedAt) || [];
const complete = (plan) => active(plan).length > 0 && active(plan).every((task) => task.status === "completed");
const label = (user) => user.getString("name") || user.getString("username");

function enabledPhotographer(app, id) {
  const user = workflow.catalogItem(app, "users", id);
  return user && !user.getBool("disabled") && user.getString("role") === "photographer" ? user : null;
}

function packageItems(app, record) {
  const pkg = workflow.catalogItem(app, "packages", record.getString("package"));
  const structure = pkg && workflow.json(pkg, "structure");
  if (!structure) return [];
  const picks = new Map((workflow.json(record, "package_options") || []).map((group) => [group.group_id, group.choices]));
  const result = [...(structure.freebies || [])];
  for (const entry of structure.inclusions || []) {
    if (entry.type === "item") result.push(entry.id);
    if (entry.type !== "pose") continue;
    const exchange = (structure.exchanges || []).find((option) => option.pose === entry.id);
    const choice = exchange && picks.get(exchange.id)?.[0];
    const replacement = choice && !choice.keep && exchange.options.find((option) => option.id === choice.id);
    const canKeep = !exchange || exchange.keep_for === "all" || exchange.keep_for === record.getString("gender");
    if (!replacement && !canKeep) continue;
    result.push(...((replacement || entry).items || []).map((item) => item.item));
  }
  return [...new Set(result)];
}

function updatePlan(app, record, before) {
  const previous = data(before);
  const changedPackage = !before || record.getString("package") !== before.getString("package");
  const changedPicks = before && record.getString("package_options") !== before.getString("package_options");
  const previousAdds = new Set(before ? (workflow.json(before, "add_ons") || []).map((item) => item.id) : []);
  const addIds = new Set((workflow.json(record, "add_ons") || []).map((item) => item.id).filter(Boolean));
  const sources = {};
  const priorSources = previous?.sources || {};
  const seenRequirements = {};
  function add(source, itemIds, known = {}) {
    sources[source] = {};
    for (const id of itemIds) {
      if (!id) continue;
      if (Object.hasOwn(known, id)) {
        sources[source][id] = known[id];
        continue;
      }
      const item = workflow.catalogItem(app, "catalog_items", id);
      if (!item || item.getString("category") !== "other") continue;
      const photographers = item.getStringSlice("required_photographers").map((userId) => {
        const user = workflow.catalogItem(app, "users", userId);
        return { id: userId, name: user ? label(user) : userId };
      });
      sources[source][id] = photographers.length ? { name: item.getString("name"), photographers } : null;
    }
  }
  if (changedPackage || changedPicks) add("package", packageItems(app, record), changedPackage ? {} : priorSources.package);
  else if (priorSources.package) sources.package = priorSources.package;
  for (const id of addIds) {
    if (previousAdds.has(id)) {
      if (priorSources[id]) sources[id] = priorSources[id];
      continue;
    }
    const addOn = workflow.catalogItem(app, "add_ons", id);
    add(id, [addOn?.getString("catalog_item")]);
  }
  for (const items of Object.values(sources)) {
    for (const [itemId, requirement] of Object.entries(items)) {
      for (const photographer of requirement?.photographers || []) {
        const key = itemId + ":" + photographer.id;
        seenRequirements[key] ??= { name: requirement.name, photographer };
      }
    }
  }
  const hasRequirements = Object.keys(seenRequirements).length > 0;
  // A catalogue edit never adds work to a previously sold item.
  if (!previous && !hasRequirements && !Object.values(sources).some((items) => Object.keys(items).length)) return;
  const tasks = previous?.tasks || [];
  if (!tasks.length && hasRequirements) {
    const attribution = previous?.primaryCompletion || {};
    const primary = {
      id: "primary", key: "primary", name: record.getString("client_kind") === "walkin" ? "Primary Portrait Session" : "Graduation Portrait",
      photographerId: "", photographerName: "", status: before?.getBool("shoot_completed") ? "completed" : "pending",
      ...attribution,
    };
    if (before?.getString("status") === "shooting") {
      const linked = app.findRecordsByFilter("camera_stations",
        "active_registration = {:reg} && session_task = ''", "", 2, 0, { reg: record.id });
      const station = linked.length === 1 && linked[0];
      const owner = station && enabledPhotographer(app, station.getString("session_photographer"));
      if (owner) {
        primary.photographerId = owner.id;
        primary.photographerName = label(owner);
        primary.status = "in_progress";
        primary.adoptedCamera = true;
        app.db().newQuery("UPDATE camera_stations SET session_task = 'primary' WHERE id = {:id}")
          .bind({ id: station.id }).execute();
      }
    }
    tasks.push(primary);
  }
  const now = new Date().toISOString();
  for (const task of tasks) {
    if (task.key !== "primary" && !seenRequirements[task.key] && !task.removedAt) task.removedAt = now;
  }
  for (const [key, requirement] of Object.entries(seenRequirements)) {
    if (tasks.some((task) => task.key === key && !task.removedAt)) continue;
    tasks.push({
      id: $security.randomStringWithAlphabet(12, "abcdefghijklmnopqrstuvwxyz0123456789"),
      key, name: requirement.name, photographerId: requirement.photographer.id,
      photographerName: requirement.photographer.name, status: "pending",
    });
  }
  record.set("photography", { ...previous, sources, tasks });
}

function eligible(record) {
  return workflow.paymentEligible(record) && record.getInt("queue_number") > 0
    && ["paid", "shooting"].includes(record.getString("status"))
    && (!record.getString("makeup_service") || record.getString("makeup_state") === "completed");
}

function availableTask(plan, id, account, claim = false) {
  const task = active(plan).find((entry) => entry.id === id);
  if (!task || (task.photographerId !== account.id && !(claim && !task.photographerId && task.id === "primary"))) {
    throw new ForbiddenError("This session is assigned to a different photographer.");
  }
  return task;
}

function applyStatus(record, before) {
  const plan = data(record);
  if (!active(plan).length || record.getString("status") === "cancelled") return;
  if (!complete(plan)) {
    if (record.getString("status") === "released") throw new ApiError(409, "Required photography sessions are still outstanding.");
    if (workflow.finishedShoot.includes(record.getString("status"))) {
      if (!before.getBool("shoot_completed")) throw new ApiError(409, "Complete all assigned photography sessions before advancing this order.");
      record.set("status", "shooting");
      record.set("photo_status", "pending_shoot");
    }
    record.set("shoot_completed", false);
  } else if (eligible(record)) {
    record.set("status", "done_shooting");
    record.set("photo_status", "shot_raw");
    record.set("shoot_completed", true);
  }
}

function rememberPrimaryCompletion(record, account) {
  const plan = data(record) || { sources: {}, tasks: [] };
  plan.primaryCompletion = { photographerId: account.id, photographerName: label(account), completedAt: new Date().toISOString() };
  record.set("photography", plan);
}

module.exports = { active, applyStatus, availableTask, complete, data, eligible, enabledPhotographer, label, rememberPrimaryCompletion, updatePlan };
