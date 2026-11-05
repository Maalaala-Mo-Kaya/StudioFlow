/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const reg = app.findCollectionByNameOrId("registrations");

  if (!reg.fields.getByName("framing_status")) {
    reg.fields.add(
      new SelectField({
        name: "framing_status",
        values: ["none", "pending_framing", "in_production", "framed", "ready_for_pickup", "released"],
      })
    );
  }

  if (!reg.fields.getByName("photo_status")) {
    reg.fields.add(
      new SelectField({
        name: "photo_status",
        values: ["pending_shoot", "shot_raw", "client_selected", "ready_to_print"],
      })
    );
  }

  if (!reg.fields.getByName("claimed_by")) {
    reg.fields.add(
      new TextField({
        name: "claimed_by",
      })
    );
  }

  if (!reg.fields.getByName("released_at")) {
    reg.fields.add(
      new TextField({
        name: "released_at",
      })
    );
  }

  app.save(reg);
}, (app) => {
  try {
    const reg = app.findCollectionByNameOrId("registrations");
    reg.fields.removeByName("framing_status");
    reg.fields.removeByName("photo_status");
    reg.fields.removeByName("claimed_by");
    reg.fields.removeByName("released_at");
    app.save(reg);
  } catch (_) {}
});
