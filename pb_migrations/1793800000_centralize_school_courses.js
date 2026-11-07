/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const schools = app.findCollectionByNameOrId("organizations");
  const levels = app.findCollectionByNameOrId("levels");
  const courses = app.findCollectionByNameOrId("courses");
  const assignments = new Collection({
    name: "school_courses",
    type: "base",
    listRule: "",
    viewRule: "",
    deleteRule: "@request.auth.role = 'admin'",
    indexes: [
      "CREATE UNIQUE INDEX idx_school_course ON school_courses (school_id, course_id)",
      "CREATE INDEX idx_school_course_level ON school_courses (school_id, level)",
    ],
  });
  for (const [name, collection] of [["school_id", schools], ["course_id", courses], ["level", levels]]) {
    assignments.fields.add(new RelationField({
      name, collectionId: collection.id, required: true, maxSelect: 1, cascadeDelete: true,
    }));
  }
  app.save(assignments);

  const records = app.findAllRecords("courses");
  records.sort((a, b) => a.getString("created").localeCompare(b.getString("created")) || a.id.localeCompare(b.id));
  const byCode = new Map();
  const byNameWithoutCode = new Map();
  const codesByName = new Map();
  const key = (value) => value.trim().toLowerCase();

  for (const course of records) {
    const code = key(course.getString("code"));
    const name = key(course.getString("name"));
    if (code) {
      if (!byCode.has(code)) byCode.set(code, course);
      const codes = codesByName.get(name) || new Set();
      codes.add(code);
      codesByName.set(name, codes);
    } else if (!byNameWithoutCode.has(name)) {
      byNameWithoutCode.set(name, course);
    }
  }

  const assignedLevels = new Map();
  for (const course of records) {
    const code = key(course.getString("code"));
    const name = key(course.getString("name"));
    const matchingCodes = codesByName.get(name);
    const canonical = code ? byCode.get(code)
      : matchingCodes?.size === 1 ? byCode.get([...matchingCodes][0])
      : byNameWithoutCode.get(name);
    const levelId = course.getString("level");
    if (levelId) {
      const schoolId = app.findRecordById(levels, levelId).getString("organization");
      if (!schoolId) throw new Error("Course " + course.id + " has a level with no school; resolve it before migrating.");
      const pair = schoolId + ":" + canonical.id;
      if (assignedLevels.has(pair) && assignedLevels.get(pair) !== levelId) {
        throw new Error("Course " + canonical.id + " has conflicting levels at school " + schoolId + "; resolve them before migrating.");
      }
      if (!assignedLevels.has(pair)) {
        app.save(new Record(assignments, { school_id: schoolId, course_id: canonical.id, level: levelId }));
        assignedLevels.set(pair, levelId);
      }
    }
    if (canonical.id !== course.id) {
      for (const collection of ["registrations", "master_lists"]) {
        app.db().newQuery("UPDATE " + collection + " SET course = {:canonical} WHERE course = {:duplicate}")
          .bind({ canonical: canonical.id, duplicate: course.id }).execute();
      }
      app.delete(course);
    }
  }

  courses.fields.removeByName("level");
  courses.createRule = null; // Catalog creation and the first assignment are atomic.
  courses.deleteRule = null; // School management only removes assignments.
  courses.indexes = [
    ...courses.indexes,
    "CREATE UNIQUE INDEX idx_course_code ON courses (lower(trim(code))) WHERE trim(code) <> ''",
    "CREATE UNIQUE INDEX idx_course_name_without_code ON courses (lower(trim(name))) WHERE trim(code) = ''",
  ];
  app.save(courses);
}, () => {
  throw new Error("Restore the pre-migration backup to roll back: the old schema cannot represent shared courses.");
});
