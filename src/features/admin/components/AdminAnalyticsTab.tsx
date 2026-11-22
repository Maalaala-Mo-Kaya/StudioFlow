import React, { useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  PhilippinePeso,
  Users,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  ShieldCheck,
  Building,
  Package as PackageIcon,
  Printer,
  Ban,
  Undo2,
  BookOpenCheck,
  ArrowRight,
  X,
  TriangleAlert,
} from 'lucide-react';
import type { AddOn, Organization, Registration, Package, PaymentRecord, RefundRecord } from '../../../types';
import type { RefundRequest } from '../useAdminData';
import { RefundModal, VoidPaymentModal } from './LedgerActionModals';
import { PrintRefundSlipModal } from './PrintRefundSlipModal';
import { formatCurrency, formatClientName } from '../../../utils/formatters';
import { PrintReceiptModal } from '../../cashier/components/PrintReceiptModal';
import { DataTable, tableFilterControl } from '../../../components/common/DataTable';
import type { DataTableColumn } from '../../../components/common/DataTable';
import { MuaPerformancePanel } from './MuaPerformancePanel';
import { clientGroup, clientSummary } from '../../../utils/clientInfo';
import { overviewMetrics, type OverviewMetrics } from '../overviewMetrics';
import { buildAudit, isCountedPayment, type AuditGroup } from '../auditData';
import { RegistrationDeletionHistory } from './RegistrationDeletionHistory';
import { allocateRevenue, discountCents, discountRate, revenuePesos, revenueTerms } from '../../../utils/revenue';
import { studioDayStartUtc, studioMonthStartUtc } from '../../../utils/studioDay';

const transactionDate = new Intl.DateTimeFormat('en-PH', {
  timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short',
});
const collectionModeLabels: Record<PaymentRecord['payment_type'], string> = {
  initial: '50% Downpayment', full: 'Full Settlement', additional: 'Additional Payment',
  balance_settlement: 'Full Settlement',
};

type Period = 'today' | 'month' | 'all';
const PERIOD_LABELS: Record<Period, string> = { today: 'Today', month: 'This Month', all: 'All Time' };

interface AdminAnalyticsTabProps {
  /** Analytics & Overview, or its Settlement & Ledger sub-tab. */
  view?: 'overview' | 'ledger';
  /** Opens the Settlement & Ledger sub-tab (from the overview). */
  onOpenLedger?: () => void;
  /** All-time figures. */
  metrics: OverviewMetrics;
  organizations: Organization[];
  registrations: Registration[];
  packages: Package[];
  /** For the "revenue type missing" warning. */
  addOns?: AddOn[];
  /** Opens Packages & Add-ons, where a missing revenue type is chosen. */
  onOpenCatalog?: () => void;
  /** Opens Students, where an order's revenue review is set. */
  onOpenStudents?: () => void;
  payments: PaymentRecord[];
  refunds: RefundRecord[];
  onVoidPayment: (paymentId: string, reason: string) => Promise<void>;
  onRefund: (refund: RefundRequest) => Promise<RefundRecord>;
}

