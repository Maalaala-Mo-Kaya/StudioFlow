/// <reference path="../pb_data/types.d.ts" />

routerAdd("POST", "/api/studioflow/school-courses", (e) => {
  if (e.auth.getString("role") !== "admin") {
    throw new ForbiddenError("Only administrators can assign school courses.");
  }

  const input = new DynamicModel({ schoolId: "", levelId: "", courseId: "", name: "", code: "" });
  e.bindBody(input);
  const cleanName = (value) => value.trim().replace(/\s+/g, " ");
  const nameKey = (value) => cleanName(value).toLowerCase();
  const name = cleanName(input.name);
  const code = input.code.trim().toUpperCase();
  if (!input.schoolId || !input.levelId) {
    throw new BadRequestError("Choose a school and academic level.");
  }
  if (!name || (!input.courseId && !code)) {
    throw new BadRequestError("Enter a course name and code, or select an existing course.");
  }

  let assignment;
  e.app.runInTransaction((tx) => {
    const [school] = tx.findRecordsByFilter("organizations", "id = {:id}", "", 1, 0, { id: input.schoolId });
    const [template] = tx.findRecordsByFilter("levels", "id = {:id}", "", 1, 0, { id: input.levelId });
    if (!school || !template) {
      throw new BadRequestError("Choose an available school and academic level.");
    }
    let course;
    if (input.courseId) {
      const matches = tx.findRecordsByFilter("courses", "id = {:id}", "", 1, 0, { id: input.courseId });
      course = matches[0];
      if (!course || nameKey(course.getString("name")) !== nameKey(name) || course.getString("code").trim().toUpperCase() !== code) {
        throw new BadRequestError("The selected course no longer matches these details. Refresh the catalog and select it again.");
      }
    } else {
      // Match manually entered text against the current catalog in the write transaction.
      // JS normalization also handles whitespace and case in legacy names beyond SQLite's ASCII lower().
      const catalog = tx.findAllRecords("courses");
      course = catalog.find((record) => record.getString("code").trim().toUpperCase() === code);
      if (course && nameKey(course.getString("name")) !== nameKey(name)) {
        throw new BadRequestError("This course code already belongs to a different course name.");
      }
      if (!course) {
        const sameName = catalog.filter((record) => nameKey(record.getString("name")) === nameKey(name));
        if (sameName.length === 1 && !sameName[0].getString("code").trim()) {
          course = sameName[0];
        } else if (sameName.length) {
          throw new BadRequestError("This course name already exists. Select it from the suggestions to reuse it.");
        }
      }
    }

    const levelName = template.getString("name");
    if (course) {
      const existing = tx.findRecordsByFilter(
        "school_courses", "school_id = {:school} && course_id = {:course}", "", 1, 0,
        { school: school.id, course: course.id },
      );
      if (existing.length) throw new BadRequestError("This course is already assigned to the selected school.");
      const assignedLevels = arrayOf(new DynamicModel({ name: "" }));
      tx.db().newQuery(
        "SELECT DISTINCT levels.name FROM school_courses JOIN levels ON levels.id = school_courses.level WHERE course_id = {:course}",
      ).bind({ course: course.id }).all(assignedLevels);
      if (assignedLevels.length && !assignedLevels.some((level) => nameKey(level.name) === nameKey(levelName))) {
        throw new BadRequestError("This course is not available for the selected academic level.");
      }
    } else {
      course = new Record(tx.findCollectionByNameOrId("courses"), { name, code });
      tx.save(course);
    }

    let level = template;
    if (template.getString("organization") !== school.id) {
      const localLevel = tx.findRecordsByFilter(
        "levels", "organization = {:school}", "order,id", 0, 0, { school: school.id },
      ).find((record) => nameKey(record.getString("name")) === nameKey(levelName));
      level = localLevel || new Record(tx.findCollectionByNameOrId("levels"), {
        organization: school.id, name: levelName, order: template.getInt("order"),
      });
      if (!localLevel) tx.save(level);
    }

    assignment = new Record(tx.findCollectionByNameOrId("school_courses"), {
      school_id: school.id, course_id: course.id, level: level.id,
    });
    tx.save(assignment);
  });
  return e.json(201, assignment);
}, $apis.requireAuth("users"));
