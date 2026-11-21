/// <reference path="../pb_data/types.d.ts" />

// Gender is required for new registrations through the validation hook. The
// field itself remains optional so legacy records without a value stay readable.
migrate((app) => {
  const registrations = app.findCollectionByNameOrId("registrations");
  if (!registrations.fields.getByName("gender")) registrations.fields.add(new TextField({ name: "gender" }));
  // Existing records may be blank. New registrations are enforced by the validation hook.
  registrations.fields.getByName("mobile_number").required = false;
  app.save(registrations);
}, (app) => {
  const registrations = app.findCollectionByNameOrId("registrations");
  registrations.fields.removeByName("gender");
  app.save(registrations);
});
