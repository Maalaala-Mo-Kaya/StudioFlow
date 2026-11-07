/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const payments = app.findCollectionByNameOrId("payments");
  payments.fields.add(
    new NumberField({ name: "cash_tendered" }),
    new NumberField({ name: "change_amount" }),
    new TextField({ name: "cashier_id" })
  );
  payments.addIndex("idx_payments_receipt_no", true, "receipt_no", "receipt_no != ''");
  app.save(payments);
  app.db().newQuery(`
    CREATE TRIGGER payments_validate_insert
    BEFORE INSERT ON payments
    BEGIN
      SELECT CASE WHEN ROUND(NEW.amount * 100) < 1
        THEN RAISE(ABORT, 'Payment must be at least 0.01') END;
      SELECT CASE WHEN NEW.payment_type NOT IN ('full', 'initial', 'additional')
        THEN RAISE(ABORT, 'Invalid collection mode') END;
      SELECT CASE WHEN ROUND(NEW.amount * 100) > (
        SELECT MAX(0, ROUND(r.total_amount * 100) - COALESCE(SUM(ROUND(p.amount * 100)), 0))
        FROM registrations r LEFT JOIN payments p ON p.registration = r.id
        WHERE r.id = NEW.registration GROUP BY r.id
      ) THEN RAISE(ABORT, 'Payment exceeds remaining balance') END;
      SELECT CASE WHEN NEW.payment_type = 'full' AND ROUND(NEW.amount * 100) != (
        SELECT MAX(0, ROUND(r.total_amount * 100) - COALESCE(SUM(ROUND(p.amount * 100)), 0))
        FROM registrations r LEFT JOIN payments p ON p.registration = r.id
        WHERE r.id = NEW.registration GROUP BY r.id
      ) THEN RAISE(ABORT, 'Full settlement must equal remaining balance') END;
      SELECT CASE WHEN NEW.payment_type = 'initial' AND EXISTS(
        SELECT 1 FROM payments WHERE registration = NEW.registration
      ) THEN RAISE(ABORT, 'Downpayment is only allowed as the initial payment') END;
      SELECT CASE WHEN NEW.payment_type = 'initial' AND ROUND(NEW.amount * 100) != (
        SELECT MIN(ROUND(r.total_amount * 100), ROUND(r.total_amount / 2.0) * 100)
        FROM registrations r WHERE r.id = NEW.registration
      ) THEN RAISE(ABORT, 'Downpayment must equal 50 percent of total') END;
      SELECT CASE WHEN NEW.payment_method = 'cash' AND ROUND(NEW.cash_tendered * 100) < ROUND(NEW.amount * 100)
        THEN RAISE(ABORT, 'Cash tendered is insufficient') END;
    END
  `).execute();
}, (app) => {
  app.db().newQuery("DROP TRIGGER IF EXISTS payments_validate_insert").execute();
  const payments = app.findCollectionByNameOrId("payments");
  payments.removeIndex("idx_payments_receipt_no");
  payments.fields.removeByName("cash_tendered");
  payments.fields.removeByName("change_amount");
  payments.fields.removeByName("cashier_id");
  app.save(payments);
});
