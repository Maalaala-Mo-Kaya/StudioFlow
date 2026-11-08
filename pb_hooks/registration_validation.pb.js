/// <reference path="../pb_data/types.d.ts" />

onRecordCreateRequest((e) => {
  const record = e.record;
  const errors = {};
  const invalid = (field, message) => {
    errors[field] = new ValidationError("validation_registration_" + field, message);
  };

  for (const field of ["family_name", "given_name", "middle_name", "section", "department", "email", "mobile_number"]) {
    record.set(field, record.getString(field).trim());
  }

  if (!record.getString("family_name")) invalid("family_name", "Enter your family name.");
  if (!record.getString("given_name")) invalid("given_name", "Enter your given name.");

  // Keep the contact formats in sync with src/features/registration/registrationValidation.ts.
  const email = record.getString("email");
  const emailPattern = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i;
  if (!email) invalid("email", "Enter your email address.");
  else if (!emailPattern.test(email)) invalid("email", "Enter a valid email address.");

  const mobile = record.getString("mobile_number");
  const mobilePattern = /^(?:0|\+?63)9\d{9}$/;
  if (mobile && !mobilePattern.test(mobile.replace(/[ -]/g, ""))) {
    invalid("mobile_number", "Enter a valid Philippine mobile number, such as 0917-000-0000.");
  }

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

  const packageId = record.getString("package");
  if (!packageId) {
    invalid("package", "Please select a Job Order Package to continue.");
  } else if (!e.app.findRecordsByFilter("packages", "id = {:id} && is_active = true", "", 1, 0, { id: packageId }).length) {
    invalid("package", "The selected Job Order Package is no longer available. Choose another package.");
  }

  if (!record.getBool("terms_accepted")) invalid("terms_accepted", "Agree to the Terms & Conditions to proceed.");
  if (!record.getUnsavedFiles("signature").length) {
    invalid("signature", "Provide your digital signature on the signature pad.");
  }

  if (Object.keys(errors).length) throw new BadRequestError("Check the registration fields and try again.", errors);
  return e.next();
}, "registrations");
