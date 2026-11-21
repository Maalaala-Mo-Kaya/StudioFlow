import type { PaymentRecord, RefundRecord, Registration } from '../../types';
import { isPhotographed } from '../../utils/releaseReadiness';
import { buildAudit } from './auditData';

export interface OverviewMetrics {
  /** Active (not cancelled) job orders. */
  totalRegistrations: number;
  /** Paid and waiting for, or in, the photo session (right now). */
  totalPaidShooting: number;
  /** Photographed, whatever happened after (production, ready, released). */
  totalCompleted: number;
  /** Operational settlement: net payments plus discount credits. */
  totalCollections: number;
  totalDiscountCredits: number;
  /** Payments received, before refunds. */
  totalReceived: number;
  /** Refunds given. */
  totalRefunds: number;
  /** Money owed back to clients (paid more than their job order total). */
  totalRefundDue: number;
  /** Still to collect from the active orders counted. */
  totalOutstandingBalances: number;
  /** Active orders' totals, plus money already received from cancelled ones. */
  totalGrossInvoiced: number;
  cancelledCount: number;
}

/**
 * Admin overview figures, using the same rules as the Audit Export (see auditData.ts).
 * With `since`: payments received and job orders made since then. Without it: all time.
 */
export function overviewMetrics(
  registrations: Registration[], payments: PaymentRecord[], refunds: RefundRecord[] = [], since?: string,
): OverviewMetrics {
  const audit = buildAudit(registrations, payments, refunds, since);
  const active = audit.orders.filter((order) => !order.cancelled).map((order) => order.registration);
  return {
    totalRegistrations: audit.totals.activeOrders,
    totalPaidShooting: active.filter((reg) => reg.status === 'paid' || reg.status === 'shooting').length,
    totalCompleted: active.filter(isPhotographed).length,
    totalCollections: audit.totals.analyticsCollected,
    totalDiscountCredits: audit.totals.discountCredits,
    totalReceived: audit.totals.collections,
    totalRefunds: audit.totals.refunds,
    totalRefundDue: audit.totals.overpaid,
    totalOutstandingBalances: audit.totals.outstanding,
    totalGrossInvoiced: audit.totals.gross,
    cancelledCount: audit.totals.cancelledOrders,
  };
}
