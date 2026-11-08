import React, { useEffect, useRef, useState } from 'react';
import { Activity, ChevronDown, FileSpreadsheet, FileText } from 'lucide-react';

interface AdminHeaderProps {
  onExportCsv: () => void;
  onExportExcel: () => Promise<void>;
  exportingExcel: boolean;
}

export const AdminHeader: React.FC<AdminHeaderProps> = ({ onExportCsv, onExportExcel, exportingExcel }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [exportingFormat, setExportingFormat] = useState<'csv' | 'excel' | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const exporting = exportingFormat !== null || exportingExcel;

  useEffect(() => {
    if (!menuOpen) return;

    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!dropdownRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setMenuOpen(false);
      triggerRef.current?.focus();
    };

    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [menuOpen]);

  const runExport = async (format: 'csv' | 'excel') => {
    if (exporting) return;
    setMenuOpen(false);
    setExportingFormat(format);
    try {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      if (format === 'csv') onExportCsv();
      else await onExportExcel();
    } finally {
      setExportingFormat(null);
      triggerRef.current?.focus();
    }
  };

  const moveMenuFocus = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const options = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
    const current = options.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === 'Home' ? 0
      : event.key === 'End' ? options.length - 1
      : event.key === 'ArrowDown' ? (current + 1) % options.length
      : (current - 1 + options.length) % options.length;
    options[next]?.focus();
  };

  return (
    <div className="animate-enter relative z-30 overflow-visible bg-[#0A0A0A] text-white p-5 sm:p-6 mb-6 border-2 border-[#0A0A0A] shadow-[4px_4px_0px_#C9A227] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <div className="flex items-center gap-2 mb-1.5">
          <span className="font-mono text-[10px] font-black uppercase tracking-widest bg-[#C9A227] text-[#0A0A0A] px-2 py-0.5">
            Admin Workspace
          </span>
          <span className="flex items-center gap-1 font-mono text-[10px] text-emerald-400">
            <Activity className="w-3 h-3 animate-pulse" /> LAN Sync Active
          </span>
        </div>
        <h1 className="text-xl sm:text-2xl font-black tracking-tight uppercase text-white">
          System <span className="text-[#C9A227]">Administration</span>
        </h1>
      </div>

      <div ref={dropdownRef} className="relative self-start sm:self-auto">
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          disabled={exporting}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-controls="admin-export-menu"
          className="btn-tactile min-h-[42px] flex items-center justify-center gap-2 px-4 py-2 bg-[#C9A227] text-[#0A0A0A] text-xs font-black uppercase tracking-wider cursor-pointer disabled:cursor-wait disabled:opacity-60"
        >
          <FileSpreadsheet className="w-4 h-4 stroke-[2.5]" />
          <span>{exporting ? `Exporting ${exportingFormat === 'csv' ? 'CSV' : 'Excel'}…` : 'Export'}</span>
          {!exporting && <ChevronDown className={`w-3.5 h-3.5 transition-transform ${menuOpen ? 'rotate-180' : ''}`} />}
        </button>

        {menuOpen && (
          <div
            id="admin-export-menu"
            role="menu"
            aria-label="Export format"
            onKeyDown={moveMenuFocus}
            className="absolute left-0 top-full z-50 mt-2 w-44 border-2 border-[#C9A227] bg-[#0A0A0A] p-1 shadow-[4px_4px_0px_#C9A227] sm:left-auto sm:right-0"
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => void runExport('csv')}
              className="flex min-h-[42px] w-full items-center gap-2 px-3 py-2 text-left font-mono text-xs font-black uppercase tracking-wider text-white hover:bg-[#C9A227] hover:text-[#0A0A0A] focus:bg-[#C9A227] focus:text-[#0A0A0A] focus:outline-none"
            >
              <FileText className="h-4 w-4" /> CSV
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => void runExport('excel')}
              className="flex min-h-[42px] w-full items-center gap-2 px-3 py-2 text-left font-mono text-xs font-black uppercase tracking-wider text-white hover:bg-[#C9A227] hover:text-[#0A0A0A] focus:bg-[#C9A227] focus:text-[#0A0A0A] focus:outline-none"
            >
              <FileSpreadsheet className="h-4 w-4" /> Excel
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
