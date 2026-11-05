import React, { useState, useMemo } from 'react';
import {
  DollarSign,
  Users,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  ShieldCheck,
  Building,
  Package as PackageIcon,
} from 'lucide-react';
import type { Organization, Registration, Package } from '../../../types';
import { formatCurrency, formatClientName } from '../../../utils/formatters';

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
  onExportCsv: () => void;
}

export const AdminAnalyticsTab: React.FC<AdminAnalyticsTabProps> = ({
  metrics,
  organizations,
  registrations,
  packages,
  onExportCsv,
}) => {
  const [filterSchool, setFilterSchool] = useState<string>('all');
  const [filterPaymentStatus, setFilterPaymentStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

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
      const collected = orgRegs.reduce((sum, r) => sum + (r.paid_amount || 0), 0);
      const balance = orgRegs.reduce((sum, r) => sum + (r.balance || 0), 0);
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
  }, [organizations, registrations]);

  // Breakdown by Package
  const packageBreakdown = useMemo(() => {
    return packages.map((pkg) => {
      const pkgRegs = registrations.filter((r) => r.package === pkg.id);
      const billed = pkgRegs.reduce((sum, r) => sum + (r.total_amount || 0), 0);
      const collected = pkgRegs.reduce((sum, r) => sum + (r.paid_amount || 0), 0);
      return {
        id: pkg.id,
        code: pkg.code,
        name: pkg.name,
        count: pkgRegs.length,
        billed,
        collected,
      };
    });
  }, [packages, registrations]);

  // Filtered Financial Ledger
  const filteredLedger = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return registrations.filter((r) => {
      if (filterSchool !== 'all' && r.organization !== filterSchool) return false;
      if (filterPaymentStatus !== 'all') {
        if (filterPaymentStatus === 'fully_paid' && r.balance > 0) return false;
        if (filterPaymentStatus === 'unpaid' && (r.paid_amount || 0) > 0) return false;
        if (filterPaymentStatus === 'has_balance' && r.balance <= 0) return false;
      }
      if (q) {
        const fullName = `${r.given_name} ${r.family_name}`.toLowerCase();
        const jo = (r.job_order_no || '').toLowerCase();
        const schoolName = (r.expand?.organization?.name || '').toLowerCase();
        if (!fullName.includes(q) && !jo.includes(q) && !schoolName.includes(q)) return false;
      }
      return true;
    });
  }, [registrations, filterSchool, filterPaymentStatus, searchQuery]);

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
                filteredLedger.slice(0, 50).map((r) => (
                  <tr key={r.id} className="hover:bg-[#F8F7F4] transition-colors">
                    <td className="py-2 px-3 font-black text-red-600">{r.job_order_no}</td>
                    <td className="py-2 px-3 font-bold text-[#0A0A0A] uppercase">{formatClientName(r)}</td>
                    <td className="py-2 px-3 text-neutral-600">{r.expand?.organization?.code || 'ORG'}</td>
                    <td className="py-2 px-3">{r.expand?.package?.code || 'PKG'}</td>
                    <td className="py-2 px-3 text-right font-bold">{formatCurrency(r.total_amount)}</td>
                    <td className="py-2 px-3 text-right text-emerald-700 font-bold">{formatCurrency(r.paid_amount || 0)}</td>
                    <td className="py-2 px-3 text-right font-black">
                      {r.balance > 0 ? (
                        <span className="text-red-600">{formatCurrency(r.balance)}</span>
                      ) : (
                        <span className="text-emerald-700">₱0.00</span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-center">
                      {r.balance <= 0 ? (
                        <span className="px-2 py-0.5 text-[9px] font-black bg-emerald-100 text-emerald-800 border border-emerald-400 uppercase">
                          SETTLED
                        </span>
                      ) : (r.paid_amount || 0) > 0 ? (
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
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
