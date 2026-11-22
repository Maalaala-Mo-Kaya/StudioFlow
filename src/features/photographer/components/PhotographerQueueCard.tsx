import React, { useState } from 'react';
import { Megaphone, CheckCircle2, Folder, Copy, Check, Aperture, Gift, ListChecks } from 'lucide-react';
import type { Registration } from '../../../types';
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

interface PhotographerQueueCardProps {
  registration: Registration;
  index: number;
  isShooting: boolean;
  onCallStudent: (reg: Registration) => void;
  onMarkDone: (reg: Registration) => void;
  /** Name of this device's camera, or '' when no camera is in use. */
  cameraName?: string;
  cameraLinked?: boolean;
  onLinkCamera?: (registrationId: string) => void;
}

export const PhotographerQueueCard: React.FC<PhotographerQueueCardProps> = ({
  registration: reg,
  index,
  isShooting,
  onCallStudent,
  onMarkDone,
  cameraName = '',
  cameraLinked = false,
  onLinkCamera,
}) => {
  const [copied, setCopied] = useState(false);
  const [folderPath, setFolderPath] = useState('');
  const { toast } = useToast();
  const inclusionsArray = orderInclusions(reg);
  const freebies = orderFreebies(reg);
  const optionLines = chosenOptionLines(reg.package_options);

  const handleCopyFolder = async () => {
    try {
      const path = await getPhotoFolderPath(reg.id);
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
    <article
      className={`card-interactive border-2 p-5 sm:p-6 flex flex-col justify-between relative ${
        isShooting
          ? 'bg-obsidian text-white border-gold shadow-lux-gold'
          : index === 0
          ? 'bg-panel text-ink border-line shadow-lux-gold'
          : 'bg-panel text-ink border-line shadow-lux'
      }`}
    >
      {/* Top Row: Queue Badge & Job Order */}
      <div className="flex justify-between items-center mb-4 pb-3 border-b border-neutral-500/20">
        <div className="flex items-center gap-2">
          <span
            className={`font-mono text-lg font-black px-3 py-1 ${
              isShooting ? 'bg-gold text-on-gold' : 'bg-obsidian text-gold'
            }`}
          >
            {formatQueueNumber(reg.queue_number)}
          </span>
          {isShooting ? (
            <span className="bg-gold/20 text-gold font-mono text-[10px] font-black uppercase tracking-widest px-2 py-0.5 border border-gold animate-pulse">
              ON SET
            </span>
          ) : index === 0 ? (
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
            isShooting ? 'text-white' : 'text-ink'
          }`}
        >
          {formatClientName(reg)}
        </h3>
        <div
          className={`text-xs font-bold mt-1 uppercase ${
            isShooting ? 'text-gold' : 'text-neutral-700'
          }`}
        >
          {clientGroup(reg, true) || 'School Organization'}
        </div>
        <div
          className={`font-mono text-[11px] mt-0.5 ${
            isShooting ? 'text-neutral-400' : 'text-neutral-500'
          }`}
        >
          {clientDetail(reg, true) || 'General Program'}{' '}
          {reg.section ? `• Sec ${reg.section}` : ''}
        </div>

        {/* Package Spec Box */}
        <div
          className={`mt-4 p-3.5 border ${
            isShooting
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
          {inclusionsArray.length > 0 && (
            <ul
              className={`text-[11px] space-y-1 mt-2 border-t pt-2 ${
                isShooting
                  ? 'border-neutral-800 text-neutral-400'
                  : 'border-neutral-200 text-neutral-600'
              }`}
            >
              {inclusionsArray.slice(0, 3).map((inc, i) => (
                <li key={i} className="truncate flex items-center gap-1.5">
                  <span className="text-gold font-mono font-bold">+</span> {inc}
                </li>
              ))}
            </ul>
          )}
          {optionLines.length > 0 && (
            <ul className={`text-[11px] space-y-1 mt-2 border-t pt-2 font-bold ${
              isShooting ? 'border-neutral-800 text-white' : 'border-neutral-200 text-ink'
            }`}>
              {optionLines.map((line) => (
                <li key={line} className="flex items-center gap-1.5">
                  <ListChecks className="w-3 h-3 shrink-0 text-gold" /> {line}
                </li>
              ))}
            </ul>
          )}
          {freebies.length > 0 && (
            <ul className={`text-[11px] space-y-1 mt-2 border-t pt-2 ${
              isShooting ? 'border-neutral-800 text-gold' : 'border-neutral-200 text-gold-soft'
            }`}>
              {freebies.map((item, i) => (
                <li key={i} className="truncate flex items-center gap-1.5 font-semibold">
                  <Gift className="w-3 h-3 shrink-0" /> {item}
                </li>
              ))}
            </ul>
          )}

          {/* Safe Pictorial Directory Helper (T042 / AC021) */}
          <div className="mt-3 pt-2 border-t border-neutral-500/20 flex items-center justify-between text-[10px] font-mono">
            <span className="flex items-center gap-1 text-neutral-400">
              <Folder className="w-3 h-3 text-gold" /> Pictorial Folder:
            </span>
            <button
              type="button"
              onClick={handleCopyFolder}
              className="btn-tactile inline-flex items-center gap-1 px-2 py-0.5 font-bold uppercase bg-obsidian text-gold hover:bg-neutral-800 cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="w-2.5 h-2.5 text-emerald-400" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-2.5 h-2.5" />
                  <span>Copy Path</span>
                </>
              )}
            </button>
          </div>
          {folderPath && (
            <input type="text" aria-label="Pictorial folder path" value={folderPath} readOnly
              onFocus={(event) => event.target.select()} className="mt-2 w-full bg-panel text-black border border-neutral-400 p-1 font-mono text-xs" />
          )}
        </div>
      </div>

      {/* Camera auto-import link */}
      {cameraName && (cameraLinked ? (
        <div className="mb-3 flex items-center gap-2 px-3 py-2 border border-gold bg-gold-wash text-gold font-mono text-[10px] font-black uppercase tracking-widest">
          <Aperture className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{cameraName} → sending photos here</span>
        </div>
      ) : isShooting && onLinkCamera && (
        <button
          type="button"
          onClick={() => onLinkCamera(reg.id)}
          className="btn-tactile mb-3 w-full min-h-[38px] flex items-center justify-center gap-2 px-3 py-2 border border-gold text-gold bg-obsidian-2 font-mono text-[10px] font-black uppercase tracking-widest cursor-pointer"
        >
          <Aperture className="w-3.5 h-3.5" /> Link Camera ({cameraName})
        </button>
      ))}

      {/* Large Touch Action Buttons */}
      <div className="grid grid-cols-2 gap-2.5 pt-3 border-t border-neutral-500/20">
        <button
          type="button"
          onClick={() => onCallStudent(reg)}
          className={`btn-tactile min-h-[46px] flex items-center justify-center gap-1.5 py-2.5 text-xs font-black uppercase tracking-wider border cursor-pointer ${
            isShooting
              ? 'bg-obsidian-2 text-gold border-gold'
              : 'bg-obsidian text-white border-line hover:bg-neutral-800'
          }`}
        >
          <Megaphone className="w-4 h-4 text-gold" />
          <span>{isShooting ? 'Recall' : 'Call Client'}</span>
        </button>

        <button
          type="button"
          onClick={() => onMarkDone(reg)}
          className="btn-tactile min-h-[46px] flex items-center justify-center gap-1.5 py-2.5 text-xs font-black uppercase tracking-wider bg-gold text-on-gold border border-line cursor-pointer"
        >
          <CheckCircle2 className="w-4 h-4 stroke-[2.5]" />
          <span>Mark Done</span>
        </button>
      </div>
    </article>
  );
};
