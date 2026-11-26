import React, { useEffect, useRef, useState } from 'react';
import { Activity, ChevronDown, Download, FileSpreadsheet, X } from 'lucide-react';
import type { Organization, Registration } from '../../../types';
import type { DateRange, OverallScope } from '../studentExcel';
import { SearchableSelect } from '../../../components/common/SearchableSelect';
import { isWalkIn } from '../../../utils/clientInfo';
import { clampDay, useStudioCalendar } from '../../../hooks/useStudioCalendar';
import { workflowError } from '../../../hooks/useWorkflowData';

interface AdminHeaderProps {
  onExportCsv: () => void;
  onExportExcel: (scope?: OverallScope, range?: DateRange, label?: string) => Promise<void>;
  exportingExcel: boolean;
  organizations: Organization[];
  registrations: Registration[];
}

type ExportKind = 'master' | 'school' | 'walkin' | 'levels' | 'csv' | 'mua';

const KINDS: Array<{ id: ExportKind; label: string; hint: string }> = [
  { id: 'master', label: 'Master Overall: all schools', hint: 'One file: Summary + one sheet per school + Walk-ins' },
  { id: 'school', label: 'One school', hint: 'Only that school\'s clients, grouped by level. Safe to give to the school.' },
  { id: 'walkin', label: 'Walk-in clients', hint: 'Family portraits, events and other walk-ins' },
  { id: 'levels', label: 'All schools by level', hint: 'COLLEGE OVERALL, SHS OVERALL… sheets, as before' },
  { id: 'csv', label: 'CSV list of every job order', hint: 'One plain list with paid and balance (dates not applied)' },
];

const OTHER_EXPORTS: typeof KINDS = [
  { id: 'mua', label: 'MUA report', hint: 'Performance, earnings, and payouts in one Excel workbook' },
];

/**
 * Admin export picker for client lists and the combined MUA workbook.
 */
