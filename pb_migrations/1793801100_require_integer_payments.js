/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  app.db().newQuery(`
    CREATE TRIGGER payments_require_integer_amount
    BEFORE INSERT ON payments
    WHEN NEW.amount < 1 OR NEW.amount != CAST(NEW.amount AS INTEGER)
    BEGIN
      SELECT RAISE(ABORT, 'Payment must be a positive whole-peso amount');
    END
  `).execute();
}, (app) => {
  app.db().newQuery("DROP TRIGGER IF EXISTS payments_require_integer_amount").execute();
});
