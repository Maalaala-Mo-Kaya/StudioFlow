import { CreditCard, Banknote, Printer, PackageCheck } from 'lucide-react';
import type { Registration } from '../../../types';
import { RegistrationStatusBadge } from '../../../components/RegistrationStatusBadge';
import {
  formatClientName,
  formatCurrency,
  formatJobOrderNo,
  formatQueueNumber,
} from '../../../utils/formatters';
import { DataTable } from '../../../components/common/DataTable';
import type { DataTableColumn } from '../../../components/common/DataTable';
import { CashierMobileCard } from './CashierMobileCard';

interface CashierTableProps {
  registrations: Registration[];
  loading: boolean;
  filtered: boolean;
  onOpenPayment: (reg: Registration) => void;
  onOpenPrint: (reg: Registration) => void;
  onOpenRelease: (reg: Registration) => void;
}

export function CashierTable({
  registrations, loading, filtered, onOpenPayment, onOpenPrint, onOpenRelease,
}: CashierTableProps) {
  const columns: DataTableColumn<Registration>[] = [
    {
      id: 'job', header: 'Queue & Job №', sortable: true, accessor: (reg) => reg.job_order_no,
      cell: (reg) => (
        <div className="flex items-center gap-2">
          <span className="font-mono font-black text-[#C9A227] bg-[#0A0A0A] px-2 py-0.5 text-xs">
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
      cell: formatClientName,
      cellClassName: 'font-black uppercase text-sm',
    },
    {
      id: 'school', header: 'School & Course', sortable: true, accessor: (reg) => `${reg.expand?.organization?.name || ''} ${reg.expand?.course?.code || ''}`,
      cell: (reg) => (
        <>
          <div className="font-bold text-[#0A0A0A]">
            {reg.expand?.organization?.name || 'School N/A'}
          </div>
          <div className="text-[11px] text-neutral-500 font-medium">
            {reg.expand?.course?.code || reg.course || 'Gen Program'}{' '}
            {reg.section ? `• Sec ${reg.section}` : ''}
          </div>
        </>
      ),
    },
    {
      id: 'package', header: 'Package', sortable: true, accessor: (reg) => reg.expand?.package?.code,
      cell: (reg) => (
        <span className="font-mono font-black text-xs bg-[#F7F2E0] border border-[#0A0A0A] text-[#0A0A0A] px-2 py-0.5">
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
      id: 'actions', header: 'Actions', align: 'right',
      cell: (reg) => (
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
      ),
    },
  ];

  return (
    <DataTable
      label="Cashier & Receipt Desk"
      rows={registrations}
      columns={columns}
      getRowId={(reg) => reg.id}
      defaultSort={{ column: 'job', direction: 'ascending' }}
      loading={loading}
      loadingMessage="Loading cashier ledger…"
      filtered={filtered}
      emptyMessage="No cashier records available."
      filteredEmptyMessage="No records matching current filter."
      className="animate-enter-delay-1 md:h-[660px]"
      viewportClassName="flex-1"
      headerClassName="font-mono uppercase tracking-wider"
      rowClassName={() => 'hover:bg-[#F7F2E0]/50 transition'}
      renderCompactRow={(reg) => (
        <CashierMobileCard registration={reg} onOpenPayment={onOpenPayment}
          onOpenPrint={onOpenPrint} onOpenRelease={onOpenRelease} />
      )}
    />
  );
}