export const AdminHeader: React.FC<AdminHeaderProps> = ({ onExportCsv, onExportExcel, exportingExcel, organizations, registrations }) => {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<ExportKind>('master');
  const [schoolId, setSchoolId] = useState('');
  const [clientRange, setClientRange] = useState({ from: '', to: '' });
  const [muaRange, setMuaRange] = useState<{ from: string; to: string }>();
  const { start, today } = useStudioCalendar();
  const [busy, setBusy] = useState(false);
  const [exportError, setExportError] = useState('');
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const exporting = busy || exportingExcel;

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  const perSchool = new Map<string, number>();
  for (const reg of registrations) {
    if (!isWalkIn(reg) && reg.organization && reg.status !== 'cancelled') {
      perSchool.set(reg.organization, (perSchool.get(reg.organization) ?? 0) + 1);
    }
  }
  const schoolOptions = [...organizations].sort((a, b) => a.name.localeCompare(b.name)).map((org) => ({
    value: org.id,
    label: `${org.name}${org.code ? ` (${org.code})` : ''} · ${perSchool.get(org.id) ?? 0}`,
    keywords: org.code,
  }));
  const school = organizations.find((org) => org.id === schoolId);
  const mua = kind === 'mua';
  const monthStart = clampDay(`${today.slice(0, 8)}01`, start, today);
  const { from, to } = mua ? muaRange ?? { from: monthStart, to: today } : clientRange;
  const setRange = mua ? setMuaRange : setClientRange;
  const badRange = Boolean(from && to && from > to);
  const canExport = !exporting && !badRange && (kind !== 'school' || Boolean(school)) && (!mua || Boolean(from && to));

  const setQuick = (preset: 'all' | 'month' | 'today') => {
    if (preset === 'all') setRange(mua ? { from: start, to: today } : { from: '', to: '' });
    if (preset === 'today') setRange({ from: today, to: today });
    if (preset === 'month') setRange({ from: monthStart, to: today });
  };

  const runExport = async () => {
    if (!canExport) return;
    setBusy(true);
    setExportError('');
    try {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const range: DateRange = { from: from || undefined, to: to || undefined };
      if (kind === 'csv') onExportCsv();
      else if (kind === 'mua') {
        const { downloadMuaExport } = await import('../muaPerformanceExport');
        await downloadMuaExport(from, to);
      } else if (kind === 'school' && school) await onExportExcel({ kind: 'school', schoolId: school.id }, range, school.code || school.name);
      else if (kind !== 'school') await onExportExcel({ kind }, range);
      setOpen(false);
      triggerRef.current?.focus();
    } catch (error) {
      setExportError(workflowError(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="animate-enter relative z-30 overflow-visible bg-obsidian text-white p-5 sm:p-6 mb-6 border-2 border-line shadow-lux-gold flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <div className="flex items-center gap-2 mb-1.5">
          <span className="font-mono text-[10px] font-black uppercase tracking-widest bg-gold text-on-gold px-2 py-0.5">
            Admin Workspace
          </span>
          <span className="flex items-center gap-1 font-mono text-[10px] text-emerald-400">
            <Activity className="w-3 h-3 animate-pulse" /> LAN Sync Active
          </span>
        </div>
        <h1 className="text-xl sm:text-2xl font-black tracking-tight uppercase text-white">
          System <span className="text-gold">Administration</span>
        </h1>
      </div>

      <div ref={panelRef} className="relative self-start sm:self-auto">
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen((value) => !value)}
          disabled={exporting}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls="admin-export-panel"
          className="btn-tactile min-h-[42px] flex items-center justify-center gap-2 px-4 py-2 bg-gold text-on-gold text-xs font-black uppercase tracking-wider cursor-pointer disabled:cursor-wait disabled:opacity-60"
        >
          <FileSpreadsheet className="w-4 h-4 stroke-[2.5]" />
          <span>{exporting ? 'Exporting…' : 'Export'}</span>
          {!exporting && <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />}
        </button>

        {open && (
          <div
            id="admin-export-panel"
            role="dialog"
            aria-label="Export"
            className="absolute left-0 top-full z-50 mt-2 w-[min(24rem,calc(100vw-2rem))] border-2 border-gold bg-obsidian p-4 shadow-lux-gold sm:left-auto sm:right-0 space-y-4 font-mono text-xs text-white"
          >
            <div className="flex items-center justify-between">
              <span className="font-black uppercase tracking-wider text-gold">Export</span>
              <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="p-1 hover:text-gold cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <fieldset disabled={exporting} className="space-y-1.5">
              <legend className="mb-1.5 font-bold uppercase text-neutral-400 text-[10px]">What to export</legend>
              {[KINDS, OTHER_EXPORTS].map((options, index) => (
                <div key={options[0].id} role={index ? 'group' : undefined} aria-labelledby={index ? 'admin-export-others' : undefined} className="space-y-1.5">
                  {index === 1 && <h2 id="admin-export-others" className="pt-2 font-bold uppercase text-neutral-400 text-[10px]">Others</h2>}
                  {options.map(({ id, label, hint }) => (
                    <label key={id} className={`flex gap-2 p-2 border cursor-pointer ${kind === id ? 'border-gold bg-obsidian-2' : 'border-neutral-700 hover:border-neutral-500'}`}>
                      <input type="radio" name="export-kind" value={id} checked={kind === id}
                        onChange={() => { setKind(id); setExportError(''); }} className="mt-0.5 accent-gold" />
                      <span>
                        <span className="block font-bold">{label}</span>
                        <span className="block text-[10px] text-neutral-400">{hint}</span>
                      </span>
                    </label>
                  ))}
                </div>
              ))}
            </fieldset>

            {kind === 'school' && (
              <div className="text-ink">
                <label htmlFor="export-school" className="mb-1 block font-bold uppercase text-neutral-400 text-[10px]">School</label>
                <SearchableSelect
                  id="export-school"
                  value={schoolId}
                  onChange={setSchoolId}
                  options={schoolOptions}
                  placeholder="Type a school name or code"
                  emptyText="No school matches. Try the school code."
                  className="w-full min-h-10 border-2 border-line bg-canvas py-2 font-bold text-xs text-ink"
                />
              </div>
            )}

            <fieldset disabled={kind === 'csv' || exporting} className="space-y-2 disabled:opacity-40">
              <legend className="mb-1 font-bold uppercase text-neutral-400 text-[10px]">{mua ? 'MUA report period · Philippine time' : 'Dates (optional)'}</legend>
              <div className="flex flex-wrap gap-1.5">
                {([['all', 'All dates'], ['month', 'This month'], ['today', 'Today']] as const).map(([preset, text]) => (
                  <button key={preset} type="button" disabled={mua && preset === 'all' && !start} onClick={() => setQuick(preset)}
                    className="px-2 py-1 border border-neutral-600 hover:border-gold uppercase text-[10px] font-bold cursor-pointer disabled:opacity-40">
                    {text}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="block text-[10px] text-neutral-400 mb-0.5">From</span>
                  <input type="date" value={from} min={start || undefined} max={to || (mua ? today : undefined)}
                    onChange={(e) => setRange({ from: clampDay(e.target.value, start, to || (mua ? today : undefined)), to })}
                    className="w-full p-1.5 bg-canvas text-ink border border-line" />
                </label>
                <label className="block">
                  <span className="block text-[10px] text-neutral-400 mb-0.5">To</span>
                  <input type="date" value={to} min={from || start || undefined} max={mua ? today : undefined}
                    onChange={(e) => setRange({ from, to: clampDay(e.target.value, from || start, mua ? today : undefined) })}
                    className="w-full p-1.5 bg-canvas text-ink border border-line" />
                </label>
              </div>
              <p className={`text-[10px] ${badRange ? 'text-red-400 font-bold' : 'text-neutral-400'}`}>
                {badRange ? '"From" must be on or before "To".'
                  : mua ? 'The selected period applies to all MUA worksheets.'
                    : 'Uses the pictorial date (or the registration date when there is none). Leave both empty for everything.'}
              </p>
            </fieldset>

            {exportError && <p role="alert" className="text-red-400">{exportError}</p>}
            <button
              type="button"
              onClick={() => void runExport()}
              disabled={!canExport}
              className="btn-tactile w-full min-h-[42px] flex items-center justify-center gap-2 bg-gold text-on-gold font-black uppercase tracking-wider cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Download className="w-4 h-4" />
              {kind === 'school' && !school ? 'Choose a school first' : kind === 'csv' ? 'Download CSV' : 'Download Excel'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
