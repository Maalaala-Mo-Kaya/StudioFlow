import React, { Fragment, useState, useMemo } from 'react';
import {
  DollarSign,
  Users,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  ShieldCheck,
  Building,
  Package as PackageIcon,
  ChevronDown,
  ChevronRight,
  Printer,
} from 'lucide-react';
import type { Organization, Registration, Package, PaymentRecord } from '../../../types';
import { formatCurrency, formatClientName } from '../../../utils/formatters';
import { PrintReceiptModal } from '../../cashier/components/PrintReceiptModal';

const transactionDate = new Intl.DateTimeFormat('en-PH', {
  timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short',
});
const collectionModeLabels: Record<PaymentRecord['payment_type'], string> = {
  initial: '50% Downpayment', full: 'Full Settlement', additional: 'Additional Payment',
  balance_settlement: 'Full Settlement',
};

interface AdminAnalyticsTabProps {
  metrics: {
    totalRegistrations: number;
    totalPaidShooting: number;
    totalCompleted: number;
    totalCollections: number;
    totalOutstandingBalances: number;
  };
  organizations: Organization[];
  registrations: Registration[];
  packages: Package[];
  payments: PaymentRecord[];
  onExportCsv: () => void;
}

export const AdminAnalyticsTab: React.FC<AdminAnalyticsTabProps> = ({
  metrics,
  organizations,
  registrations,
  packages,
  payments,
  onExportCsv,
}) => {
  const [filterSchool, setFilterSchool] = useState<string>('all');
  const [filterPaymentStatus, setFilterPaymentStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [receiptRegistration, setReceiptRegistration] = useState<Registration | null>(null);

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
    const collected = transactions.reduce((sum, payment) =>
      payment.status === 'voided' || payment.status === 'refunded' ? sum : sum + payment.amount, 0);
    return {
      registration,
      transactions,
      collected,
      balance: Math.max(0, (registration.total_amount || 0) - collected),
    };
  }), [registrations, paymentsByRegistration]);

  // Total Invoiced / Gross Billed
  const totalGrossBilled = useMemo(
    () => registrations.reduce((sum, r) => sum + (r.total_amount || 0), 0),
    [registrations]
  );

  // Reconciliation Check (T049 / AC023)
  const isReconciled = useMemo(() => {
    const calcExpected = metrics.totalCollections + metrics.totalOutstandingBalances;
    return Math.abs(totalGrossBilled - calcExpected) < 0.01;
  }, [totalGrossBilled, metrics.totalCollections, metrics.totalOutstandingBalances]);

  // Breakdown by School
  const schoolBreakdown = useMemo(() => {
    return organizations.map((org) => {
      const orgRegs = registrations.filter((r) => r.organization === org.id);
      const billed = orgRegs.reduce((sum, r) => sum + (r.total_amount || 0), 0);
      const orgRows = ledgerRows.filter(({ registration }) => registration.organization === org.id);
      const collected = orgRows.reduce((sum, row) => sum + row.collected, 0);
      const balance = orgRows.reduce((sum, row) => sum + row.balance, 0);
      return {
        id: org.id,
        code: org.code || 'ORG',
        name: org.name,
        count: orgRegs.length,
        billed,
        collected,
        balance,
      };
    });
  }, [organizations, registrations, ledgerRows]);

  // Breakdown by Package
  const packageBreakdown = useMemo(() => {
    return packages.map((pkg) => {
      const pkgRegs = registrations.filter((r) => r.package === pkg.id);
      const billed = pkgRegs.reduce((sum, r) => sum + (r.total_amount || 0), 0);
      const collected = ledgerRows.filter(({ registration }) => registration.package === pkg.id)
        .reduce((sum, row) => sum + row.collected, 0);
      return {
        id: pkg.id,
        code: pkg.code,
        name: pkg.name,
        count: pkgRegs.length,
        billed,
        collected,
      };
    });
  }, [packages, registrations, ledgerRows]);

  // Filtered Financial Ledger
  const filteredLedger = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return ledgerRows.filter(({ registration: r, collected, balance }) => {
      if (filterSchool !== 'all' && r.organization !== filterSchool) return false;
      if (filterPaymentStatus !== 'all') {
        if (filterPaymentStatus === 'fully_paid' && balance > 0) return false;
        if (filterPaymentStatus === 'unpaid' && collected > 0) return false;
        if (filterPaymentStatus === 'has_balance' && balance <= 0) return false;
      }
      if (q) {
        const fullName = `${r.given_name} ${r.family_name}`.toLowerCase();
        const jo = (r.job_order_no || '').toLowerCase();
        const schoolName = (r.expand?.organization?.name || '').toLowerCase();
        if (!fullName.includes(q) && !jo.includes(q) && !schoolName.includes(q)) return false;
      }
      return true;
    });
  }, [ledgerRows, filterSchool, filterPaymentStatus, searchQuery]);

  return (
    <div className="space-y-6 animate-enter">
      {/* KPI Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        <div className="bg-[#0A0A0A] text-white border-2 border-[#0A0A0A] shadow-[4px_4px_0px_#C9A227] p-5">
          <div className="flex items-center justify-between text-[#C9A227] mb-2">
            <span className="font-mono text-[10px] font-black uppercase tracking-wider">
              Total Collections
            </span>
            <DollarSign className="w-4 h-4" />
          </div>
          <div className="font-mono text-2xl sm:text-3xl font-black text-[#C9A227]">
            {formatCurrency(metrics.totalCollections)}
          </div>
          <p className="text-[11px] text-neutral-400 mt-1">Verified cashier receipts</p>
        </div>

        <div className="bg-white border-2 border-[#0A0A0A] shadow-[4px_4px_0px_#0A0A0A] p-5">
          <div className="flex items-center justify-between text-neutral-600 mb-2">
            <span className="font-mono text-[10px] font-black uppercase tracking-wider">
              Gross Invoiced
            </span>
            <Users className="w-4 h-4 text-[#0A0A0A]" />
          </div>
          <div className="font-mono text-2xl sm:text-3xl font-black text-[#0A0A0A]">
            {formatCurrency(totalGrossBilled)}
          </div>
          <p className="text-[11px] text-neutral-500 mt-1">{metrics.totalRegistrations} registered clients</p>
        </div>

        <div className="bg-white border-2 border-[#0A0A0A] shadow-[4px_4px_0px_#0A0A0A] p-5">
          <div className="flex items-center justify-between text-neutral-600 mb-2">
            <span className="font-mono text-[10px] font-black uppercase tracking-wider">
              Outstanding Balances
            </span>
            <AlertCircle className="w-4 h-4 text-red-600" />
          </div>
          <div className="font-mono text-2xl sm:text-3xl font-black text-red-600">
            {formatCurrency(metrics.totalOutstandingBalances)}
          </div>
          <p className="text-[11px] text-neutral-500 mt-1">Due before print release</p>
        </div>

        <div className="bg-white border-2 border-[#0A0A0A] shadow-[4px_4px_0px_#0A0A0A] p-5">
          <div className="flex items-center justify-between text-neutral-600 mb-2">
            <span className="font-mono text-[10px] font-black uppercase tracking-wider">
              Shoots Completed
            </span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="font-mono text-2xl sm:text-3xl font-black text-[#0A0A0A]">
            {metrics.totalCompleted}
          </div>
          <p className="text-[11px] text-neutral-500 mt-1">
            {metrics.totalPaidShooting} in studio queue
          </p>
        </div>
      </div>

      {/* Accounting Reconciliation Banner */}
      <div className={`p-3.5 border-2 font-mono text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
        isReconciled
          ? 'bg-emerald-50 border-emerald-600 text-emerald-900'
          : 'bg-red-50 border-red-600 text-red-900'
      }`}>
        <div className="flex items-center gap-2 font-bold">
          <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-700" />
          <span>
            {isReconciled
              ? `Ledger Balanced: Gross (${formatCurrency(totalGrossBilled)}) = Collections (${formatCurrency(metrics.totalCollections)}) + Balances (${formatCurrency(metrics.totalOutstandingBalances)})`
              : `Discrepancy: Gross (${formatCurrency(totalGrossBilled)}) does not match Collections + Receivables`}
          </span>
        </div>
        <button
          type="button"
          onClick={onExportCsv}
          className="btn-tactile shrink-0 px-3 py-1 bg-[#0A0A0A] text-[#C9A227] font-black uppercase text-[10px] tracking-wider flex items-center gap-1.5 cursor-pointer"
        >
          <FileSpreadsheet className="w-3.5 h-3.5" />
          <span>Audit Export</span>
        </button>
      </div>

      {/* Split Grid: School Performance & Package Performance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* School Ledger */}
        <div className="bg-white border-2 border-[#0A0A0A] shadow-[4px_4px_0px_#0A0A0A] p-5">
          <div className="flex items-center justify-between pb-3 border-b-2 border-[#0A0A0A] mb-3">
            <h3 className="font-black text-xs uppercase tracking-wider flex items-center gap-1.5">
              <Building className="w-4 h-4 text-[#C9A227]" />
              <span>Collections by School</span>
            </h3>
            <span className="font-mono text-[10px] text-neutral-500">{organizations.length} Schools</span>
          </div>
          <div className="divide-y divide-neutral-200">
            {schoolBreakdown.map((s) => (
              <div key={s.id} className="py-2.5 flex items-center justify-between text-xs font-mono">
                <div>
                  <span className="font-black text-[#0A0A0A]">{s.code}</span>
                  <span className="text-neutral-500 text-[11px] block truncate max-w-[200px]">{s.name}</span>
                </div>
                <div className="text-right">
                  <div className="font-black text-[#0A0A0A]">{formatCurrency(s.collected)}</div>
                  {s.balance > 0 ? (
                    <span className="text-[10px] text-red-600 font-bold block">
                      Bal: {formatCurrency(s.balance)}
                    </span>
                  ) : (
                    <span className="text-[10px] text-emerald-600 font-bold block">100% Settled</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Package Revenue */}
        <div className="bg-white border-2 border-[#0A0A0A] shadow-[4px_4px_0px_#0A0A0A] p-5">
          <div className="flex items-center justify-between pb-3 border-b-2 border-[#0A0A0A] mb-3">
            <h3 className="font-black text-xs uppercase tracking-wider flex items-center gap-1.5">
              <PackageIcon className="w-4 h-4 text-[#C9A227]" />
              <span>Revenue by Package</span>
            </h3>
            <span className="font-mono text-[10px] text-neutral-500">{packages.length} Packages</span>
          </div>
          <div className="divide-y divide-neutral-200">
            {packageBreakdown.map((pkg) => (
              <div key={pkg.id} className="py-2.5 flex items-center justify-between text-xs font-mono">
                <div>
                  <span className="font-black text-[#0A0A0A]">{pkg.code}</span>
                  <span className="text-neutral-500 text-[11px] block truncate max-w-[200px]">{pkg.name}</span>
                </div>
                <div className="text-right">
                  <div className="font-black text-[#0A0A0A]">{formatCurrency(pkg.billed)}</div>
                  <span className="text-[10px] text-neutral-500 block">{pkg.count} orders</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Financial Ledger & Audit Trail */}
      <div className="bg-white border-2 border-[#0A0A0A] shadow-[6px_6px_0px_#0A0A0A] p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b-2 border-[#0A0A0A]">
          <div>
            <h3 className="font-black text-xs uppercase tracking-wider text-[#0A0A0A]">
              Financial Settlement &amp; Ledger
            </h3>
            <p className="font-mono text-[11px] text-neutral-500">
              Showing {filteredLedger.length} of {registrations.length} participant accounts
            </p>
          </div>

          <div className="flex flex-wrap gap-2 items-center text-xs font-mono">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search student or JO №..."
              className="p-1.5 bg-[#F8F7F4] border border-[#0A0A0A] font-mono text-xs"
            />
            <select
              value={filterSchool}
              onChange={(e) => setFilterSchool(e.target.value)}
              className="p-1.5 bg-[#F8F7F4] border border-[#0A0A0A] font-mono text-xs uppercase"
            >
              <option value="all">All Schools</option>
              {organizations.map((org) => (
                <option key={org.id} value={org.id}>{org.code || org.name}</option>
              ))}
            </select>
            <select
              value={filterPaymentStatus}
              onChange={(e) => setFilterPaymentStatus(e.target.value)}
              className="p-1.5 bg-[#F8F7F4] border border-[#0A0A0A] font-mono text-xs uppercase"
            >
              <option value="all">All Balances</option>
              <option value="has_balance">With Outstanding Balance</option>
              <option value="fully_paid">Fully Paid</option>
              <option value="unpaid">Unpaid</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse font-mono">
            <thead>
              <tr className="bg-[#0A0A0A] text-[#C9A227] text-[10px] uppercase font-black tracking-wider">
                <th className="py-2.5 px-3">JO №</th>
                <th className="py-2.5 px-3">Student Name</th>
                <th className="py-2.5 px-3">School</th>
                <th className="py-2.5 px-3">Package</th>
                <th className="py-2.5 px-3 text-right">Billed</th>
                <th className="py-2.5 px-3 text-right">Collected</th>
                <th className="py-2.5 px-3 text-right">Balance</th>
                <th className="py-2.5 px-3 text-center">Settlement Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {filteredLedger.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-neutral-400">
                    No records match the selected ledger filters.
                  </td>
                </tr>
              ) : (
                filteredLedger.slice(0, 50).map(({ registration: r, transactions, collected, balance }) => {
                  const expanded = expandedRows.has(r.id);
                  let runningTotal = 0;
                  const history = transactions.map((payment) => {
                    if (payment.status !== 'voided' && payment.status !== 'refunded') runningTotal += payment.amount;
                    return { payment, runningTotal, remaining: Math.max(0, r.total_amount - runningTotal) };
                  });
                  const toggle = () => setExpandedRows((current) => {
                    const next = new Set(current);
                    if (next.has(r.id)) next.delete(r.id); else next.add(r.id);
                    return next;
                  });
                  return (
                  <Fragment key={r.id}>
                  <tr
                    onClick={toggle}
                    onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') toggle(); }}
                    tabIndex={0}
                    aria-expanded={expanded}
                    className="cursor-pointer hover:bg-[#F8F7F4] transition-colors focus:bg-[#F7F2E0] focus:outline-none"
                  >
                    <td className="py-2 px-3 font-black text-red-600">
                      <span className="inline-flex items-center gap-1">{expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}{r.job_order_no}</span>
                    </td>
                    <td className="py-2 px-3 font-bold text-[#0A0A0A] uppercase">{formatClientName(r)}</td>
                    <td className="py-2 px-3 text-neutral-600">{r.expand?.organization?.code || 'ORG'}</td>
                    <td className="py-2 px-3">{r.expand?.package?.code || 'PKG'}</td>
                    <td className="py-2 px-3 text-right font-bold">{formatCurrency(r.total_amount)}</td>
                    <td className="py-2 px-3 text-right text-emerald-700 font-bold">{formatCurrency(collected)}</td>
                    <td className="py-2 px-3 text-right font-black">
                      {balance > 0 ? (
                        <span className="text-red-600">{formatCurrency(balance)}</span>
                      ) : (
                        <span className="text-emerald-700">₱0.00</span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-center">
                      {balance <= 0 ? (
                        <span className="px-2 py-0.5 text-[9px] font-black bg-emerald-100 text-emerald-800 border border-emerald-400 uppercase">
                          FULLY PAID
                        </span>
                      ) : collected > 0 ? (
                        <span className="px-2 py-0.5 text-[9px] font-black bg-amber-100 text-amber-800 border border-amber-400 uppercase">
                          PARTIAL
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 text-[9px] font-black bg-neutral-200 text-neutral-700 uppercase">
                          UNPAID
                        </span>
                      )}
                    </td>
                  </tr>
                  {expanded && (
                    <tr>
                      <td colSpan={8} className="border-y-2 border-[#C9A227] bg-[#F8F7F4] p-3">
                        <div className="mb-2 text-[10px] font-black uppercase tracking-wider">Payment Transaction History</div>
                        {history.length === 0 ? (
                          <div className="border border-neutral-300 bg-white p-4 text-center text-neutral-500">No payment transactions recorded.</div>
                        ) : (
                          <div className="overflow-x-auto border border-[#0A0A0A] bg-white">
                            <table className="min-w-[1200px] w-full text-[10px]">
                              <thead className="bg-[#0A0A0A] text-[#C9A227] uppercase">
                                <tr>
                                  {['Date & Time', 'Receipt №', 'Collection Mode', 'Payment Method', 'Amount Paid', 'Running Total', 'Remaining Balance', 'Cashier', 'Reference / Remarks', 'Status', 'Actions'].map((label) => (
                                    <th key={label} className="whitespace-nowrap px-2 py-2 text-left">{label}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-neutral-200">
                                {history.map(({ payment, runningTotal: running, remaining }) => (
                                  <tr key={payment.id}>
                                    <td className="whitespace-nowrap px-2 py-2">{transactionDate.format(new Date(payment.created.replace(' ', 'T')))}</td>
                                    <td className="whitespace-nowrap px-2 py-2 font-bold">{payment.receipt_no || payment.id}</td>
                                    <td className="whitespace-nowrap px-2 py-2">{collectionModeLabels[payment.payment_type] || payment.payment_type}</td>
                                    <td className="whitespace-nowrap px-2 py-2 uppercase">{payment.payment_method}</td>
                                    <td className="whitespace-nowrap px-2 py-2 text-right font-bold">{formatCurrency(payment.amount, { exact: true })}</td>
                                    <td className="whitespace-nowrap px-2 py-2 text-right">{formatCurrency(running, { exact: true })}</td>
                                    <td className="whitespace-nowrap px-2 py-2 text-right">{formatCurrency(remaining, { exact: true })}</td>
                                    <td className="whitespace-nowrap px-2 py-2">{payment.cashier_name || '—'}</td>
                                    <td className="max-w-52 px-2 py-2">{payment.remarks || '—'}</td>
                                    <td className="whitespace-nowrap px-2 py-2 font-bold uppercase">{payment.status || 'completed'}</td>
                                    <td className="px-2 py-2">
                                      <button
                                        type="button"
                                        onClick={(event) => { event.stopPropagation(); setReceiptRegistration(r); }}
                                        className="inline-flex items-center gap-1 whitespace-nowrap border border-[#0A0A0A] bg-[#C9A227] px-2 py-1 font-black uppercase"
                                      >
                                        <Printer className="size-3" /> Reprint
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                  </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      {receiptRegistration && (
        <PrintReceiptModal
          registration={receiptRegistration}
          cashierName="Administrator"
          onClose={() => setReceiptRegistration(null)}
        />
      )}
    </div>
  );
};
