/// <reference path="../pb_data/types.d.ts" />

// Job orders now keep the package contents they were sold with (inclusions and photo
// selection limit) in package_snapshot, next to the sold price. Existing orders take
// their package's current contents. Only the two new keys are added; price, code,
// name and configuredAmount stay exactly as saved.
migrate((app) => {
  const parse = (text) => {
    let value = text;
    for (let i = 0; i < 2 && typeof value === "string"; i++) {
      // Not JSON: an old record holding one plain-text inclusion.
      try { value = JSON.parse(value || "null"); } catch (_) { return value.trim() ? [value] : []; }
    }
    return Array.isArray(value) ? value.filter((item) => typeof item === "string" && item.trim()) : [];
  };
  for (const pkg of app.findAllRecords("packages")) {
    app.db().newQuery(`UPDATE registrations
      SET package_snapshot = json_set(package_snapshot, '$.inclusions', json({:inclusions}), '$.photo_selection_limit', {:limit})
      WHERE package = {:id} AND json_valid(package_snapshot) AND json_type(package_snapshot) = 'object'
        AND json_type(package_snapshot, '$.inclusions') IS NULL`)
      .bind({ id: pkg.id, inclusions: JSON.stringify(parse(pkg.getString("inclusions"))), limit: pkg.getInt("photo_selection_limit") })
      .execute();
  }
}, (app) => {
  app.db().newQuery(`UPDATE registrations
    SET package_snapshot = json_remove(package_snapshot, '$.inclusions', '$.photo_selection_limit')
    WHERE json_valid(package_snapshot) AND json_type(package_snapshot) = 'object'`).execute();
});
