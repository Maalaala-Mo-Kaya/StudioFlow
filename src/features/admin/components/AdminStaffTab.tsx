import type { DataRequestState } from '../../../components/common/DataFeedback';
import React, { useState } from 'react';
import { UserPlus, Eye, EyeOff, KeyRound } from 'lucide-react';
import { RecordActionButton } from '../../../components/common/RecordActionButton';
import { ResetPasswordModal } from './ResetPasswordModal';
import type { StaffUser, StaffRole } from '../../../types';
import { PROTECTED_SYSTEM_USERNAMES } from '../../../constants/studio';
import { ConfirmModal } from '../../../components/common/ConfirmModal';
import { useAuth } from '../../../context/AuthContext';
import { tableActions, DataTable, tableFilterControl, type DataTableColumn } from '../../../components/common/DataTable';

const roles: Record<StaffRole, string> = {
  cashier: 'Cashier', photographer: 'Photographer', mua: 'MUA', chooser: 'Chooser', admin: 'Studio Admin',
};

interface AdminStaffTabProps {
  request: DataRequestState;
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
  request,
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

  const columns: DataTableColumn<StaffUser>[] = [
    { id: 'account', header: 'Account', sortable: true, accessor: (account) => account.username,
      cell: (account) => <><span className="font-mono font-bold text-gold-soft">@{account.username}</span>
        <span className="block text-neutral-600">{account.name}</span></> },
    { id: 'role', header: 'Role', sortable: true, accessor: (account) => roles[account.role],
      cell: (account) => (
        <select aria-label={'Role for ' + account.username} value={account.role}
          disabled={account.id === user?.id || !!updating}
          onChange={(event) => void update(account, { role: event.target.value as StaffRole })}
          className={`${tableFilterControl} disabled:opacity-65`}>
          {Object.entries(roles).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      ) },
    { id: 'status', header: 'Status', sortable: true, accessor: (account) => account.disabled ? 'Disabled' : 'Enabled' },
    { id: 'actions', width: 256, header: 'Actions', cell: (account) => (
      <div className={tableActions + ' gap-1.5'}>
        <button type="button" disabled={account.id === user?.id || !!updating}
          onClick={() => void update(account, { disabled: !account.disabled })}
          className="min-h-8 border border-line px-2 disabled:opacity-45">
          {account.disabled ? 'Enable' : 'Disable'}
        </button>
        {account.id !== user?.id && (
          <button type="button" disabled={!!updating} onClick={() => setResetTarget(account)}
            title={'Reset password for @' + account.username}
            className="flex min-h-8 items-center gap-1 border border-line px-2 hover:bg-gold-wash disabled:opacity-45">
            <KeyRound className="size-3.5" aria-hidden="true" /> Reset Password
          </button>
        )}
        {account.id !== user?.id && !PROTECTED_SYSTEM_USERNAMES.includes(account.username) && (
          <RecordActionButton variant="delete" recordName={`staff account ${account.username}`} onClick={() => promptDeleteStaff(account)} />
        )}
      </div>
    ) },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8 animate-enter">
      {/* Provision New Staff Account */}
      <div className="min-w-0 bg-panel border-2 border-line shadow-lux p-6">
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
      <div className="min-w-0 bg-panel border-2 border-line shadow-lux p-6">
        <div className="flex items-center justify-between pb-3 border-b-2 border-line mb-4">
          <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-ink">
            Staff Accounts
          </h3>
          <span className="font-mono text-[10px] bg-obsidian text-gold px-2 py-0.5 font-bold">
            {staffAccounts.length} Staff
          </span>
        </div>
        <DataTable {...request} label="Staff accounts" rows={staffAccounts} columns={columns} getRowId={(account) => account.id}
          pagination={false} tableClassName="min-w-[460px]" headerClassName="uppercase"
          emptyMessage="No staff accounts found." />
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
