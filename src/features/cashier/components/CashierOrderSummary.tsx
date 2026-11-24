import { ShoppingBag } from 'lucide-react';
import { JobOrderBreakdown } from '../../../components/common/JobOrderBreakdown';
import type { Registration } from '../../../types';
import { formatCurrency } from '../../../utils/formatters';
import { chosenOptionLines } from '../../../utils/packageOptions';
import { getRegistrationAddOns } from '../../../utils/registrationAddOns';
import { toCentavos } from '../../../utils/revenue';
import { soldPackagePrice } from '../../receipts/receiptData';

interface CashierOrderSummaryProps {
  registration: Registration;
  originalCents: number;
  discountCents: number;
  discountLabel: string;
  totalCents: number;
  paidCents: number;
  balanceCents: number;
}

function peso(cents: number) {
  return formatCurrency(cents / 100, { exact: true });
}

export function CashierOrderSummary({
  registration, originalCents, discountCents, discountLabel, totalCents, paidCents, balanceCents,
}: CashierOrderSummaryProps) {
  const snapshot = registration.package_snapshot;
  const livePackage = registration.expand?.package;
  const refundedCents = toCentavos(registration.refunded_amount);
  const hasDiscount = discountCents > 0;

  return (
    <section aria-label="Job order summary" className="space-y-4 border border-line bg-obsidian p-4 font-mono text-xs text-white">
      <h4 className="flex items-center gap-2 border-b-2 border-neutral-800 pb-3 text-xs font-black uppercase tracking-widest text-gold">
        <ShoppingBag className="size-4 shrink-0" aria-hidden="true" /> Job order summary
      </h4>
      <JobOrderBreakdown
        selectedPackage={{
          code: snapshot?.code || livePackage?.code,
          name: snapshot?.name || livePackage?.name || 'Pictorial package',
          amount: soldPackagePrice(registration),
        }}
        optionLines={chosenOptionLines(registration.package_options)}
        addOns={getRegistrationAddOns(registration.add_ons)}
      />
      <dl className="space-y-1.5 border-t border-neutral-800 pt-3">
        {!!registration.other_fees && (
          <SummaryLine label="Other fees" amount={formatCurrency(registration.other_fees, { exact: true })} />
        )}
        {hasDiscount && (
          <>
            <SummaryLine label="Original job amount" amount={peso(originalCents)} />
            <SummaryLine label={`Discount (${discountLabel})`} amount={`−${peso(discountCents)}`} tone="text-gold-soft" />
          </>
        )}
        <SummaryLine label="Total billed" amount={peso(totalCents)} />
        {refundedCents > 0 && (
          <>
            <SummaryLine label="Payments received" amount={peso(paidCents + refundedCents)} />
            <SummaryLine label="Refunded" amount={`−${peso(refundedCents)}`} />
          </>
        )}
        <SummaryLine label={refundedCents > 0 ? 'Net paid' : 'Previously paid'} amount={peso(paidCents)}
          tone={paidCents > 0 ? 'text-emerald-500' : undefined} />
        <div className="flex items-baseline justify-between gap-2 border-t border-neutral-800 pt-2 font-black text-gold">
          <dt className="uppercase">Balance due</dt>
          <dd className="shrink-0 text-base">{peso(balanceCents)}</dd>
        </div>
      </dl>
    </section>
  );
}

function SummaryLine({ label, amount, tone = 'text-white' }: { label: string; amount: string; tone?: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-neutral-400">{label}</dt>
      <dd className={`shrink-0 font-bold ${tone}`}>{amount}</dd>
    </div>
  );
}
