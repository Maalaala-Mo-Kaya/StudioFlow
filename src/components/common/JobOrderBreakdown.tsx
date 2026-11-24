import { Check, Sparkles } from 'lucide-react';
import { formatCurrency } from '../../utils/formatters';

interface PurchaseLine {
  code?: string;
  name: string;
  amount: number;
}

interface JobOrderBreakdownProps {
  selectedPackage?: PurchaseLine;
  optionLines?: readonly string[];
  addOns: readonly (PurchaseLine & { auto_applied?: boolean })[];
  addOnsClassName?: string;
}

export function JobOrderBreakdown({
  selectedPackage, optionLines = [], addOns, addOnsClassName = '',
}: JobOrderBreakdownProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="font-mono text-[9px] font-bold uppercase tracking-widest text-neutral-400">Chosen pictorial package</p>
        {selectedPackage ? (
          <div className="flex items-start justify-between gap-2 border border-gold/40 bg-obsidian-2 p-3">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              {selectedPackage.code && (
                <span className="bg-gold px-1.5 py-0.5 text-[9px] font-black uppercase text-on-gold wrap-break-word">
                  {selectedPackage.code}
                </span>
              )}
              <span className="min-w-0 text-xs font-black uppercase text-white wrap-break-word">{selectedPackage.name}</span>
            </div>
            <span className="shrink-0 text-sm font-black text-gold">
              {formatCurrency(selectedPackage.amount, { exact: true })}
            </span>
          </div>
        ) : (
          <p className="border border-dashed border-neutral-700 p-3 text-center text-[11px] text-neutral-400 italic">
            Please select a package from Section 03
          </p>
        )}
        {selectedPackage && optionLines.length > 0 && (
          <ul className="space-y-1 text-[11px] text-neutral-300">
            {optionLines.map((line, index) => (
              <li key={index} className="flex items-start gap-1.5 wrap-break-word">
                <Check className="mt-0.5 size-3 shrink-0 text-gold" aria-hidden="true" />
                <span className="min-w-0">{line}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {addOns.length > 0 && (
        <div className="space-y-1.5">
          <p className="font-mono text-[9px] font-bold uppercase tracking-widest text-neutral-400">Selected add-ons ({addOns.length})</p>
          <ul className={`space-y-1 ${addOnsClassName}`}>
            {addOns.map((item, index) => (
              <li key={index} className="flex items-baseline justify-between gap-2 border border-neutral-800 bg-obsidian-2 px-2 py-1 text-[11px]">
                <div className="flex min-w-0 items-start gap-1.5 text-neutral-300">
                  <Sparkles className="mt-0.5 size-3 shrink-0 text-gold" aria-hidden="true" />
                  <span className="min-w-0 wrap-break-word">
                    {item.name}{item.auto_applied && <span className="text-gold-soft"> · Automatic</span>}
                  </span>
                </div>
                <span className="shrink-0 font-black text-gold-soft">+{formatCurrency(item.amount, { exact: true })}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
