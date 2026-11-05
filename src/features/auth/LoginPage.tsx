import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import type { StaffRole } from '../../types';
import { STAFF_PRESETS } from '../../constants/studio';
import { Eye, EyeOff, ArrowRight } from 'lucide-react';

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

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
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

      if (
        requiredRoles &&
        staffUser.role !== 'admin' &&
        !requiredRoles.includes(staffUser.role)
      ) {
        toast.error(
          `Account "${staffUser.username}" (${staffUser.role.toUpperCase()}) is not authorized for ${
            targetStationName || 'this station'
          }.`
        );
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

  const applyPreset = (u: string) => {
    setUsername(u);
  };

  return (
    <div className="max-w-md mx-auto px-4 py-12 sm:py-20 animate-enter">
      <div className="bg-white border-2 border-[#0A0A0A] shadow-[8px_8px_0px_#0A0A0A]">
        {/* Architectural Header Block */}
        <div className="bg-[#0A0A0A] text-white p-6 sm:p-8 border-b-2 border-[#C9A227]">
          <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-[0.2em] text-[#C9A227] mb-3">
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
            <div className="bg-[#F7F2E0] border border-[#C9A227] p-3.5 mb-5 text-xs text-[#0A0A0A] animate-enter">
              <div className="font-mono font-bold uppercase text-[10px] tracking-wider text-[#8C6D11]">
                Active Session Notice
              </div>
              <p className="mt-1">
                Signed in as <strong>{user.name}</strong> ({user.role.toUpperCase()}). Sign in with
                an authorized account below to switch stations.
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label
                htmlFor="login-username"
                className="block text-[11px] font-mono font-bold text-[#0A0A0A] uppercase tracking-widest mb-1.5"
              >
                01 / Username
              </label>
              <input
                id="login-username"
                type="text"
                required
                autoComplete="username"
                placeholder="cashier / photographer / admin"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full min-h-[48px] text-sm px-4 py-2.5 rounded-none border border-neutral-400 focus:border-[#0A0A0A] bg-[#F8F7F4] focus:bg-white font-mono font-semibold transition-colors"
              />
            </div>

            <div>
              <label
                htmlFor="login-password"
                className="block text-[11px] font-mono font-bold text-[#0A0A0A] uppercase tracking-widest mb-1.5"
              >
                02 / Password
              </label>
              <div className="relative">
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full min-h-[48px] text-sm pl-4 pr-11 py-2.5 rounded-none border border-neutral-400 focus:border-[#0A0A0A] bg-[#F8F7F4] focus:bg-white font-mono font-semibold transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-3 p-1 text-neutral-500 hover:text-[#0A0A0A] cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="btn-tactile w-full min-h-[50px] py-3.5 px-6 bg-[#0A0A0A] hover:bg-[#C9A227] text-white hover:text-[#0A0A0A] border border-[#0A0A0A] font-mono font-bold text-xs uppercase tracking-[0.15em] flex items-center justify-between cursor-pointer disabled:opacity-50"
            >
              <span>{isLoading ? 'Authenticating...' : 'Authenticate & Enter Station'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          {/* Station Quick-Select Ledger */}
          <div className="mt-7 pt-5 border-t border-neutral-200">
            <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-widest text-neutral-500 mb-2.5">
              <span>Station Quick-Fill</span>
              <span>Select Account</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {STAFF_PRESETS.map((preset) => (
                <button
                  key={preset.username}
                  type="button"
                  onClick={() => applyPreset(preset.username)}
                  className={`btn-tactile py-2 px-2 border text-left transition-colors cursor-pointer ${
                    username === preset.username
                      ? 'bg-[#0A0A0A] text-[#C9A227] border-[#0A0A0A]'
                      : 'bg-[#F8F7F4] hover:bg-white text-[#0A0A0A] border-neutral-300'
                  }`}
                >
                  <span className="text-[10px] font-bold uppercase block">{preset.label}</span>
                  <span className="text-[9px] font-mono opacity-70 block">@{preset.username}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
