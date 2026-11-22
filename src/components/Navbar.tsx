import React from 'react';
import { LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { ThemeToggle } from './ThemeToggle';
import { ADMIN_STATION_LINKS, ROLE_DEFAULT_ROUTE, STUDIO_INFO } from '../constants/studio';

interface NavbarProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
  queueCount?: number;
}

function StudioStatus({ queueCount }: { queueCount: number }) {
  return (
    <div className="flex min-w-0 items-center gap-2 text-[10px] font-mono text-neutral-400 tracking-wider uppercase">
      <span aria-hidden="true" className="size-1.5 shrink-0 bg-gold animate-status-pulse" />
      <span className="truncate">LAN System Online</span>
      {queueCount > 0 && <span className="truncate text-gold font-bold">• {queueCount} Active in Queue</span>}
    </div>
  );
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
      className="theme-night no-print relative bg-obsidian text-white sticky top-0 z-40 shadow-[0_10px_30px_-18px_rgb(212_175_55/0.45)]"
    >
      <div aria-hidden="true" className="gold-rule absolute inset-x-0 bottom-0" />
      <div className="w-full max-w-[1680px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-12">
        <div className="flex h-16 items-center justify-between gap-2 sm:gap-3">
          {/* Studio Masthead Identity */}
          <button
            type="button"
            onClick={handleMastheadClick}
            className="group flex min-w-0 shrink-0 items-center gap-2 text-left cursor-pointer focus-visible:outline-2 focus-visible:outline-gold md:shrink md:gap-3.5"
          >
            <img
              src="/logo/hi-light-gold.jpg"
              alt={STUDIO_INFO.shortCode}
              className="h-10 w-auto shrink-0 mix-blend-lighten transition-transform duration-300 group-hover:scale-[1.03] min-[360px]:h-12"
            />
            <div className="hidden min-w-0 border-l border-gold/25 pl-3 md:block">
              <div className="flex items-center gap-2.5">
                <span className="truncate font-display font-semibold text-base tracking-[0.18em] uppercase text-foil">
                  Hi-Light Studio
                </span>
                <span className="hidden shrink-0 whitespace-nowrap text-[10px] font-mono uppercase tracking-widest text-neutral-500 border-l border-neutral-800 pl-2.5 2xl:inline-block">
                  {STUDIO_INFO.shortAddress}
                </span>
              </div>
              <StudioStatus queueCount={user ? queueCount : 0} />
            </div>
          </button>

          {/* Right Side: Minimal Staff Session or Single Login Trigger */}
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <ThemeToggle />
            {user && currentTab === 'register' && (
              // The kiosk is the public client form: it never sends the staff sign-in kept on this browser.
              <span title={`Registrations on this page are sent as a client, not as ${user.name}.`}
                className="hidden sm:inline-flex shrink-0 items-center border border-gold/60 px-2 py-1 text-[9px] font-mono font-bold uppercase tracking-widest text-gold">
                Kiosk · public form
              </span>
            )}
            {user && (
              <div className="flex min-w-0 items-center gap-2 sm:gap-3">
                {stations.length > 0 && (
                  <nav aria-label="Staff stations" className="hidden shrink-0 items-center border border-neutral-800 bg-obsidian-2 xl:flex">
                    {stations.map((st) => (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => onSelectTab(st.id)}
                        className={`px-3 py-1.5 text-[10px] font-mono font-bold uppercase tracking-widest transition-colors cursor-pointer ${currentTab === st.id
                            ? 'bg-gold text-on-gold'
                            : 'text-neutral-400 hover:text-white'
                          }`}
                      >
                        {st.label}
                      </button>
                    ))}
                  </nav>
                )}

                <div className="flex min-w-0 items-center gap-2 border border-neutral-800 bg-obsidian-2 px-2 py-1.5 sm:gap-2.5 sm:px-3">
                  <div className="min-w-0 max-w-[34vw] text-right sm:max-w-40">
                    <div className="truncate text-xs font-bold text-white leading-none" title={user.name}>{user.name}</div>
                    <div className="mt-1 truncate text-[9px] font-mono font-bold text-gold uppercase tracking-widest">
                      ROLE // {user.role}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleSignOut}
                    aria-label="Exit (sign out)"
                    title="Sign out"
                    className="btn-tactile flex shrink-0 items-center gap-1.5 border border-neutral-700 bg-obsidian px-2.5 py-1.5 text-[10px] font-mono font-bold uppercase tracking-wider text-neutral-300 hover:bg-panel hover:text-ink cursor-pointer sm:ml-1"
                  >
                    <LogOut className="w-3 h-3" />
                    <span className="hidden sm:inline">Exit</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="pb-1.5 md:hidden">
          <StudioStatus queueCount={user ? queueCount : 0} />
        </div>

        {/* Station navigation on smaller screens */}
        {stations.length > 0 && (
          <nav aria-label="Staff stations" className="grid grid-cols-3 sm:flex xl:hidden border-t border-neutral-800 bg-obsidian-2 py-1.5 gap-1">
            {stations.map((st) => (
              <button
                key={st.id}
                type="button"
                onClick={() => onSelectTab(st.id)}
                className={`px-2.5 py-1 text-[10px] font-mono font-bold uppercase tracking-wider transition-colors ${
                  currentTab === st.id ? 'bg-gold text-on-gold' : 'text-neutral-400'
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
