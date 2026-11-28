// The MUA station switch (Admin → DEV CON, studio_settings.mua_station_off).
//
// While the station is off, a client whose order brings makeup or grooming does not wait in the MUA
// queue: their makeup is marked done without an artist (makeup_state "completed", makeup_skipped),
// so every photography check lets them through and they get their photo queue number at payment.
// Nothing about money changes: the MUA charges stay on the order, the ledger and every MUA total.
// No artist is credited for them; MUA Payouts lists them with the shared MUA money.
const workflow = require(__hooks + "/studio_workflow.js");

function settings(app) {
  return app.findRecordsByFilter("studio_settings", "key = 'main'", "", 1, 0)[0] || null;
}

function stationOff(app) {
  return !!settings(app)?.getBool("mua_station_off");
}

/**
 * Marks a client's makeup as skipped when the station is off. Clients an artist has already
 * claimed or started stay with that artist. Returns true when the record was changed.
 */
function skipIfOff(app, record) {
  if (!record.getString("makeup_service") || !stationOff(app)) return false;
  const state = record.getString("makeup_state");
  if (state === "completed" || workflow.activeMakeup.includes(state)) return false;
  record.set("makeup_state", "completed");
  record.set("makeup_skipped", true);
  return true;
}

// Turning the station off sends the clients waiting in the MUA queue to the photographers.
function releaseWaiting(app) {
  const numbering = require(__hooks + "/studio_numbering.js");
  let released = 0;
  const waiting = app.findRecordsByFilter("registrations",
    "makeup_service != '' && makeup_state = '' && status = 'paid'", "", 0, 0);
  for (const candidate of waiting) {
    workflow.withRegistration(app, candidate.id, (tx, record) => {
      if (!skipIfOff(tx, record)) return;
      numbering.handoffToPhotography(tx, record);
      tx.save(record);
      released++;
    });
  }
  return released;
}

function setStationOff(app, off) {
  const record = settings(app);
  if (!record) throw new NotFoundError("Studio settings were not found. Restart the server so the latest update is applied.");
  record.set("mua_station_off", off);
  app.save(record);
  return off ? releaseWaiting(app) : 0;
}

module.exports = { releaseWaiting, setStationOff, skipIfOff, stationOff };
