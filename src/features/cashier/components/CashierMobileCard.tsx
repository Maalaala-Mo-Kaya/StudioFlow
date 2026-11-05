import React from 'react';
import { CreditCard, Banknote, Printer, PackageCheck } from 'lucide-react';
import type { Registration } from '../../../types';
import { RegistrationStatusBadge } from '../../../components/RegistrationStatusBadge';
import {
  formatClientName,
  formatCurrency,
  formatJobOrderNo,
  formatQueueNumber,
} from '../../../utils/formatters';

interface CashierMobileCardProps {
  registration: Registration;
  onOpenPayment: (reg: Registration) => void;
  onOpenPrint: (reg: Registration) => void;
  onOpenRelease: (reg: Registration) => void;
}

export const CashierMobileCard: React.FC<CashierMobileCardProps> = ({
  registration: reg,
  onOpenPayment,
  onOpenPrint,
  onOpenRelease,
}) => {
  return (
    <div className="bg-white border-2 border-[#0A0A0A] p-4 shadow-[4px_4px_0px_#0A0A0A] space-y-3">
      <div className="flex items-center justify-between border-b border-neutral-200 pb-2.5">
        <div className="flex items-center gap-2">
          <span className="font-mono font-black text-xs bg-[#0A0A0A] text-[#C9A227] px-2 py-0.5">
            {formatQueueNumber(reg.queue_number)}
          </span>
          <span className="font-mono font-black text-sm text-red-600">
            {formatJobOrderNo(reg.job_order_no)}
          </span>
        </div>
        <RegistrationStatusBadge status={reg.status} />
      </div>

      <div>
        <h3 className="text-base font-black text-[#0A0A0A] uppercase">
          {formatClientName(reg)}
        </h3>
        <p className="text-xs font-semibold text-neutral-600 mt-0.5">
          {reg.expand?.organization?.name || 'School N/A'} •{' '}
          {reg.expand?.course?.code || reg.course || 'General'}{' '}
          {reg.section ? `(${reg.section})` : ''}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2 bg-[#F8F7F4] p-3 border border-neutral-300 text-xs">
        <div>
          <span className="font-mono text-[9px] font-bold uppercase text-neutral-500 block">
            Package
          </span>
          <span className="font-mono font-black text-[#0A0A0A]">
            {reg.expand?.package?.code || 'PKG'}
          </span>
        </div>
        <div>
          <span className="font-mono text-[9px] font-bold uppercase text-neutral-500 block">
            Total / Paid
          </span>
          <span className="font-mono font-bold text-[#0A0A0A]">
            {formatCurrency(reg.total_amount)}
          </span>
          <span className="font-mono text-[10px] text-emerald-700 font-bold block">
            Paid: {formatCurrency(reg.paid_amount)}
          </span>
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
        </div>
      </div>

      <div className="flex items-center gap-2 pt-1">
        {reg.status === 'pending_payment' ? (
          <button
            type="button"
            onClick={() => onOpenPayment(reg)}
            className="btn-tactile flex-1 min-h-[44px] flex items-center justify-center gap-2 bg-[#C9A227] text-[#0A0A0A] border border-[#0A0A0A] font-black text-xs uppercase tracking-wider cursor-pointer"
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

        <button
          type="button"
          onClick={() => onOpenPrint(reg)}
          className="btn-tactile min-h-[44px] px-4 flex items-center justify-center gap-1.5 bg-[#0A0A0A] text-[#C9A227] text-xs font-black uppercase tracking-wider cursor-pointer"
        >
          <Printer className="w-4 h-4" /> Stub
        </button>

        {reg.status !== 'pending_payment' && reg.status !== 'released' && (
          <button
            type="button"
            onClick={() => onOpenRelease(reg)}
            className={`btn-tactile min-h-[44px] px-3 flex items-center justify-center gap-1 text-xs font-black uppercase tracking-wider border cursor-pointer ${
              reg.balance > 0
                ? 'bg-neutral-100 text-neutral-500 border-neutral-300'
                : 'bg-emerald-700 text-white border-emerald-900'
            }`}
          >
            <PackageCheck className="w-4 h-4" /> Release
          </button>
        )}
      </div>
    </div>
  );
};
