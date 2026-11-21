// Shared by the registration hooks, migration and staff APIs.
const paymentSql = "(paid_amount > 0 OR (payment_status = 'fully_paid' AND total_amount = 0))";
const paymentFilter = "(paid_amount > 0 || (payment_status = 'fully_paid' && total_amount = 0))";
const photoQueue = "(status = 'shooting' OR (status = 'paid' AND queue_number > 0 AND " + paymentSql + " AND (makeup_state = 'completed' OR (makeup_service = '' AND makeup_state = ''))))";
function paymentEligible(record) {
  return record.getFloat("paid_amount") > 0
    || (record.getString("payment_status") === "fully_paid" && record.getFloat("total_amount") === 0);
}
const finishedShoot = ["done_shooting", "completed", "ready_for_pickup", "released"];
const activeMakeup = ["claimed", "in_progress"];

function photographyComplete(registration) {
  return registration.getBool("shoot_completed") && finishedShoot.includes(registration.getString("status"));
}

function json(record, field) {
  return JSON.parse(record.getString(field) || "null");
}

function catalogItem(app, collection, id) {
  return id ? app.findRecordsByFilter(collection, "id = {:id}", "", 1, 0, { id })[0] : null;
}

function makeupServices(registration) {
  const saved = json(registration, "makeup_services");
  if (Array.isArray(saved)) return saved;
  const service = registration.getString("makeup_service");
  return service ? [{ source: "legacy", name: service }] : [];
}

function serviceRequirement(item, source) {
  const defaultMua = source === "add_on" && item?.getBool("default_when_no_mua")
    && item.getString("revenue_category") === "mua";
  if ((!item?.getBool("requires_mua") && !defaultMua)
    || (source === "add_on" && item.getString("revenue_category") === "studio")) return null;
  return { source, id: item.id, name: item.getString("name"), defaultService: defaultMua };
}

function purchasedServices(app, registration, before) {
  const services = before ? makeupServices(before) : [];
  const addOnIds = (record) => {
    const items = record && json(record, "add_ons");
    return new Set(Array.isArray(items) ? items.map((item) => item?.id).filter(Boolean) : []);
  };
  const selected = addOnIds(registration);
  const previous = addOnIds(before);
  const packageId = registration.getString("package");
  const changedPackage = packageId !== before?.getString("package");
  const saved = services.filter((service) =>
    (service.source !== "package" || !changedPackage)
    && (service.source !== "add_on" || selected.has(service.id)));
  const addService = (collection, source, id) => {
    const service = serviceRequirement(catalogItem(app, collection, id), source);
    if (service) saved.push(service);
  };
  if (changedPackage) addService("packages", "package", packageId);
  for (const id of selected) {
    if (!previous.has(id)) addService("add_ons", "add_on", id);
  }
  return saved;
}

function saveMakeupServices(registration, services) {
  registration.set("makeup_services", services);
  // The existing queue filters and SQLite guard share this saved summary.
  registration.set("makeup_service", services.map(({ name }) => name).join(" + "));
}

function staff(app, auth, roles) {
  const account = auth && catalogItem(app, "users", auth.id);
  if (!account || account.getBool("disabled") || !roles.includes(account.getString("role"))) {
    throw new ForbiddenError("Your staff account does not have access to this station.");
  }
  return account;
}

// Acquire SQLite's write lock before reading mutable state. All request paths
// using this helper serialize against other writers, including other connections.
function withRegistration(app, id, work) {
  let result;
  app.runInTransaction((tx) => {
    const match = tx.db().newQuery("UPDATE registrations SET id = id WHERE id = {:id}").bind({ id }).execute();
    if (match.rowsAffected() !== 1) throw new NotFoundError("Registration not found.");
    const registration = tx.findRecordById("registrations", id);
    if (registration.getString("deleted_by_id")) throw new ApiError(409, "This registration has already been deleted.");
    result = work(tx, registration);
  });
  return result;
}

function summary(app, registration) {
  const label = (collection, field) => catalogItem(app, collection, registration.getString(field));
  const walkin = registration.getString("client_kind") === "walkin";
  const school = walkin ? null : label("organizations", "organization");
  const course = walkin ? label("session_types", "session_type") : label("courses", "course");
  const pkg = label("packages", "package");
  return {
    id: registration.id,
    studentId: registration.getString("student_id"),
    jobOrder: registration.getString("job_order_no"),
    name: ["given_name", "middle_name", "family_name"].map((key) => registration.getString(key)).filter(Boolean).join(" "),
    // Walk-ins: "Walk-in" (or their company) in place of the school, the session type in place of the course.
    school: walkin ? (registration.getString("client_org") || "Walk-in") : school?.getString("name") || "",
    course: course?.getString("name") || "",
    packageName: json(registration, "package_snapshot")?.name || pkg?.getString("name") || "",
    packageConfiguration: json(registration, "package_snapshot")?.configuration?.summary || "",
    photographyComplete: photographyComplete(registration),
    queueNumber: registration.getInt("queue_number") || null,
  };
}

module.exports = { activeMakeup, catalogItem, finishedShoot, json, makeupServices, paymentEligible, paymentFilter, photographyComplete, photoQueue, purchasedServices, saveMakeupServices, serviceRequirement, staff, summary, withRegistration };
