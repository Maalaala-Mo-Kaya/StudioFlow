/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const users = app.findCollectionByNameOrId("users");

  // 1. Add username field if not present
  if (!users.fields.getByName("username")) {
    users.fields.add(
      new TextField({
        name: "username",
        required: true,
        min: 3,
        max: 50,
      })
    );
  }

  // 2. Add role field if not present
  if (!users.fields.getByName("role")) {
    users.fields.add(
      new SelectField({
        name: "role",
        required: true,
        maxSelect: 1,
        values: ["admin", "cashier", "photographer"],
      })
    );
  }

  // 3. Unique index on username so PocketBase passwordAuth accepts username login
  try {
    users.addIndex("idx_users_username", true, "username", "");
  } catch (_) {}

  // 4. Enable username + email authentication
  users.passwordAuth.enabled = true;
  users.passwordAuth.identityFields = ["username", "email"];

  // 5. Rules for staff management
  users.listRule = "@request.auth.id != ''";
  users.viewRule = "@request.auth.id != ''";
  users.createRule = "@request.auth.role = 'admin'";
  users.updateRule = "@request.auth.role = 'admin' || id = @request.auth.id";
  users.deleteRule = "@request.auth.role = 'admin'";
  users.manageRule = "@request.auth.role = 'admin'";

  app.save(users);

  // 6. Seed default accounts for each role (admin, cashier, photographer)
  const defaultStaff = [
    {
      username: "admin",
      email: "admin@hilightstudio.local",
      password: "password123",
      name: "Studio Administrator",
      role: "admin",
    },
    {
      username: "cashier",
      email: "cashier@hilightstudio.local",
      password: "password123",
      name: "Mel (Cashier Staff)",
      role: "cashier",
    },
    {
      username: "photographer",
      email: "photographer@hilightstudio.local",
      password: "password123",
      name: "Lead Photographer",
      role: "photographer",
    },
  ];

  for (const staff of defaultStaff) {
    let record = null;
    try {
      record = app.findAuthRecordByEmail("users", staff.email);
    } catch (_) {}

    if (!record) {
      record = new Record(users);
    }

    record.set("username", staff.username);
    record.set("email", staff.email);
    record.set("name", staff.name);
    record.set("role", staff.role);
    record.set("verified", true);
    record.setPassword(staff.password);
    app.save(record);
  }
}, (app) => {
  try {
    const users = app.findCollectionByNameOrId("users");
    users.removeIndex("idx_users_username");
    users.passwordAuth.identityFields = ["email"];
    app.save(users);
  } catch (_) {}
});
