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
  const entry = new Record(app.findCollectionByNameOrId("mua_assignment_events"), {
    job_id: job.id, job_order: job.getString("job_order_no"),
    artist_id: artistId, artist_name: artist ? actorName(artist) : artistId,
    previous_artist_id: previousArtistId,
    actor_id: actor.id, actor_name: actorName(actor),
    action, version: job.getInt("makeup_version"),
  });
  app.save(entry);
}

module.exports = { availableArtist, log, permissions, settings };
