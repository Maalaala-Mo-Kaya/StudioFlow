import React from 'react';
import {
  TrendingUp,
  Building,
  Package as PackageIcon,
  UploadCloud,
  ShieldCheck,
  Frame,
  Users,
} from 'lucide-react';
import type { AdminTab } from '../useAdminData';

interface AdminNavTabsProps {
  activeTab: AdminTab;
  onSelectTab: (tab: AdminTab) => void;
}

export const AdminNavTabs: React.FC<AdminNavTabsProps> = ({ activeTab, onSelectTab }) => {
  return (
    <div className="animate-enter-delay-1 grid grid-cols-2 sm:flex sm:flex-wrap gap-2 mb-6 bg-white p-2 border-2 border-[#0A0A0A]">
      <button
        type="button"
        onClick={() => onSelectTab('metrics')}
        className={`btn-tactile min-h-[42px] flex items-center justify-center gap-2 px-4 py-2 text-xs font-black uppercase tracking-wider border cursor-pointer ${
          activeTab === 'metrics'
            ? 'bg-[#0A0A0A] text-[#C9A227] border-[#0A0A0A]'
            : 'bg-[#F8F7F4] text-neutral-700 border-neutral-300 hover:border-[#0A0A0A]'
        }`}
      >
        <TrendingUp className="w-4 h-4 shrink-0" />
        <span>Analytics &amp; Overview</span>
      </button>

      <button
        type="button"
        onClick={() => onSelectTab('orgs')}
        className={`btn-tactile min-h-[42px] flex items-center justify-center gap-2 px-4 py-2 text-xs font-black uppercase tracking-wider border cursor-pointer ${
          activeTab === 'orgs'
            ? 'bg-[#0A0A0A] text-[#C9A227] border-[#0A0A0A]'
            : 'bg-[#F8F7F4] text-neutral-700 border-neutral-300 hover:border-[#0A0A0A]'
        }`}
      >
        <Building className="w-4 h-4 shrink-0" />
        <span>Schools &amp; Courses</span>
      </button>

      <button
        type="button"
        onClick={() => onSelectTab('packages')}
        className={`btn-tactile min-h-[42px] flex items-center justify-center gap-2 px-4 py-2 text-xs font-black uppercase tracking-wider border cursor-pointer ${
          activeTab === 'packages'
            ? 'bg-[#0A0A0A] text-[#C9A227] border-[#0A0A0A]'
            : 'bg-[#F8F7F4] text-neutral-700 border-neutral-300 hover:border-[#0A0A0A]'
        }`}
      >
        <PackageIcon className="w-4 h-4 shrink-0" />
        <span>Packages</span>
      </button>

      <button
        type="button"
        onClick={() => onSelectTab('roster')}
        className={`btn-tactile min-h-[42px] flex items-center justify-center gap-2 px-4 py-2 text-xs font-black uppercase tracking-wider border cursor-pointer ${
          activeTab === 'roster'
            ? 'bg-[#0A0A0A] text-[#C9A227] border-[#0A0A0A]'
            : 'bg-[#F8F7F4] text-neutral-700 border-neutral-300 hover:border-[#0A0A0A]'
        }`}
      >
        <UploadCloud className="w-4 h-4 shrink-0" />
        <span>Master Roster</span>
      </button>

      <button
        type="button"
        onClick={() => onSelectTab('students')}
        className={`btn-tactile min-h-[42px] flex items-center justify-center gap-2 px-4 py-2 text-xs font-black uppercase tracking-wider border cursor-pointer ${
          activeTab === 'students'
            ? 'bg-[#0A0A0A] text-[#C9A227] border-[#0A0A0A]'
            : 'bg-[#F8F7F4] text-neutral-700 border-neutral-300 hover:border-[#0A0A0A]'
        }`}
      >
        <Users className="w-4 h-4 shrink-0" />
        <span>Students</span>
      </button>

      <button
        type="button"
        onClick={() => onSelectTab('framing')}
        className={`btn-tactile min-h-[42px] flex items-center justify-center gap-2 px-4 py-2 text-xs font-black uppercase tracking-wider border cursor-pointer ${
          activeTab === 'framing'
            ? 'bg-[#0A0A0A] text-[#C9A227] border-[#0A0A0A]'
            : 'bg-[#F8F7F4] text-neutral-700 border-neutral-300 hover:border-[#0A0A0A]'
        }`}
      >
        <Frame className="w-4 h-4 shrink-0" />
        <span>Framing Schedule</span>
      </button>

      <button
        type="button"
        onClick={() => onSelectTab('staff')}
        className={`btn-tactile col-span-2 sm:col-span-1 min-h-[42px] flex items-center justify-center gap-2 px-4 py-2 text-xs font-black uppercase tracking-wider border cursor-pointer ${
          activeTab === 'staff'
            ? 'bg-[#0A0A0A] text-[#C9A227] border-[#0A0A0A]'
            : 'bg-[#F8F7F4] text-neutral-700 border-neutral-300 hover:border-[#0A0A0A]'
        }`}
      >
        <ShieldCheck className="w-4 h-4 shrink-0" />
        <span>Staff Accounts</span>
      </button>
    </div>
  );
};
