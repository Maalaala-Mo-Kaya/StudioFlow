/// <reference path="../pb_data/types.d.ts" />

// The studio's first day: the Manila date of its first registration (or first MUA completion, or the
// earliest pictorial date). Report and export date pickers start there, so nobody picks a period
// from before the system was running. Any signed-in staff member may read it.
routerAdd("GET", "/api/studioflow/studio-calendar", (e) => {
  if (!e.auth || e.auth.getBool("disabled")) throw new ForbiddenError("Sign in again.");
  const manila = (value) => {
    const time = Date.parse(String(value || "").replace(" ", "T"));
    return Number.isFinite(time) ? new Date(time + 8 * 3600000).toISOString().slice(0, 10) : "";
  };
  const first = new DynamicModel({ created: "", completed: "", pictorial: "" });
  e.app.db().newQuery(`SELECT
      COALESCE((SELECT MIN(created) FROM registrations), '') AS created,
      COALESCE((SELECT MIN(completed_at) FROM mua_completions), '') AS completed,
      COALESCE((SELECT MIN(pictorial_date) FROM registrations WHERE pictorial_date != ''), '') AS pictorial`).one(first);
  const today = manila(new Date().toISOString());
  const days = [manila(first.created), manila(first.completed), String(first.pictorial || "").slice(0, 10)]
    .filter((day) => /^\d{4}-\d{2}-\d{2}$/.test(day));
  const start = days.length ? days.sort()[0] : today;
  e.response.header().set("Cache-Control", "private, no-store");
  return e.json(200, { start: start < today ? start : today, today });
}, $apis.requireAuth("users"));
