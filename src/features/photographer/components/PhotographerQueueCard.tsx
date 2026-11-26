import React, { useState } from 'react';
import { Megaphone, CheckCircle2, Folder, Copy, Check, Aperture, Gift, ListChecks, MousePointer2, Maximize2, Camera } from 'lucide-react';
import type { Registration } from '../../../types';
import { Modal } from '../../../components/common/Modal';
import { chosenOptionLines } from '../../../utils/packageOptions';
import {
  formatClientName,
  formatJobOrderNo,
  formatQueueNumber,
  orderInclusions,
  orderFreebies,
} from '../../../utils/formatters';
import { getPhotoFolderPath, copyFolderPathToClipboard } from '../../../utils/folderPath';
import { useToast } from '../../../context/ToastContext';
import { workflowError } from '../../../hooks/useWorkflowData';
import { clientDetail, clientGroup } from '../../../utils/clientInfo';

/** Copies the client's photo folder path; shows it in a field when the clipboard isn't available. */
export const CopyPathButton: React.FC<{ registrationId: string; className?: string }> = ({ registrationId, className = '' }) => {
  const [copied, setCopied] = useState(false);
  const [folderPath, setFolderPath] = useState('');
  const { toast } = useToast();
  const copy = async () => {
    try {
      const path = await getPhotoFolderPath(registrationId);
      if (await copyFolderPathToClipboard(path)) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } else {
        setFolderPath(path);
      }
    } catch (error) {
      toast.error(workflowError(error));
    }
  };
  return (
    <>
      <button
        type="button"
        onClick={() => void copy()}
        className={`btn-tactile inline-flex items-center gap-1 px-2 py-0.5 font-bold uppercase bg-obsidian text-gold hover:bg-neutral-800 cursor-pointer ${className}`}
      >
        {copied ? <Check className="w-2.5 h-2.5 text-emerald-400" /> : <Copy className="w-2.5 h-2.5" />}
        <span>{copied ? 'Copied' : 'Copy Path'}</span>
      </button>
      {folderPath && (
        <input type="text" aria-label="Pictorial folder path" value={folderPath} readOnly
          onFocus={(event) => event.target.select()} className="mt-2 w-full bg-panel text-black border border-neutral-400 p-1 font-mono text-xs" />
      )}
    </>
  );
};

/** What the client bought: the package's inclusions, the options they picked and the freebies. */
export const BoughtDetails: React.FC<{ registration: Registration; dark?: boolean }> = ({ registration: reg, dark = false }) => {
  const inclusions = orderInclusions(reg);
  const freebies = orderFreebies(reg);
  const optionLines = chosenOptionLines(reg.package_options);
  const rule = dark ? 'border-neutral-800' : 'border-neutral-200';
  if (!inclusions.length && !optionLines.length && !freebies.length) {
    return <p className={`m-0 mt-2 text-[11px] ${dark ? 'text-neutral-400' : 'text-neutral-600'}`}>No package details.</p>;
  }
  return (
    <>
      {inclusions.length > 0 && (
        <ul className={`text-[11px] space-y-1 mt-2 border-t pt-2 ${rule} ${dark ? 'text-neutral-300' : 'text-neutral-600'}`}>
          {inclusions.map((inc, i) => (
            <li key={i} className="flex items-start gap-1.5">
              <span className="text-gold font-mono font-bold">+</span> {inc}
            </li>
          ))}
        </ul>
      )}
      {optionLines.length > 0 && (
        <ul className={`text-[11px] space-y-1 mt-2 border-t pt-2 font-bold ${rule} ${dark ? 'text-white' : 'text-ink'}`}>
          {optionLines.map((line) => (
            <li key={line} className="flex items-start gap-1.5">
              <ListChecks className="w-3 h-3 mt-0.5 shrink-0 text-gold" /> {line}
            </li>
          ))}
        </ul>
      )}
      {freebies.length > 0 && (
        <ul className={`text-[11px] space-y-1 mt-2 border-t pt-2 ${rule} ${dark ? 'text-gold' : 'text-gold-soft'}`}>
          {freebies.map((item, i) => (
            <li key={i} className="flex items-start gap-1.5 font-semibold">
              <Gift className="w-3 h-3 mt-0.5 shrink-0" /> {item}
            </li>
          ))}
        </ul>
      )}
    </>
  );
};

