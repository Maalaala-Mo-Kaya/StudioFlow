import React, { useEffect, useRef, useState } from 'react';
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
  ChevronDown,
  ListChecks,
  Aperture,
  Shapes,
  ScanText,
  BookOpenCheck,
  QrCode,
  TriangleAlert,
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
  /** Shown indented under this section, as its sub-tab. */
  parent?: AdminTab;
}

export const AdminSidebarNav: React.FC<AdminSidebarNavProps> = ({
  activeTab,
  onSelectTab,
  studentCount,
  packageCount,
  schoolCount,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isMobileModal, setIsMobileModal] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches,
  );
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 768px)');
    const updateMobileMode = () => setIsMobileModal(mediaQuery.matches);

    updateMobileMode();
    mediaQuery.addEventListener('change', updateMobileMode);
    return () => mediaQuery.removeEventListener('change', updateMobileMode);
  }, []);

  useEffect(() => {
    if (!mobileMenuOpen || !isMobileModal) return;

    const originalOverflow = document.body.style.overflow;
    const menuTrigger = menuTriggerRef.current;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setMobileMenuOpen(false);
        return;
      }

      if (event.key !== 'Tab' || !dialogRef.current) return;

      const focusableElements = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.offsetParent !== null);

      if (focusableElements.length === 0) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      } else if (!dialogRef.current.contains(document.activeElement)) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = originalOverflow;
      menuTrigger?.focus();
    };
  }, [isMobileModal, mobileMenuOpen]);

  const navItems: NavItem[] = [
    {
      id: 'metrics',
      label: 'Analytics & Overview',
      shortLabel: 'Overview',
      icon: TrendingUp,
    },
    {
      id: 'ledger',
      label: 'Settlement & Ledger',
      shortLabel: 'Ledger',
      icon: BookOpenCheck,
      parent: 'metrics',
    },
    {
      id: 'students',
      label: 'Clients Directory',
      shortLabel: 'Clients',
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
      id: 'catalog-import',
      label: 'Import from File',
      shortLabel: 'Import',
      icon: ScanText,
      parent: 'packages',
    },
    {
      id: 'clients',
      label: 'Client Types & Sessions',
      shortLabel: 'Client Types',
      icon: Shapes,
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
      label: 'Production & Pickup',
      shortLabel: 'Production',
      icon: Frame,
    },
    {
      id: 'workflow',
      label: 'Makeup & Photo Selection',
      shortLabel: 'Studio Workflow',
      icon: ListChecks,
    },
    {
      id: 'camera',
      label: 'Camera Import',
      shortLabel: 'Camera',
      icon: Aperture,
    },
    {
      id: 'qr-codes',
      label: 'QR Code Generator',
      shortLabel: 'QR Codes',
      icon: QrCode,
    },
    {
      id: 'staff',
      label: 'Staff Accounts',
      shortLabel: 'Staff',
      icon: ShieldCheck,
    },
    {
      id: 'devcon',
      label: 'DEV CON',
      shortLabel: 'DEV CON',
      icon: TriangleAlert,
    },
  ];

  const handleSelect = (tab: AdminTab) => {
    onSelectTab(tab);
    setMobileMenuOpen(false);
  };

  const activeItem = navItems.find((n) => n.id === activeTab) || navItems[0];
  // Sub-tabs show only while their section (or the sub-tab itself) is open.
  const visibleItems = navItems.filter((n) => !n.parent || activeTab === n.parent || activeTab === n.id);
  const hasChildren = (item: NavItem) => navItems.some((n) => n.parent === item.id);
  /** A section whose sub-tab is the open page: outlined, not filled, so only one item looks selected. */
  const childOpen = (item: NavItem) => navItems.some((n) => n.parent === item.id && n.id === activeTab);
  const expanded = (item: NavItem) => hasChildren(item) && (activeTab === item.id || childOpen(item));

  return (
    <>
      {/* Mobile Top Header Dropdown / Toggle */}
      <div className="lg:hidden mb-4 w-full bg-panel border-2 border-line shadow-lux p-2.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <activeItem.icon className="w-4 h-4 text-gold" />
          <span className="font-mono text-xs font-black uppercase text-ink truncate">
            {activeItem.label}
          </span>
        </div>
        <button
          ref={menuTriggerRef}
          type="button"
          onClick={() => setMobileMenuOpen((prev) => !prev)}
          aria-expanded={mobileMenuOpen}
          aria-haspopup={isMobileModal ? 'dialog' : undefined}
          aria-controls="admin-mobile-navigation"
          className="btn-tactile flex items-center gap-1.5 px-3 py-1.5 bg-obsidian text-gold text-[10px] font-black uppercase tracking-wider cursor-pointer"
        >
          {mobileMenuOpen ? (
            <>
              <X className="w-3.5 h-3.5 max-[768px]:hidden" />
              <Menu className="hidden w-3.5 h-3.5 max-[768px]:block" />
            </>
          ) : (
            <Menu className="w-3.5 h-3.5" />
          )}
          <span className="max-[768px]:hidden">{mobileMenuOpen ? 'Close Menu' : 'Sections'}</span>
          <span className="hidden max-[768px]:inline">Sections</span>
        </button>
      </div>

      {/* Mobile Collapsible Drawer */}
      {mobileMenuOpen && (
        <>
          <div
            aria-hidden="true"
            className="hidden max-[768px]:block fixed inset-0 z-40 bg-[rgba(0,0,0,0.6)]"
          />
          <div
            ref={dialogRef}
            id="admin-mobile-navigation"
            role={isMobileModal ? 'dialog' : undefined}
            aria-modal={isMobileModal ? true : undefined}
            aria-labelledby={isMobileModal ? 'admin-mobile-navigation-title' : undefined}
            tabIndex={isMobileModal ? -1 : undefined}
            className="lg:hidden mb-4 bg-canvas border-2 border-line shadow-lux p-2 font-mono text-xs animate-enter max-[768px]:animate-none max-[768px]:fixed max-[768px]:z-50 max-[768px]:top-6 max-[768px]:left-1/2 max-[768px]:-translate-x-1/2 max-[768px]:w-[calc(100vw-32px)] max-[768px]:max-w-[430px] max-[768px]:max-h-[calc(100dvh-48px)] max-[768px]:mb-0 max-[768px]:flex max-[768px]:flex-col"
          >
            <div className="hidden max-[768px]:flex sticky top-0 z-10 items-center justify-between gap-3 mb-2 p-2 bg-canvas border-b-2 border-line">
              <span id="admin-mobile-navigation-title" className="font-black uppercase tracking-wider text-ink">
                Admin Sections
              </span>
              <button
                ref={closeButtonRef}
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Close navigation menu"
                className="btn-tactile shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-obsidian text-gold text-[10px] font-black uppercase tracking-wider cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                <span>Close</span>
              </button>
            </div>

          <div className="space-y-1.5 max-[768px]:overflow-y-auto max-[768px]:overscroll-contain max-[768px]:pr-1">
            {visibleItems.map((item) => {
              const isSelected = activeTab === item.id;
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelect(item.id)}
                  aria-expanded={hasChildren(item) ? expanded(item) : undefined}
                  className={`${item.parent ? 'ml-6 w-[calc(100%-1.5rem)] min-h-[38px] animate-enter' : 'w-full min-h-[42px]'} px-3.5 py-2 flex items-center justify-between border text-left cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-obsidian text-gold border-line font-black'
                      : childOpen(item)
                        ? 'bg-panel text-gold-soft border-gold font-black'
                        : 'bg-panel text-neutral-800 border-neutral-300 hover:border-line'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="uppercase tracking-wider">{item.label}</span>
                  </div>
                  {item.badge !== undefined && (
                    <span
                      className={`shrink-0 ml-2 text-[10px] font-mono px-1.5 py-0.5 ${
                        isSelected ? 'bg-gold text-on-gold font-black' : 'bg-neutral-100 text-neutral-600'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          </div>
        </>
      )}

      {/* Desktop Persistent Vertical Sidebar */}
      <nav
        aria-label="Admin Sections"
        className="hidden lg:flex flex-col justify-between w-64 shrink-0 bg-panel border-2 border-line shadow-lux p-3 font-mono text-xs space-y-4 self-start sticky top-6"
      >
        <div>
          <div className="pb-2.5 mb-3 border-b-2 border-line flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-gold-soft">
              Admin Sections
            </span>
            <span className="text-[9px] font-mono text-ink">{navItems.filter((n) => !n.parent).length} TABS</span>
          </div>

          <div className="space-y-1.5">
            {visibleItems.map((item) => {
              const isSelected = activeTab === item.id;
              const Icon = item.icon;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectTab(item.id)}
                  aria-expanded={hasChildren(item) ? expanded(item) : undefined}
                  className={`btn-tactile ${item.parent ? 'ml-5 w-[calc(100%-1.25rem)] min-h-[36px] py-1.5 animate-enter' : 'w-full min-h-[44px] py-2.5'} px-3 flex items-center justify-between border text-left cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-obsidian text-gold border-line font-black shadow-lux-gold'
                      : childOpen(item)
                        ? 'bg-canvas text-gold-soft border-gold font-black'
                        : 'bg-canvas text-neutral-700 border-neutral-300 hover:border-line hover:bg-neutral-100'
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
                            ? 'bg-gold text-on-gold font-black'
                            : 'bg-neutral-200 text-neutral-700 font-bold'
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                    {expanded(item)
                      ? <ChevronDown className="w-3.5 h-3.5 text-gold" />
                      : isSelected && <ChevronRight className="w-3.5 h-3.5 text-gold" />}
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
