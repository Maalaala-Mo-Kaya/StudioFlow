/// <reference path="../pb_data/types.d.ts" />

function installPaymentValidation(app, restrictInitialModes) {
  const paymentScope = restrictInitialModes ? "AND COALESCE(status, '') IN ('', 'completed')" : "";
  const paid = `(SELECT COALESCE(SUM(ROUND(amount * 100)), 0)
    FROM payments WHERE registration = NEW.registration ${paymentScope})`;
  const remaining = `(SELECT MAX(0, ROUND(total_amount * 100) - ${paid})
    FROM registrations WHERE id = NEW.registration)`;
  const initialModeUsed = restrictInitialModes
    ? `NEW.payment_type IN ('full', 'initial') AND ${paid} > 0`
    : `NEW.payment_type = 'initial' AND EXISTS(
        SELECT 1 FROM payments WHERE registration = NEW.registration
      )`;

  app.db().newQuery("DROP TRIGGER IF EXISTS payments_validate_insert").execute();
  app.db().newQuery(`
    CREATE TRIGGER payments_validate_insert
    BEFORE INSERT ON payments
    BEGIN
      SELECT CASE WHEN ROUND(NEW.amount * 100) < 1
        THEN RAISE(ABORT, 'Payment must be at least 0.01') END;
      SELECT CASE WHEN NEW.payment_type NOT IN ('full', 'initial', 'additional')
        THEN RAISE(ABORT, 'Invalid collection mode') END;
      SELECT CASE WHEN ${initialModeUsed}
        THEN RAISE(ABORT, 'Collection mode is only available for the initial payment') END;
      SELECT CASE WHEN ROUND(NEW.amount * 100) > ${remaining}
        THEN RAISE(ABORT, 'Payment exceeds remaining balance') END;
      SELECT CASE WHEN NEW.payment_type = 'full' AND ROUND(NEW.amount * 100) != ${remaining}
        THEN RAISE(ABORT, 'Full settlement must equal remaining balance') END;
      SELECT CASE WHEN NEW.payment_type = 'initial' AND ROUND(NEW.amount * 100) != (
        SELECT MIN(ROUND(total_amount * 100), ROUND(total_amount / 2.0) * 100)
        FROM registrations WHERE id = NEW.registration
      ) THEN RAISE(ABORT, 'Downpayment must equal 50 percent of total') END;
      SELECT CASE WHEN NEW.payment_method = 'cash' AND ROUND(NEW.cash_tendered * 100) < ROUND(NEW.amount * 100)
        THEN RAISE(ABORT, 'Cash tendered is insufficient') END;
    END
  `).execute();
}

migrate((app) => installPaymentValidation(app, true), (app) => installPaymentValidation(app, false));
