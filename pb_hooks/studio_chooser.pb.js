/// <reference path="../pb_data/types.d.ts" />

// Client list for the Photo Chooser. Filters (all optional, combined):
//   q          search: name, student ID, job order, school, course, walk-in company or session
//   done       "selected" (a selection was confirmed) | "not_selected"
//   school     an organization id, or "walkin" for walk-in clients
//   course     a course id (school) or session type id (walk-in)
//   selection  one exact selection state (awaiting, in_progress, completed, needs_review, recovering)
//   day        YYYY-MM-DD: job orders created that studio day (Manila time), e.g. today's
// Only photographed clients are listed (the photographer marked the shoot done), with or without a search.
// `counts` gives the number of clients per selection filter for the current search, school and course.
routerAdd("GET", "/api/studioflow/chooser", (e) => {
  const workflow = require(__hooks + "/studio_workflow.js");
  const selection = require(__hooks + "/studio_photo_selection.js");
  workflow.staff(e.app, e.auth, ["admin", "chooser"]);
  const params = e.request.url.query();
  const q = params.get("q").trim().slice(0, 100);
  const state = params.get("selection");
  const done = ["selected", "not_selected"].includes(params.get("done")) ? params.get("done") : "";
  const school = params.get("school").trim().slice(0, 40);
  const course = params.get("course").trim().slice(0, 40);
  // day: job orders created on that studio day (Asia/Manila, UTC+8), YYYY-MM-DD.
  const day = /^\d{4}-\d{2}-\d{2}$/.test(params.get("day")) ? params.get("day") : "";
  const dayStart = day ? Date.parse(day + "T00:00:00Z") - 8 * 3600000 : NaN;
  if (day && !Number.isFinite(dayStart)) throw new BadRequestError("Invalid date.");
  const utc = (ms) => new Date(ms).toISOString().replace("T", " ");
  const from_ = day ? utc(dayStart) : "";
  const to_ = day ? utc(dayStart + 24 * 3600000) : "";
  const page = Math.max(1, Math.min(1000000, parseInt(params.get("page"), 10) || 1));
  const escaped = "%" + q.toLowerCase().replace(/[\\%_]/g, "\\$&").replace(/\s+/g, "%") + "%";
  const from = `
    FROM registrations r
    LEFT JOIN organizations o ON o.id = r.organization
    LEFT JOIN courses c ON c.id = r.course
    LEFT JOIN session_types s ON s.id = r.session_type
    WHERE r.status != 'cancelled'
    AND r.shoot_completed = true AND r.status IN ('done_shooting','completed','ready_for_pickup','released')
    AND ({:q} = '' OR lower(
        r.given_name || ' ' || r.middle_name || ' ' || r.family_name || ' ' ||
        r.family_name || ' ' || r.given_name || ' ' || r.student_id || ' ' || r.job_order_no || ' ' ||
        COALESCE(o.name,'') || ' ' || COALESCE(o.code,'') || ' ' ||
        COALESCE(c.name,'') || ' ' || COALESCE(c.code,'') || ' ' ||
        COALESCE(r.client_org,'') || ' ' || COALESCE(s.name,'') || ' ' || COALESCE(s.code,'')
      ) LIKE {:pattern} ESCAPE '\\')
    AND ({:school} = '' OR ({:school} = 'walkin' AND r.client_kind = 'walkin')
      OR ({:school} != 'walkin' AND r.client_kind != 'walkin' AND r.organization = {:school}))
    AND ({:course} = '' OR r.course = {:course} OR r.session_type = {:course})
    AND ({:dayFrom} = '' OR (r.created >= {:dayFrom} AND r.created < {:dayTo}))`;
  const bind = { q, pattern: escaped, school, course, dayFrom: from_, dayTo: to_ };
  // An order can keep its previous selection and still need a review after a new shoot.
  const CHOOSER_SAVED = "COALESCE(r.photo_selection, '') NOT IN ('', 'null', '[]')"
    + " AND (CASE WHEN json_valid(r.photography) THEN COALESCE(json_extract(r.photography, '$.selectionReview'), '') ELSE '' END) = ''";

  const tally = new DynamicModel({ total: 0, selected: 0 });
  e.app.db().newQuery(`SELECT COUNT(*) AS total, COALESCE(SUM(CASE WHEN ${CHOOSER_SAVED} THEN 1 ELSE 0 END), 0) AS selected ${from}`)
    .bind(bind).one(tally);

  const doneFilter = done === "selected" ? ` AND ${CHOOSER_SAVED}` : done === "not_selected" ? ` AND NOT (${CHOOSER_SAVED})` : "";
  const rows = arrayOf(new DynamicModel({ id: "" }));
  e.app.db().newQuery(`SELECT r.id ${from}${doneFilter} ORDER BY r.created DESC, r.id LIMIT {:limit} OFFSET {:offset}`)
    .bind({ ...bind, limit: state ? -1 : 25, offset: state ? 0 : (page - 1) * 24 }).all(rows);
  const summarize = ({ id }) => selection.listItem(e.app, e.app.findRecordById("registrations", id));
  let items;
  if (state) {
    const matched = [];
    const start = (page - 1) * 24;
    for (const row of rows) {
      const item = summarize(row);
      if (item.selectionState === state) matched.push(item);
      if (matched.length > start + 24) break;
    }
    items = matched.slice(start, start + 25);
  } else {
    items = rows.slice(0, 24).map(summarize);
  }
  return e.json(200, {
    items: items.slice(0, 24),
    hasMore: (state ? items.length : rows.length) > 24,
    counts: { all: tally.total, selected: tally.selected, notSelected: tally.total - tally.selected },
  });
}, $apis.requireAuth("users"));

