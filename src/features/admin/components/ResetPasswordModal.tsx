import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { KeyRound, X, Loader2, Eye, EyeOff } from 'lucide-react';

interface ResetPasswordModalProps {
  username: string;
  onSubmit: (password: string) => Promise<void>;
  onClose: () => void;
}

/** Admin sets a new password for another staff account. Mount only while open. */
export const ResetPasswordModal: React.FC<ResetPasswordModalProps> = ({ username, onSubmit, onClose }) => {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);

  const tooShort = password.length > 0 && password.length < 8;
  const mismatch = confirm.length > 0 && password !== confirm;
  const valid = password.length >= 8 && password === confirm;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || saving) return;
    setSaving(true);
    try {
      await onSubmit(password);
      onClose();
    } catch {
      // The handler already showed the error; keep the dialog open to retry.
    } finally {
      setSaving(false);
    }
  }

  const inputClass = 'w-full min-h-[44px] text-xs sm:text-sm pl-3.5 pr-12 py-2 border border-neutral-400 bg-canvas focus:bg-panel font-mono';

  return createPortal(
    <div role="dialog" aria-modal="true" aria-labelledby="reset-password-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-obsidian/85 modal-overlay">
      <form onSubmit={handleSubmit}
        className="w-full max-w-md bg-panel border-2 border-line shadow-lux-gold p-6 sm:p-7 space-y-4 text-xs">
        <div className="flex items-center justify-between pb-3 border-b-2 border-line">
          <div className="flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-gold shrink-0" />
            <h3 id="reset-password-title" className="text-xs sm:text-sm font-black uppercase tracking-wider text-ink">
              Reset Password: @{username}
            </h3>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" disabled={saving}
            className="w-7 h-7 flex items-center justify-center border border-line bg-canvas hover:bg-gold hover:text-on-gold transition-colors cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-neutral-700 leading-relaxed text-xs sm:text-[13px]">
          Set a new password for this account. Anyone signed in as @{username} will be signed out
          and must log in again with the new password.
        </p>

        <div>
          <label htmlFor="reset-password-new" className="block text-[11px] font-black text-ink uppercase tracking-wider mb-1.5">
            New Password (Min 8 characters)
          </label>
          <div className="relative">
            <input id="reset-password-new" type={show ? 'text' : 'password'} autoFocus required
              minLength={8} maxLength={71} autoComplete="new-password" spellCheck={false} autoCapitalize="off"
              value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
            <button type="button" onClick={() => setShow((v) => !v)}
              aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show}
              title={show ? 'Hide password' : 'Show password'}
              className="absolute inset-y-0 right-0 w-11 flex items-center justify-center text-neutral-500 hover:text-gold cursor-pointer">
              {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {tooShort && <p className="text-[11px] text-red-600 mt-1">{8 - password.length} more character(s) needed.</p>}
        </div>

        <div>
          <label htmlFor="reset-password-confirm" className="block text-[11px] font-black text-ink uppercase tracking-wider mb-1.5">
            Confirm New Password
          </label>
          <input id="reset-password-confirm" type={show ? 'text' : 'password'} required
            maxLength={71} autoComplete="new-password" spellCheck={false} autoCapitalize="off"
            value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputClass} />
          {mismatch && <p className="text-[11px] text-red-600 mt-1">Passwords do not match.</p>}
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-neutral-200">
          <button type="button" onClick={onClose} disabled={saving}
            className="btn-tactile px-4 py-2 bg-canvas text-neutral-700 border border-neutral-400 hover:border-line font-bold uppercase tracking-wider cursor-pointer disabled:opacity-50">
            Cancel
          </button>
          <button type="submit" disabled={!valid || saving}
            className="btn-tactile flex items-center gap-1.5 px-5 py-2 font-black uppercase tracking-wider border bg-obsidian text-gold border-line shadow-lux-gold cursor-pointer disabled:opacity-50">
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            <span>Set Password</span>
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
};
