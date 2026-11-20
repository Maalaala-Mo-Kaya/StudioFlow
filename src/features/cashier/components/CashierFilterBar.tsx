import React from 'react';
import { Clock, CheckCircle2, Banknote, PackageCheck } from 'lucide-react';
import type { CashierTab } from '../useCashierState';
import type { Registration } from '../../../types';
import { ClientGroupFilter } from '../../../components/common/ClientGroupFilter';
import { StudentDirectoryFilters } from '../../admin/components/StudentDirectoryFilters';
import {
  cashierColumns, cashierFilterSections, type CashierColumnId, type CashierFilterKey, type CashierFilters,
} from '../cashierFilters';

interface CashierFilterBarProps {
  activeTab: CashierTab;
  onSelectTab: (tab: CashierTab) => void;
  pendingCount: number;
  paidCount: number;
  balanceCount: number;
  readyCount: number;
  /** All orders, for the school / walk-in picker and its counts. */
  registrations: Registration[];
  clientGroup: string;
  onClientGroupChange: (group: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  filters: CashierFilters;
  filterOptions: Record<CashierFilterKey, { id: string; label: string }[]>;
  onToggleFilter: (key: CashierFilterKey, id: string) => void;
  onClearFilters: () => void;
  visibleColumns: CashierColumnId[];
  onToggleColumn: (id: CashierColumnId) => void;
  onResetColumns: () => void;
}

const tabs: Array<{
  id: CashierTab; label: string; icon: typeof Clock; active: string; idle: string; badgeActive: string; badgeIdle: string;
}> = [
  { id: 'pending', label: 'Pending', icon: Clock, active: 'bg-obsidian text-gold border-line', idle: 'bg-canvas text-neutral-700 border-neutral-300 hover:border-line', badgeActive: 'bg-gold text-on-gold', badgeIdle: 'bg-neutral-200 text-ink' },
  { id: 'paid', label: 'Paid', icon: CheckCircle2, active: 'bg-obsidian text-gold border-line', idle: 'bg-canvas text-neutral-700 border-neutral-300 hover:border-line', badgeActive: 'bg-gold text-on-gold', badgeIdle: 'bg-neutral-200 text-ink' },
  { id: 'balances', label: 'Balances', icon: Banknote, active: 'bg-red-700 text-white border-red-700', idle: 'bg-canvas text-red-700 border-neutral-300 hover:border-red-700', badgeActive: 'bg-panel text-red-700', badgeIdle: 'bg-red-100 text-red-800' },
  // Orders ready for the client to claim.
  { id: 'ready', label: 'Ready for Pickup', icon: PackageCheck, active: 'bg-emerald-700 text-white border-emerald-700', idle: 'bg-canvas text-emerald-700 border-neutral-300 hover:border-emerald-700', badgeActive: 'bg-panel text-emerald-700', badgeIdle: 'bg-emerald-100 text-emerald-800' },
];

/**
 * Cashier tabs plus the same filter row as Admin → Clients Directory:
 * Advanced Filters (funnel), a type-to-search school / walk-in picker, and the search box.
 */
export const CashierFilterBar: React.FC<CashierFilterBarProps> = ({
  activeTab, onSelectTab, pendingCount, paidCount, balanceCount, readyCount,
  registrations, clientGroup, onClientGroupChange, searchQuery, onSearchChange,
  filters, filterOptions, onToggleFilter, onClearFilters, visibleColumns, onToggleColumn, onResetColumns,
}) => {
  const counts: Record<CashierTab, number> = { pending: pendingCount, paid: paidCount, balances: balanceCount, ready: readyCount };
  return (
    // relative z-20: the open filter lists must sit above the table, which also animates in.
    <div className="animate-enter-delay-1 relative z-20 space-y-3 bg-panel p-3 border-2 border-line mb-6">
      <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-1.5">
        {tabs.map(({ id, label, icon: Icon, active, idle, badgeActive, badgeIdle }) => (
          <button
            key={id}
            type="button"
            onClick={() => onSelectTab(id)}
            aria-pressed={activeTab === id}
            className={`btn-tactile min-h-[42px] flex items-center justify-center gap-1.5 px-3 sm:px-4 py-2 text-[11px] font-black uppercase tracking-wider border cursor-pointer ${activeTab === id ? active : idle}`}
          >
            <Icon className="w-3.5 h-3.5 shrink-0 hidden xs:inline" />
            <span>{label}</span>
            <span className={`font-mono px-1.5 py-0.5 text-[10px] font-black ${activeTab === id ? badgeActive : badgeIdle}`}>
              {counts[id]}
            </span>
          </button>
        ))}
      </div>

      <div className="font-mono text-xs">
      <StudentDirectoryFilters
        bare
        query={searchQuery}
        onQueryChange={onSearchChange}
        searchPlaceholder="Search name, job number, registration or student ID…"
        searchLabel="Search job orders"
        quickFilter={(
          <div className="w-full sm:w-72 shrink-0">
            <ClientGroupFilter id="cashier-client-group" value={clientGroup} onChange={onClientGroupChange} registrations={registrations} />
          </div>
        )}
        sections={cashierFilterSections}
        filters={filters}
        options={filterOptions}
        onToggleFilter={onToggleFilter}
        onClearFilters={onClearFilters}
        columns={cashierColumns}
        visibleColumns={visibleColumns}
        onToggleColumn={onToggleColumn}
        onResetColumns={onResetColumns}
      />
      </div>
    </div>
  );
};
