// Preferred makeup look (see pb_migrations/1793802900_makeup_look.js).
// Keep the values and labels in sync with src/constants/makeupLook.ts.
const { catalogItem } = require(__hooks + "/studio_workflow.js");

const looks = ["full", "light", "grooming"];
const noteMax = 200;

// Whether the kiosk asks this client for a look: the switch for their type of client is on,
// and their school (or walk-in session type) is not set to skip it.
function asked(app, registration) {
  const settings = app.findRecordsByFilter("studio_settings", "key = 'main'", "", 1, 0)[0];
  if (!settings) return false;
  const walkin = registration.getString("client_kind") === "walkin";
  if (!settings.getBool(walkin ? "makeup_look_walkin" : "makeup_look_school")) return false;
  const id = registration.getString(walkin ? "session_type" : "organization");
  const item = id ? catalogItem(app, walkin ? "session_types" : "organizations", id) : null;
  return !item?.getBool("makeup_look_off");
}

// Trims the note and checks both fields. Returns { field, message } for the first problem, or null.
// `required`: the kiosk must choose a look; admin edits may also clear it.
function check(registration, required) {
  const note = registration.getString("makeup_look_note").trim();
  registration.set("makeup_look_note", note);
  const look = registration.getString("makeup_look");
  if (required ? !looks.includes(look) : look && !looks.includes(look)) {
    return { field: "makeup_look", message: "Choose your preferred look." };
  }
  if (note.length > noteMax) return { field: "makeup_look_note", message: `Keep the note under ${noteMax} characters.` };
  return null;
}

function clear(registration) {
  registration.set("makeup_look", "");
  registration.set("makeup_look_note", "");
}

module.exports = { asked, check, clear, looks };
