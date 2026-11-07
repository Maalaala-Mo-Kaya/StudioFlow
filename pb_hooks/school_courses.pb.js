/// <reference path="../pb_data/types.d.ts" />

routerAdd("POST", "/api/studioflow/school-courses", (e) => {
  if (e.auth.getString("role") !== "admin") {
    throw new ForbiddenError("Only administrators can assign school courses.");
  }

  const input = new DynamicModel({ schoolId: "", levelId: "", name: "", code: "" });
  e.bindBody(input);
  const name = input.name.trim();
  const code = input.code.trim().toUpperCase();
  if (!input.schoolId || !input.levelId || (!name && !code)) {
    throw new BadRequestError("Choose a school and academic level and enter a course name or code.");
  }

  let assignment;
  e.app.runInTransaction((tx) => {
    const school = tx.findRecordById("organizations", input.schoolId);
    const template = tx.findRecordById("levels", input.levelId);
    const courseMatches = (condition, params) => {
      const ids = arrayOf(new DynamicModel({ id: "" }));
      tx.db().newQuery("SELECT id FROM courses WHERE " + condition + " LIMIT 2").bind(params).all(ids);
      return ids;
    };

    let matches = code ? courseMatches("lower(trim(code)) = lower({:code})", { code }) : [];
    if (!matches.length && name) {
      matches = courseMatches(
        "lower(trim(name)) = lower({:name})" + (code ? " AND trim(code) = ''" : ""),
        { name },
      );
    }
    if (matches.length > 1) throw new BadRequestError("More than one course has this name. Enter its course code.");
    let courseId = matches[0]?.id;

    if (courseId) {
      const existing = tx.findRecordsByFilter(
        "school_courses", "school_id = {:school} && course_id = {:course}", "", 1, 0,
        { school: school.id, course: courseId },
      );
      if (existing.length) throw new BadRequestError("This course is already assigned to this school.");
    } else {
      if (!name) throw new BadRequestError("Enter a name for the new course.");
      const course = new Record(tx.findCollectionByNameOrId("courses"), { name, code });
      tx.save(course);
      courseId = course.id;
    }

    let level = template;
    if (template.getString("organization") !== school.id) {
      const localLevels = tx.findRecordsByFilter(
        "levels", "organization = {:school} && name = {:name}", "order,id", 1, 0,
        { school: school.id, name: template.getString("name") },
      );
      level = localLevels[0] || new Record(tx.findCollectionByNameOrId("levels"), {
        organization: school.id, name: template.getString("name"), order: template.getInt("order"),
      });
      if (!localLevels.length) tx.save(level);
    }

    assignment = new Record(tx.findCollectionByNameOrId("school_courses"), {
      school_id: school.id, course_id: courseId, level: level.id,
    });
    tx.save(assignment);
  });
  return e.json(201, assignment);
}, $apis.requireAuth("users"));

onRecordCreateRequest((e) => {
  const school = e.record.getString("organization");
  const level = e.record.getString("level");
  const course = e.record.getString("course");
  if (level) {
    const levels = e.app.findRecordsByFilter(
      "levels", "id = {:level} && organization = {:school}", "", 1, 0, { level, school },
    );
    if (!levels.length) throw new BadRequestError("The selected academic level does not belong to this school.");
  }
  if (course) {
    const matches = e.app.findRecordsByFilter(
      "school_courses", "school_id = {:school} && level = {:level} && course_id = {:course}",
      "", 1, 0, { school, level, course },
    );
    if (!matches.length) throw new BadRequestError("The selected course is not assigned to this school and academic level.");
  }
  e.next();
}, "registrations");
