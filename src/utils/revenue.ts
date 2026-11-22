import type { PaymentRecord, RefundRecord, Registration, RevenueSplit } from '../types';

export const revenueKeys = ['studio', 'mua', 'unallocated'] as const;
export const emptyRevenue = (): RevenueSplit => ({ studio: 0, mua: 0, unallocated: 0 });
export const countedPayment = (payment: PaymentRecord) => (payment.status || 'completed') === 'completed';
export const toCentavos = (amount: number | undefined) => Math.round((amount || 0) * 100);
export const revenuePesos = ({ studio, mua, unallocated }: RevenueSplit): RevenueSplit =>
  ({ studio: studio / 100, mua: mua / 100, unallocated: unallocated / 100 });
export const discountCents = (reg: Registration) => (reg.revenue_discount?.studio ?? 0) + (reg.revenue_discount?.mua ?? 0);

/**
 * How a discount is described next to its amount: "10%", or "Fixed amount" for one given in pesos
 * (its worked-out percentage, e.g. 6.68%, would only confuse). '' when there is none.
 */
export function discountRate(discount: { percentage?: number; fixed?: boolean; studio?: number; mua?: number } | null | undefined, total?: number): string {
  if (!discount) return '';
  if (discount.fixed) return 'Fixed amount';
  const credit = (discount.studio ?? 0) + (discount.mua ?? 0);
  const percentage = discount.percentage ?? (credit && total !== undefined ? credit * 100 / (total * 100 + credit) : undefined);
  return percentage === undefined ? '' : `${Number(percentage.toFixed(2))}%`;
}

export function revenueTerms(reg?: Registration): RevenueSplit {
  const due = toCentavos(reg?.total_amount);
  const terms = reg?.revenue_terms;
  if (terms && revenueKeys.every((key) => Number.isSafeInteger(terms[key]) && terms[key] >= 0)
    && revenueKeys.reduce((sum, key) => sum + terms[key], 0) === due) return terms;
  return { ...emptyRevenue(), unallocated: due };
}

/**
 * A single known category can be recognized as cash comes in. Mixed partial balances,
 * unclassified legacy charges and excess cash stay unallocated until supported by the
 * ledger and sale terms. Settlement can release earlier cash into its final categories.
 */
export function allocateRevenue(net: number, terms: RevenueSplit): RevenueSplit {
  const total = terms.studio + terms.mua + terms.unallocated;
  if (net >= total) return { ...terms, unallocated: net - terms.studio - terms.mua };
  if (net > 0 && terms.studio === total) return { ...emptyRevenue(), studio: net };
  if (net > 0 && terms.mua === total) return { ...emptyRevenue(), mua: net };
  return { ...emptyRevenue(), unallocated: net };
}

/** Event movements in centavos, including reclassification of earlier cash on settlement. */
export function revenueMovements(reg: Registration | undefined, payments: PaymentRecord[], refunds: RefundRecord[]) {
  const terms = revenueTerms(reg);
  const events = [
    ...payments.filter(countedPayment).map((p) => ({
      key: 'p:' + p.id, date: p.created, sequence: p.receipt_no ?? p.id, amount: toCentavos(p.amount),
    })),
    ...refunds.map((r) => ({
      key: 'r:' + r.id, date: r.created, sequence: r.refund_no ?? r.id, amount: -toCentavos(r.amount),
    })),
  ].sort((a, b) => a.date.localeCompare(b.date) || Number(a.amount < 0) - Number(b.amount < 0)
    || a.sequence.localeCompare(b.sequence, undefined, { numeric: true }) || a.key.localeCompare(b.key));
  const movements = new Map<string, RevenueSplit>();
  let net = 0;
  let previous = emptyRevenue();
  for (const event of events) {
    net += event.amount;
    const next = allocateRevenue(net, terms);
    movements.set(event.key, {
      studio: next.studio - previous.studio,
      mua: next.mua - previous.mua,
      unallocated: next.unallocated - previous.unallocated,
    });
    previous = next;
  }
  return { movements, net: previous };
}
