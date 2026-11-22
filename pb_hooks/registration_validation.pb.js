/// <reference path="../pb_data/types.d.ts" />

onRecordCreateRequest((e) => {
  const record = e.record;
  const errors = {};
  const invalid = (field, message) => {
    errors[field] = new ValidationError("validation_registration_" + field, message);
  };

  for (const field of ["family_name", "given_name", "middle_name", "gender", "section", "department", "email", "mobile_number"]) {
    record.set(field, record.getString(field).trim());
  }

  if (!record.getString("family_name")) invalid("family_name", "Enter your family name.");
  if (!record.getString("given_name")) invalid("given_name", "Enter your given name.");
  // Keep the new registration limits in sync with registrationValidation.ts.
  const { registrationNameLimit } = require(__hooks + "/studio_photo_names.cjs");
  const names = { family_name: "Family name", given_name: "Given name", middle_name: "Middle name" };
  for (const field of Object.keys(names)) {
    if (Array.from(record.getString(field)).length > registrationNameLimit) {
      invalid(field, `${names[field]} must be ${registrationNameLimit} characters or fewer.`);
    }
  }
  if (!["male", "female"].includes(record.getString("gender"))) invalid("gender", "Please select the client's gender.");

  // Keep the contact formats in sync with src/features/registration/registrationValidation.ts.
  const email = record.getString("email");
  const emailPattern = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i;
  if (email && !emailPattern.test(email)) invalid("email", "Enter a valid email address.");

  const mobile = record.getString("mobile_number");
  const mobilePattern = /^(?:0|\+?63)9\d{9}$/;
  if (!mobile) invalid("mobile_number", "Mobile number is required.");
  else if (!mobilePattern.test(mobile.replace(/[ -]/g, ""))) {
    invalid("mobile_number", "Enter a valid Philippine mobile number, such as 0917-000-0000.");
  }

  // Client type: school/graduation (default) or walk-in. Each must be switched on in Admin.
  const kind = record.getString("client_kind") || "school";
  if (!["school", "walkin"].includes(kind)) throw new BadRequestError("Invalid client type.");
  record.set("client_kind", kind);
  const settings = e.app.findRecordsByFilter("studio_settings", "key = 'main'", "", 1, 0)[0];
  const enabled = kind === "school" ? (settings ? settings.getBool("school_enabled") : true) : !!settings?.getBool("walkin_enabled");
  if (!enabled) {
    throw new BadRequestError(kind === "school"
      ? "School registrations are closed right now. Please ask the staff."
      : "Walk-in registrations are closed right now. Please ask the staff.");
  }

  if (kind === "school") {
    for (const field of ["session_type", "event_date", "event_venue", "client_org"]) record.set(field, "");
    const school = record.getString("organization");
    const level = record.getString("level");
    const course = record.getString("course");
    if (!school) {
      invalid("organization", "Select your school, campus, or organization.");
    } else if (!e.app.findRecordsByFilter("organizations", "id = {:school} && is_active = true", "", 1, 0, { school }).length) {
      invalid("organization", "The selected school is no longer available.");
    }
    if (!level) {
      invalid("level", "Select your academic level.");
    } else if (!e.app.findRecordsByFilter("levels", "id = {:level} && organization = {:school}", "", 1, 0, { level, school }).length) {
      invalid("level", "The selected academic level does not belong to this school.");
    }
    if (!course || !e.app.findRecordsByFilter(
      "school_courses", "school_id = {:school} && level = {:level} && course_id = {:course}",
      "", 1, 0, { school, level, course },
    ).length) {
      invalid("course", "Select a course or strand for this school and academic level.");
    }
  } else {
    // Walk-in: no school details; a session type, plus date and venue for events outside the studio.
    for (const field of ["organization", "level", "course", "student_id", "section", "department"]) record.set(field, "");
    for (const field of ["event_venue", "client_org", "notes"]) record.set(field, record.getString(field).trim());
    if (record.getString("client_org").length > 120) invalid("client_org", "Keep the organization or company name under 120 characters.");
    if (record.getString("notes").length > 500) invalid("notes", "Keep the notes under 500 characters.");
    const sessionId = record.getString("session_type");
    const session = sessionId
      ? e.app.findRecordsByFilter("session_types", "id = {:id} && is_active = true", "", 1, 0, { id: sessionId })[0]
      : null;
    if (!session) {
      invalid("session_type", sessionId ? "The selected session type is no longer available." : "Select the type of session.");
    } else if (session.getBool("on_location")) {
      if (!record.getString("event_date")) invalid("event_date", "Enter the event date.");
      if (!record.getString("event_venue")) invalid("event_venue", "Enter the event venue.");
    } else {
      record.set("event_date", "");
      record.set("event_venue", "");
    }
  }

  const packageId = record.getString("package");
  const pkg = packageId
    ? e.app.findRecordsByFilter("packages", "id = {:id} && is_active = true", "", 1, 0, { id: packageId })[0]
    : null;
  if (!packageId) {
    invalid("package", "Please select a Job Order Package to continue.");
  } else if (!pkg) {
    invalid("package", "The selected Job Order Package is no longer available. Choose another package.");
  } else if (![kind, "both"].includes(pkg.getString("client_kind") || "school")) {
    invalid("package", "This package is not offered for this type of client. Choose another package.");
  }

  // The client's picks from the package's option groups, checked against the package and saved
  // with their labels (studio_package_options.js).
  const options = pkg
    ? require(__hooks + "/studio_package_options.js").check(pkg, record.getString("gender"), record.getString("package_options"))
    : { value: [] };
  if (options.problem) invalid("package_options", options.problem);
  else record.set("package_options", options.value);

  // The preferred-look UI is retired. Keep historical values, but validate only the
  // optional artist note for new MUA orders. Orders without MUA services are cleared.
  const lookRules = require(__hooks + "/studio_makeup_look.js");
  const workflow = require(__hooks + "/studio_workflow.js");
  if (pkg && workflow.purchasedServices(e.app, record).length) {
    lookRules.clearLook(record);
    const problem = lookRules.check(record, false);
    if (problem) invalid(problem.field, problem.message);
  } else {
    lookRules.clear(record);
  }

  if (!record.getBool("terms_accepted")) invalid("terms_accepted", "Agree to the Terms & Conditions to proceed.");
  if (!record.getUnsavedFiles("signature").length) {
    invalid("signature", "Provide your digital signature on the signature pad.");
  }

  if (Object.keys(errors).length) throw new BadRequestError("Check the registration fields and try again.", errors);
  return e.next();
}, "registrations");

