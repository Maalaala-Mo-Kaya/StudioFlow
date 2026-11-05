import React from 'react';
import { Clock, CheckCircle2, Banknote, Search } from 'lucide-react';
import type { CashierTab } from '../useCashierState';

interface CashierFilterBarProps {
  activeTab: CashierTab;
  onSelectTab: (tab: CashierTab) => void;
  pendingCount: number;
  paidCount: number;
  balanceCount: number;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export const CashierFilterBar: React.FC<CashierFilterBarProps> = ({
  activeTab,
  onSelectTab,
  pendingCount,
  paidCount,
  balanceCount,
  searchQuery,
  onSearchChange,
}) => {
  return (
    <div className="animate-enter-delay-1 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 bg-white p-3 border-2 border-[#0A0A0A] mb-6">
      <div className="grid grid-cols-3 sm:flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onSelectTab('pending')}
          className={`btn-tactile min-h-[42px] flex items-center justify-center gap-1.5 px-3 sm:px-4 py-2 text-[11px] font-black uppercase tracking-wider border cursor-pointer ${
            activeTab === 'pending'
              ? 'bg-[#0A0A0A] text-[#C9A227] border-[#0A0A0A]'
              : 'bg-[#F8F7F4] text-neutral-700 border-neutral-300 hover:border-[#0A0A0A]'
          }`}
        >
          <Clock className="w-3.5 h-3.5 shrink-0 hidden xs:inline" />
          <span>Pending</span>
          <span
            className={`font-mono px-1.5 py-0.5 text-[10px] font-black ${
              activeTab === 'pending'
                ? 'bg-[#C9A227] text-[#0A0A0A]'
                : 'bg-neutral-200 text-[#0A0A0A]'
            }`}
          >
            {pendingCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => onSelectTab('paid')}
          className={`btn-tactile min-h-[42px] flex items-center justify-center gap-1.5 px-3 sm:px-4 py-2 text-[11px] font-black uppercase tracking-wider border cursor-pointer ${
            activeTab === 'paid'
              ? 'bg-[#0A0A0A] text-[#C9A227] border-[#0A0A0A]'
              : 'bg-[#F8F7F4] text-neutral-700 border-neutral-300 hover:border-[#0A0A0A]'
          }`}
        >
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0 hidden xs:inline" />
          <span>Paid</span>
          <span
            className={`font-mono px-1.5 py-0.5 text-[10px] font-black ${
              activeTab === 'paid'
                ? 'bg-[#C9A227] text-[#0A0A0A]'
                : 'bg-neutral-200 text-[#0A0A0A]'
            }`}
          >
            {paidCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => onSelectTab('balances')}
          className={`btn-tactile min-h-[42px] flex items-center justify-center gap-1.5 px-3 sm:px-4 py-2 text-[11px] font-black uppercase tracking-wider border cursor-pointer ${
            activeTab === 'balances'
              ? 'bg-red-700 text-white border-red-700'
              : 'bg-[#F8F7F4] text-red-700 border-neutral-300 hover:border-red-700'
          }`}
        >
          <Banknote className="w-3.5 h-3.5 shrink-0 hidden xs:inline" />
          <span>Balances</span>
          <span
            className={`font-mono px-1.5 py-0.5 text-[10px] font-black ${
              activeTab === 'balances' ? 'bg-white text-red-700' : 'bg-red-100 text-red-800'
            }`}
          >
            {balanceCount}
          </span>
        </button>
      </div>

      {/* Search Input */}
      <div className="relative w-full lg:w-80">
        <Search className="w-4 h-4 absolute left-3.5 top-3.5 text-neutral-500" />
        <input
          type="search"
          placeholder="Search Job № 00001, Name, School..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full min-h-[42px] text-xs sm:text-sm pl-10 pr-4 py-2 border border-neutral-400 focus:border-[#0A0A0A] bg-[#F8F7F4] focus:bg-white font-semibold"
        />
      </div>
    </div>
  );
};
