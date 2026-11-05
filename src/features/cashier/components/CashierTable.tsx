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

interface CashierTableProps {
  registrations: Registration[];
  onOpenPayment: (reg: Registration) => void;
  onOpenPrint: (reg: Registration) => void;
  onOpenRelease: (reg: Registration) => void;
}

export const CashierTable: React.FC<CashierTableProps> = ({
  registrations,
  onOpenPayment,
  onOpenPrint,
  onOpenRelease,
}) => {
  return (
    <div className="hidden md:block bg-white border-2 border-[#0A0A0A] shadow-[6px_6px_0px_#0A0A0A] overflow-hidden animate-enter-delay-1">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-[#0A0A0A] text-[#C9A227] font-mono text-[11px] uppercase font-black tracking-wider border-b-2 border-[#0A0A0A]">
              <th className="py-3.5 px-4">Queue &amp; Job №</th>
              <th className="py-3.5 px-4">Client Name</th>
              <th className="py-3.5 px-4">School &amp; Course</th>
              <th className="py-3.5 px-4">Package</th>
              <th className="py-3.5 px-4">Total</th>
              <th className="py-3.5 px-4">Paid / Balance</th>
              <th className="py-3.5 px-4">Status</th>
              <th className="py-3.5 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200">
            {registrations.map((reg) => (
              <tr key={reg.id} className="hover:bg-[#F7F2E0]/50 transition">
                <td className="py-3.5 px-4">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-black text-[#C9A227] bg-[#0A0A0A] px-2 py-0.5 text-xs">
                      {formatQueueNumber(reg.queue_number)}
                    </span>
                    <span className="font-mono font-black text-red-600 text-sm">
                      {formatJobOrderNo(reg.job_order_no)}
                    </span>
                  </div>
                </td>

                <td className="py-3.5 px-4 font-black text-[#0A0A0A] uppercase text-sm">
                  {formatClientName(reg)}
                </td>

                <td className="py-3.5 px-4">
                  <div className="font-bold text-[#0A0A0A]">
                    {reg.expand?.organization?.name || 'School N/A'}
                  </div>
                  <div className="text-[11px] text-neutral-500 font-medium">
                    {reg.expand?.course?.code || reg.course || 'Gen Program'}{' '}
                    {reg.section ? `• Sec ${reg.section}` : ''}
                  </div>
                </td>

                <td className="py-3.5 px-4">
                  <span className="font-mono font-black text-xs bg-[#F7F2E0] border border-[#0A0A0A] text-[#0A0A0A] px-2 py-0.5">
                    {reg.expand?.package?.code || 'PKG'}
                  </span>
                </td>

                <td className="py-3.5 px-4 font-mono font-black text-[#0A0A0A] text-sm">
                  {formatCurrency(reg.total_amount)}
                </td>

                <td className="py-3.5 px-4 font-mono">
                  <div className="text-emerald-700 font-black">
                    {formatCurrency(reg.paid_amount)}
                  </div>
                  {reg.balance > 0 ? (
                    <div className="text-red-600 font-black text-[11px]">
                      Bal: {formatCurrency(reg.balance)}
                    </div>
                  ) : (
                    <div className="text-neutral-400 font-bold text-[10px] uppercase">
                      Settled
                    </div>
                  )}
                </td>

                <td className="py-3.5 px-4">
                  <RegistrationStatusBadge status={reg.status} />
                </td>

                <td className="py-3.5 px-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    {reg.status === 'pending_payment' ? (
                      <button
                        type="button"
                        onClick={() => onOpenPayment(reg)}
                        className="btn-tactile min-h-[36px] flex items-center gap-1.5 px-3.5 py-1.5 bg-[#C9A227] text-[#0A0A0A] border border-[#0A0A0A] font-black text-[11px] uppercase tracking-wider cursor-pointer"
                      >
                        <CreditCard className="w-3.5 h-3.5" /> Pay Now
                      </button>
                    ) : reg.balance > 0 ? (
                      <button
                        type="button"
                        onClick={() => onOpenPayment(reg)}
                        className="btn-tactile min-h-[36px] flex items-center gap-1.5 px-3.5 py-1.5 bg-red-600 hover:bg-red-700 text-white font-black text-[11px] uppercase tracking-wider cursor-pointer"
                      >
                        <Banknote className="w-3.5 h-3.5" /> Settle Bal
                      </button>
                    ) : null}

                    <button
                      type="button"
                      onClick={() => onOpenPrint(reg)}
                      title="Print Yellow Form / Receipt"
                      className="btn-tactile min-h-[36px] px-3 py-1.5 bg-[#0A0A0A] text-[#C9A227] hover:bg-neutral-800 font-bold text-[11px] uppercase tracking-wider flex items-center gap-1.5 cursor-pointer"
                    >
                      <Printer className="w-3.5 h-3.5" /> Print
                    </button>

                    {reg.status !== 'pending_payment' && reg.status !== 'released' && (
                      <button
                        type="button"
                        onClick={() => onOpenRelease(reg)}
                        title={reg.balance > 0 ? "Release blocked (Has balance)" : "Release package to client"}
                        className={`btn-tactile min-h-[36px] px-2.5 py-1.5 font-bold text-[11px] uppercase tracking-wider flex items-center gap-1.5 border cursor-pointer ${
                          reg.balance > 0
                            ? 'bg-neutral-100 text-neutral-500 border-neutral-300 hover:border-red-500'
                            : 'bg-emerald-700 text-white border-emerald-900 hover:bg-emerald-800'
                        }`}
                      >
                        <PackageCheck className="w-3.5 h-3.5" /> Release
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
