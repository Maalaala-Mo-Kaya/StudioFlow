import { CreditCard, Banknote, Printer, PackageCheck, MessageSquare } from 'lucide-react';
import { PickupNoticeInfo } from './PickupNoticeInfo';
import type { Registration } from '../../../types';
import { RegistrationStatusBadge } from '../../../components/RegistrationStatusBadge';
import { isReadyForRelease, releaseBlocker } from '../../../utils/releaseReadiness';
import {
  formatClientName,
  formatCurrency,
  formatJobOrderNo,
  formatQueueNumber,
} from '../../../utils/formatters';
import { DataTable } from '../../../components/common/DataTable';
import type { DataTableColumn } from '../../../components/common/DataTable';
import { CashierMobileCard } from './CashierMobileCard';
import { clientDetail, clientGroup, clientSummary } from '../../../utils/clientInfo';

interface CashierTableProps {
  registrations: Registration[];
  loading: boolean;
  filtered: boolean;
  onOpenPayment: (reg: Registration) => void;
  onOpenPrint: (reg: Registration) => void;
  onOpenRelease: (reg: Registration) => void;
  /** Ready for Pickup tab: shows when each order became ready and whether the client was told. */
  pickupMode?: boolean;
  onOpenNotify?: (reg: Registration) => void;
  /** Columns chosen under Advanced Filters → Show Columns (Actions always shows). */
  visibleColumns?: readonly string[];
}