export const AdminAnalyticsTab: React.FC<AdminAnalyticsTabProps> = ({
  view = 'overview',
  onOpenLedger,
  metrics,
  organizations,
  registrations,
  packages,
  addOns = [],
  onOpenCatalog,
  onOpenStudents,
  payments,
  refunds,
  onVoidPayment,
  onRefund,
}) => {
  // Cards: today / this month / all time. The ledger check below always uses all-time totals,
  // because payments in a period can belong to job orders from earlier periods.
  const [period, setPeriod] = useState<Period>('all');
  const since = period === 'today' ? studioDayStartUtc() : period === 'month' ? studioMonthStartUtc() : undefined;
  const shown = period === 'all' ? metrics : overviewMetrics(registrations, payments, refunds, since);
  const periodWords = { today: 'today', month: 'this month', all: 'to date' }[period];
  const periodNote = period === 'all'
    ? 'Everything since the system started.'
    : `${period === 'today' ? 'Since midnight' : 'Since the 1st of the month'} (Philippine time). Payments count by the day they were received, job orders by the day they were made.`;
  const [filterSchool, setFilterSchool] = useState<string>('all');
  const [filterPaymentStatus, setFilterPaymentStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [receiptTarget, setReceiptTarget] = useState<{ registration: Registration; paymentId: string } | null>(null);
  const [voidTarget, setVoidTarget] = useState<{ registration: Registration; payment: PaymentRecord } | null>(null);
  const [refundTarget, setRefundTarget] = useState<{ registration: Registration; refundable: number } | null>(null);
  const [slipTarget, setSlipTarget] = useState<{ registration: Registration; refund: RefundRecord; justRecorded?: boolean } | null>(null);
  // The ledger account open in the popup (by id, so it shows the latest payments and refunds).
  const [openAccountId, setOpenAccountId] = useState<string | null>(null);
  const actionOpen = Boolean(receiptTarget || voidTarget || refundTarget || slipTarget);
  useEffect(() => {
    if (!openAccountId) return;
    // Escape closes the account popup, unless a receipt / void / refund popup is open on top of it.
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !actionOpen) setOpenAccountId(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openAccountId, actionOpen]);
  const refundsByRegistration = useMemo(() => {
    const grouped = new Map<string, RefundRecord[]>();
    for (const refund of refunds) grouped.set(refund.registration, [...(grouped.get(refund.registration) ?? []), refund]);
    return grouped;
  }, [refunds]);

  const paymentsByRegistration = useMemo(() => {
    const grouped = new Map<string, PaymentRecord[]>();
    for (const payment of payments) {
      const records = grouped.get(payment.registration) ?? [];
      records.push(payment);
      grouped.set(payment.registration, records);
    }
    for (const records of grouped.values()) {
      records.sort((a, b) => Date.parse(a.created.replace(' ', 'T')) - Date.parse(b.created.replace(' ', 'T')) || a.id.localeCompare(b.id));
    }
    return grouped;
  }, [payments]);
  const ledgerRows = useMemo(() => registrations.map((registration) => {
    const transactions = paymentsByRegistration.get(registration.id) ?? [];
    const orderRefunds = refundsByRegistration.get(registration.id) ?? [];
    const cents = (value: number) => Math.round(value * 100);
    const paid = transactions.reduce((sum, payment) => (isCountedPayment(payment) ? sum + cents(payment.amount) : sum), 0);
    const refunded = orderRefunds.reduce((sum, refund) => sum + cents(refund.amount), 0);
    const net = paid - refunded;
    const total = cents(registration.total_amount || 0);
    const cancelled = registration.status === 'cancelled';
    const granted = discountCents(registration);
    const credit = cancelled ? 0 : Math.min(granted, Math.max(0, total + granted - net));
    const overpaid = cancelled ? 0 : Math.max(0, net - total);
    return {
      registration,
      transactions,
      orderRefunds,
      cancelled,
      collected: (net + credit) / 100,
      credit: credit / 100,
      netPayments: net / 100,
      revenue: revenuePesos(allocateRevenue(net, revenueTerms(registration))),
      refunded: refunded / 100,
      balance: cancelled ? 0 : Math.max(0, total - net) / 100,
      overpaid: overpaid / 100,
      // Most that can be refunded now: everything held on a cancelled order, the overpayment otherwise.
      refundable: (cancelled ? Math.max(0, net) : overpaid) / 100,
    };
  }), [registrations, paymentsByRegistration, refundsByRegistration]);

  // Same rules as the cards and the Audit Export (auditData.ts), for the chosen period.
  const audit = useMemo(
    () => buildAudit(registrations, payments, refunds, since, { organizations, packages }),
    [registrations, payments, refunds, since, organizations, packages],
  );
  const isReconciled = audit.ordersBalanced && audit.paymentsBalanced;
  // School and package groups report Studio activity only.
  const hasActivity = (group: AuditGroup) => Boolean(group.count || group.billed || group.collected || group.balance || group.held);
  // Revenue types that were never chosen: their sales can't be counted as Studio or MUA.
  const untypedCatalog = [
    ...packages.filter((pkg) => !pkg.revenue_category).map((pkg) => `${pkg.name} (package)`),
    ...addOns.filter((add) => !add.revenue_category && !add.catalog_item).map((add) => `${add.name} (add-on)`),
  ];
  const untypedOrders = registrations
    .filter((reg) => reg.status !== 'cancelled' && revenueTerms(reg).unallocated > 0)
    .map((reg) => reg.job_order_no || reg.id);
  const list = (names: string[], max: number) => names.slice(0, max).join(', ') + (names.length > max ? ` and ${names.length - max} more` : '');
  const activeSchools = audit.bySchool.filter(hasActivity);
  const hiddenSchools = audit.bySchool.length - activeSchools.length;
  const activePackages = audit.byPackage.filter(hasActivity);
  const [exportingAudit, setExportingAudit] = useState(false);
  const exportAudit = async () => {
    if (exportingAudit) return;
    setExportingAudit(true);
    try {
      const { downloadAuditWorkbook } = await import('../auditWorkbook');
      await downloadAuditWorkbook(audit, { label: PERIOD_LABELS[period], since });
    } catch (err) {
      console.error('Audit export failed:', err);
      window.alert('Could not create the audit report. Please try again.');
    } finally {
      setExportingAudit(false);
    }
  };

  // Filtered Financial Ledger
  const filteredLedger = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return ledgerRows.filter(({ registration: r, collected, balance, overpaid, cancelled }) => {
      if (filterSchool !== 'all' && r.organization !== filterSchool) return false;
      if (filterPaymentStatus !== 'all') {
        if (filterPaymentStatus === 'fully_paid' && balance > 0) return false;
        if (filterPaymentStatus === 'unpaid' && collected > 0) return false;
        if (filterPaymentStatus === 'has_balance' && balance <= 0) return false;
        if (filterPaymentStatus === 'refund_due' && overpaid <= 0) return false;
        if (filterPaymentStatus === 'cancelled' && !cancelled) return false;
      }
      if (q) {
        const fullName = `${r.given_name} ${r.family_name}`.toLowerCase();
        const jo = (r.job_order_no || '').toLowerCase();
        const schoolName = clientSummary(r, true).toLowerCase();
        if (!fullName.includes(q) && !jo.includes(q) && !schoolName.includes(q)) return false;
      }
      return true;
    });
  }, [ledgerRows, filterSchool, filterPaymentStatus, searchQuery]);

  type LedgerRow = typeof ledgerRows[number];
  // Settlement label for a job order; cancelled and overpaid orders are called out.
  const settlementOf = ({ cancelled, balance, collected, overpaid }: LedgerRow) => {
    if (cancelled) return { rank: 4, label: collected > 0 ? `Cancelled · ${formatCurrency(collected, { exact: true })} held` : 'Cancelled', tone: 'bg-neutral-200 text-neutral-700' };
    if (overpaid > 0) return { rank: 3, label: `Refund due ${formatCurrency(overpaid, { exact: true })}`, tone: 'border border-red-400 bg-red-100 text-red-800' };
    if (balance <= 0) return { rank: 2, label: 'Fully paid', tone: 'border border-emerald-400 bg-emerald-100 text-emerald-800' };
    if (collected > 0) return { rank: 1, label: 'Partial', tone: 'border border-amber-400 bg-amber-100 text-amber-800' };
    return { rank: 0, label: 'Unpaid', tone: 'bg-neutral-200 text-neutral-700' };
  };
  const ledgerColumns: DataTableColumn<LedgerRow>[] = [
    { id: 'job', header: 'JO №', sortable: true, accessor: ({ registration }) => registration.job_order_no, cellClassName: 'font-black text-red-600' },
    { id: 'name', header: 'Client Name', sortable: true, accessor: ({ registration }) => `${registration.family_name} ${registration.given_name}`,
      cell: ({ registration }) => formatClientName(registration), cellClassName: 'font-bold uppercase' },
    { id: 'school', header: 'School / Client', sortable: true, accessor: ({ registration }) => clientGroup(registration),
      cell: ({ registration }) => clientGroup(registration) || 'ORG', cellClassName: 'text-neutral-600' },
    { id: 'package', header: 'Package', sortable: true, accessor: ({ registration }) => registration.package_snapshot?.code || registration.expand?.package?.code,
      cell: ({ registration }) => registration.package_snapshot?.code || registration.expand?.package?.code || 'PKG' },
    { id: 'billed', header: 'Original billed', sortable: true, accessor: ({ registration }) => registration.total_amount + discountCents(registration) / 100, align: 'right',
      cell: ({ registration }) => formatCurrency(registration.total_amount + discountCents(registration) / 100), cellClassName: 'font-bold' },
    // The order's discount, with its rate and reason, so it is visible without opening the cashier.
    { id: 'discount', header: 'Discount', sortable: true, accessor: ({ registration, cancelled }) => (cancelled ? 0 : discountCents(registration)), align: 'right',
      cell: ({ registration, cancelled }) => {
        const amount = cancelled ? 0 : discountCents(registration) / 100;
        if (!amount) return <span className="text-neutral-400">—</span>;
        const d = registration.revenue_discount;
        return (
          <>
            <div className="text-amber-700">−{formatCurrency(amount, { exact: true })}</div>
            <div className="text-[9px] font-normal text-neutral-500 whitespace-normal max-w-40">
              {discountRate(d, registration.total_amount)}{d?.reason ? ` · ${d.reason}` : ''}
            </div>
          </>
        );
      }, cellClassName: 'font-bold' },
    { id: 'collected', header: 'Collected (payments + credits)', sortable: true, accessor: ({ collected }) => collected, align: 'right',
      cell: ({ collected, refunded, credit, netPayments }) => (
        <>
          <div>{formatCurrency(collected)}</div>
          {credit > 0 && <div className="text-[9px] font-normal text-neutral-500">{formatCurrency(netPayments)} net payments + {formatCurrency(credit)} credit</div>}
          {refunded > 0 && <div className="text-[9px] font-normal text-neutral-500">after {formatCurrency(refunded, { exact: true })} refunded</div>}
        </>
      ), cellClassName: 'font-bold text-emerald-700' },
    { id: 'studio', header: 'Studio revenue', sortable: true, accessor: ({ revenue }) => revenue.studio, align: 'right',
      cell: ({ revenue }) => formatCurrency(revenue.studio, { exact: true }) },
    { id: 'mua', header: 'Other Payment — MUA', sortable: true, accessor: ({ revenue }) => revenue.mua, align: 'right',
      cell: ({ revenue }) => formatCurrency(revenue.mua, { exact: true }) },
    { id: 'unallocated', header: 'Unallocated cash', sortable: true, accessor: ({ revenue }) => revenue.unallocated, align: 'right',
      cell: ({ revenue }) => formatCurrency(revenue.unallocated, { exact: true }) },
    { id: 'balance', header: 'Balance', sortable: true, accessor: ({ balance }) => balance, align: 'right', cellClassName: 'font-black',
      cell: ({ balance }) => balance > 0 ? <span className="text-red-600">{formatCurrency(balance)}</span> : <span className="text-emerald-700">₱0.00</span> },
    { id: 'status', header: 'Settlement Status', sortable: true, align: 'center',
      accessor: (row) => settlementOf(row).rank,
      cell: (row) => {
        const { label, tone } = settlementOf(row);
        return <span className={`whitespace-nowrap px-2 py-0.5 text-[9px] font-black uppercase ${tone}`}>{label}</span>;
      },
    },
  ];

  function renderHistory(row: LedgerRow) {
    const { registration, transactions, orderRefunds, refundable, cancelled } = row;
    const released = registration.status === 'released';
    let runningTotal = 0;
    // Balances follow transaction chronology even when the display is sorted by another column.
    const history = transactions.map((payment) => {
      if (isCountedPayment(payment)) runningTotal += payment.amount;
      return { payment, runningTotal, remaining: Math.max(0, registration.total_amount - runningTotal) };
    });
    const columns: DataTableColumn<typeof history[number]>[] = [
      { id: 'date', header: 'Date & Time', sortable: true, accessor: ({ payment }) => new Date(payment.created.replace(' ', 'T')),
        cell: ({ payment }) => {
          const date = new Date(payment.created.replace(' ', 'T'));
          return Number.isFinite(date.getTime()) ? transactionDate.format(date) : '—';
        } },
      { id: 'receipt', header: 'Receipt №', sortable: true, accessor: ({ payment }) => payment.receipt_no || payment.id, cellClassName: 'font-bold' },
      { id: 'mode', header: 'Collection Mode', sortable: true, accessor: ({ payment }) => collectionModeLabels[payment.payment_type] || payment.payment_type },
      { id: 'method', header: 'Payment Method', sortable: true, accessor: ({ payment }) => payment.payment_method, cellClassName: 'uppercase' },
      { id: 'amount', header: 'Amount Paid', sortable: true, accessor: ({ payment }) => payment.amount, align: 'right', cellClassName: 'font-bold',
        cell: ({ payment }) => formatCurrency(payment.amount, { exact: true }) },
      { id: 'running', header: 'Running Total', sortable: true, accessor: ({ runningTotal }) => runningTotal, align: 'right',
        cell: ({ runningTotal }) => formatCurrency(runningTotal, { exact: true }) },
      { id: 'remaining', header: 'Remaining Balance', sortable: true, accessor: ({ remaining }) => remaining, align: 'right',
        cell: ({ remaining }) => formatCurrency(remaining, { exact: true }) },
      { id: 'cashier', header: 'Cashier', sortable: true, accessor: ({ payment }) => payment.cashier_name },
      { id: 'remarks', header: 'Reference / Remarks', sortable: true, accessor: ({ payment }) => payment.remarks, cellClassName: 'max-w-52 whitespace-normal' },
      { id: 'status', header: 'Status', sortable: true, accessor: ({ payment }) => payment.status || 'completed', cellClassName: 'font-bold uppercase',
        cell: ({ payment }) => (
          <div className="whitespace-normal max-w-56">
            <span className={payment.status === 'voided' ? 'text-red-600' : ''}>{payment.status || 'completed'}</span>
            {payment.status === 'voided' && (
              <div className="text-[9px] normal-case font-normal text-neutral-600">
                {payment.voided_at ? transactionDate.format(new Date(payment.voided_at.replace(' ', 'T'))) : ''}
                {payment.voided_by ? ` by ${payment.voided_by}` : ''}{payment.void_reason ? `: ${payment.void_reason}` : ''}
              </div>
            )}
            {payment.status === 'refunded' && <div className="text-[9px] normal-case font-normal text-neutral-600">old method</div>}
          </div>
        ) },
      { id: 'actions', header: 'Actions', cell: ({ payment }) => (
        <div className="flex gap-1">
          <button type="button" onClick={() => setReceiptTarget({ registration, paymentId: payment.id })}
            className="inline-flex items-center gap-1 border border-line bg-gold px-2 py-1 font-black uppercase cursor-pointer">
            <Printer className="size-3" /> Reprint
          </button>
          {(payment.status || 'completed') === 'completed' && !released && (
            <button type="button" onClick={() => setVoidTarget({ registration, payment })}
              title="Void a payment recorded by mistake"
              className="inline-flex items-center gap-1 border border-red-600 text-red-700 bg-panel px-2 py-1 font-black uppercase cursor-pointer">
              <Ban className="size-3" /> Void
            </button>
          )}
        </div>
      ) },
    ];
    const refundColumns: DataTableColumn<RefundRecord>[] = [
      { id: 'date', header: 'Date & Time', cell: (refund) => transactionDate.format(new Date(refund.created.replace(' ', 'T'))) },
      { id: 'number', header: 'Refund №', accessor: (refund) => refund.refund_no, cellClassName: 'font-bold' },
      { id: 'method', header: 'Method', accessor: (refund) => refund.method, cellClassName: 'uppercase' },
      { id: 'amount', header: 'Amount', align: 'right', cellClassName: 'font-bold text-red-700',
        cell: (refund) => '−' + formatCurrency(refund.amount, { exact: true }) },
      { id: 'staff', header: 'Given by', accessor: (refund) => refund.refunded_by },
      { id: 'reason', header: 'Reason', accessor: (refund) => refund.reason, cellClassName: 'max-w-52 whitespace-normal' },
      { id: 'slip', header: 'Slip', cell: (refund) => <>
        <button type="button" onClick={() => setSlipTarget({ registration, refund })}
          title={refund.signature ? 'Reprint the signed refund slip' : 'Have the client sign on screen, then print the refund slip'}
          className="inline-flex items-center gap-1 border border-line bg-gold px-2 py-1 font-black uppercase cursor-pointer">
          <Printer className="size-3" /> {refund.signature ? 'Print Slip' : 'Sign / Print'}
        </button>
        {refund.signature && <span className="ml-1 text-[9px] font-bold uppercase text-emerald-700">✓ Signed</span>}
      </> },
    ];
    return (
      <>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <span className="text-[10px] font-black uppercase tracking-wider">Payment Transaction History</span>
          {refundable > 0 && (
            <button type="button" onClick={() => setRefundTarget({ registration, refundable })}
              className="inline-flex items-center gap-1 border border-line bg-obsidian text-gold px-2.5 py-1 text-[10px] font-black uppercase cursor-pointer">
              <Undo2 className="size-3" /> Refund {cancelled ? '(cancelled order)' : '(overpaid)'} · up to {formatCurrency(refundable, { exact: true })}
            </button>
          )}
        </div>
        {cancelled && registration.cancel_reason && (
          <p className="mb-2 text-[10px] text-neutral-600">
            Cancelled {registration.cancelled_at ? transactionDate.format(new Date(registration.cancelled_at.replace(' ', 'T'))) : ''}
            {registration.cancelled_by ? ` by ${registration.cancelled_by}` : ''}: {registration.cancel_reason}
          </p>
        )}
        <DataTable
          label={`Payment history for JO № ${registration.job_order_no}`}
          rows={history}
          columns={columns}
          getRowId={({ payment }) => payment.id}
          defaultSort={{ column: 'date', direction: 'ascending' }}
          pagination={false}
          emptyMessage="No payment transactions recorded."
          className="border! shadow-none!"
          tableClassName="whitespace-nowrap text-[10px]!"
          headerClassName="uppercase"
        />
        {orderRefunds.length > 0 && (
          <div className="mt-3">
            <div className="mb-1 text-[10px] font-black uppercase tracking-wider">Refunds</div>
            <DataTable label={`Refunds for JO № ${registration.job_order_no}`} rows={orderRefunds} columns={refundColumns}
              getRowId={(refund) => refund.id} pagination={false} className="border! shadow-none!"
              tableClassName="whitespace-nowrap text-[10px]!" headerClassName="uppercase" />
          </div>
        )}
      </>
    );
  }

  const openAccount = openAccountId ? ledgerRows.find((row) => row.registration.id === openAccountId) : undefined;
  // Summary figures for the popup: the ledger's own columns, minus the identity ones in its header.
  const summaryColumns = ledgerColumns.filter((c) => !['job', 'name', 'school', 'package'].includes(c.id));

  return (
    <div className="space-y-6 animate-enter">
      {view === 'overview' && (<>
      {/* Period switch for the cards (dates in Philippine time). */}
      <div className="flex flex-wrap items-center gap-3">
        <div role="group" aria-label="Period" className="inline-flex border-2 border-line bg-panel shadow-lux font-mono text-xs font-black uppercase">
          {(Object.keys(PERIOD_LABELS) as Period[]).map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={period === id}
              onClick={() => setPeriod(id)}
              className={`px-4 py-2 cursor-pointer border-r border-line last:border-r-0 ${period === id ? 'bg-obsidian text-gold' : 'text-ink hover:bg-gold-wash'}`}
            >
              {PERIOD_LABELS[id]}
            </button>
          ))}
        </div>
        <span className="font-mono text-[11px] text-neutral-500">{periodNote}</span>
      </div>

      {/* KPI Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        <div className="bg-obsidian text-white border-2 border-line shadow-lux-gold p-5">
          <div className="flex items-center justify-between text-gold mb-2">
            <span className="font-mono text-[10px] font-black uppercase tracking-wider">
              {period === 'today' ? 'Collected Today' : period === 'month' ? 'Collected This Month' : 'Total Collections'}
            </span>
            <PhilippinePeso className="w-4 h-4" />
          </div>
          <div className="font-mono text-2xl sm:text-3xl font-black text-gold">
            {formatCurrency(shown.totalCollections)}
          </div>
          <p className="text-[11px] text-neutral-400 mt-1">
            {formatCurrency(shown.totalReceived - shown.totalRefunds, { exact: true })} net payments + {formatCurrency(shown.totalDiscountCredits, { exact: true })} discount credits
          </p>
        </div>

        <div className="bg-panel border-2 border-line shadow-lux p-5">
          <div className="flex items-center justify-between text-neutral-600 mb-2">
            <span className="font-mono text-[10px] font-black uppercase tracking-wider">
              Gross Invoiced
            </span>
            <Users className="w-4 h-4 text-ink" />
          </div>
          <div className="font-mono text-2xl sm:text-3xl font-black text-ink">
            {formatCurrency(shown.totalGrossInvoiced)}
          </div>
          <p className="text-[11px] text-neutral-500 mt-1">
            Job orders made {periodWords} · {shown.totalRegistrations} client{shown.totalRegistrations === 1 ? '' : 's'}
            {shown.cancelledCount > 0 && ` (${shown.cancelledCount} cancelled not counted)`}
          </p>
        </div>

        <div className="bg-panel border-2 border-line shadow-lux p-5">
          <div className="flex items-center justify-between text-neutral-600 mb-2">
            <span className="font-mono text-[10px] font-black uppercase tracking-wider">
              Outstanding Balances
            </span>
            <AlertCircle className="w-4 h-4 text-red-600" />
          </div>
          <div className="font-mono text-2xl sm:text-3xl font-black text-red-600">
            {formatCurrency(shown.totalOutstandingBalances)}
          </div>
          <p className="text-[11px] text-neutral-500 mt-1">
            {period === 'all' ? 'Still to collect from active orders' : `Still unpaid on the job orders made ${periodWords}`}
            {shown.totalRefundDue > 0 && (
              <span className="block text-red-600 font-bold">Refund due to clients: {formatCurrency(shown.totalRefundDue, { exact: true })} (ledger filter “Refund Due”)</span>
            )}
          </p>
        </div>

        <div className="bg-panel border-2 border-line shadow-lux p-5">
          <div className="flex items-center justify-between text-neutral-600 mb-2">
            <span className="font-mono text-[10px] font-black uppercase tracking-wider">
              Shoots Completed
            </span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="font-mono text-2xl sm:text-3xl font-black text-ink">
            {shown.totalCompleted}
          </div>
          <p className="text-[11px] text-neutral-500 mt-1">
            {period === 'all' ? 'Photographed to date' : `Of the job orders made ${periodWords}`} · {metrics.totalPaidShooting} waiting or on set now
          </p>
        </div>
      </div>

      {(untypedCatalog.length > 0 || untypedOrders.length > 0) && (
        <section role="alert" aria-labelledby="revenue-missing-title"
          // Fixed red / white (not theme tokens): the alert stays red with white text in Night and Day.
          className="border-2 border-[#dc2626] bg-red-50 text-red-900 shadow-[0_0_0_3px_rgba(220,38,38,0.25)]">
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-[#dc2626] text-[#fff]">
            <h3 id="revenue-missing-title" className="flex items-center gap-2 text-sm font-black uppercase tracking-wider m-0">
              <TriangleAlert className="w-5 h-5 shrink-0 motion-safe:animate-pulse" aria-hidden="true" />
              Action required: revenue type missing
            </h3>
            <span className="font-mono text-[10px] font-black uppercase tracking-widest border border-[#fff]/70 px-2 py-0.5">
              Revenue figures are incomplete
            </span>
          </div>
          <ol className="p-4 space-y-3 text-xs">
            {untypedCatalog.length > 0 && (
              <li className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <p className="m-0">
                  <b className="font-black">1. {untypedCatalog.length} catalog item{untypedCatalog.length === 1 ? '' : 's'}</b> {untypedCatalog.length === 1 ? 'has' : 'have'} no Studio / MUA type: {list(untypedCatalog, 5)}.{' '}
                  <b>Every new sale of {untypedCatalog.length === 1 ? 'it' : 'them'} goes uncounted</b> until you choose one.
                </p>
                {onOpenCatalog && (
                  <button type="button" onClick={onOpenCatalog}
                    className="btn-tactile shrink-0 min-h-[40px] px-4 bg-[#dc2626] text-[#fff] border border-[#b91c1c] text-[11px] font-black uppercase tracking-wider cursor-pointer hover:bg-[#b91c1c]">
                    Fix in Packages &amp; Add-ons
                  </button>
                )}
              </li>
            )}
            {untypedOrders.length > 0 && (
              <li className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-red-300 first:pt-0 first:border-t-0">
                <p className="m-0">
                  <b className="font-black">{untypedCatalog.length > 0 ? '2. ' : '1. '}{untypedOrders.length} job order{untypedOrders.length === 1 ? '' : 's'}</b> ({list(untypedOrders, 8)}) {untypedOrders.length === 1 ? 'has' : 'have'} charges with no revenue type.{' '}
                  <b>Part of {untypedOrders.length === 1 ? 'its' : 'their'} payments stays unallocated even when fully paid.</b>{' '}
                  Set the MUA amount in the order&apos;s revenue review (Students → Edit).
                </p>
                {onOpenStudents && (
                  <button type="button" onClick={onOpenStudents}
                    className="btn-tactile shrink-0 min-h-[40px] px-4 bg-[#dc2626] text-[#fff] border border-[#b91c1c] text-[11px] font-black uppercase tracking-wider cursor-pointer hover:bg-[#b91c1c]">
                    Review in Students
                  </button>
                )}
              </li>
            )}
          </ol>
        </section>
      )}

      {/* Accounting Reconciliation Banner */}
      <div className="grid gap-3 sm:grid-cols-3">
        {([
          ['Operational collected', audit.totals.analyticsCollected],
          ['Discount credits', audit.totals.discountCredits],
          ['Studio revenue', audit.totals.revenue.studio],
          ['Other Payment — MUA', audit.totals.revenue.mua],
          ['Unallocated cash', audit.totals.revenue.unallocated],
        ] as const).map(([label, amount]) => <div key={label} className="border-2 border-line bg-panel p-4">
          <p className="text-xs font-black uppercase text-gold-soft">{label}</p>
          <p className="font-mono text-xl font-black">{formatCurrency(amount, { exact: true })}</p>
        </div>)}
        <p className="text-xs text-neutral-600 sm:col-span-3">
          Net of refunds. Mixed partial payments, excess cash, and charges awaiting review stay unallocated. Settlement and refunds can move cash between categories.
        </p>
      </div>
      <div className={`p-3.5 border-2 font-mono text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
        isReconciled
          ? 'bg-emerald-50 border-emerald-600 text-emerald-900'
          : 'bg-red-50 border-red-600 text-red-900'
      }`}>
        <div className="flex items-center gap-2 font-bold">
          <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-700" />
          <span>
            {!isReconciled
              ? `Discrepancy (${PERIOD_LABELS[period]}): the totals do not add up. Export the audit report and check the Summary sheet.`
              : period === 'all'
                ? 'All-time collections and outstanding balances reconcile with the ledger.'
                : `${PERIOD_LABELS[period]} Balanced: Gross (${formatCurrency(audit.totals.gross, { exact: true })}) = Paid (${formatCurrency(audit.totals.paidOnOrders, { exact: true })}) + Balances (${formatCurrency(audit.totals.outstanding, { exact: true })}) · Collections (${formatCurrency(audit.totals.collections, { exact: true })}) include ${formatCurrency(audit.totals.collectionsOnEarlierOrders, { exact: true })} for older job orders`}
          </span>
        </div>
        <button
          type="button"
          onClick={() => void exportAudit()}
          disabled={exportingAudit}
          title={`Printable Excel report for ${PERIOD_LABELS[period]}: summary with checks, every job order and every receipt.`}
          className="btn-tactile shrink-0 px-3 py-1 bg-obsidian text-gold font-black uppercase text-[10px] tracking-wider flex items-center gap-1.5 cursor-pointer disabled:opacity-60 disabled:cursor-wait"
        >
          <FileSpreadsheet className="w-3.5 h-3.5" />
          <span>{exportingAudit ? 'Preparing…' : `Audit Export (${PERIOD_LABELS[period]})`}</span>
        </button>
      </div>

      <RegistrationDeletionHistory />

      {/* Split Grid: School Performance & Package Performance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* School Ledger */}
        <div className="bg-panel border-2 border-line shadow-lux p-5">
          <div className="flex items-center justify-between pb-3 border-b-2 border-line mb-3">
            <h3 className="font-black text-xs uppercase tracking-wider flex items-center gap-1.5">
              <Building className="w-4 h-4 text-gold" />
              <span>Studio Revenue by School</span>
            </h3>
            <span className="font-mono text-[10px] text-neutral-500">{PERIOD_LABELS[period]}</span>
          </div>
          <div className="divide-y divide-neutral-200">
            {activeSchools.length === 0 && <p className="py-3 text-xs text-neutral-500">No payments or job orders {periodWords}.</p>}
            {activeSchools.map((s) => (
              <div key={s.key} className="py-2.5 flex items-center justify-between text-xs font-mono">
                <div>
                  <span className="font-black text-ink">{s.code}</span>
                  <span className="text-neutral-500 text-[11px] block truncate max-w-[200px]">{s.name}</span>
                </div>
                <GroupFigures group={s} fallback={s.count ? 'No balance' : 'Payments only'} />
              </div>
            ))}
            {activeSchools.length > 0 && (
              <div className="pt-2.5 flex items-center justify-between text-xs font-mono font-black border-t-2 border-line">
                <span>TOTAL</span>
                <GroupFigures group={sumGroups(activeSchools)} total />
              </div>
            )}
          </div>
          <GroupFootnote groups={activeSchools} />
          {hiddenSchools > 0 && (
            <p className="mt-2 text-[10px] text-neutral-500">{hiddenSchools} school{hiddenSchools === 1 ? '' : 's'} with nothing {periodWords} not shown.</p>
          )}
        </div>

        {/* Package Revenue */}
        <div className="bg-panel border-2 border-line shadow-lux p-5">
          <div className="flex items-center justify-between pb-3 border-b-2 border-line mb-3">
            <h3 className="font-black text-xs uppercase tracking-wider flex items-center gap-1.5">
              <PackageIcon className="w-4 h-4 text-gold" />
              <span>Studio Revenue by Package</span>
            </h3>
            <span className="font-mono text-[10px] text-neutral-500">{PERIOD_LABELS[period]}</span>
          </div>
          <div className="divide-y divide-neutral-200">
            {activePackages.length === 0 && <p className="py-3 text-xs text-neutral-500">No job orders {periodWords}.</p>}
            {activePackages.map((pkg) => (
              <div key={pkg.key} className="py-2.5 flex items-center justify-between text-xs font-mono">
                <div>
                  <span className="font-black text-ink">{pkg.code}</span>
                  <span className="text-neutral-500 text-[11px] block truncate max-w-[200px]">{pkg.name}</span>
                </div>
                <GroupFigures group={pkg} fallback={`${pkg.count} order${pkg.count === 1 ? '' : 's'}`} />
              </div>
            ))}
            {activePackages.length > 0 && (
              <div className="pt-2.5 flex items-center justify-between text-xs font-mono font-black border-t-2 border-line">
                <span>TOTAL</span>
                <GroupFigures group={sumGroups(activePackages)} total fallback={`${audit.totals.activeOrders} orders`} />
              </div>
            )}
          </div>
          <GroupFootnote groups={activePackages} />
        </div>
      </div>

      <MuaPerformancePanel />

      {/* The ledger has its own sub-tab. */}
      <button type="button" onClick={onOpenLedger}
        className="btn-tactile w-full flex flex-wrap items-center justify-between gap-3 p-4 bg-panel border-2 border-line shadow-lux text-left cursor-pointer hover:border-gold">
        <span className="flex items-center gap-3">
          <BookOpenCheck className="w-5 h-5 text-gold shrink-0" />
          <span>
            <span className="block font-black text-xs uppercase tracking-wider text-ink">Financial Settlement &amp; Ledger</span>
            <span className="block font-mono text-[11px] text-neutral-500">
              Every client's billing, payments, balance and refunds · {registrations.length} account{registrations.length === 1 ? '' : 's'}
            </span>
          </span>
        </span>
        <span className="flex items-center gap-1.5 font-mono text-[10px] font-black uppercase text-gold-soft">Open <ArrowRight className="w-4 h-4" /></span>
      </button>
      </>)}

      {/* Financial Ledger & Audit Trail: click a client to open their account. */}
      {view === 'ledger' && <DataTable
        label="Financial Settlement & Ledger"
        rows={filteredLedger}
        columns={ledgerColumns}
        getRowId={({ registration }) => registration.id}
        defaultSort={{ column: 'job', direction: 'ascending' }}
        tableClassName="font-mono"
        headerClassName="uppercase tracking-wider"
        filtered={Boolean(searchQuery.trim()) || filterSchool !== 'all' || filterPaymentStatus !== 'all'}
        emptyMessage="No participant accounts yet."
        filteredEmptyMessage="No records match the selected ledger filters."
        onRowClick={(row) => setOpenAccountId(row.registration.id)}
        toolbar={(
          <div className="flex flex-wrap items-center justify-between gap-3 p-5">
            <div>
              <h3 className="font-black text-xs uppercase tracking-wider text-ink">
                Financial Settlement &amp; Ledger
              </h3>
              <p className="font-mono text-[11px] text-neutral-500">
                Showing {filteredLedger.length} of {registrations.length} participant accounts · click a client to see payments, refunds and receipts
              </p>
            </div>

            <div className="flex flex-wrap gap-2 items-center text-xs font-mono">
              <input
                type="search"
                aria-label="Search financial ledger"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search student or JO №..."
                className={tableFilterControl}
              />
              <select
                aria-label="Filter ledger by school" value={filterSchool}
                onChange={(e) => setFilterSchool(e.target.value)}
                className={tableFilterControl}
              >
                <option value="all">All Schools</option>
                {organizations.map((org) => (
                  <option key={org.id} value={org.id}>{org.code || org.name}</option>
                ))}
              </select>
              <select
                aria-label="Filter ledger by balance" value={filterPaymentStatus}
                onChange={(e) => setFilterPaymentStatus(e.target.value)}
                className={tableFilterControl}
              >
                <option value="all">All Balances</option>
                <option value="has_balance">With Outstanding Balance</option>
                <option value="fully_paid">Fully Paid</option>
                <option value="unpaid">Unpaid</option>
                <option value="refund_due">Refund Due (overpaid)</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>
        )}
      />}

      {openAccount && createPortal(
        <div role="dialog" aria-modal="true" aria-labelledby="ledger-account-title"
          onClick={(e) => { if (e.target === e.currentTarget && !actionOpen) setOpenAccountId(null); }}
          className="no-print fixed inset-0 z-40 flex items-stretch sm:items-center justify-center sm:p-4 bg-obsidian/85 backdrop-blur-xs animate-modal">
          <div className="w-full sm:max-w-6xl h-full sm:h-auto sm:max-h-[92vh] flex flex-col bg-panel sm:border-2 border-line shadow-lux-gold font-mono text-xs">
            <div className="p-4 sm:px-6 border-b-2 border-line flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="bg-obsidian text-gold px-2 py-0.5 text-[10px] font-black uppercase tracking-widest">JO № {openAccount.registration.job_order_no || '—'}</span>
                  {(() => { const { label, tone } = settlementOf(openAccount); return <span className={`px-2 py-0.5 text-[9px] font-black uppercase ${tone}`}>{label}</span>; })()}
                </div>
                <h3 id="ledger-account-title" className="mt-1 text-base sm:text-lg font-black uppercase tracking-wider text-ink">{formatClientName(openAccount.registration)}</h3>
                <p className="text-[11px] text-neutral-600">
                  {clientSummary(openAccount.registration, true) || 'No school / client'} · Package {openAccount.registration.package_snapshot?.code || openAccount.registration.expand?.package?.code || '—'}
                </p>
              </div>
              <button type="button" onClick={() => setOpenAccountId(null)} aria-label="Close"
                className="w-9 h-9 shrink-0 flex items-center justify-center border border-line bg-canvas hover:bg-gold hover:text-on-gold cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
              <dl className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                {summaryColumns.map((column) => (
                  <div key={column.id} className="p-2 border border-line bg-canvas">
                    <dt className="text-[9px] font-black uppercase tracking-wider text-neutral-600">{column.header}</dt>
                    <dd className={`mt-0.5 text-sm font-black ${column.cellClassName ?? ''}`}>
                      {column.cell ? column.cell(openAccount) : String(column.accessor?.(openAccount) ?? '')}
                    </dd>
                  </div>
                ))}
              </dl>
              <div>{renderHistory(openAccount)}</div>
            </div>
          </div>
        </div>,
        document.body,
      )}
      {receiptTarget && (
        <PrintReceiptModal
          registration={receiptTarget.registration}
          paymentId={receiptTarget.paymentId}
          cashierName="Administrator"
          onClose={() => setReceiptTarget(null)}
        />
      )}
      {voidTarget && (
        <VoidPaymentModal
          payment={voidTarget.payment}
          registration={voidTarget.registration}
          onClose={() => setVoidTarget(null)}
          onVoid={onVoidPayment}
        />
      )}
      {refundTarget && (
        <RefundModal
          registration={refundTarget.registration}
          refundable={refundTarget.refundable}
          onClose={() => setRefundTarget(null)}
          onRefund={onRefund}
          onRecorded={(refund) => {
            setSlipTarget({ registration: refundTarget.registration, refund, justRecorded: true });
            setRefundTarget(null);
          }}
        />
      )}
      {slipTarget && (
        <PrintRefundSlipModal
          registration={slipTarget.registration}
          refund={slipTarget.refund}
          justRecorded={slipTarget.justRecorded}
          onClose={() => setSlipTarget(null)}
        />
      )}
    </div>
  );
};

