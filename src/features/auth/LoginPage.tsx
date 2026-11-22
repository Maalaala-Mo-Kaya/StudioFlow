import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import type { StaffRole } from '../../types';
import { ROLE_DEFAULT_ROUTE } from '../../constants/studio';
import { Eye, EyeOff, ArrowRight } from 'lucide-react';

/** What each role's home station is called on screen. */
const STATION_NAMES: Record<StaffRole, string> = {
  admin: 'Admin', cashier: 'Cashier', photographer: 'Photo Set', mua: 'Makeup / Grooming', chooser: 'Chooser',
};
// The last username signed in on this device, so each station PC opens with its own account filled in.
const LAST_USERNAME_KEY = 'studioflow-last-username';
const readLastUsername = () => { try { return localStorage.getItem(LAST_USERNAME_KEY) ?? ''; } catch { return ''; } };
const saveLastUsername = (name: string) => { try { localStorage.setItem(LAST_USERNAME_KEY, name); } catch { /* private mode */ } };

/** Opens a role's own station (used when the account signed in here is not allowed on this page). */
const openStation = (role: StaffRole) => { window.location.hash = `#/${ROLE_DEFAULT_ROUTE[role] || 'register'}`; };

interface LoginPageProps {
  onLoginSuccess?: (role: StaffRole) => void;
  requiredRoles?: StaffRole[];
  targetStationName?: string;
}

export const LoginPage: React.FC<LoginPageProps> = ({
  onLoginSuccess,
  requiredRoles,
  targetStationName,
}) => {
  const { user, login } = useAuth();
  const { toast } = useToast();

  const [username, setUsername] = useState(readLastUsername);
  const [password, setPassword] = useState('');
  const passwordRef = useRef<HTMLInputElement>(null);
  // With the username remembered, start in the password box.
  useEffect(() => { if (readLastUsername()) passwordRef.current?.focus(); }, []);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!username.trim() || !password) {
      toast.error('Enter both username and password.');
      return;
    }

    setIsLoading(true);
    try {
      const staffUser = await login(username.trim(), password);
      saveLastUsername(staffUser.username);

      // Signed in, but this page is for other roles: open the account's own station instead of
      // leaving it on a sign-in form it can never get past.
      if (
        requiredRoles &&
        staffUser.role !== 'admin' &&
        !requiredRoles.includes(staffUser.role)
      ) {
        toast.info(
          `Signed in as ${staffUser.name}. ${targetStationName || 'This page'} is not for ${staffUser.role} accounts, so here is the ${STATION_NAMES[staffUser.role]} station.`
        );
        setPassword('');
        openStation(staffUser.role);
        return;
      }

      toast.info(`Welcome, ${staffUser.name}!`);
      onLoginSuccess?.(staffUser.role);
    } catch {
      toast.error('Authentication failed. Verify your staff username and password.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-12 sm:py-20 animate-enter">
      <div className="bg-panel border-2 border-line shadow-lux">
        {/* Architectural Header Block */}
        <div className="bg-obsidian text-white p-6 sm:p-8 border-b-2 border-gold">
          <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-[0.2em] text-gold mb-3">
            <span>AUTH // TERMINAL 01</span>
            <span>OFFLINE LAN</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-white">
            Staff Sign In
          </h1>
          <p className="text-xs text-neutral-400 mt-1.5 leading-relaxed">
            {targetStationName
              ? `Sign in with authorized credentials to access ${targetStationName}.`
              : 'Enter your studio username and password. You will be routed automatically to your assigned station.'}
          </p>
        </div>

        {/* Form Body */}
        <div className="p-6 sm:p-8">
          {user && requiredRoles && (
            <div className="bg-gold-wash border border-gold p-3.5 mb-5 text-xs text-ink animate-enter">
              <div className="font-mono font-bold uppercase text-[10px] tracking-wider text-gold-soft">
                Active Session Notice
              </div>
              <p className="mt-1">
                Signed in as <strong>{user.name}</strong> ({user.role.toUpperCase()}), which can't open
                {' '}{targetStationName || 'this page'}. Go to your own station, or sign in below with an account that can.
              </p>
              <button type="button" onClick={() => openStation(user.role)}
                className="btn-tactile mt-2.5 min-h-[38px] px-3 flex items-center gap-1.5 bg-obsidian text-gold border border-line font-mono text-[10px] font-black uppercase tracking-wider cursor-pointer">
                Go to my station: {STATION_NAMES[user.role]} <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label
                htmlFor="login-username"
                className="block text-[11px] font-mono font-bold text-ink uppercase tracking-widest mb-1.5"
              >
                01 / Username
              </label>
              <input
                id="login-username"
                type="text"
                required
                autoComplete="username"
                placeholder="Your staff username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full min-h-[48px] text-sm px-4 py-2.5 rounded-none border border-neutral-400 focus:border-line bg-canvas focus:bg-panel font-mono font-semibold transition-colors"
              />
            </div>

            <div>
              <label
                htmlFor="login-password"
                className="block text-[11px] font-mono font-bold text-ink uppercase tracking-widest mb-1.5"
              >
                02 / Password
              </label>
              <div className="relative">
                <input
                  ref={passwordRef}
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full min-h-[48px] text-sm pl-4 pr-11 py-2.5 rounded-none border border-neutral-400 focus:border-line bg-canvas focus:bg-panel font-mono font-semibold transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-3 p-1 text-neutral-500 hover:text-ink cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="btn-tactile w-full min-h-[50px] py-3.5 px-6 bg-obsidian hover:bg-gold text-white hover:text-on-gold border border-line font-mono font-bold text-xs uppercase tracking-[0.15em] flex items-center justify-between cursor-pointer disabled:opacity-50"
            >
              <span>{isLoading ? 'Authenticating...' : 'Authenticate & Enter Station'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          {username && (
            <p className="mt-4 text-[10px] font-mono text-neutral-500">
              Not you?{' '}
              <button type="button" onClick={() => { setUsername(''); saveLastUsername(''); }}
                className="underline underline-offset-2 hover:text-ink cursor-pointer">Clear the username</button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