export function CashierTable({
  registrations, loading, filtered, onOpenPayment, onOpenPrint, onOpenRelease, pickupMode = false, onOpenNotify, visibleColumns,
}: CashierTableProps) {
  const columns: DataTableColumn<Registration>[] = [
    {
      id: 'job', header: 'Queue & Job №', sortable: true, accessor: (reg) => reg.job_order_no,
      cell: (reg) => (
        <div className="flex items-center gap-2">
          <span className="font-mono font-black text-gold bg-obsidian px-2 py-0.5 text-xs">
            {formatQueueNumber(reg.queue_number)}
          </span>
          <span className="font-mono font-black text-red-600 text-sm">
            {formatJobOrderNo(reg.job_order_no)}
          </span>
        </div>
      ),
    },
    {
      id: 'name', header: 'Client Name', sortable: true,
      accessor: (reg) => `${reg.family_name} ${reg.given_name}`,
      cell: (reg) => <>{formatClientName(reg)}
        {!reg.job_order_no && <span className="mt-0.5 block break-all font-mono text-[10px] normal-case text-neutral-500">Ref {reg.id}</span>}
      </>,
      cellClassName: 'font-black uppercase text-sm',
    },
    {
      id: 'school', header: 'School / Session', sortable: true, accessor: (reg) => clientSummary(reg, true),
      cell: (reg) => (
        <>
          <div className="font-bold text-ink">
            {clientGroup(reg, true) || 'School N/A'}
          </div>
          <div className="text-[11px] text-neutral-500 font-medium">
            {clientDetail(reg) || 'Gen Program'}{' '}
            {reg.section ? `• Sec ${reg.section}` : ''}
          </div>
        </>
      ),
    },
    {
      id: 'package', header: 'Package', sortable: true, accessor: (reg) => reg.expand?.package?.code,
      cell: (reg) => (
        <span className="font-mono font-black text-xs bg-gold-wash border border-line text-ink px-2 py-0.5">
          {reg.expand?.package?.code || 'PKG'}
        </span>
      ),
    },
    {
      id: 'total', header: 'Total', sortable: true, accessor: (reg) => reg.total_amount,
      cellClassName: 'font-mono font-black text-sm',
      cell: (reg) => formatCurrency(reg.total_amount),
    },
    {
      id: 'balance', header: 'Paid / Balance', sortable: true, accessor: (reg) => reg.balance,
      cellClassName: 'font-mono',
      cell: (reg) => (
        <>
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
          {/* paid_amount is net of refunds: say when money was given back, so ₱0 paid isn't mistaken for "never paid". */}
          {(reg.refunded_amount ?? 0) > 0 && (
            <div className="text-neutral-600 font-bold text-[10px]" title="Money given back to the client (recorded by an admin)">
              Refunded {formatCurrency(reg.refunded_amount ?? 0)}
            </div>
          )}
        </>
      ),
    },
    {
      id: 'status', header: 'Status', sortable: true, accessor: (reg) => reg.status,
      cell: (reg) => (
        <RegistrationStatusBadge status={reg.status} />
      ),
    },
    {
      id: 'pickup', header: 'Pickup Notice', sortable: true, visible: pickupMode,
      accessor: (reg) => reg.ready_at ?? '',
      cell: (reg) => <PickupNoticeInfo reg={reg} />,
    },
    {
      id: 'actions', header: 'Actions', align: 'right',
      cell: (reg) => (
        <div className="flex items-center justify-end gap-2">
          {pickupMode && onOpenNotify && (
            <button
              type="button"
              onClick={() => onOpenNotify(reg)}
              title="Text the client that the order is ready"
              className="btn-tactile min-h-[36px] px-3 py-1.5 bg-gold text-on-gold border border-line font-black text-[11px] uppercase tracking-wider flex items-center gap-1.5 cursor-pointer"
            >
              <MessageSquare className="w-3.5 h-3.5" /> Notify
            </button>
          )}
          {reg.status === 'pending_payment' ? (
            <button
              type="button"
              onClick={() => onOpenPayment(reg)}
              className="btn-tactile min-h-[36px] flex items-center gap-1.5 px-3.5 py-1.5 bg-gold text-on-gold border border-line font-black text-[11px] uppercase tracking-wider cursor-pointer"
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

          {reg.job_order_no && <button
            type="button"
            onClick={() => onOpenPrint(reg)}
            title="Print Yellow Form / Receipt"
            className="btn-tactile min-h-[36px] px-3 py-1.5 bg-obsidian text-gold hover:bg-neutral-800 font-bold text-[11px] uppercase tracking-wider flex items-center gap-1.5 cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" /> Print
          </button>}

          {reg.status !== 'pending_payment' && reg.status !== 'released' && reg.status !== 'cancelled' && (
            <button
              type="button"
              onClick={() => onOpenRelease(reg)}
              title={reg.balance > 0 ? 'Release blocked (Has balance)'
                : releaseBlocker(reg) ?? 'Release package to client'}
              className={`btn-tactile min-h-[36px] px-2.5 py-1.5 font-bold text-[11px] uppercase tracking-wider flex items-center gap-1.5 border cursor-pointer ${
                reg.balance > 0 || !isReadyForRelease(reg)
                  ? 'bg-neutral-100 text-neutral-500 border-neutral-300 hover:border-gold'
                  : 'bg-emerald-600 text-white border-emerald-500 hover:bg-emerald-500'
              }`}
            >
              <PackageCheck className="w-3.5 h-3.5" /> Release
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <DataTable
      key={pickupMode ? 'pickup' : 'all'}
      label={pickupMode ? 'Ready for Pickup' : 'Cashier & Receipt Desk'}
      rows={registrations}
      columns={columns}
      visibleColumnIds={visibleColumns ? [...visibleColumns, 'actions'] : undefined}
      getRowId={(reg) => reg.id}
      // Pickup list: longest-waiting orders first.
      defaultSort={pickupMode ? { column: 'pickup', direction: 'ascending' } : { column: 'job', direction: 'ascending' }}
      loading={loading}
      loadingMessage="Loading cashier ledger…"
      filtered={filtered}
      emptyMessage={pickupMode ? 'No orders are waiting for pickup.' : 'No cashier records available.'}
      filteredEmptyMessage="No records matching current filter."
      className="animate-enter-delay-1 md:h-[660px]"
      viewportClassName="flex-1"
      headerClassName="font-mono uppercase tracking-wider"
      rowClassName={() => 'hover:bg-gold-wash/50 transition'}
      renderCompactRow={(reg) => (
        <CashierMobileCard registration={reg} onOpenPayment={onOpenPayment}
          onOpenPrint={onOpenPrint} onOpenRelease={onOpenRelease}
          onOpenNotify={pickupMode ? onOpenNotify : undefined} />
      )}
    />
  );
}