const sumGroups = (groups: AuditGroup[]): AuditGroup => groups.reduce((sum, group) => ({
  ...sum, count: sum.count + group.count, billed: sum.billed + group.billed, collected: sum.collected + group.collected,
  balance: sum.balance + group.balance, held: sum.held + group.held,
}), { key: 'total', code: 'TOTAL', name: '', count: 0, billed: 0, collected: 0, balance: 0, held: 0 });

/**
 * A school / package row's figures: Studio revenue counted, cash held until a mixed order is fully
 * paid (or that has no revenue type), and Studio charges no cash has been counted toward yet.
 */
const GroupFigures: React.FC<{ group: AuditGroup; total?: boolean; fallback?: string }> = ({ group, total, fallback }) => (
  <div className="text-right">
    <div className={`${total ? '' : 'font-black '}text-ink`}>{formatCurrency(group.collected, { exact: true })}</div>
    {group.held > 0 && (
      <span className="text-[10px] text-amber-700 font-bold block">Held, not yet split: {formatCurrency(group.held, { exact: true })}</span>
    )}
    {group.balance > 0 && (
      <span className="text-[10px] text-neutral-600 font-bold block">Studio still to settle: {formatCurrency(group.balance, { exact: true })}</span>
    )}
    {!group.held && !group.balance && fallback && (
      <span className={`text-[10px] font-bold block ${total ? 'text-neutral-500' : 'text-emerald-600'}`}>{fallback}</span>
    )}
  </div>
);

/** Explains "held" and "still to settle" under a card, only when one shows. */
const GroupFootnote: React.FC<{ groups: AuditGroup[] }> = ({ groups }) => {
  const held = groups.some((group) => group.held > 0);
  const toSettle = groups.some((group) => group.balance > 0);
  if (!held && !toSettle) return null;
  return (
    <p className="mt-3 pt-2 border-t border-line text-[10px] text-neutral-500 font-sans leading-relaxed">
      {held && <><b className="text-amber-700">Held, not yet split:</b> payments on orders that mix Studio and MUA charges, counted into each once the order is fully paid (or charges with no revenue type). </>}
      {toSettle && <><b className="text-neutral-600">Studio still to settle:</b> Studio charges no payment has been counted toward yet.</>}
    </p>
  );
};
