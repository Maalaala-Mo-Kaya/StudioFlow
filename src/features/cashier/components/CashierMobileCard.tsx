import React from 'react';
import { CreditCard, Banknote, Printer, PackageCheck, MessageSquare, Plus } from 'lucide-react';
import { PickupNoticeInfo } from './PickupNoticeInfo';
import type { Registration } from '../../../types';
import { RegistrationStatusBadge } from '../../../components/RegistrationStatusBadge';
import { isReadyForRelease } from '../../../utils/releaseReadiness';
import { formatClientName, formatCurrency } from '../../../utils/formatters';
import { discountRate } from '../../../utils/revenue';
import { clientDetail, clientGroup } from '../../../utils/clientInfo';
import { RecordActionButton } from '../../../components/common/RecordActionButton';

interface CashierMobileCardProps {
  registration: Registration;
  onOpenPayment: (reg: Registration) => void;
  onOpenDelete?: (reg: Registration) => void;
  onOpenPrint: (reg: Registration) => void;
  onOpenRelease: (reg: Registration) => void;
  onOpenAddOn?: (reg: Registration) => void;
  /** Ready for Pickup tab: show the pickup notice and a Notify button. */
  onOpenNotify?: (reg: Registration) => void;
}

export const CashierMobileCard: React.FC<CashierMobileCardProps> = ({
  registration: reg,
  onOpenPayment,
  onOpenDelete,
  onOpenPrint,
  onOpenRelease,
  onOpenAddOn,
  onOpenNotify,
}) => {
  return (
    <div className="bg-panel border-2 border-line p-4 shadow-lux space-y-3">
      <div className="flex items-center justify-between border-b border-neutral-200 pb-2.5">
        <span className="font-mono font-black text-sm text-red-600">
          {reg.job_order_no?.trim() || '—'}
        </span>
        <RegistrationStatusBadge status={reg.status} />
      </div>

      <div>
        <h3 className="text-base font-black text-ink uppercase">
          {formatClientName(reg)}
        </h3>
        {!reg.job_order_no && <p className="break-all font-mono text-xs text-neutral-500">Ref {reg.id}</p>}
        <p className="text-xs font-semibold text-neutral-600 mt-0.5">
          {clientGroup(reg, true) || 'School N/A'} •{' '}
          {clientDetail(reg) || 'General'}{' '}
          {reg.section ? `(${reg.section})` : ''}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2 bg-canvas p-3 border border-neutral-300 text-xs">
        <div>
          <span className="font-mono text-[9px] font-bold uppercase text-neutral-500 block">
            Package
          </span>
          <span className="font-mono font-black text-ink">
            {reg.expand?.package?.code || 'PKG'}
          </span>
        </div>
        <div>
          <span className="font-mono text-[9px] font-bold uppercase text-neutral-500 block">
            Total / Paid
          </span>
          <span className="font-mono font-bold text-ink">
            {formatCurrency(reg.total_amount)}
          </span>
          <span className="font-mono text-[10px] text-emerald-700 font-bold block">
            Paid: {formatCurrency(reg.paid_amount)}
          </span>
          {(reg.refunded_amount ?? 0) > 0 && (
            <span className="font-mono text-[10px] text-neutral-600 font-bold block" title="Money given back to the client (recorded by an admin)">
              Refunded: {formatCurrency(reg.refunded_amount ?? 0)}
            </span>
          )}
        </div>
        <div>
          <span className="font-mono text-[9px] font-bold uppercase text-neutral-500 block">
            Balance
          </span>
          <span
            className={`font-mono font-black ${
              reg.balance > 0 ? 'text-red-600' : 'text-emerald-700'
            }`}
          >
            {reg.balance > 0 ? formatCurrency(reg.balance) : 'Settled'}
          </span>
          {/* A discounted order says so at a glance (its reason shows on hover). */}
          {reg.revenue_discount && reg.status !== 'cancelled' && (
            <div className="text-amber-700 font-bold text-[10px]" title={reg.revenue_discount.reason ? `Discount reason: ${reg.revenue_discount.reason}` : undefined}>
              Discount {discountRate(reg.revenue_discount, reg.total_amount)} · −{formatCurrency(((reg.revenue_discount.studio ?? 0) + (reg.revenue_discount.mua ?? 0)) / 100, { exact: true })}
            </div>
          )}
        </div>
      </div>

      {onOpenNotify && (
        <div className="flex items-center justify-between gap-2 border border-neutral-300 bg-canvas p-2.5">
          <PickupNoticeInfo reg={reg} />
          <button
            type="button"
            onClick={() => onOpenNotify(reg)}
            className="btn-tactile min-h-[40px] px-3 flex items-center gap-1.5 bg-gold text-on-gold border border-line text-xs font-black uppercase cursor-pointer"
          >
            <MessageSquare className="w-4 h-4" /> Notify
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        {reg.status === 'pending_payment' ? (
          <button
            type="button"
            onClick={() => onOpenPayment(reg)}
            className="btn-tactile flex-1 min-h-[44px] flex items-center justify-center gap-2 bg-gold text-on-gold border border-line font-black text-xs uppercase tracking-wider cursor-pointer"
          >
            <CreditCard className="w-4 h-4" /> Collect Payment
          </button>
        ) : reg.balance > 0 ? (
          <button
            type="button"
            onClick={() => onOpenPayment(reg)}
            className="btn-tactile flex-1 min-h-[44px] flex items-center justify-center gap-2 bg-red-600 text-white font-black text-xs uppercase tracking-wider cursor-pointer"
          >
            <Banknote className="w-4 h-4" /> Settle Balance
          </button>
        ) : null}

{onOpenAddOn && !['released', 'cancelled'].includes(reg.status) && (
          <button
            type="button"
            onClick={() => onOpenAddOn(reg)}
            title="Add an add-on the client asks for"
            className="btn-tactile min-h-[44px] px-3 text-xs border border-gold text-gold-soft bg-canvas font-black uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer hover:bg-gold-wash"
          >
            <Plus className="w-4 h-4" /> Add-on
          </button>
        )}
        {reg.job_order_no && <button
          type="button"
          onClick={() => onOpenPrint(reg)}
          className="btn-tactile min-h-[44px] px-4 flex items-center justify-center gap-1.5 bg-obsidian text-gold text-xs font-black uppercase tracking-wider cursor-pointer"
        >
          <Printer className="w-4 h-4" /> Stub
        </button>}

        {reg.balance === 0 && reg.revenue_discount && !['cancelled', 'released'].includes(reg.status) &&
          <RecordActionButton variant="edit" recordName={`discount for ${formatClientName(reg)}`} onClick={() => onOpenPayment(reg)} />}
        {onOpenDelete &&
          <RecordActionButton variant="delete" recordName={`unpaid registration for ${formatClientName(reg)}`} onClick={() => onOpenDelete(reg)} />}
        {reg.status !== 'pending_payment' && reg.status !== 'released' && reg.status !== 'cancelled' && (
          <button
            type="button"
            onClick={() => onOpenRelease(reg)}
            className={`btn-tactile min-h-[44px] px-3 flex items-center justify-center gap-1 text-xs font-black uppercase tracking-wider border cursor-pointer ${
              reg.balance > 0 || !isReadyForRelease(reg)
                ? 'bg-neutral-100 text-neutral-500 border-neutral-300'
                : 'bg-emerald-600 text-white border-emerald-500'
            }`}
          >
            <PackageCheck className="w-4 h-4" /> Release
          </button>
        )}
      </div>
    </div>
  );
};
