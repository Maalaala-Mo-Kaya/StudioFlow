/// <reference path="../pb_data/types.d.ts" />

routerAdd("GET", "/api/studioflow/chooser", (e) => {
  const workflow = require(__hooks + "/studio_workflow.js");
  const selection = require(__hooks + "/studio_photo_selection.js");
  workflow.staff(e.app, e.auth, ["admin", "chooser"]);
  const params = e.request.url.query();
  const q = params.get("q").trim().slice(0, 100);
  const state = params.get("selection");
  const page = Math.max(1, Math.min(1000000, parseInt(params.get("page"), 10) || 1));
  const escaped = "%" + q.toLowerCase().replace(/[\\%_]/g, "\\$&").replace(/\s+/g, "%") + "%";
  const rows = arrayOf(new DynamicModel({ id: "" }));
  e.app.db().newQuery(`
    SELECT r.id FROM registrations r
    LEFT JOIN organizations o ON o.id = r.organization
    LEFT JOIN courses c ON c.id = r.course
    WHERE r.status != 'cancelled' AND (
      ({:q} = '' AND r.shoot_completed = true AND r.status IN ('done_shooting','completed','ready_for_pickup','released'))
      OR ({:q} != '' AND lower(
        r.given_name || ' ' || r.middle_name || ' ' || r.family_name || ' ' ||
        r.family_name || ' ' || r.given_name || ' ' || r.student_id || ' ' || r.job_order_no || ' ' ||
        COALESCE(o.name,'') || ' ' || COALESCE(o.code,'') || ' ' ||
        COALESCE(c.name,'') || ' ' || COALESCE(c.code,'')
      ) LIKE {:pattern} ESCAPE '\\')
    )
    ORDER BY r.created DESC, r.id LIMIT {:limit} OFFSET {:offset}
  `).bind({ q, pattern: escaped, limit: state ? -1 : 25, offset: state ? 0 : (page - 1) * 24 }).all(rows);
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
  });
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
  return selection.gallery(e.app, record, (root) => {
    const query = e.request.url.query();
    const photo = storage.image(root, query.get("group"), query.get("name"), e.request.pathValue("photo"));
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
    if (!record.getString("photo_folder")) {
      storage.setFolder(record, folder);
      tx.save(record);
    }
    return storage.displayPath(folder);
  });
  return e.json(200, { path });
}, $apis.requireAuth("users"));
