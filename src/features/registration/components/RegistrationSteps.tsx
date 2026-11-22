
import { Check } from 'lucide-react';

export interface RegistrationStep {
  id: string;
  label: string;
}

/**
 * The kiosk's step bar: where the client is, which steps are done (those can be opened again),
 * and which are still ahead (locked until the earlier ones are filled in).
 */
export function RegistrationStepBar({ steps, current, reached, onSelect }: {
  steps: RegistrationStep[];
  current: number;
  /** The furthest step the client has reached (steps up to it can be opened). */
  reached: number;
  onSelect: (index: number) => void;
}) {
  return (
    <nav aria-label="Registration steps" className="mb-6 border-2 border-t-0 border-line bg-obsidian px-3 pb-3 pt-3 sm:px-6 shadow-lux-gold">
      <ol className="grid gap-1 font-mono text-[9px] sm:text-[10px] font-bold uppercase tracking-wider"
        style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
        {steps.map((step, index) => {
          const done = index < current;
          const open = index <= reached;
          return (
            <li key={step.id} className="min-w-0">
              <button type="button" disabled={!open || index === current} onClick={() => onSelect(index)}
                aria-current={index === current ? 'step' : undefined}
                className={`w-full flex flex-col items-center gap-1 px-0.5 text-center enabled:cursor-pointer disabled:cursor-default ${
                  index === current ? 'text-gold' : done || open ? 'text-gold-soft hover:text-gold' : 'text-neutral-500'
                }`}>
                <span className={`grid h-6 w-8 place-items-center border font-black ${
                  index === current ? 'border-gold bg-gold text-on-gold'
                    : done ? 'border-gold/70 bg-obsidian text-gold' : 'border-neutral-700 bg-obsidian text-neutral-500'
                }`}>
                  {done ? <Check className="w-3.5 h-3.5" /> : String(index + 1).padStart(2, '0')}
                </span>
                <span className="block w-full truncate leading-tight">{step.label}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