// Choices for the chooser's School / Course filters: every active school with all its courses,
// and Walk-in clients with their session types (when walk-ins are on or any exist). Each with
// the number of photographed clients (0 included). Inactive schools / courses / sessions that
// still have photographed clients are listed too, so their clients stay reachable.
routerAdd("GET", "/api/studioflow/chooser-filters", (e) => {
  const workflow = require(__hooks + "/studio_workflow.js");
  workflow.staff(e.app, e.auth, ["admin", "chooser"]);
  const db = e.app.db();
  const photographed = "r.status != 'cancelled' AND r.shoot_completed = true AND r.status IN ('done_shooting','completed','ready_for_pickup','released')";

  // Photographed clients per school + course, and per walk-in session.
  const counted = arrayOf(new DynamicModel({ school: "", course: "", clients: 0 }));
  db.newQuery(`
    SELECT CASE WHEN r.client_kind = 'walkin' THEN 'walkin' ELSE r.organization END AS school,
      CASE WHEN r.client_kind = 'walkin' THEN r.session_type ELSE r.course END AS course, COUNT(*) AS clients
    FROM registrations r WHERE ${photographed} GROUP BY 1, 2
  `).all(counted);
  const clientsIn = new Map();
  for (const row of counted) {
    clientsIn.set(row.school, (clientsIn.get(row.school) || 0) + row.clients);
    clientsIn.set(row.school + "/" + row.course, row.clients);
  }
  const label = (code, name) => code || name || "Unnamed";

  // Schools and their courses (school_courses links a course to a school and level).
  const schoolRows = arrayOf(new DynamicModel({ id: "", code: "", name: "", active: false }));
  db.newQuery("SELECT id, code, name, is_active AS active FROM organizations").all(schoolRows);
  const courseRows = arrayOf(new DynamicModel({ school: "", id: "", code: "", name: "" }));
  db.newQuery(`
    SELECT DISTINCT sc.school_id AS school, c.id AS id, c.code AS code, c.name AS name
    FROM school_courses sc JOIN courses c ON c.id = sc.course_id
  `).all(courseRows);
  const schools = [];
  for (const school of schoolRows) {
    const clients = clientsIn.get(school.id) || 0;
    if (!school.active && !clients) continue;
    const courses = new Map();
    for (const course of courseRows) {
      if (course.school === school.id) courses.set(course.id, { id: course.id, name: label(course.code, course.name), clients: clientsIn.get(school.id + "/" + course.id) || 0 });
    }
    // A course a client registered under but no longer linked to the school.
    for (const row of counted) {
      if (row.school === school.id && row.course && !courses.has(row.course)) {
        const course = workflow.catalogItem(e.app, "courses", row.course);
        courses.set(row.course, { id: row.course, name: label(course?.getString("code"), course?.getString("name")), clients: row.clients });
      }
    }
    schools.push({ id: school.id, name: label(school.code, school.name), walkin: false, clients,
      courses: [...courses.values()].sort((a, b) => a.name.localeCompare(b.name)) });
  }
  schools.sort((a, b) => a.name.localeCompare(b.name));

  // Walk-ins, with every active session type (and inactive ones that have clients).
  const settings = e.app.findRecordsByFilter("studio_settings", "key = 'main'", "", 1, 0)[0];
  const walkinClients = clientsIn.get("walkin") || 0;
  if (settings?.getBool("walkin_enabled") || walkinClients) {
    const sessions = arrayOf(new DynamicModel({ id: "", name: "", active: false }));
    db.newQuery("SELECT id, name, is_active AS active FROM session_types ORDER BY \"order\", name").all(sessions);
    schools.push({
      id: "walkin", name: "Walk-in clients", walkin: true, clients: walkinClients,
      courses: sessions
        .map((session) => ({ id: session.id, name: session.name, clients: clientsIn.get("walkin/" + session.id) || 0, active: session.active }))
        .filter((session) => session.active || session.clients)
        .map(({ id, name, clients }) => ({ id, name, clients })),
    });
  }
  e.response.header().set("Cache-Control", "private, no-store");
  return e.json(200, { schools });
}, $apis.requireAuth("users"));

