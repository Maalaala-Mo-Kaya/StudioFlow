import React, { useState } from 'react';
import {
  TrendingUp,
  Building,
  Package as PackageIcon,
  UploadCloud,
  ShieldCheck,
  Frame,
  Users,
  Menu,
  X,
  ChevronRight,
} from 'lucide-react';
import type { AdminTab } from '../useAdminData';

interface AdminSidebarNavProps {
  activeTab: AdminTab;
  onSelectTab: (tab: AdminTab) => void;
  studentCount?: number;
  packageCount?: number;
  schoolCount?: number;
}

interface NavItem {
  id: AdminTab;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
}

export const AdminSidebarNav: React.FC<AdminSidebarNavProps> = ({
  activeTab,
  onSelectTab,
  studentCount,
  packageCount,
  schoolCount,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems: NavItem[] = [
    {
      id: 'metrics',
      label: 'Analytics & Overview',
      shortLabel: 'Overview',
      icon: TrendingUp,
    },
    {
      id: 'students',
      label: 'Students Directory',
      shortLabel: 'Students',
      icon: Users,
      badge: studentCount,
    },
    {
      id: 'packages',
      label: 'Packages & Add-ons',
      shortLabel: 'Packages',
      icon: PackageIcon,
      badge: packageCount,
    },
    {
      id: 'orgs',
      label: 'Schools & Courses',
      shortLabel: 'Schools',
      icon: Building,
      badge: schoolCount,
    },
    {
      id: 'roster',
      label: 'Master Roster',
      shortLabel: 'Roster',
      icon: UploadCloud,
    },
    {
      id: 'framing',
      label: 'Framing Schedule',
      shortLabel: 'Framing',
      icon: Frame,
    },
    {
      id: 'staff',
      label: 'Staff Accounts',
      shortLabel: 'Staff',
      icon: ShieldCheck,
    },
  ];

  const handleSelect = (tab: AdminTab) => {
    onSelectTab(tab);
    setMobileMenuOpen(false);
  };

  const activeItem = navItems.find((n) => n.id === activeTab) || navItems[0];

  return (
    <>
      {/* Mobile Top Header Dropdown / Toggle */}
      <div className="lg:hidden mb-4 bg-white border-2 border-[#0A0A0A] shadow-[4px_4px_0px_#0A0A0A] p-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <activeItem.icon className="w-4 h-4 text-[#C9A227]" />
          <span className="font-mono text-xs font-black uppercase text-[#0A0A0A]">
            {activeItem.label}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setMobileMenuOpen((prev) => !prev)}
          className="btn-tactile flex items-center gap-1.5 px-3 py-1.5 bg-[#0A0A0A] text-[#C9A227] text-[10px] font-black uppercase tracking-wider cursor-pointer"
        >
          {mobileMenuOpen ? <X className="w-3.5 h-3.5" /> : <Menu className="w-3.5 h-3.5" />}
          <span>{mobileMenuOpen ? 'Close Menu' : 'Sections'}</span>
        </button>
      </div>

      {/* Mobile Collapsible Drawer */}
      {mobileMenuOpen && (
        <div className="lg:hidden mb-4 bg-[#F8F7F4] border-2 border-[#0A0A0A] shadow-[6px_6px_0px_#0A0A0A] p-2 space-y-1.5 font-mono text-xs animate-enter">
          {navItems.map((item) => {
            const isSelected = activeTab === item.id;
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelect(item.id)}
                className={`w-full min-h-[42px] px-3.5 py-2 flex items-center justify-between border text-left cursor-pointer transition-colors ${
                  isSelected
                    ? 'bg-[#0A0A0A] text-[#C9A227] border-[#0A0A0A] font-black'
                    : 'bg-white text-neutral-800 border-neutral-300 hover:border-[#0A0A0A]'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="uppercase tracking-wider">{item.label}</span>
                </div>
                {item.badge !== undefined && (
                  <span
                    className={`text-[10px] font-mono px-1.5 py-0.5 ${
                      isSelected ? 'bg-[#C9A227] text-[#0A0A0A] font-black' : 'bg-neutral-100 text-neutral-600'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Desktop Persistent Vertical Sidebar */}
      <nav
        aria-label="Admin Sections"
        className="hidden lg:flex flex-col justify-between w-64 shrink-0 bg-white border-2 border-[#0A0A0A] shadow-[6px_6px_0px_#0A0A0A] p-3 font-mono text-xs space-y-4 self-start sticky top-6"
      >
        <div>
          <div className="pb-2.5 mb-3 border-b-2 border-[#0A0A0A] flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#9A7816]">
              Admin Sections
            </span>
            <span className="text-[9px] font-mono text-neutral-400">7 TABS</span>
          </div>

          <div className="space-y-1.5">
            {navItems.map((item) => {
              const isSelected = activeTab === item.id;
              const Icon = item.icon;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectTab(item.id)}
                  className={`btn-tactile w-full min-h-[44px] px-3 py-2.5 flex items-center justify-between border text-left cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-[#0A0A0A] text-[#C9A227] border-[#0A0A0A] font-black shadow-[3px_3px_0px_#C9A227]'
                      : 'bg-[#F8F7F4] text-neutral-700 border-neutral-300 hover:border-[#0A0A0A] hover:bg-neutral-100'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="text-[11px] uppercase tracking-wider truncate">
                      {item.label}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 shrink-0 ml-1">
                    {item.badge !== undefined && (
                      <span
                        className={`text-[9px] font-mono px-1.5 py-0.5 ${
                          isSelected
                            ? 'bg-[#C9A227] text-[#0A0A0A] font-black'
                            : 'bg-neutral-200 text-neutral-700 font-bold'
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                    {isSelected && <ChevronRight className="w-3.5 h-3.5 text-[#C9A227]" />}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Studio Branding / System Version */}
        <div className="pt-3 border-t border-neutral-200 text-[10px] text-neutral-400 flex items-center justify-between">
          <span className="font-bold uppercase tracking-wider text-neutral-600">StudioFlow v2</span>
          <span className="font-mono text-emerald-600 font-bold">● LAN Ready</span>
        </div>
      </nav>
    </>
  );
};
