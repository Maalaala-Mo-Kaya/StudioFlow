import React from 'react';
import { Check, Printer } from 'lucide-react';
import type { Registration } from '../../../types';
import { YellowFormReceipt } from '../../../components/YellowFormReceipt';
import { formatJobOrderNo, formatQueueNumber } from '../../../utils/formatters';

interface RegistrationConfirmationProps {
  record: Registration;
  onReset: () => void;
}

export const RegistrationConfirmation: React.FC<RegistrationConfirmationProps> = ({
  record,
  onReset,
}) => {
  return (
    <div className="w-full max-w-[1200px] mx-auto px-4 sm:px-6 py-6 sm:py-10 animate-enter">
      <div className="no-print bg-[#0A0A0A] text-white border-2 border-[#0A0A0A] p-6 sm:p-8 shadow-[6px_6px_0px_#C9A227] mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-neutral-800">
          <div>
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-[#C9A227] block mb-1">
              STATUS // OFFICIAL JOB ORDER RECORDED
            </span>
            <h2 className="text-2xl sm:text-3xl font-black text-white uppercase tracking-tight">
              Registration Complete
            </h2>
          </div>
          <div className="w-11 h-11 bg-[#C9A227] text-[#0A0A0A] flex items-center justify-center shrink-0">
            <Check className="w-6 h-6 stroke-[3]" />
          </div>
        </div>

        <p className="text-xs sm:text-sm text-neutral-300 mt-4 leading-relaxed">
          Proceed to the <strong className="text-[#C9A227] uppercase">Cashier Counter</strong> and
          present your Job Order or Queue Number below to confirm payment.
        </p>

        <div className="grid grid-cols-2 gap-4 mt-6">
          <div className="bg-[#141414] border border-neutral-800 p-4">
            <span className="font-mono text-[10px] font-bold text-neutral-400 uppercase tracking-widest block">
              Job Order No.
            </span>
            <span className="text-xl sm:text-2xl font-mono font-black text-red-500 mt-1 block">
              {formatJobOrderNo(record.job_order_no)}
            </span>
          </div>
          <div className="bg-[#141414] border border-[#C9A227] p-4">
            <span className="font-mono text-[10px] font-bold text-[#C9A227] uppercase tracking-widest block">
              Daily Queue No.
            </span>
            <span className="text-xl sm:text-2xl font-mono font-black text-white mt-1 block">
              {formatQueueNumber(record.queue_number)}
            </span>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mt-7">
          <button
            type="button"
            onClick={() => window.print()}
            className="btn-tactile flex-1 min-h-[48px] flex items-center justify-center gap-2 px-6 py-3 bg-[#C9A227] text-[#0A0A0A] font-black text-xs uppercase tracking-widest cursor-pointer"
          >
            <Printer className="w-4 h-4" /> Print / Save Claim Stub
          </button>
          <button
            type="button"
            onClick={onReset}
            className="btn-tactile min-h-[48px] px-6 py-3 bg-transparent border border-neutral-700 text-white font-bold text-xs uppercase tracking-widest hover:border-[#C9A227] cursor-pointer"
          >
            Register Next Client
          </button>
        </div>
      </div>

      <div className="animate-enter-delay-1">
        <div className="no-print font-mono text-[10px] font-bold text-neutral-500 uppercase tracking-[0.2em] mb-2">
          PREVIEW // DIGITAL JOB ORDER CLAIM STUB
        </div>
        <YellowFormReceipt registration={record} copyType="customer" />
      </div>
    </div>
  );
};
