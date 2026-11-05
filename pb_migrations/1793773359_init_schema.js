/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  // 1. organizations
  const orgs = new Collection({
    name: "organizations",
    type: "base",
    listRule: "",
    viewRule: "",
    createRule: "",
    updateRule: "",
    deleteRule: "",
  });
  orgs.fields.add(
    new TextField({ name: "name", required: true }),
    new TextField({ name: "code" }),
    new BoolField({ name: "is_active" }),
    new AutodateField({ name: "created", onCreate: true, onUpdate: false }),
    new AutodateField({ name: "updated", onCreate: true, onUpdate: true })
  );
  app.save(orgs);

  // 2. levels
  const levels = new Collection({
    name: "levels",
    type: "base",
    listRule: "",
    viewRule: "",
    createRule: "",
    updateRule: "",
    deleteRule: "",
  });
  levels.fields.add(
    new RelationField({
      name: "organization",
      collectionId: orgs.id,
      cascadeDelete: true,
      maxSelect: 1,
    }),
    new TextField({ name: "name", required: true }),
    new NumberField({ name: "order" }),
    new AutodateField({ name: "created", onCreate: true, onUpdate: false }),
    new AutodateField({ name: "updated", onCreate: true, onUpdate: true })
  );
  app.save(levels);

  // 3. courses
  const courses = new Collection({
    name: "courses",
    type: "base",
    listRule: "",
    viewRule: "",
    createRule: "",
    updateRule: "",
    deleteRule: "",
  });
  courses.fields.add(
    new RelationField({
      name: "level",
      collectionId: levels.id,
      cascadeDelete: true,
      maxSelect: 1,
    }),
    new TextField({ name: "name", required: true }),
    new TextField({ name: "code" }),
    new AutodateField({ name: "created", onCreate: true, onUpdate: false }),
    new AutodateField({ name: "updated", onCreate: true, onUpdate: true })
  );
  app.save(courses);

  // 4. packages
  const packages = new Collection({
    name: "packages",
    type: "base",
    listRule: "",
    viewRule: "",
    createRule: "",
    updateRule: "",
    deleteRule: "",
  });
  packages.fields.add(
    new TextField({ name: "code", required: true }),
    new TextField({ name: "name", required: true }),
    new NumberField({ name: "amount", required: true }),
    new TextField({ name: "description" }),
    new JSONField({ name: "inclusions" }),
    new BoolField({ name: "is_active" }),
    new AutodateField({ name: "created", onCreate: true, onUpdate: false }),
    new AutodateField({ name: "updated", onCreate: true, onUpdate: true })
  );
  app.save(packages);

  // 5. add_ons
  const addOns = new Collection({
    name: "add_ons",
    type: "base",
    listRule: "",
    viewRule: "",
    createRule: "",
    updateRule: "",
    deleteRule: "",
  });
  addOns.fields.add(
    new TextField({ name: "code" }),
    new TextField({ name: "name", required: true }),
    new NumberField({ name: "amount", required: true }),
    new BoolField({ name: "is_active" }),
    new AutodateField({ name: "created", onCreate: true, onUpdate: false }),
    new AutodateField({ name: "updated", onCreate: true, onUpdate: true })
  );
  app.save(addOns);

  // 6. master_lists
  const masterLists = new Collection({
    name: "master_lists",
    type: "base",
    listRule: "",
    viewRule: "",
    createRule: "",
    updateRule: "",
    deleteRule: "",
  });
  masterLists.fields.add(
    new RelationField({
      name: "organization",
      collectionId: orgs.id,
      maxSelect: 1,
    }),
    new RelationField({
      name: "level",
      collectionId: levels.id,
      maxSelect: 1,
    }),
    new RelationField({
      name: "course",
      collectionId: courses.id,
      maxSelect: 1,
    }),
    new TextField({ name: "student_id" }),
    new TextField({ name: "full_name", required: true }),
    new EmailField({ name: "email" }),
    new TextField({ name: "mobile_number" }),
    new TextField({ name: "section" }),
    new AutodateField({ name: "created", onCreate: true, onUpdate: false }),
    new AutodateField({ name: "updated", onCreate: true, onUpdate: true })
  );
  app.save(masterLists);

  // 7. registrations
  const registrations = new Collection({
    name: "registrations",
    type: "base",
    listRule: "",
    viewRule: "",
    createRule: "",
    updateRule: "",
    deleteRule: "",
  });
  registrations.fields.add(
    new TextField({ name: "job_order_no" }),
    new NumberField({ name: "queue_number" }),
    new TextField({ name: "family_name", required: true }),
    new TextField({ name: "given_name", required: true }),
    new TextField({ name: "middle_name" }),
    new RelationField({
      name: "organization",
      collectionId: orgs.id,
      maxSelect: 1,
    }),
    new RelationField({
      name: "level",
      collectionId: levels.id,
      maxSelect: 1,
    }),
    new RelationField({
      name: "course",
      collectionId: courses.id,
      maxSelect: 1,
    }),
    new TextField({ name: "department" }),
    new TextField({ name: "section" }),
    new TextField({ name: "mobile_number", required: true }),
    new EmailField({ name: "email" }),
    new RelationField({
      name: "package",
      collectionId: packages.id,
      maxSelect: 1,
    }),
    new JSONField({ name: "add_ons" }),
    new NumberField({ name: "other_fees" }),
    new NumberField({ name: "total_amount" }),
    new NumberField({ name: "paid_amount" }),
    new NumberField({ name: "balance" }),
    new TextField({ name: "payment_type" }),
    new TextField({ name: "payment_status" }),
    new TextField({ name: "status" }),
    new FileField({
      name: "signature",
      maxSelect: 1,
      maxSize: 5242880,
      mimeTypes: ["image/png", "image/jpeg", "image/webp"],
    }),
    new TextField({ name: "prepared_by" }),
    new BoolField({ name: "terms_accepted" }),
    new TextField({ name: "notes" }),
    new AutodateField({ name: "created", onCreate: true, onUpdate: false }),
    new AutodateField({ name: "updated", onCreate: true, onUpdate: true })
  );
  app.save(registrations);

  // 8. payments
  const payments = new Collection({
    name: "payments",
    type: "base",
    listRule: "",
    viewRule: "",
    createRule: "",
    updateRule: "",
    deleteRule: "",
  });
  payments.fields.add(
    new RelationField({
      name: "registration",
      collectionId: registrations.id,
      maxSelect: 1,
      cascadeDelete: true,
    }),
    new NumberField({ name: "amount", required: true }),
    new TextField({ name: "payment_type" }),
    new TextField({ name: "payment_method" }),
    new TextField({ name: "cashier_name" }),
    new TextField({ name: "receipt_no" }),
    new TextField({ name: "remarks" }),
    new AutodateField({ name: "created", onCreate: true, onUpdate: false }),
    new AutodateField({ name: "updated", onCreate: true, onUpdate: true })
  );
  app.save(payments);

  // Seed default organization, packages, and sample hierarchy
  const defaultOrg = new Record(orgs, {
    name: "ACLC College of Mandaue",
    code: "ACLC-MND",
    is_active: true,
  });
  app.save(defaultOrg);

  const collegeLevel = new Record(levels, {
    organization: defaultOrg.id,
    name: "College",
    order: 1,
  });
  app.save(collegeLevel);

  const shsLevel = new Record(levels, {
    organization: defaultOrg.id,
    name: "Senior High School",
    order: 2,
  });
  app.save(shsLevel);

  const bscsCourse = new Record(courses, {
    level: collegeLevel.id,
    name: "Bachelor of Science in Computer Science",
    code: "BSCS",
  });
  app.save(bscsCourse);

  const bsitCourse = new Record(courses, {
    level: collegeLevel.id,
    name: "Bachelor of Science in Information Technology",
    code: "BSIT",
  });
  app.save(bsitCourse);

  const bsaCourse = new Record(courses, {
    level: collegeLevel.id,
    name: "Bachelor of Science in Accountancy",
    code: "BSA",
  });
  app.save(bsaCourse);

  const stemStrand = new Record(courses, {
    level: shsLevel.id,
    name: "Science, Technology, Engineering, and Mathematics",
    code: "STEM",
  });
  app.save(stemStrand);

  const abmStrand = new Record(courses, {
    level: shsLevel.id,
    name: "Accountancy, Business and Management",
    code: "ABM",
  });
  app.save(abmStrand);

  // Seed sample packages matching photo studio pricing
  const pkgA = new Record(packages, {
    code: "PKG-A",
    name: "Package A - Complete Graduation Pictorial",
    amount: 1500,
    description: "Includes Toga, Formal, Filipiniana/Barong, 8R Frame, 2 3R prints, 8 Wallet size, and Soft Copy.",
    inclusions: JSON.stringify([
      "1x 8R Glass Framed Portrait",
      "2x 3R Portrait Prints",
      "8x Wallet Size Prints",
      "Soft Copy via Google Drive / USB",
      "Toga, Barong / Filipiniana Attire Included"
    ]),
    is_active: true,
  });
  app.save(pkgA);

  const pkgB = new Record(packages, {
    code: "PKG-B",
    name: "Package B - Standard Graduation Package",
    amount: 1100,
    description: "Includes Toga, Formal attire, 5R Frame, 4 Wallet size, Soft Copy.",
    inclusions: JSON.stringify([
      "1x 5R Framed Portrait",
      "4x Wallet Size Prints",
      "Soft Copy via Google Drive / USB",
      "Toga Attire Included"
    ]),
    is_active: true,
  });
  app.save(pkgB);

  const pkgC = new Record(packages, {
    code: "PKG-C",
    name: "Package C - Basic Toga Only",
    amount: 750,
    description: "Includes Toga photo shoot, 1 5R print, 4 Wallet size.",
    inclusions: JSON.stringify([
      "1x 5R Print",
      "4x Wallet Size Prints",
      "Toga Attire Included"
    ]),
    is_active: true,
  });
  app.save(pkgC);

  // Seed Add-ons
  const addon1 = new Record(addOns, {
    code: "ADD-8RFRAME",
    name: "Extra 8R Frame",
    amount: 350,
    is_active: true,
  });
  app.save(addon1);

  const addon2 = new Record(addOns, {
    code: "ADD-11X14FRAME",
    name: "Upgrade to 11x14 Premium Frame",
    amount: 600,
    is_active: true,
  });
  app.save(addon2);

  const addon3 = new Record(addOns, {
    code: "ADD-RAWSOFT",
    name: "All Raw Unedited Soft Copies (USB / Drive)",
    amount: 300,
    is_active: true,
  });
  app.save(addon3);

  const addon4 = new Record(addOns, {
    code: "ADD-HAIRMAKEUP",
    name: "Professional Studio Hair & Makeup",
    amount: 400,
    is_active: true,
  });
  app.save(addon4);
}, (app) => {
  const collections = [
    "payments",
    "registrations",
    "master_lists",
    "add_ons",
    "packages",
    "courses",
    "levels",
    "organizations",
  ];
  for (const name of collections) {
    try {
      const col = app.findCollectionByNameOrId(name);
      if (col) app.delete(col);
    } catch (_) {}
  }
});
