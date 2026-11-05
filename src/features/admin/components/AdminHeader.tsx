import React from 'react';
import { FileSpreadsheet, Activity } from 'lucide-react';

interface AdminHeaderProps {
  onExportCsv: () => void;
}

export const AdminHeader: React.FC<AdminHeaderProps> = ({ onExportCsv }) => {
  return (
    <div className="animate-enter bg-[#0A0A0A] text-white p-5 sm:p-6 mb-6 border-2 border-[#0A0A0A] shadow-[4px_4px_0px_#C9A227] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
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

      <button
        type="button"
        onClick={onExportCsv}
        className="btn-tactile min-h-[42px] flex items-center justify-center gap-2 px-4 py-2 bg-[#C9A227] text-[#0A0A0A] text-xs font-black uppercase tracking-wider self-start sm:self-auto cursor-pointer"
      >
        <FileSpreadsheet className="w-4 h-4 stroke-[2.5]" />
        <span>Export Master CSV</span>
      </button>
    </div>
  );
};
