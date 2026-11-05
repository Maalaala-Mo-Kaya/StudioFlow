import React from 'react';
import { CheckCircle2 } from 'lucide-react';
import type { Registration } from '../../../types';
import {
  formatClientName,
  formatJobOrderNo,
  formatQueueNumber,
} from '../../../utils/formatters';

interface PhotographerHistoryListProps {
  recentlyDone: Registration[];
}

export const PhotographerHistoryList: React.FC<PhotographerHistoryListProps> = ({
  recentlyDone,
}) => {
  return (
    <div className="animate-enter bg-white border-2 border-[#0A0A0A] shadow-[6px_6px_0px_#0A0A0A] p-5 sm:p-6">
      <div className="flex items-center justify-between pb-3 border-b-2 border-[#0A0A0A] mb-4">
        <h3 className="text-xs sm:text-sm font-black text-[#0A0A0A] uppercase tracking-[0.15em]">
          <span className="font-mono text-[#9A7816] mr-2">LOG //</span>
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
                <span className="font-mono font-black text-[#C9A227] bg-[#0A0A0A] px-2.5 py-1">
                  {formatQueueNumber(reg.queue_number)}
                </span>
                <div>
                  <span className="font-black text-[#0A0A0A] uppercase text-sm">
                    {formatClientName(reg)}
                  </span>
                  <span className="text-red-600 ml-2 font-mono font-bold">
                    {formatJobOrderNo(reg.job_order_no)}
                  </span>
                  <div className="text-[11px] text-neutral-500 font-medium">
                    {reg.expand?.organization?.name} •{' '}
                    {reg.expand?.course?.code || reg.course}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between sm:justify-end gap-3 pl-11 sm:pl-0">
                <span className="inline-flex items-center gap-1 font-mono text-[10px] font-black uppercase tracking-wider text-[#0A0A0A] bg-[#F7F2E0] px-2.5 py-1 border border-[#C9A227]">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#9A7816]" /> Done Shooting
                </span>
                <span className="text-[11px] text-neutral-500 font-mono bg-[#F8F7F4] px-2 py-1 border border-neutral-200">
                  DIR: {reg.job_order_no}_{reg.family_name}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
