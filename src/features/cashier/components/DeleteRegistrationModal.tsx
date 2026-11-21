import { useEffect, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { Registration } from '../../../types';

const reasons = ['Duplicate Registration', 'Incorrect Form', 'Client Requested Cancellation', 'Test Registration', 'Other'];

export function DeleteRegistrationButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      title="Delete unpaid registration"
      aria-label="Delete unpaid registration"
      onClick={onClick}
      className="btn-tactile inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 border border-red-600 px-2 text-[11px] font-black uppercase tracking-wider text-red-700 hover:bg-red-600 hover:text-white lg:min-h-9"
    >
      <Trash2 className="size-4" aria-hidden="true" />
      Delete
    </button>
  );
}

interface DeleteRegistrationModalProps {
  registration: Registration;
  onClose: () => void;
  onDelete: (reason: string) => Promise<string | undefined>;
}

export function DeleteRegistrationModal({ registration, onClose, onDelete }: DeleteRegistrationModalProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const submitting = useRef(false);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('');
  const [explanation, setExplanation] = useState('');
  const [error, setError] = useState<string>();

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!reason || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError(undefined);
    try {
      setError(await onDelete([reason, explanation.trim()].filter(Boolean).join(' — ')));
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };

  return (
    <dialog
      ref={dialog}
      aria-labelledby="delete-registration-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!submitting.current) onClose();
      }}
      className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-md max-h-[calc(100%-2rem)] overflow-y-auto border-2 border-line bg-panel p-5 text-ink shadow-lux-gold backdrop:bg-obsidian/85 sm:p-6"
    >
      <form onSubmit={submit} className="space-y-4">
        <h2 id="delete-registration-title" className="flex items-center gap-2 text-sm font-black uppercase tracking-wider">
          <Trash2 className="size-5 text-red-700" aria-hidden="true" />
          Delete Registration
        </h2>
        <p className="text-sm text-neutral-700">This registration will be removed from active client records.</p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 border border-line bg-canvas p-3 text-sm">
          <dt className="font-bold">Client</dt>
          <dd>{[registration.family_name, [registration.given_name, registration.middle_name].filter(Boolean).join(' ')].filter(Boolean).join(', ')}</dd>
          <dt className="font-bold">Registration ref</dt>
          <dd className="break-all font-mono">{registration.id}</dd>
          <dt className="font-bold">Package</dt>
          <dd>{registration.package_snapshot?.name || registration.expand?.package?.name || 'Package unavailable'}</dd>
          <dt className="font-bold">Job Order</dt>
          <dd>Not generated</dd>
          <dt className="font-bold">Payment</dt>
          <dd>Unpaid</dd>
        </dl>
        <label className="block space-y-1 text-sm font-bold">
          <span>Reason for deletion (required)</span>
          <select required value={reason} disabled={busy} onChange={(event) => setReason(event.target.value)}
            className="block min-h-11 w-full border border-line bg-canvas px-2 font-normal">
            <option value="">Choose a reason</option>
            {reasons.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        <label className="block space-y-1 text-sm font-bold">
          <span>Explanation (optional)</span>
          <textarea rows={2} maxLength={400} value={explanation} disabled={busy} onChange={(event) => setExplanation(event.target.value)}
            className="block w-full border border-line bg-canvas p-2 font-normal" />
        </label>
        {error && <p role="alert" className="text-sm font-bold text-red-700">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4 text-xs font-black uppercase">
          <button type="button" onClick={onClose} disabled={busy} className="min-h-11 border border-line px-4 disabled:opacity-50">
            Cancel
          </button>
          <button type="submit" disabled={busy || !reason} className="min-h-11 bg-red-600 px-4 text-white hover:bg-red-700 disabled:opacity-50">
            {busy ? 'Deleting…' : 'Delete Registration'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
