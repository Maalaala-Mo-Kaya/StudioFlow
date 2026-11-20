migrate((app) => {
  const trigger = new DynamicModel({ sql: "" });
  app.db().newQuery("SELECT sql FROM sqlite_master WHERE name = 'studio_photo_queue_guard'").one(trigger);
  app.db().newQuery("DROP TRIGGER studio_photo_queue_guard").execute();
  app.db().newQuery(trigger.sql.replace("OLD.paid_amount <= 0",
    "OLD.paid_amount <= 0 AND NOT (OLD.payment_status = 'fully_paid' AND OLD.total_amount = 0)")).execute();
}, (app) => {
  const trigger = new DynamicModel({ sql: "" });
  app.db().newQuery("SELECT sql FROM sqlite_master WHERE name = 'studio_photo_queue_guard'").one(trigger);
  app.db().newQuery("DROP TRIGGER studio_photo_queue_guard").execute();
  app.db().newQuery(trigger.sql.replace(" AND NOT (OLD.payment_status = 'fully_paid' AND OLD.total_amount = 0)", "")).execute();
});