interface PhotographerQueueCardProps {
  registration: Registration;
  selected?: boolean;
  nextUp?: boolean;
  busy: boolean;
  onSelect?: (reg: Registration) => void;
  onMarkDone: (reg: Registration) => void;
  sessionActions?: React.ReactNode;
  /** Name of the camera currently sending photos to this client. */
  cameraName?: string;
  /** Queue view: name, job order, Copy Path and actions only; Full View opens the details. */
  compact?: boolean;
}

export const PhotographerQueueCard: React.FC<PhotographerQueueCardProps> = ({
  registration: reg,
  selected = false,
  nextUp = false,
  busy,
  onSelect,
  onMarkDone,
  sessionActions,
  cameraName = '',
  compact = false,
}) => {
  const [fullView, setFullView] = useState(false);
  const alreadyOnSet = reg.status === 'shooting';

  const actions = sessionActions ?? <div className={`grid gap-2.5 pt-3 border-t border-neutral-500/20 ${onSelect ? 'grid-cols-2' : 'grid-cols-1'}`}>
    {onSelect && (
      <button
        type="button"
        disabled={busy}
        onClick={() => { setFullView(false); onSelect(reg); }}
        className="btn-tactile flex min-h-[46px] cursor-pointer items-center justify-center gap-1.5 border border-line bg-obsidian px-1 py-2.5 text-xs font-black uppercase tracking-wider text-white hover:border-gold disabled:cursor-default disabled:opacity-50"
      >
        {alreadyOnSet ? <MousePointer2 className="size-4 shrink-0 text-gold" /> : <Megaphone className="size-4 shrink-0 text-gold" />}
        <span>{alreadyOnSet ? 'Select' : 'Call Client'}</span>
      </button>
    )}

    <button
      type="button"
      disabled={busy}
      onClick={() => { setFullView(false); onMarkDone(reg); }}
      className="btn-tactile flex min-h-[46px] cursor-pointer items-center justify-center gap-1.5 border border-line bg-gold px-1 py-2.5 text-xs font-black uppercase tracking-wider text-on-gold disabled:cursor-default disabled:opacity-50"
    >
      <CheckCircle2 className="size-4 shrink-0 stroke-[2.5]" />
      <span>Mark Done</span>
    </button>
  </div>;

  if (compact) {
    return (
      <article className={`card-interactive min-w-0 border-2 p-3.5 flex flex-col gap-3 bg-panel text-ink border-line ${nextUp ? 'shadow-lux-gold' : 'shadow-lux'}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-black px-2 py-0.5 bg-obsidian text-gold">{formatQueueNumber(reg.queue_number)}</span>
              {nextUp && (
                <span className="bg-gold-wash text-gold-soft font-mono text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 border border-gold">
                  Next up
                </span>
              )}
            </div>
            <h3 className="mt-2 text-base font-black uppercase tracking-tight leading-snug text-ink wrap-break-word">{formatClientName(reg)}</h3>
            <p className="m-0 font-mono text-xs font-black text-red-500">{formatJobOrderNo(reg.job_order_no)}</p>
          </div>
          <button type="button" onClick={() => setFullView(true)} aria-label={`Full view of ${formatClientName(reg)}`}
            className="btn-tactile shrink-0 inline-flex items-center gap-1 border border-line bg-canvas px-2 py-1 text-[10px] font-black uppercase tracking-wider text-ink hover:border-gold cursor-pointer">
            <Maximize2 className="w-3 h-3 text-gold" /> Full view
          </button>
        </div>
        <div className="text-[10px] font-mono">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1 text-neutral-500"><Folder className="w-3 h-3 text-gold" /> Folder</span>
            <CopyPathButton registrationId={reg.id} />
          </div>
        </div>
        {actions}
        {fullView && (
          <Modal title={formatClientName(reg)} icon={Camera} size="md" onClose={() => setFullView(false)}
            subtitle={<>{formatJobOrderNo(reg.job_order_no)} · {formatQueueNumber(reg.queue_number)}</>}>
            <PhotographerQueueCard registration={reg} nextUp={nextUp} busy={busy} onSelect={onSelect && ((item) => { setFullView(false); onSelect(item); })}
              onMarkDone={(item) => { setFullView(false); onMarkDone(item); }} sessionActions={sessionActions} cameraName={cameraName} />
          </Modal>
        )}
      </article>
    );
  }

  return (
    <article
      className={`card-interactive min-w-0 border-2 p-4 sm:p-5 flex flex-col justify-between relative ${
        selected
          ? 'bg-obsidian text-white border-gold shadow-lux-gold'
          : nextUp
          ? 'bg-panel text-ink border-line shadow-lux-gold'
          : 'bg-panel text-ink border-line shadow-lux'
      }`}
    >
      {/* Top Row: Queue Badge & Job Order */}
      <div className="flex justify-between items-center mb-4 pb-3 border-b border-neutral-500/20">
        <div className="flex items-center gap-2">
          <span
            className={`font-mono text-lg font-black px-3 py-1 ${
              selected ? 'bg-gold text-on-gold' : 'bg-obsidian text-gold'
            }`}
          >
            {formatQueueNumber(reg.queue_number)}
          </span>
          {selected ? (
            <span className="bg-gold/20 text-gold font-mono text-[10px] font-black uppercase tracking-widest px-2 py-0.5 border border-gold animate-pulse">
              ON SET
            </span>
          ) : nextUp ? (
            <span className="bg-gold-wash text-gold-soft font-mono text-[10px] font-black uppercase tracking-widest px-2 py-0.5 border border-gold">
              NEXT UP
            </span>
          ) : null}
        </div>

        <span className="font-mono font-black text-red-500 text-sm">
          {formatJobOrderNo(reg.job_order_no)}
        </span>
      </div>

      {/* Client Details */}
      <div className="mb-5">
        <h3
          className={`text-xl font-black uppercase tracking-tight leading-snug ${
            selected ? 'text-white' : 'text-ink'
          }`}
        >
          {formatClientName(reg)}
        </h3>
        <div
          className={`text-xs font-bold mt-1 uppercase ${
            selected ? 'text-gold' : 'text-neutral-700'
          }`}
        >
          {clientGroup(reg, true) || 'School Organization'}
        </div>
        <div
          className={`font-mono text-[11px] mt-0.5 ${
            selected ? 'text-neutral-400' : 'text-neutral-500'
          }`}
        >
          {clientDetail(reg, true) || 'General Program'}{' '}
          {reg.section ? `• Sec ${reg.section}` : ''}
        </div>

        {/* Package Spec Box */}
        <div
          className={`mt-4 p-3.5 border ${
            selected
              ? 'bg-obsidian-2 border-neutral-800 text-neutral-200'
              : 'bg-canvas border-neutral-300 text-ink'
          }`}
        >
          <div className="flex items-center justify-between font-mono text-xs font-black uppercase">
            <span className="text-gold-soft">{reg.expand?.package?.code || 'PKG-A'}</span>
            <span className="truncate ml-2">
              {reg.expand?.package?.name || 'Pictorial Package'}
            </span>
          </div>
          <BoughtDetails registration={reg} dark={selected} />

          {/* Safe Pictorial Directory Helper (T042 / AC021) */}
          <div className="mt-3 pt-2 border-t border-neutral-500/20 flex items-center justify-between text-[10px] font-mono">
            <span className="flex items-center gap-1 text-neutral-500">
              <Folder className="w-3 h-3 text-gold" /> Pictorial Folder:
            </span>
            <CopyPathButton registrationId={reg.id} />
          </div>
        </div>
      </div>

      {/* Camera auto-import link */}
      {cameraName && (
        <div role="status" className="mb-3 flex min-h-10 items-center gap-2 border-2 border-gold bg-gold px-3 py-2 font-mono text-[11px] font-black uppercase tracking-wider text-on-gold shadow-lux-gold">
          <Aperture className="size-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 wrap-break-word">{cameraName} → sending photos here</span>
          <span aria-hidden="true" className="ml-auto size-2 shrink-0 rounded-full bg-emerald-700 motion-safe:animate-status-pulse" />
        </div>
      )}

      {/* Large Touch Action Buttons */}
      {actions}
    </article>
  );
};
