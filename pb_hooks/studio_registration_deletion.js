// Use the same eligibility query for the Cashier action and for confirmation
// under the registration write lock. Ledger history counts even if it nets to zero.
function eligibleIds(app, id = "") {
  const rows = arrayOf(new DynamicModel({ id: "" }));
  const query = app.db().newQuery(`
    SELECT r.id FROM registrations r
    WHERE r.status = 'pending_payment' AND r.payment_status IN ('', 'unpaid')
      AND r.deleted_by_id = '' AND r.cancelled_at = ''
      AND COALESCE(r.job_order_no, '') = '' AND COALESCE(r.queue_number, 0) = 0 AND r.queue_issued_at = ''
      AND r.paid_amount = 0 AND r.refunded_amount = 0 AND r.had_discount_credit = 0
      AND (r.revenue_discount IS NULL OR CAST(r.revenue_discount AS TEXT) IN ('', 'null'))
      AND r.makeup_state = '' AND r.makeup_artist = '' AND r.makeup_completed_at = ''
      AND r.shoot_completed = 0 AND r.photo_status IN ('', 'pending_shoot')
      AND r.photo_folder = '' AND r.photo_folder_key = '' AND r.photo_revision = 0 AND r.photo_edit_until = 0
      AND (r.photo_selection IS NULL OR CAST(r.photo_selection AS TEXT) IN ('', 'null'))
      AND (r.photo_pending IS NULL OR CAST(r.photo_pending AS TEXT) IN ('', 'null'))
      AND (r.photo_last_request IS NULL OR CAST(r.photo_last_request AS TEXT) IN ('', 'null'))
      AND r.framing_status IN ('', 'none') AND r.ready_at = '' AND r.pickup_notified_at = ''
      AND r.pickup_notify_count = 0 AND r.released_at = '' AND r.claimed_by = ''
      AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.registration = r.id)
      AND NOT EXISTS (SELECT 1 FROM refunds f WHERE f.registration = r.id)
      AND NOT EXISTS (SELECT 1 FROM mua_completions c WHERE c.job_id = r.id)
      AND COALESCE((SELECT a.action FROM mua_assignment_events a WHERE a.job_id = r.id
        ORDER BY a.version DESC, a.created DESC LIMIT 1), 'release') = 'release'
      AND NOT EXISTS (SELECT 1 FROM camera_stations s WHERE s.active_registration = r.id)
      ${id ? "AND r.id = {:id}" : ""}
  `);
  if (id) query.bind({ id });
  query.all(rows);
  return rows.map((row) => row.id);
}

module.exports = { eligibleIds };
