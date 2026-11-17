import React from 'react';
import { LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { ADMIN_STATION_LINKS, ROLE_DEFAULT_ROUTE, STUDIO_INFO } from '../constants/studio';

interface NavbarProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
  queueCount?: number;
}

export const Navbar: React.FC<NavbarProps> = ({ currentTab, onSelectTab, queueCount = 0 }) => {
  const { user, logout } = useAuth();
  const stations = user?.role === 'admin' ? ADMIN_STATION_LINKS
    : ADMIN_STATION_LINKS.filter((station) => user && station.id === ROLE_DEFAULT_ROUTE[user.role]);

  const handleSignOut = () => {
    logout();
    onSelectTab('login');
  };

  const handleMastheadClick = () => {
    if (!user) {
      onSelectTab('register');
      return;
    }
    onSelectTab(ROLE_DEFAULT_ROUTE[user.role] || 'register');
  };

  return (
    <header
      role="banner"
      className="no-print bg-[#0A0A0A] text-white border-b border-[#C9A227]/40 sticky top-0 z-40"
    >
      <div className="w-full max-w-[1680px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-12">
        <div className="flex items-center justify-between h-16">
          {/* Studio Masthead Identity */}
          <button
            type="button"
            onClick={handleMastheadClick}
            className="flex min-w-0 items-center gap-2 sm:gap-3.5 text-left group focus:outline-none cursor-pointer"
          >
            <div className="w-9 h-9 shrink-0 bg-[#C9A227] text-[#0A0A0A] rounded-none flex items-center justify-center font-mono font-black text-sm tracking-tighter border border-[#DFC15D] transition-transform duration-200 group-hover:scale-95">
              {STUDIO_INFO.shortCode}
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <span className="font-black text-sm sm:text-base tracking-[0.14em] uppercase text-white">
                  Hi-Light <span className="text-[#C9A227]">Studio</span>
                </span>
                <span className="hidden sm:inline-block text-[10px] font-mono uppercase tracking-widest text-neutral-500 border-l border-neutral-800 pl-2.5">
                  {STUDIO_INFO.shortAddress}
                </span>
              </div>
              <div className="flex items-center gap-2 text-[10px] font-mono text-neutral-400 tracking-wider uppercase">
                <span className="w-1.5 h-1.5 bg-[#C9A227] inline-block animate-status-pulse" />
                <span>LAN System Online</span>
                {queueCount > 0 && user && (
                  <span className="text-[#C9A227] font-bold">• {queueCount} Active in Queue</span>
                )}
              </div>
            </div>
          </button>

          {/* Right Side: Minimal Staff Session or Single Login Trigger */}
          <div className="flex items-center gap-3">
            {user && (
              <div className="flex items-center gap-2 sm:gap-3">
                {stations.length > 0 && (
                  <nav aria-label="Staff stations" className="hidden lg:flex items-center border border-neutral-800 bg-[#141414]">
                    {stations.map((st) => (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => onSelectTab(st.id)}
                        className={`px-3 py-1.5 text-[10px] font-mono font-bold uppercase tracking-widest transition-colors cursor-pointer ${currentTab === st.id
                            ? 'bg-[#C9A227] text-[#0A0A0A]'
                            : 'text-neutral-400 hover:text-white'
                          }`}
                      >
                        {st.label}
                      </button>
                    ))}
                  </nav>
                )}

                <div className="flex items-center gap-2.5 border border-neutral-800 bg-[#141414] px-3 py-1.5">
                  <div className="text-right">
                    <div className="max-w-[27vw] sm:max-w-40 truncate text-xs font-bold text-white leading-none">{user.name}</div>
                    <div className="text-[9px] font-mono font-bold text-[#C9A227] uppercase tracking-widest mt-1">
                      ROLE // {user.role}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleSignOut}
                    title="Sign out"
                    className="btn-tactile ml-1 px-2.5 py-1.5 bg-[#0A0A0A] hover:bg-white text-neutral-300 hover:text-[#0A0A0A] border border-neutral-700 text-[10px] font-mono font-bold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer"
                  >
                    <LogOut className="w-3 h-3" />
                    <span className="hidden sm:inline">Exit</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Mobile Admin Station Bar */}
        {stations.length > 0 && (
          <nav aria-label="Staff stations" className="grid grid-cols-3 sm:flex lg:hidden border-t border-neutral-800 bg-[#141414] py-1.5 gap-1">
            {stations.map((st) => (
              <button
                key={st.id}
                type="button"
                onClick={() => onSelectTab(st.id)}
                className={`px-2.5 py-1 text-[10px] font-mono font-bold uppercase tracking-wider transition-colors ${
                  currentTab === st.id ? 'bg-[#C9A227] text-[#0A0A0A]' : 'text-neutral-400'
                }`}
              >
                {st.label}
              </button>
            ))}
          </nav>
        )}
      </div>
    </header>
  );
};
