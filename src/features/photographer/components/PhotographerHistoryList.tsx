import React from 'react';
import { CheckCircle2, RotateCcw } from 'lucide-react';
import type { PhotographyTask, Registration } from '../../../types';
import { activePhotographyTasks } from '../photographyTasks';
import {
  formatClientName,
  formatJobOrderNo,
  formatQueueNumber,
} from '../../../utils/formatters';
import { clientDetail, clientGroup } from '../../../utils/clientInfo';
import { PhotographyProgress } from './PhotographyProgress';

// The Chooser has picked this client's photos (or production started): a retake is then a paid
// retake through the admin, and the server refuses a re-shoot. The server checks the rest.
const chooserStarted = (reg: Registration) =>
  !['', 'pending_shoot', 'shot_raw'].includes(reg.photo_status ?? '')
  || !['', 'none', 'pending_framing'].includes(reg.framing_status ?? '');

const chooserNote = (
  <span title="A retake after the client has chosen is a paid retake. Ask the admin."
    className="mt-1 inline-flex items-center gap-1 border border-neutral-500/40 px-2.5 py-1 font-mono text-[10px] font-black uppercase tracking-wider text-neutral-500">
    Chosen · retake via admin
  </span>
);

interface PhotographerHistoryListProps {
  recentlyDone: Registration[];
  /** Opens the re-shoot popup for a finished client, or for one finished session of a multi-photographer order. */
  onReshoot?: (reg: Registration, task?: PhotographyTask) => void;
  busy?: boolean;
  /** Admin: opens the paid retake popup for a client who has already chosen. */
  onPaidRetake?: (reg: Registration) => void;
  /** The signed-in photographer (their own sessions get a Re-shoot button). */
  photographerId?: string;
  admin?: boolean;
}

export const PhotographerHistoryList: React.FC<PhotographerHistoryListProps> = ({
  recentlyDone,
  onReshoot,
  onPaidRetake,
  busy = false,
  photographerId,
  admin = false,
}) => {
  const reshootButton = (onClick: () => void) => (
    <button type="button" disabled={busy} onClick={onClick}
      title="Put this client back on set for more shots (before the Chooser starts)"
      className="btn-tactile mt-1 inline-flex min-h-9 items-center gap-1 border border-line bg-obsidian px-2.5 font-mono text-[10px] font-black uppercase tracking-wider text-gold hover:border-gold cursor-pointer disabled:opacity-50">
      <RotateCcw className="w-3.5 h-3.5" /> Re-shoot
    </button>
  );
  return (
    <div className="animate-enter bg-panel border-2 border-line shadow-lux p-5 sm:p-6">
      <div className="flex items-center justify-between pb-3 border-b-2 border-line mb-4">
        <h3 className="text-xs sm:text-sm font-black text-ink uppercase tracking-[0.15em]">
          <span className="font-mono text-gold-soft mr-2">LOG //</span>
          Completed Pictorial Sessions Today
        </h3>
        <span className="font-mono text-[10px] text-neutral-500 uppercase">
          {recentlyDone.length} Records
        </span>
      </div>
      {recentlyDone.length === 0 ? (
        <p className="font-mono text-xs text-neutral-400 py-8 text-center uppercase">
          No completed sessions recorded yet today.
        </p>
      ) : (
        <div className="divide-y divide-neutral-200 text-xs">
          {recentlyDone.map((reg) => (
            <div
              key={reg.id}
              className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
            >
              <div className="flex items-center gap-3">
                <span className="font-mono font-black text-gold bg-obsidian px-2.5 py-1">
                  {formatQueueNumber(reg.queue_number)}
                </span>
                <div>
                  <span className="font-black text-ink uppercase text-sm">
                    {formatClientName(reg)}
                  </span>
                  <span className="text-red-600 ml-2 font-mono font-bold">
                    {formatJobOrderNo(reg.job_order_no)}
                  </span>
                  <div className="text-[11px] text-neutral-500 font-medium">
                    {clientGroup(reg, true)} •{' '}
                    {clientDetail(reg)}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between sm:justify-end gap-3 pl-11 sm:pl-0">
                {activePhotographyTasks(reg).length ? (
                  // One Re-shoot per finished session: the session's own photographer, or the admin.
                  <PhotographyProgress registration={reg} action={(task) => onReshoot && task.status === 'completed'
                    && ['shooting', 'done_shooting'].includes(reg.status) && (admin || task.photographerId === photographerId)
                    && !chooserStarted(reg) ? reshootButton(() => onReshoot(reg, task)) : null} />
                ) : <span className="inline-flex items-center gap-1 font-mono text-[10px] font-black uppercase tracking-wider text-ink bg-gold-wash px-2.5 py-1 border border-gold">
                  <CheckCircle2 className="w-3.5 h-3.5 text-gold-soft" /> Done Shooting
                </span>}
                {onReshoot && reg.status === 'done_shooting' && !activePhotographyTasks(reg).length
                  && (chooserStarted(reg) ? null : reshootButton(() => onReshoot(reg)))}
                {chooserStarted(reg) && (admin && onPaidRetake
                  ? <button type="button" disabled={busy} onClick={() => onPaidRetake(reg)}
                    title="The client chose already: start a paid retake (admin)"
                    className="btn-tactile mt-1 inline-flex min-h-9 items-center gap-1 border border-gold bg-obsidian px-2.5 font-mono text-[10px] font-black uppercase tracking-wider text-gold cursor-pointer disabled:opacity-50">
                    <RotateCcw className="w-3.5 h-3.5" /> Paid retake
                  </button>
                  : chooserNote)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