onRecordUpdateRequest((e) => {
  const before = e.record.original();
  const changed = (field) => e.record.getString(field) !== before.getString(field);
  if (changed("gender") && e.record.getString("gender") && !["male", "female"].includes(e.record.getString("gender"))) {
    throw new BadRequestError("Gender must be Male or Female.");
  }
  if (changed("mobile_number")) {
    const mobile = e.record.getString("mobile_number").trim();
    if (!mobile) throw new BadRequestError("Mobile number is required for updated client records.");
    if (!/^(?:0|\+?63)9\d{9}$/.test(mobile.replace(/[ -]/g, ""))) {
      throw new BadRequestError("Enter a valid Philippine mobile number, such as 0917-000-0000.");
    }
    e.record.set("mobile_number", mobile);
  }
  if (changed("email")) {
    const email = e.record.getString("email").trim();
    if (email && !/^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(email)) {
      throw new BadRequestError("Enter a valid email address.");
    }
    e.record.set("email", email);
  }
  return e.next();
}, "registrations");

// Admin edits of the package or of the client's package options: the picks are checked against
// the order's package. A new package starts with no picks, so its options must be chosen with it.
// Picks made at sale stay as saved when the package's options are edited later.
onRecordUpdateRequest((e) => {
  const before = e.record.original();
  const changed = (field) => e.record.getString(field) !== before.getString(field);
  const packageChanged = changed("package");
  if (!packageChanged && !changed("package_options")) return e.next();
  const status = before.getString("status");
  if (["released", "cancelled"].includes(status)) {
    throw new BadRequestError(status === "released"
      ? "This order was already released, so its package options can't change."
      : "This order is cancelled. Restore it before changing its package options.");
  }
  const packageId = e.record.getString("package");
  const pkg = packageId ? e.app.findFirstRecordByFilter("packages", "id = {:id}", { id: packageId }) : null;
  const sent = changed("package_options") ? e.record.getString("package_options") : "[]";
  const result = pkg
    ? require(__hooks + "/studio_package_options.js").check(pkg, e.record.getString("gender"), sent)
    : { value: [] };
  if (result.problem) {
    throw new BadRequestError(result.problem, {
      package_options: new ValidationError("validation_registration_package_options", result.problem),
    });
  }
  e.record.set("package_options", result.value);
  return e.next();
}, "registrations");

// Admin edits of the preferred makeup look (Edit Client): a known look or none, and a short note.
onRecordUpdateRequest((e) => {
  const before = e.record.original();
  if (e.record.getString("makeup_look") === before.getString("makeup_look")
    && e.record.getString("makeup_look_note") === before.getString("makeup_look_note")) return e.next();
  const problem = require(__hooks + "/studio_makeup_look.js").check(e.record, false);
  if (problem) {
    throw new BadRequestError(problem.message, {
      [problem.field]: new ValidationError("validation_registration_" + problem.field, problem.message),
    });
  }
  return e.next();
}, "registrations");
