import React, { useState } from 'react';
import { UserPlus, Trash2 } from 'lucide-react';
import type { StaffUser, StaffRole } from '../../../types';
import { PROTECTED_SYSTEM_USERNAMES } from '../../../constants/studio';
import { ConfirmModal } from '../../../components/common/ConfirmModal';

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
}) => {
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
      <div className="bg-white border-2 border-[#0A0A0A] shadow-[6px_6px_0px_#0A0A0A] p-6">
        <div className="flex items-center gap-3 pb-3 border-b-2 border-[#0A0A0A] mb-4">
          <div className="w-8 h-8 bg-[#0A0A0A] text-[#C9A227] flex items-center justify-center shrink-0">
            <UserPlus className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-[#0A0A0A] m-0">
              New Staff Account
            </h3>
            <p className="text-[11px] text-neutral-500">
              Create login credentials for Cashier, Photo, or Admin stations
            </p>
          </div>
        </div>

        <form onSubmit={onCreateStaff} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-black text-[#0A0A0A] uppercase tracking-wider mb-1.5">
                Username <span className="text-red-600">*</span>
              </label>
              <input
                type="text"
                required
                minLength={3}
                placeholder="cashier2"
                value={staffUsername}
                onChange={(e) => onStaffUsernameChange(e.target.value)}
                className="w-full min-h-[44px] text-xs sm:text-sm px-3.5 py-2 border border-neutral-400 bg-[#F8F7F4] focus:bg-white font-mono font-bold lowercase"
              />
            </div>

            <div>
              <label className="block text-[11px] font-black text-[#0A0A0A] uppercase tracking-wider mb-1.5">
                Assigned Role <span className="text-red-600">*</span>
              </label>
              <select
                value={staffRole}
                onChange={(e) => onStaffRoleChange(e.target.value as StaffRole)}
                className="w-full min-h-[44px] text-xs sm:text-sm px-3.5 py-2 border border-neutral-400 bg-white font-bold uppercase"
              >
                <option value="cashier">Cashier (POS &amp; Receipts)</option>
                <option value="photographer">Photographer (Live Queue)</option>
                <option value="admin">Studio Admin (Full Access)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-black text-[#0A0A0A] uppercase tracking-wider mb-1.5">
              Staff Full Name / Station Label
            </label>
            <input
              type="text"
              placeholder="Maria Santos (Cashier 2)"
              value={staffName}
              onChange={(e) => onStaffNameChange(e.target.value)}
              className="w-full min-h-[44px] text-xs sm:text-sm px-3.5 py-2 border border-neutral-400 bg-[#F8F7F4] focus:bg-white font-semibold"
            />
          </div>

          <div>
            <label className="block text-[11px] font-black text-[#0A0A0A] uppercase tracking-wider mb-1.5">
              Password (Min 8 characters) <span className="text-red-600">*</span>
            </label>
            <input
              type="password"
              required
              minLength={8}
              placeholder="••••••••••••"
              value={staffPassword}
              onChange={(e) => onStaffPasswordChange(e.target.value)}
              className="w-full min-h-[44px] text-xs sm:text-sm px-3.5 py-2 border border-neutral-400 bg-[#F8F7F4] focus:bg-white font-mono"
            />
          </div>

          <button
            type="submit"
            className="btn-tactile w-full min-h-[46px] py-2.5 bg-[#0A0A0A] text-[#C9A227] border border-[#0A0A0A] text-xs font-black uppercase tracking-widest cursor-pointer"
          >
            Create Staff Credentials
          </button>
        </form>
      </div>

      {/* Active Staff Accounts Directory */}
      <div className="bg-white border-2 border-[#0A0A0A] shadow-[6px_6px_0px_#0A0A0A] p-6">
        <div className="flex items-center justify-between pb-3 border-b-2 border-[#0A0A0A] mb-4">
          <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-[#0A0A0A]">
            Active Staff Accounts
          </h3>
          <span className="font-mono text-[10px] bg-[#0A0A0A] text-[#C9A227] px-2 py-0.5 font-bold">
            {staffAccounts.length} Staff
          </span>
        </div>
        <div className="space-y-3">
          {staffAccounts.map((acc) => (
            <div
              key={acc.id}
              className="p-4 bg-[#0A0A0A] text-white border border-[#0A0A0A] flex items-center justify-between gap-3"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-black text-[#C9A227]">
                    @{acc.username}
                  </span>
                  <span className="px-2 py-0.5 text-[10px] font-mono font-black uppercase tracking-widest bg-[#141414] text-white border border-[#C9A227]/50">
                    {acc.role}
                  </span>
                </div>
                <p className="text-xs text-neutral-300 font-semibold mt-1">{acc.name}</p>
              </div>

              {!(PROTECTED_SYSTEM_USERNAMES as readonly string[]).includes(acc.username) && (
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
          ))}
        </div>
      </div>

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
