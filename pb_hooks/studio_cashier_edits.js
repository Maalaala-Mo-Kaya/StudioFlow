const versionField = "cashier_edit_version";
const fields = [
  "family_name", "given_name", "middle_name", "gender", "student_id", "section", "organization", "level", "course",
  "mobile_number", "email", "session_type", "client_org", "event_date", "event_venue", "package", "package_options",
  "add_ons", "notes", "makeup_look", "makeup_look_note",
];

function eligibleIds(app, id = "") {
  const rows = arrayOf(new DynamicModel({ id: "" }));
  const query = app.db().newQuery(`
    SELECT r.id FROM registrations r
    WHERE r.status = 'pending_payment' AND r.payment_status IN ('', 'unpaid')
      AND r.deleted_by_id = '' AND r.cancelled_at = ''
      AND COALESCE(r.job_order_no, '') = '' AND r.paid_amount = 0
      AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.registration = r.id)
      AND NOT EXISTS (SELECT 1 FROM refunds f WHERE f.registration = r.id)
      ${id ? "AND r.id = {:id}" : ""}
  `);
  if (id) query.bind({ id });
  query.all(rows);
  return rows.map((row) => row.id);
}

function assertEligible(app, record) {
  if (!eligibleIds(app, record.id).length) {
    throw new ApiError(409, "This client is no longer eligible for cashier editing. Check for a payment or an issued job order.");
  }
}

function validateRequest(e, body, before) {
  require(__hooks + "/studio_workflow.js").staff(e.app, e.auth, ["cashier", "admin"]);
  if (Object.keys(body).some((field) => field !== versionField && !fields.includes(field))) {
    throw new ForbiddenError("This editor can only change client details and package selections.");
  }
  assertEligible(e.app, before);
  if (body[versionField] !== before.getString("updated")) {
    throw new ApiError(409, "This registration changed while you were editing. Reopen it to make your changes.");
  }
  if (!e.record.getString("package")) throw new BadRequestError("Choose a package.");
}

function validateAcademicAndSession(app, record, before) {
  const changed = (field) => record.getString(field) !== before.getString(field);
  const find = (collection, filter, parameters) => app.findRecordsByFilter(collection, filter, "", 1, 0, parameters)[0];
  const walkIn = record.getString("client_kind") === "walkin";
  const details = walkIn ? ["session_type", "client_org", "event_date", "event_venue"] : ["organization", "level", "course", "student_id", "section"];
  const other = walkIn ? ["organization", "level", "course", "student_id", "section"] : ["session_type", "client_org", "event_date", "event_venue"];
  if (other.some(changed)) throw new BadRequestError("These fields do not apply to this client type.");
  for (const field of ["family_name", "given_name", "middle_name"]) {
    if (!changed(field)) continue;
    const name = record.getString(field).trim();
    const { registrationNameLimit } = require(__hooks + "/studio_photo_names.cjs");
    if ((!name && field !== "middle_name") || Array.from(name).length > registrationNameLimit) {
      throw new BadRequestError(`Enter valid client names of up to ${registrationNameLimit} characters each.`);
    }
    record.set(field, name);
  }
  if (!details.slice(0, walkIn ? 4 : 3).some(changed)) return;
  if (!walkIn) {
    const school = record.getString("organization");
    const level = record.getString("level");
    const course = record.getString("course");
    if (!find("school_courses", "school_id = {:school} && level = {:level} && course_id = {:course}", { school, level, course })
      || (changed("organization") && !find("organizations", "id = {:school} && is_active = true", { school }))) {
      throw new BadRequestError("Choose a course offered by the selected school and academic level.");
    }
    return;
  }
  const id = record.getString("session_type");
  const session = id && find("session_types", "id = {:id}", { id });
  if (!session || (changed("session_type") && !session.getBool("is_active"))) {
    throw new BadRequestError("Choose an available session type.");
  }
  if (!session.getBool("on_location")) {
    record.set("event_date", "");
    record.set("event_venue", "");
  } else if (!record.getString("event_date") || !record.getString("event_venue").trim()) {
    throw new BadRequestError("Enter the event date and venue for this session.");
  }
}

function audit(app, record, before, actor) {
  const workflow = require(__hooks + "/studio_workflow.js");
  const read = (row, field) => ["add_ons", "package_options"].includes(field) ? workflow.json(row, field)
    : ["total_amount", "balance", "paid_amount"].includes(field) ? row.getFloat(field) : row.getString(field);
  const changes = [];
  for (const field of [...fields, "total_amount", "balance", "paid_amount"]) {
    const previous = read(before, field);
    const updated = read(record, field);
    if (JSON.stringify(previous) !== JSON.stringify(updated)) {
      changes.push({ field, before: previous, after: updated });
    }
  }
  if (!changes.length) return;
  const entry = new Record(app.findCollectionByNameOrId("cashier_registration_edits"));
  entry.set("registration", record.id);
  entry.set("actor_id", actor.id);
  entry.set("actor_name", require(__hooks + "/studio_ledger.js").actorName(actor));
  entry.set("role", actor.getString("role"));
  entry.set("changes", changes);
  app.save(entry);
}

module.exports = { versionField, eligibleIds, assertEligible, validateRequest, validateAcademicAndSession, audit };
