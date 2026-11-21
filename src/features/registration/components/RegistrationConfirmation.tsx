import React from 'react';
import { Check } from 'lucide-react';
import type { Registration } from '../../../types';
import { SoldPackageChoices } from '../../packages/SoldPackageChoices';

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
      <div className="no-print bg-obsidian text-white border-2 border-line p-6 sm:p-8 shadow-lux-gold mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-neutral-800">
          <div>
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-gold block mb-1">
              Pending payment
            </span>
            <h2 className="text-2xl sm:text-3xl font-black text-white uppercase tracking-tight">
              Registration Complete
            </h2>
          </div>
          <div className="w-11 h-11 bg-gold text-on-gold flex items-center justify-center shrink-0">
            <Check className="w-6 h-6 stroke-[3]" />
          </div>
        </div>

        <p className="text-xs sm:text-sm text-neutral-300 mt-4 leading-relaxed">
          Proceed to the <strong className="text-gold uppercase">Cashier Counter</strong> and
          show your registration reference to pay. The cashier issues your official Job Order after payment.
        </p>

        <div className="mt-6 border border-gold bg-obsidian-2 p-4">
          <span className="block font-mono text-[10px] font-bold uppercase tracking-widest text-gold">
            Registration reference
          </span>
          <span className="mt-1 block break-all font-mono text-xl font-black text-white">{record.id}</span>
        </div>
        {record.package_snapshot?.configuration?.selections.length ? (
          <div className="mt-4 space-y-2 border border-line bg-obsidian-2 p-4">
            <p className="font-bold text-gold">{record.package_snapshot.name}</p>
            <SoldPackageChoices registration={record} showPrice />
          </div>
        ) : null}

        <div className="flex flex-col sm:flex-row gap-3 mt-7">
          <button
            type="button"
            onClick={onReset}
            className="btn-tactile flex-1 min-h-[48px] px-6 py-3 bg-gold text-on-gold font-black text-xs uppercase tracking-widest cursor-pointer"
          >
            Register Next Client
          </button>
        </div>
      </div>
    </div>
  );
};
