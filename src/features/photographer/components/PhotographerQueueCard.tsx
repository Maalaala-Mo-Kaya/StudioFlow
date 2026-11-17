import React, { useState } from 'react';
import { Megaphone, CheckCircle2, Folder, Copy, Check } from 'lucide-react';
import type { Registration } from '../../../types';
import {
  formatClientName,
  formatJobOrderNo,
  formatQueueNumber,
  parsePackageInclusions,
} from '../../../utils/formatters';
import { getPhotoFolderPath, copyFolderPathToClipboard } from '../../../utils/folderPath';
import { useToast } from '../../../context/ToastContext';
import { workflowError } from '../../../hooks/useWorkflowData';

interface PhotographerQueueCardProps {
  registration: Registration;
  index: number;
  isShooting: boolean;
  onCallStudent: (reg: Registration) => void;
  onMarkDone: (reg: Registration) => void;
}

export const PhotographerQueueCard: React.FC<PhotographerQueueCardProps> = ({
  registration: reg,
  index,
  isShooting,
  onCallStudent,
  onMarkDone,
}) => {
  const [copied, setCopied] = useState(false);
  const [folderPath, setFolderPath] = useState('');
  const { toast } = useToast();
  const inclusionsArray = parsePackageInclusions(reg.expand?.package?.inclusions);

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
          ? 'bg-[#0A0A0A] text-white border-[#C9A227] shadow-[6px_6px_0px_#C9A227]'
          : index === 0
          ? 'bg-white text-[#0A0A0A] border-[#0A0A0A] shadow-[6px_6px_0px_#C9A227]'
          : 'bg-white text-[#0A0A0A] border-[#0A0A0A] shadow-[4px_4px_0px_#0A0A0A]'
      }`}
    >
      {/* Top Row: Queue Badge & Job Order */}
      <div className="flex justify-between items-center mb-4 pb-3 border-b border-neutral-500/20">
        <div className="flex items-center gap-2">
          <span
            className={`font-mono text-lg font-black px-3 py-1 ${
              isShooting ? 'bg-[#C9A227] text-[#0A0A0A]' : 'bg-[#0A0A0A] text-[#C9A227]'
            }`}
          >
            {formatQueueNumber(reg.queue_number, index + 1)}
          </span>
          {isShooting ? (
            <span className="bg-[#C9A227]/20 text-[#C9A227] font-mono text-[10px] font-black uppercase tracking-widest px-2 py-0.5 border border-[#C9A227] animate-pulse">
              ON SET
            </span>
          ) : index === 0 ? (
            <span className="bg-[#F7F2E0] text-[#9A7816] font-mono text-[10px] font-black uppercase tracking-widest px-2 py-0.5 border border-[#C9A227]">
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
            isShooting ? 'text-white' : 'text-[#0A0A0A]'
          }`}
        >
          {formatClientName(reg)}
        </h3>
        <div
          className={`text-xs font-bold mt-1 uppercase ${
            isShooting ? 'text-[#C9A227]' : 'text-neutral-700'
          }`}
        >
          {reg.expand?.organization?.name || 'School Organization'}
        </div>
        <div
          className={`font-mono text-[11px] mt-0.5 ${
            isShooting ? 'text-neutral-400' : 'text-neutral-500'
          }`}
        >
          {reg.expand?.course?.name || reg.course || 'General Program'}{' '}
          {reg.section ? `• Sec ${reg.section}` : ''}
        </div>

        {/* Package Spec Box */}
        <div
          className={`mt-4 p-3.5 border ${
            isShooting
              ? 'bg-[#141414] border-neutral-800 text-neutral-200'
              : 'bg-[#F8F7F4] border-neutral-300 text-[#0A0A0A]'
          }`}
        >
          <div className="flex items-center justify-between font-mono text-xs font-black uppercase">
            <span className="text-[#9A7816]">{reg.expand?.package?.code || 'PKG-A'}</span>
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
                  <span className="text-[#C9A227] font-mono font-bold">+</span> {inc}
                </li>
              ))}
            </ul>
          )}

          {/* Safe Pictorial Directory Helper (T042 / AC021) */}
          <div className="mt-3 pt-2 border-t border-neutral-500/20 flex items-center justify-between text-[10px] font-mono">
            <span className="flex items-center gap-1 text-neutral-400">
              <Folder className="w-3 h-3 text-[#C9A227]" /> Pictorial Folder:
            </span>
            <button
              type="button"
              onClick={handleCopyFolder}
              className="btn-tactile inline-flex items-center gap-1 px-2 py-0.5 font-bold uppercase bg-[#0A0A0A] text-[#C9A227] hover:bg-neutral-800 cursor-pointer"
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
              onFocus={(event) => event.target.select()} className="mt-2 w-full bg-white text-black border border-neutral-400 p-1 font-mono text-xs" />
          )}
        </div>
      </div>

      {/* Large Touch Action Buttons */}
      <div className="grid grid-cols-2 gap-2.5 pt-3 border-t border-neutral-500/20">
        <button
          type="button"
          onClick={() => onCallStudent(reg)}
          className={`btn-tactile min-h-[46px] flex items-center justify-center gap-1.5 py-2.5 text-xs font-black uppercase tracking-wider border cursor-pointer ${
            isShooting
              ? 'bg-[#141414] text-[#C9A227] border-[#C9A227]'
              : 'bg-[#0A0A0A] text-white border-[#0A0A0A] hover:bg-neutral-800'
          }`}
        >
          <Megaphone className="w-4 h-4 text-[#C9A227]" />
          <span>{isShooting ? 'Recall' : 'Call Client'}</span>
        </button>

        <button
          type="button"
          onClick={() => onMarkDone(reg)}
          className="btn-tactile min-h-[46px] flex items-center justify-center gap-1.5 py-2.5 text-xs font-black uppercase tracking-wider bg-[#C9A227] text-[#0A0A0A] border border-[#0A0A0A] cursor-pointer"
        >
          <CheckCircle2 className="w-4 h-4 stroke-[2.5]" />
          <span>Mark Done</span>
        </button>
      </div>
    </article>
  );
};
