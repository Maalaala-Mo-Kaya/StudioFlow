import React from 'react';
import { RotateCw } from 'lucide-react';
import { formatCurrency } from '../../../utils/formatters';

interface CashierHeaderProps {
  totalCollectedToday: number;
  onRefresh: () => void;
}

export const CashierHeader: React.FC<CashierHeaderProps> = ({
  totalCollectedToday,
  onRefresh,
}) => {
  return (
    <div className="animate-enter bg-[#0A0A0A] text-white p-5 sm:p-6 mb-6 border-2 border-[#0A0A0A] shadow-[4px_4px_0px_#C9A227] flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div>
        <span className="font-mono text-[10px] font-black uppercase tracking-widest bg-[#C9A227] text-[#0A0A0A] px-2 py-0.5 inline-block mb-1.5">
          POS Station
        </span>
        <h1 className="text-xl sm:text-2xl font-black tracking-tight uppercase text-white">
          Cashier &amp; <span className="text-[#C9A227]">Receipt Desk</span>
        </h1>
        <p className="text-xs text-neutral-400 mt-1">
          Verify client job orders, collect payments, and dispatch clients to the shooting queue.
        </p>
      </div>

      <div className="flex items-center gap-3 self-start md:self-auto">
        <div className="bg-[#141414] border border-[#C9A227] px-4 py-2.5 text-right">
          <span className="block font-mono text-[9px] font-bold uppercase tracking-widest text-neutral-400">
            Collected Today
          </span>
          <span className="font-mono text-lg sm:text-xl font-black text-[#C9A227]">
            {formatCurrency(totalCollectedToday)}
          </span>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="btn-tactile min-h-[48px] flex items-center gap-2 px-4 py-2.5 bg-[#141414] hover:bg-neutral-800 border border-neutral-700 text-white text-xs font-black uppercase tracking-widest cursor-pointer"
        >
          <RotateCw className="w-4 h-4 text-[#C9A227]" />
          <span className="hidden sm:inline">Refresh</span>
        </button>
      </div>
    </div>
  );
};
