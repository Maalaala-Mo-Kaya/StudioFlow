const types = ["header", "inclusions", "prints", "options", "info", "conditional"];
const fail = (message) => { throw new BadRequestError(message); };
const idValid = (value) => typeof value === "string" && !Object.hasOwn(Object.prototype, value) && /^[a-zA-Z0-9_-]{1,100}$/.test(value);
const label = (value) => typeof value === "string" && value.trim().length > 0;
const whole = (value) => Number.isSafeInteger(value) && value >= 0;
const list = (value) => Array.isArray(value) ? value : [];

function read(record, field) {
  return JSON.parse(record.getString(field) || "null");
}

function requestOptions(body) {
  const input = body?.package_options;
  if (input === undefined) return null;
  try {
    const parsed = typeof input === "string" ? JSON.parse(input) : input;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) fail("Invalid package answers.");
    return parsed;
  } catch (_) {
    fail("Invalid package answers.");
  }
}

function optionAddOn(app, id, kind) {
  const item = require(__hooks + "/studio_workflow.js").catalogItem(app, "add_ons", id);
  if (!item || !item.getBool("is_active") || item.getBool("default_when_no_mua")) return null;
  const offered = item.getString("client_kind") || "both";
  return offered === "both" || offered === kind ? item : null;
}

function validate(app, builder, kind) {
  if (!builder || !Array.isArray(builder.sections)) fail("Invalid package sections.");
  const previous = new Map();
  for (const section of builder.sections) {
    if (!section || !idValid(section.id) || previous.has(section.id) || !types.includes(section.type) || !label(section.title)) {
      fail("Give every package section a title and a unique identifier.");
    }
    if (section.when || section.type === "conditional") {
      const parent = previous.get(section.when?.section);
      if (parent?.type !== "options" || !parent.choices.some((choice) => choice.id === section.when.choice)) {
        fail(section.title + ": choose a valid option from an earlier section.");
      }
    }
    if (section.type === "inclusions" && (!Array.isArray(section.items) || section.items.some((item) =>
      !label(item?.name) || (item.quantity !== undefined && (!whole(item.quantity) || item.quantity < 1))))) {
      fail(section.title + ": every inclusion needs a name and any quantity must be positive.");
    }
    if (section.type === "prints" && (!Array.isArray(section.prints) || section.prints.some((row) =>
      !label(row?.pose) || !label(row.size) || !whole(row.quantity) || row.quantity < 1))) {
      fail(section.title + ": enter a pose, size and positive print quantity for each row.");
    }
    if (section.type === "options") {
      const choices = list(section.choices);
      if (!whole(section.min) || !whole(section.max) || section.max < 1 || section.min > section.max || section.max > choices.length) {
        fail(section.title + ": check the minimum, maximum and number of choices.");
      }
      if (section.display === "dropdown" && section.max !== 1) fail(section.title + ": dropdowns allow one choice.");
      const ids = new Set();
      for (const choice of choices) {
        if (!choice || !idValid(choice.id) || ids.has(choice.id) || !label(choice.name)) fail(section.title + ": give every choice a name and a unique identifier.");
        ids.add(choice.id);
        if (choice.recommendation && !["male", "female", "any"].includes(choice.recommendation)) fail(section.title + ": invalid recommendation.");
        if (choice.preselect && !choice.recommendation) fail(section.title + ": select who receives each default.");
        if (choice.paid && !choice.addOn) fail(section.title + ": paid choices require a catalog add-on.");
        if (choice.addOn && !optionAddOn(app, choice.addOn, kind)) fail(section.title + ": select an active add-on offered to the same clients as the package.");
      }
    }
    previous.set(section.id, section);
  }
  if (builder.advertisedPrints !== undefined && !whole(builder.advertisedPrints)) fail("Enter a valid advertised print count.");
}

function legacyLists(builder) {
  const result = { inclusions: [], freebies: [] };
  for (const section of builder.sections) {
    if (section.when) continue;
    if (section.type === "inclusions") {
      result[section.freebies ? "freebies" : "inclusions"].push(...section.items.map((item) =>
        (item.quantity ? item.quantity + " × " : "") + item.name));
    }
    if (section.type === "prints") result.inclusions.push(...section.prints.filter((item) => !item.alternative)
      .map((item) => item.quantity + " × " + item.size + " · " + item.pose));
  }
  return result;
}

function configure(app, pkg, input, clientKind) {
  const builder = read(pkg, "builder");
  const options = builder?.sections.some((section) => section.type === "options");
  if (!builder) {
    if (input) fail("The package changed. Open its details again.");
    return null;
  }
  const version = pkg.getInt("builder_version");
  const pricing = require(__hooks + "/studio_pricing.js");
  if ((options || input) && (input?.version !== version || input?.quotedBase !== pricing.cents(pkg.getFloat("amount")))) {
    fail("The package changed or needs configuration. Open its details and confirm your choices again.");
  }
  const answers = input?.answers ?? {};
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) fail("Invalid package answers.");
  const accepted = {};
  const selections = [];
  const addOns = new Map();
  for (const section of builder.sections) {
    if (section.when && !accepted[section.when.section]?.includes(section.when.choice)) continue;
    if (section.type !== "options") continue;
    const ids = Object.hasOwn(answers, section.id) ? answers[section.id] : [];
    if (!Array.isArray(ids) || new Set(ids).size !== ids.length || ids.length < section.min || ids.length > section.max) {
      fail(section.title + ": review the required number of choices.");
    }
    accepted[section.id] = ids;
    for (const id of ids) {
      const choice = section.choices.find((item) => item.id === id);
      if (!choice) fail(section.title + ": an unknown choice was submitted.");
      const selection = { section: section.id, sectionTitle: section.title, choice: id, name: choice.name, quantity: 1, amount: 0 };
      if (choice.addOn) {
        const item = optionAddOn(app, choice.addOn, clientKind);
        if (!item) fail(choice.name + ": the associated add-on is no longer available.");
        const snapshot = pricing.snapshotAddOn(item);
        const amount = choice.paid ? snapshot.amount : 0;
        if (!addOns.has(item.id) || !choice.paid) addOns.set(item.id, { ...snapshot, amount, package_option: true });
        selection.addOn = item.id;
        selection.amount = amount;
      }
      selections.push(selection);
    }
  }
  if (Object.keys(answers).some((key) => !Object.hasOwn(accepted, key) && (!Array.isArray(answers[key]) || answers[key].length))) {
    fail("A selection was submitted for a hidden or unknown section.");
  }
  const charged = new Set();
  for (const selection of selections) {
    if (!selection.addOn) continue;
    // A catalog item included by another choice is free, and a paid item is charged once.
    selection.amount = charged.has(selection.addOn) ? 0 : addOns.get(selection.addOn).amount;
    charged.add(selection.addOn);
  }
  if ([...addOns].some(([id, item]) => input?.quotedAddOns?.[id] !== pricing.cents(item.amount))) {
    fail("One of the package add-on prices changed. Confirm your selections again.");
  }
  return {
    configuration: { version, definition: builder, answers: accepted, selections,
      summary: selections.map((item) => item.sectionTitle + ": " + item.name).join("; ") },
    addOns: [...addOns.values()],
  };
}

function combineAddOns(manual, configured) {
  const ids = new Set(configured.map((item) => item.id));
  return [...manual.filter((item) => !item.package_option && !ids.has(item.id)), ...configured];
}

module.exports = { read, requestOptions, validate, legacyLists, configure, combineAddOns };
