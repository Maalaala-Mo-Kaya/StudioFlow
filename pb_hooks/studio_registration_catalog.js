// Bump when the deployed public form's requirements or built-in terms change.
const FORM_REVISION = 1;
const TOPIC = "studioflow-registration-catalog";
const COLLECTIONS = ["packages", "add_ons", "organizations", "levels", "courses", "school_courses", "studio_settings", "session_types"];

function project(record, fields) {
  const values = record.publicExport();
  return Object.fromEntries(["id", ...fields].map((field) => [field, values[field]]));
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function configuration(app) {
  const workflow = require(__hooks + "/studio_workflow.js");
  const list = (collection, filter, sort) => app.findRecordsByFilter(collection, filter, sort, 0, 0);
  const sellable = (collection, source, fields) => list(collection, "is_active = true", "created,id")
    .map((item) => ({ ...project(item, fields), requires_mua: !!workflow.serviceRequirement(item, source) }));
  const settings = list("studio_settings", "key = 'main'", "id")[0];
  const organizations = list("organizations", "is_active = true", "name,id")
    .map((record) => project(record, ["name", "code", "is_active"]));
  const activeSchools = new Set(organizations.map(({ id }) => id));
  const levels = list("levels", "", "order,name,id").map((record) => project(record, ["name", "organization"]))
    .filter((level) => activeSchools.has(level.organization));
  const courses = new Map(list("courses", "", "name,id").map((record) => [record.id, project(record, ["name", "code"])]));
  const schoolCourses = list("school_courses", "", "course_id.name,id").map((record) => {
    const assignment = project(record, ["school_id", "level", "course_id"]);
    return { ...assignment, expand: { course_id: courses.get(assignment.course_id) } };
  }).filter((assignment) => activeSchools.has(assignment.school_id) && assignment.expand.course_id);

  const data = {
    schoolEnabled: settings ? settings.getBool("school_enabled") : true,
    walkinEnabled: !!settings?.getBool("walkin_enabled"),
    walkinTerms: settings ? workflow.json(settings, "walkin_terms") : null,
    organizations,
    levels,
    schoolCourses,
    sessionTypes: list("session_types", "is_active = true", "order,name,id")
      .map((record) => project(record, ["name", "code", "on_location", "is_active"])),
    packages: sellable("packages", "package", [
      "collectionId", "collectionName", "name", "code", "amount", "description", "tagline", "client_kind",
      "inclusions", "freebies", "option_groups", "photo_selection_limit", "structure", "photos", "is_active",
    ]),
    addOns: sellable("add_ons", "add_on", [
      "name", "code", "amount", "client_kind", "default_when_no_mua", "catalog_item", "revenue_category", "is_active",
    ]),
  };
  return { ...data, version: $security.sha256(JSON.stringify(canonical([FORM_REVISION, data]))) };
}

module.exports = { configuration, COLLECTIONS, TOPIC };