routerAdd("POST", "/api/studioflow/chooser/{id}/open", (e) => {
  const workflow = require(__hooks + "/studio_workflow.js");
  const selection = require(__hooks + "/studio_photo_selection.js");
  workflow.staff(e.app, e.auth, ["admin", "chooser"]);
  const id = e.request.pathValue("id");
  selection.queueMoves(e.app, id, e.auth, null);
  return e.json(200, selection.details(e.app, id));
}, $apis.requireAuth("users"));

routerAdd("GET", "/api/studioflow/chooser/{id}", (e) => {
  const workflow = require(__hooks + "/studio_workflow.js");
  const selection = require(__hooks + "/studio_photo_selection.js");
  workflow.staff(e.app, e.auth, ["admin", "chooser"]);
  const id = e.request.pathValue("id");
  selection.recover(e.app, id);
  return e.json(200, selection.details(e.app, id));
}, $apis.requireAuth("users"));

routerAdd("POST", "/api/studioflow/chooser/{id}/confirm", (e) => {
  const workflow = require(__hooks + "/studio_workflow.js");
  const selection = require(__hooks + "/studio_photo_selection.js");
  workflow.staff(e.app, e.auth, ["admin", "chooser"]);
  const id = e.request.pathValue("id");
  const input = new DynamicModel({ version: "", requestId: "", selected: arrayOf("") });
  e.bindBody(input);
  if (!/^[a-z0-9-]{15,80}$/i.test(input.requestId) || !input.version) throw new BadRequestError("A selection version and request ID are required.");
  selection.queueMoves(e.app, id, e.auth, input);
  return e.json(200, selection.details(e.app, id));
}, $apis.requireAuth("users"));

routerAdd("GET", "/api/studioflow/chooser/{id}/image/{photo}", (e) => {
  const workflow = require(__hooks + "/studio_workflow.js");
  const selection = require(__hooks + "/studio_photo_selection.js");
  const storage = require(__hooks + "/studio_photo_storage.js");
  workflow.staff(e.app, e.auth, ["admin", "chooser"]);
  const record = e.app.findRecordById("registrations", e.request.pathValue("id"));
  if (workflow.json(record, "photo_pending")) throw new ApiError(409, "The gallery is being updated.");
  return selection.gallery(e.app, record, (root, folder) => {
    const query = e.request.url.query();
    const photo = storage.image(root, folder, query.get("group"), query.get("name"), e.request.pathValue("photo"));
    const file = root.open(photo.path);
    try {
      if (!file.stat().mode().isRegular()) throw new NotFoundError("Photo not found.");
      e.response.header().set("Cache-Control", "private, no-store");
      e.response.header().set("X-Content-Type-Options", "nosniff");
      return e.stream(200, photo.mime, file);
    } finally { file.close(); }
  });
}, $apis.requireAuth("users"));

routerAdd("POST", "/api/studioflow/photo-folder/{id}", (e) => {
  const workflow = require(__hooks + "/studio_workflow.js");
  const storage = require(__hooks + "/studio_photo_storage.js");
  const path = workflow.withRegistration(e.app, e.request.pathValue("id"), (tx, record) => {
    workflow.staff(tx, e.auth, ["admin", "photographer"]);
    const folder = storage.photoFolder(tx, record);
    try { storage.provision(folder); } catch (_) {
      throw new ApiError(503, "The photo folder could not be created. Check the server's photo storage.");
    }
    if (record.getString("photo_folder") !== folder) {
      storage.setFolder(record, folder);
      tx.save(record);
    }
    return storage.displayPath(folder);
  });
  return e.json(200, { path });
}, $apis.requireAuth("users"));
