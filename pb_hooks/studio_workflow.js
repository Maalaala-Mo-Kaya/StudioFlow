// Shared by the registration hooks, migration and staff APIs.
const photoQueue = "(status = 'shooting' OR (status = 'paid' AND paid_amount > 0 AND (makeup_state = 'completed' OR (makeup_service = '' AND makeup_state = ''))))";
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
    const item = catalogItem(app, collection, id);
    if (item?.getBool("requires_mua")) {
      saved.push({ source, id, name: item.getString("name") });
    }
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
    result = work(tx, tx.findRecordById("registrations", id));
  });
  return result;
}

function summary(app, registration) {
  const label = (collection, field) => catalogItem(app, collection, registration.getString(field));
  const school = label("organizations", "organization");
  const course = label("courses", "course");
  const pkg = label("packages", "package");
  return {
    id: registration.id,
    studentId: registration.getString("student_id"),
    jobOrder: registration.getString("job_order_no"),
    name: ["given_name", "middle_name", "family_name"].map((key) => registration.getString(key)).filter(Boolean).join(" "),
    school: school?.getString("name") || "",
    course: course?.getString("name") || "",
    packageName: pkg?.getString("name") || json(registration, "package_snapshot")?.name || "",
    photographyComplete: photographyComplete(registration),
    queueNumber: registration.getInt("queue_number"),
  };
}

module.exports = { activeMakeup, catalogItem, finishedShoot, json, makeupServices, photographyComplete, photoQueue, purchasedServices, saveMakeupServices, staff, summary, withRegistration };
