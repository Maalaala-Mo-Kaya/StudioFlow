import React, { useState } from 'react';
import { UserPlus, Trash2, Eye, EyeOff, KeyRound } from 'lucide-react';
import { ResetPasswordModal } from './ResetPasswordModal';
import type { StaffUser, StaffRole } from '../../../types';
import { PROTECTED_SYSTEM_USERNAMES } from '../../../constants/studio';
import { ConfirmModal } from '../../../components/common/ConfirmModal';
import { useAuth } from '../../../context/AuthContext';

const roles: Record<StaffRole, string> = {
  cashier: 'Cashier', photographer: 'Photographer', mua: 'MUA', chooser: 'Chooser', admin: 'Studio Admin',
};

interface AdminStaffTabProps {
  staffAccounts: StaffUser[];
  staffUsername: string;
  onStaffUsernameChange: (val: string) => void;
  staffPassword: string;
  onStaffPasswordChange: (val: string) => void;
  staffName: string;
  onStaffNameChange: (val: string) => void;
  staffRole: StaffRole;
  onStaffRoleChange: (val: StaffRole) => void;
  onCreateStaff: (e: React.FormEvent) => void;
  onDeleteStaff: (id: string, username: string) => void;
  onUpdateStaff: (id: string, changes: Partial<Pick<StaffUser, 'role' | 'disabled'>>) => Promise<void>;
  onResetStaffPassword: (id: string, username: string, password: string) => Promise<void>;
}

