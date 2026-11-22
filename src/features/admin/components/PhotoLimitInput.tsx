import React, { useState } from 'react';
import { Infinity as InfinityIcon, Hash } from 'lucide-react';

interface PhotoLimitInputProps {
  /** Saved as 0 for unlimited, otherwise how many photos the client chooses. */
  value: number;
  onChange: (value: number) => void;
  label?: string;
}

/**
 * How many photos the client chooses from their shots: Unlimited, or a number the admin types.
 * Stored as before (0 = unlimited), so photo selection is unchanged.
 */
export const PhotoLimitInput: React.FC<PhotoLimitInputProps> = ({ value, onChange, label = 'Photos the client chooses' }) => {
  const limited = value > 0;
  // What is typed, so the box can be cleared while typing without switching back to Unlimited.
  const [typed, setTyped] = useState(limited ? String(value) : '');
  const [lastNumber, setLastNumber] = useState(limited ? value : 3);

  const pick = (number: boolean) => {
    if (number) {
      setTyped(String(lastNumber));
      onChange(lastNumber);
    } else {
      if (limited) setLastNumber(value);
      onChange(0);
    }
  };

  const button = (active: boolean) =>
    `btn-tactile flex-1 min-h-[42px] px-3 flex items-center justify-center gap-1.5 border text-[11px] font-black uppercase cursor-pointer ${
      active ? 'bg-obsidian text-gold border-line' : 'bg-canvas text-neutral-600 border-neutral-300 hover:border-line'
    }`;

  return (
    <fieldset>
      <legend className="block text-[11px] font-black uppercase mb-1">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        <button type="button" aria-pressed={!limited} onClick={() => pick(false)} className={button(!limited)}>
          <InfinityIcon className="w-4 h-4" /> Unlimited
        </button>
        <button type="button" aria-pressed={limited} onClick={() => pick(true)} className={button(limited)}>
          <Hash className="w-3.5 h-3.5" /> Set a number
        </button>
        {limited && (
          <input type="number" min={1} step={1} inputMode="numeric" aria-label="Number of photos" autoFocus
            value={typed}
            onChange={(e) => {
              setTyped(e.target.value);
              const n = Math.floor(Number(e.target.value));
              if (Number.isFinite(n) && n >= 1) { onChange(n); setLastNumber(n); }
            }}
            onBlur={() => setTyped(String(value))}
            className="w-24 min-h-[42px] px-3 py-2 border border-line bg-panel font-black text-center" />
        )}
      </div>
      <p className="mt-1 text-[10px] font-sans normal-case text-neutral-600">
        {limited
          ? `The client picks their best ${value} photo${value === 1 ? '' : 's'} from their shots.`
          : 'The client can pick as many photos as they like.'}
      </p>
    </fieldset>
  );
};
