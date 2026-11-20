/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const logs = app.findCollectionByNameOrId("mua_completions");
  logs.fields.add(new JSONField({ name: "earnings_basis" }), new JSONField({ name: "earnings_adjustments" }));
  app.save(logs);

  // Link only a single recorded source to a single completion for that job.
  // Multiple old types on one purchased line, or multiple lines for one type,
  // stay in the historical column with their original counts and payouts.
  app.db().newQuery(`
    WITH sources AS (
      SELECT c.id, c.job_id, j.value ->> '$.source' AS kind, j.value ->> '$.id' AS item
      FROM mua_completions c, json_each(CASE WHEN json_valid(c.sources) THEN c.sources ELSE '[]' END) j
      WHERE j.type = 'object' AND j.value ->> '$.source' IN ('package', 'add_on')
        AND COALESCE(j.value ->> '$.id', '') != ''
    ),
    unique_lines AS (
      SELECT job_id, kind, item FROM sources GROUP BY job_id, kind, item HAVING COUNT(*) = 1
    ),
    mapped AS (
      SELECT s.id, s.kind || ':' || s.item AS key
      FROM sources s JOIN unique_lines u USING (job_id, kind, item)
      JOIN mua_completions c ON c.id = s.id AND json_array_length(c.sources) = 1
    )
    UPDATE mua_completions AS c SET earnings_basis = json_object(
      'kind', 'historical', 'groupKey', (SELECT key FROM mapped WHERE id = c.id),
      'quantity', 1, 'earned', ROUND(payout_rate * 100)
    )
  `).execute();

  // Archive the old definitions and relations for historical inspection, while
  // removing their staff API and hiding them from the live catalog.
  const types = app.findCollectionByNameOrId("mua_service_types");
  types.listRule = types.viewRule = types.createRule = types.updateRule = null;
  app.save(types);
  for (const name of ["packages", "add_ons"]) {
    const catalog = app.findCollectionByNameOrId(name);
    catalog.fields.getByName("mua_service_types").hidden = true;
    app.save(catalog);
  }
}, () => {
  throw new Error("Restore a pre-upgrade backup to roll back catalog-based MUA earnings and retain the audit history.");
});
