const workflow = require(__hooks + "/studio_workflow.js");
const { actorName } = require(__hooks + "/studio_ledger.js");

function settings(app) {
  return app.findFirstRecordByFilter("studio_settings", "key = 'main'");
}

function permissions(config, account) {
  const parentId = config.getString("mua_parent_id");
  const parent = parentId === account.id;
  const admin = account.getString("role") === "admin";
  const allowSelf = config.getBool("mua_parent_accepts_clients");
  return { parentId, allowSelf, parent, admin, manage: parent || admin, canClaim: !admin && !parentId };
}

function availableArtist(app, id) {
  const artist = workflow.catalogItem(app, "users", id);
  return artist?.getString("role") === "mua" && !artist.getBool("disabled") ? artist : null;
}

function log(app, job, artistId, actor, action, previousArtistId = "") {
  const artist = workflow.catalogItem(app, "users", artistId);
  const serviceCount = ["assign", "reassign", "start"].includes(action)
    ? require(__hooks + "/studio_mua_reporting.js").uncreditedServices(app, job).size : 0;
  const entry = new Record(app.findCollectionByNameOrId("mua_assignment_events"), {
    job_id: job.id, job_order: job.getString("job_order_no"),
    artist_id: artistId, artist_name: artist ? actorName(artist) : artistId,
    previous_artist_id: previousArtistId,
    actor_id: actor.id, actor_name: actorName(actor),
    action, service_count: serviceCount, version: job.getInt("makeup_version"),
  });
  app.save(entry);
}

function assignmentsBefore(app, until) {
  const assignments = arrayOf(new DynamicModel({ id: "", artistId: "", state: "", serviceCount: 0 }));
  app.db().newQuery(`
    WITH latest AS (
      SELECT job_id, artist_id, action, service_count,
        ROW_NUMBER() OVER (PARTITION BY job_id ORDER BY created DESC, version DESC,
          CASE action WHEN 'complete' THEN 3 WHEN 'start' THEN 2 ELSE 1 END DESC, id DESC) AS rank
      FROM mua_assignment_events WHERE created < {:until}
    )
    SELECT r.id, latest.artist_id AS artistId, latest.service_count AS serviceCount,
      CASE latest.action WHEN 'start' THEN 'in_progress' ELSE 'claimed' END AS state
    FROM latest JOIN registrations r ON r.id = latest.job_id
    WHERE latest.rank = 1 AND latest.action IN ('assign', 'reassign', 'start')
      AND (r.cancelled_at = '' OR r.cancelled_at >= {:until}
        OR (r.restored_at >= r.cancelled_at AND r.restored_at < {:until}))
  `).bind({ until }).all(assignments);
  return assignments;
}

module.exports = { assignmentsBefore, availableArtist, log, permissions, settings };
