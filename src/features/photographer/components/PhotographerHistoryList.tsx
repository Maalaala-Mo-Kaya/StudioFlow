import React from 'react';
import { CheckCircle2 } from 'lucide-react';
import type { Registration } from '../../../types';
import {
  formatClientName,
  formatJobOrderNo,
  formatQueueNumber,
} from '../../../utils/formatters';
import { clientDetail, clientGroup } from '../../../utils/clientInfo';
import { PhotographyProgress } from './PhotographyProgress';

interface PhotographerHistoryListProps {
  recentlyDone: Registration[];
}

export const PhotographerHistoryList: React.FC<PhotographerHistoryListProps> = ({
  recentlyDone,
}) => {
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
                {reg.photography?.tasks.length ? <PhotographyProgress registration={reg} /> : <span className="inline-flex items-center gap-1 font-mono text-[10px] font-black uppercase tracking-wider text-ink bg-gold-wash px-2.5 py-1 border border-gold">
                  <CheckCircle2 className="w-3.5 h-3.5 text-gold-soft" /> Done Shooting
                </span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
