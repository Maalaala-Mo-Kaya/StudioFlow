import React, { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { pb } from '../../../db/pocketbase';
import { Modal } from '../../../components/common/Modal';
import { workflowApi, workflowError } from '../../../hooks/useWorkflowData';
import { formatClientName, formatJobOrderNo } from '../../../utils/formatters';
import type { PhotographyTask, Registration } from '../../../types';

const REASON_MAX = 300;

/**
 * Sends a client marked Done shooting back on set (POST /shoot/:id/reshoot). The server
 * refuses once the Chooser has started or production has begun, and logs every re-shoot.
 */
export const ReshootModal: React.FC<{
  registration: Registration;
  /** Multi-photographer orders: the finished session to reopen (only it goes back to its photographer). */
  task?: PhotographyTask;
  /** Admin paid retake: after the Chooser picked; reopens every session and clears the saved selection. */
  paid?: boolean;
  onClose: () => void;
  onDone: (reg: Registration, task?: PhotographyTask) => void;
}> = ({ registration: reg, task, paid = false, onClose, onDone }) => {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!reason.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      await pb.send(`${workflowApi}/shoot/${reg.id}/${paid ? 'retake' : 'reshoot'}`, { method: 'POST', body: { reason: reason.trim(), ...(task && !paid ? { taskId: task.id } : {}) } });
      onDone({ ...reg, status: 'shooting' }, task && { ...task, status: 'pending' });
    } catch (failure) {
      setError(workflowError(failure));
      setBusy(false);
    }
  };

  return (
    <Modal title={paid ? 'Paid retake' : task ? `Re-shoot · ${task.name}` : 'Re-shoot client'} icon={RotateCcw} size="md" busy={busy} onClose={onClose}
      subtitle={<>{formatClientName(reg)} · {formatJobOrderNo(reg.job_order_no)}</>}
      footer={(
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy}
            className="btn-tactile min-h-10 border border-line bg-canvas px-4 text-xs font-black uppercase tracking-wider text-ink cursor-pointer disabled:opacity-50">
            Cancel
          </button>
          <button type="button" onClick={() => void submit()} disabled={busy || !reason.trim()}
            className="btn-tactile inline-flex min-h-10 items-center gap-1.5 border border-line bg-gold px-4 text-xs font-black uppercase tracking-wider text-on-gold cursor-pointer disabled:opacity-50">
            <RotateCcw className="size-4" aria-hidden="true" /> {busy ? 'Reopening…' : paid ? 'Start paid retake' : 'Re-shoot now'}
          </button>
        </div>
      )}>
      <div className="space-y-3 font-sans text-sm">
        <p className="m-0 text-neutral-700">
          {paid
            ? <>The client has already chosen photos. A paid retake sends them back to the photographers (every photography session opens again),
              clears the Chooser's saved selection and moves production back to the start. The Chooser picks again after the new shoot;
              the earlier picks stay in the folder and show as selected.</>
            : task
            ? <>Only the <strong>{task.name}</strong> session ({task.photographerName || 'unassigned'}) goes back on set; other sessions stay as they are.
              The client leaves the Chooser's list until every session is marked done again.</>
            : <>The client goes back on set and leaves the Chooser's list until you click <strong>Mark Done</strong> again.</>}
          {' '}Their shots so far stay in their folder; new shots are added to them.
        </p>
        <label className="block">
          <span className="text-[11px] font-black uppercase tracking-wider text-ink">{paid ? 'Reason and payment note (required)' : 'Why the re-shoot? (required)'}</span>
          <textarea value={reason} maxLength={REASON_MAX} rows={3} autoFocus disabled={busy}
            onChange={(event) => setReason(event.target.value)} placeholder={paid ? 'e.g. client unhappy with the shots; retake fee ₱1,000 added as other fees' : 'e.g. eyes closed in most shots, wrong attire'}
            className="mt-1 w-full resize-y border border-neutral-400 bg-canvas px-2 py-1.5 text-sm" />
        </label>
        <p className="m-0 text-[11px] text-neutral-600">
          {paid
            ? <>This doesn't charge the client. Add the retake fee to the order (<strong>Admin → Students → Edit</strong>, other fees) and the cashier collects it.</>
            : 'Not possible once the Chooser has opened the client\'s photos or production has started. A retake then goes through the admin.'}
        </p>
        {error && <p role="alert" className="m-0 font-bold text-red-700">{error}</p>}
      </div>
    </Modal>
  );
};
