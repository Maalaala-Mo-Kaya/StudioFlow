import React, { useState, useMemo } from 'react';
import { Frame, Copy, Check, Filter } from 'lucide-react';
import type { Registration, FramingStatus } from '../../../types';
import { formatClientName, formatCurrency } from '../../../utils/formatters';
import { getDeterministicFolderPath, copyFolderPathToClipboard } from '../../../utils/folderPath';
import { DataTable } from '../../../components/common/DataTable';
import type { DataTableColumn } from '../../../components/common/DataTable';

interface AdminFramingTabProps {
  registrations: Registration[];
  onUpdateFramingStatus: (id: string, status: FramingStatus) => Promise<void>;
}

export const AdminFramingTab: React.FC<AdminFramingTabProps> = ({
  registrations,
  onUpdateFramingStatus,
}) => {
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterSchool, setFilterSchool] = useState<string>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Extract participants with frame items in package or add-ons
  const framingRecords = useMemo(() => {
    return registrations.filter((reg) => {
      const pkgInclusions = Array.isArray(reg.expand?.package?.inclusions)
        ? reg.expand.package.inclusions.join(' ')
        : String(reg.expand?.package?.inclusions || '');
      const pkgHasFrame = /frame/i.test(pkgInclusions) || /frame/i.test(reg.expand?.package?.name || '');
      const addOnsHaveFrame = (reg.add_ons || []).some(
        (a) => /frame/i.test(a.name) || /frame/i.test(a.code || '')
      );
      return pkgHasFrame || addOnsHaveFrame;
    });
  }, [registrations]);

  // Unique schools for filter
  const schools = useMemo(() => {
    const set = new Set<string>();
    framingRecords.forEach((r) => {
      const name = r.expand?.organization?.name;
      if (name) set.add(name);
    });
    return Array.from(set);
  }, [framingRecords]);

  // Status Metrics
  const metrics = useMemo(() => {
    const total = framingRecords.length;
    const pending = framingRecords.filter(
      (r) => !r.framing_status || r.framing_status === 'none' || r.framing_status === 'pending_framing'
    ).length;
    const inProduction = framingRecords.filter((r) => r.framing_status === 'in_production').length;
    const ready = framingRecords.filter(
      (r) => r.framing_status === 'framed' || r.framing_status === 'ready_for_pickup'
    ).length;
    const released = framingRecords.filter((r) => r.framing_status === 'released').length;

    return { total, pending, inProduction, ready, released };
  }, [framingRecords]);

  // Filtered List
  const filteredList = useMemo(() => {
    return framingRecords.filter((r) => {
      if (filterSchool !== 'all' && r.expand?.organization?.name !== filterSchool) return false;
      const status = r.framing_status || 'pending_framing';
      if (filterStatus === 'all') return true;
      if (filterStatus === 'pending') return status === 'none' || status === 'pending_framing';
      return status === filterStatus;
    });
  }, [framingRecords, filterStatus, filterSchool]);

  const handleCopy = async (reg: Registration) => {
    const path = getDeterministicFolderPath(reg);
    const success = await copyFolderPathToClipboard(path);
    if (success) {
      setCopiedId(reg.id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  // Helper to extract frame names
  const getFrameDetails = (reg: Registration) => {
    const frames: string[] = [];
    const pkgInclusions = Array.isArray(reg.expand?.package?.inclusions)
      ? reg.expand.package.inclusions
      : [];
    pkgInclusions.forEach((inc) => {
      if (/frame/i.test(inc)) frames.push(inc);
    });
    (reg.add_ons || []).forEach((a) => {
      if (/frame/i.test(a.name)) frames.push(a.name);
    });
    return frames.length > 0 ? frames : ['Standard Framing'];
  };
  const columns: DataTableColumn<Registration>[] = [
    {
      id: 'job', header: 'JO № & Queue', sortable: true, accessor: (reg) => reg.job_order_no,
      cellClassName: 'font-mono',
      cell: (reg) => (
        <>
          <div className="font-black text-red-600">{reg.job_order_no}</div>
          <div className="text-[10px] text-neutral-500 font-bold">Q-{reg.queue_number}</div>
        </>
      ),
    },
    {
      id: 'name', header: 'Student Name', sortable: true,
      accessor: (reg) => `${reg.family_name} ${reg.given_name}`,
      cell: formatClientName,
      cellClassName: 'font-black uppercase text-[#0A0A0A]',
    },
    {
      id: 'school', header: 'School & Course', sortable: true, accessor: (reg) => `${reg.expand?.organization?.name || ''} ${reg.expand?.course?.code || ''}`,
      cell: (reg) => (
        <>
          <div className="font-bold text-[#0A0A0A]">{reg.expand?.organization?.code || reg.expand?.organization?.name}</div>
          <div className="text-[11px] text-neutral-500">{reg.expand?.course?.code || 'Course'}</div>
        </>
      ),
    },
    {
      id: 'frame', header: 'Frame Specification', sortable: true, accessor: (reg) => getFrameDetails(reg).join(' '),
      cell: (reg) => (
        <div className="space-y-1">
          {getFrameDetails(reg).map((f, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 px-2 py-0.5 font-mono text-[10px] font-bold bg-[#F7F2E0] border border-[#0A0A0A] text-[#0A0A0A]"
            >
              <Frame className="w-3 h-3 text-[#C9A227]" /> {f}
            </span>
          ))}
        </div>
      ),
    },
    {
      id: 'payment', header: 'Payment', sortable: true, accessor: (reg) => reg.balance,
      cellClassName: 'font-mono',
      cell: (reg) => reg.balance > 0 ? (
        <span className="text-red-600 font-black text-[11px]">
          Bal: {formatCurrency(reg.balance)}
        </span>
      ) : (
        <span className="text-emerald-700 font-black text-[11px]">
          ✓ Paid ({formatCurrency(reg.total_amount)})
        </span>
      ),
    },
    {
      id: 'status', header: 'Production Status', sortable: true, accessor: (reg) => reg.framing_status || 'pending_framing',
      cell: (reg) => (
        <select
          value={reg.framing_status || 'pending_framing'}
          onChange={(e) => onUpdateFramingStatus(reg.id, e.target.value as FramingStatus)}
          className="p-1 font-mono text-xs font-bold uppercase bg-white border border-[#0A0A0A] focus:outline-hidden"
        >
          <option value="pending_framing">Pending Framing</option>
          <option value="in_production">In Production</option>
          <option value="framed">Framed</option>
          <option value="ready_for_pickup">Ready for Pickup</option>
          <option value="released">Released to Client</option>
        </select>
      ),
    },
    {
      id: 'folder', header: 'Pictorial Folder', sortable: true, accessor: getDeterministicFolderPath,
      align: 'right',
      cell: (reg) => (
        <button
          type="button"
          onClick={() => handleCopy(reg)}
          title={getDeterministicFolderPath(reg)}
          className="btn-tactile inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-mono font-bold uppercase bg-[#0A0A0A] text-[#C9A227] hover:bg-neutral-800 transition-colors cursor-pointer"
        >
          {copiedId === reg.id ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span>Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>Copy Path</span>
            </>
          )}
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6 animate-enter-delay-2">
      {/* KPI Overview */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 font-mono">
        <div className="p-4 bg-white border-2 border-[#0A0A0A] shadow-[4px_4px_0px_#0A0A0A]">
          <span className="text-[10px] font-bold text-neutral-500 uppercase block">Total Frame Orders</span>
          <span className="text-2xl font-black text-[#0A0A0A]">{metrics.total}</span>
        </div>
        <div className="p-4 bg-white border-2 border-[#0A0A0A] shadow-[4px_4px_0px_#0A0A0A]">
          <span className="text-[10px] font-bold text-amber-700 uppercase block">Pending Framing</span>
          <span className="text-2xl font-black text-amber-600">{metrics.pending}</span>
        </div>
        <div className="p-4 bg-white border-2 border-[#0A0A0A] shadow-[4px_4px_0px_#0A0A0A]">
          <span className="text-[10px] font-bold text-blue-700 uppercase block">In Production</span>
          <span className="text-2xl font-black text-blue-600">{metrics.inProduction}</span>
        </div>
        <div className="p-4 bg-white border-2 border-[#0A0A0A] shadow-[4px_4px_0px_#0A0A0A]">
          <span className="text-[10px] font-bold text-emerald-700 uppercase block">Ready for Pickup</span>
          <span className="text-2xl font-black text-emerald-600">{metrics.ready}</span>
        </div>
        <div className="p-4 bg-white border-2 border-[#0A0A0A] shadow-[4px_4px_0px_#0A0A0A] col-span-2 lg:col-span-1">
          <span className="text-[10px] font-bold text-neutral-500 uppercase block">Released / Claimed</span>
          <span className="text-2xl font-black text-neutral-800">{metrics.released}</span>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="p-4 bg-white border-2 border-[#0A0A0A] flex flex-wrap gap-4 items-center justify-between text-xs font-mono">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-[#C9A227]" />
          <span className="font-bold uppercase">Filter Status:</span>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="p-1.5 bg-[#F8F7F4] border border-[#0A0A0A] font-mono text-xs uppercase"
          >
            <option value="all">All Statuses ({framingRecords.length})</option>
            <option value="pending">Pending Framing ({metrics.pending})</option>
            <option value="in_production">In Production ({metrics.inProduction})</option>
            <option value="ready_for_pickup">Ready for Pickup ({metrics.ready})</option>
            <option value="released">Released ({metrics.released})</option>
          </select>
        </div>

        {schools.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="font-bold uppercase">School:</span>
            <select
              value={filterSchool}
              onChange={(e) => setFilterSchool(e.target.value)}
              className="p-1.5 bg-[#F8F7F4] border border-[#0A0A0A] font-mono text-xs uppercase"
            >
              <option value="all">All Schools</option>
              {schools.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Framing Ledger Table */}
      <DataTable
        label="Framing Ledger"
        rows={filteredList}
        columns={columns}
        getRowId={(reg) => reg.id}
        defaultSort={{ column: 'job', direction: 'ascending' }}
        pagination={false}
        viewportClassName="max-h-[600px]"
        headerClassName="font-mono uppercase tracking-wider"
        filtered={filterSchool !== 'all' || filterStatus !== 'all'}
        emptyMessage="No framing orders available."
        filteredEmptyMessage="No framing orders match the selected filters."
      />
    </div>
  );
};