export const AdminStaffTab: React.FC<AdminStaffTabProps> = ({
  staffAccounts,
  staffUsername,
  onStaffUsernameChange,
  staffPassword,
  onStaffPasswordChange,
  staffName,
  onStaffNameChange,
  staffRole,
  onStaffRoleChange,
  onCreateStaff,
  onDeleteStaff,
  onUpdateStaff,
  onResetStaffPassword,
}) => {
  const { user } = useAuth();
  const [updating, setUpdating] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [resetTarget, setResetTarget] = useState<StaffUser | null>(null);

  async function update(account: StaffUser, changes: Partial<Pick<StaffUser, 'role' | 'disabled'>>) {
    setUpdating(account.id);
    try { await onUpdateStaff(account.id, changes); } finally { setUpdating(''); }
  }
  const [deleteModalState, setDeleteModalState] = useState<{
    isOpen: boolean;
    id: string;
    username: string;
  }>({
    isOpen: false,
    id: '',
    username: '',
  });

  const promptDeleteStaff = (acc: StaffUser) => {
    setDeleteModalState({
      isOpen: true,
      id: acc.id,
      username: acc.username,
    });
  };

  const handleConfirmDelete = () => {
    if (deleteModalState.id) {
      onDeleteStaff(deleteModalState.id, deleteModalState.username);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8 animate-enter">
      {/* Provision New Staff Account */}
      <div className="bg-panel border-2 border-line shadow-lux p-6">
        <div className="flex items-center gap-3 pb-3 border-b-2 border-line mb-4">
          <div className="w-8 h-8 bg-obsidian text-gold flex items-center justify-center shrink-0">
            <UserPlus className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-ink m-0">
              New Staff Account
            </h3>
            <p className="text-[11px] text-neutral-500">
              Create login credentials and assign a station role.
            </p>
          </div>
        </div>

        <form onSubmit={onCreateStaff} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-black text-ink uppercase tracking-wider mb-1.5">
                Username <span className="text-red-600">*</span>
              </label>
              <input
                type="text"
                required
                minLength={3}
                autoComplete="off"
                spellCheck={false}
                autoCapitalize="off"
                placeholder="cashier2"
                value={staffUsername}
                onChange={(e) => onStaffUsernameChange(e.target.value)}
                className="w-full min-h-[44px] text-xs sm:text-sm px-3.5 py-2 border border-neutral-400 bg-canvas focus:bg-panel font-mono font-bold lowercase"
              />
            </div>

            <div>
              <label className="block text-[11px] font-black text-ink uppercase tracking-wider mb-1.5">
                Assigned Role <span className="text-red-600">*</span>
              </label>
              <select
                value={staffRole}
                onChange={(e) => onStaffRoleChange(e.target.value as StaffRole)}
                className="w-full min-h-[44px] text-xs sm:text-sm px-3.5 py-2 border border-neutral-400 bg-panel font-bold uppercase"
              >
                {Object.entries(roles).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-black text-ink uppercase tracking-wider mb-1.5">
              Staff Full Name / Station Label
            </label>
            <input
              type="text"
              placeholder="Maria Santos (Cashier 2)"
              value={staffName}
              onChange={(e) => onStaffNameChange(e.target.value)}
              className="w-full min-h-[44px] text-xs sm:text-sm px-3.5 py-2 border border-neutral-400 bg-canvas focus:bg-panel font-semibold"
            />
          </div>

          <div>
            <label className="block text-[11px] font-black text-ink uppercase tracking-wider mb-1.5">
              Password (Min 8 characters) <span className="text-red-600">*</span>
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                minLength={8}
                maxLength={71}
                autoComplete="new-password"
                spellCheck={false}
                autoCapitalize="off"
                placeholder="••••••••••••"
                value={staffPassword}
                onChange={(e) => onStaffPasswordChange(e.target.value)}
                className="w-full min-h-[44px] text-xs sm:text-sm pl-3.5 pr-12 py-2 border border-neutral-400 bg-canvas focus:bg-panel font-mono"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
                title={showPassword ? 'Hide password' : 'Show password'}
                className="absolute inset-y-0 right-0 w-11 flex items-center justify-center text-neutral-500 hover:text-gold cursor-pointer"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {staffPassword.length > 0 && staffPassword.length < 8 && (
              <p className="text-[11px] text-red-600 mt-1">{8 - staffPassword.length} more character(s) needed.</p>
            )}
          </div>

          <button
            type="submit"
            className="btn-tactile w-full min-h-[46px] py-2.5 bg-obsidian text-gold border border-line text-xs font-black uppercase tracking-widest cursor-pointer"
          >
            Create Staff Credentials
          </button>
        </form>
      </div>

      {/* Active Staff Accounts Directory */}
      <div className="bg-panel border-2 border-line shadow-lux p-6">
        <div className="flex items-center justify-between pb-3 border-b-2 border-line mb-4">
          <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-ink">
            Staff Accounts
          </h3>
          <span className="font-mono text-[10px] bg-obsidian text-gold px-2 py-0.5 font-bold">
            {staffAccounts.length} Staff
          </span>
        </div>
        <div className="space-y-3">
          {staffAccounts.map((acc) => (
            <div
              key={acc.id}
              className="p-4 bg-obsidian text-white border border-line flex flex-wrap items-center justify-between gap-3"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-black text-gold">
                    @{acc.username}
                  </span>
                  <span className="px-2 py-0.5 text-[10px] font-mono font-black uppercase tracking-widest bg-obsidian-2 text-white border border-gold/50">
                    {acc.disabled ? 'Disabled' : 'Enabled'}
                  </span>
                </div>
                <p className="text-xs text-neutral-300 font-semibold mt-1">{acc.name}</p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select aria-label={`Role for ${acc.username}`} value={acc.role}
                  disabled={acc.id === user?.id || !!updating}
                  onChange={(event) => void update(acc, { role: event.target.value as StaffRole })}
                  className="bg-obsidian-2 border border-neutral-600 text-xs p-2 disabled:opacity-65">
                  {Object.entries(roles).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                <button type="button" disabled={acc.id === user?.id || !!updating}
                  onClick={() => void update(acc, { disabled: !acc.disabled })}
                  className="border border-neutral-600 text-xs p-2 disabled:opacity-45">
                  {acc.disabled ? 'Enable' : 'Disable'}
                </button>
                {acc.id !== user?.id && (
                  <button type="button" disabled={!!updating}
                    onClick={() => setResetTarget(acc)}
                    title={`Reset password for @${acc.username}`}
                    className="flex items-center gap-1 border border-neutral-600 text-xs p-2 hover:border-gold hover:text-gold cursor-pointer disabled:opacity-45">
                    <KeyRound className="w-3.5 h-3.5" />
                    Reset Password
                  </button>
                )}
              {acc.id !== user?.id && !PROTECTED_SYSTEM_USERNAMES.includes(acc.username) && (
                <button
                  type="button"
                  onClick={() => promptDeleteStaff(acc)}
                  title="Delete Staff Account"
                  className="p-2 bg-red-950/80 hover:bg-red-700 text-red-300 hover:text-white transition cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {resetTarget && (
        <ResetPasswordModal
          username={resetTarget.username}
          onSubmit={(password) => onResetStaffPassword(resetTarget.id, resetTarget.username, password)}
          onClose={() => setResetTarget(null)}
        />
      )}

      {/* Confirmation Modal */}
      <ConfirmModal
        isOpen={deleteModalState.isOpen}
        title={`Delete Staff Account: @${deleteModalState.username}`}
        message={`Are you sure you want to permanently delete staff account @${deleteModalState.username}? This user will immediately lose access to their station.`}
        confirmText="Confirm Delete"
        isDestructive={true}
        onConfirm={handleConfirmDelete}
        onClose={() => setDeleteModalState({ isOpen: false, id: '', username: '' })}
      />
    </div>
  );
};
