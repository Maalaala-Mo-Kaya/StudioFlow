import React from 'react';
import { Check, ArrowLeftRight, Gift } from 'lucide-react';
import type { Gender, PackageOptionGroup } from '../../types';
import { availableChoices, requiredPicks, type OptionPicks } from '../../utils/packageOptions';

interface PackageOptionsPickerProps {
  groups: PackageOptionGroup[];
  gender: Gender | '' | undefined;
  picks: OptionPicks;
  onChange: (picks: OptionPicks) => void;
  /** Shown under the groups, e.g. the server's or the form's message. */
  error?: string;
  disabled?: boolean;
}

/**
 * The client's choices from a package's option groups (kiosk and Edit Client). One-pick groups
 * behave like radio buttons; others stop at the pick count. Only choices for the client's gender
 * show. A group that exchanges an inclusion offers keeping it first and says what is swapped.
 */
export const PackageOptionsPicker: React.FC<PackageOptionsPickerProps> = ({ groups, gender, picks, onChange, error, disabled }) => {
  if (!groups.length) return null;

  const toggle = (group: PackageOptionGroup, choiceId: string) => {
    const need = requiredPicks(group, gender);
    const current = picks[group.id] || [];
    let next: string[];
    if (current.includes(choiceId)) next = current.filter((id) => id !== choiceId);
    else if (need === 1) next = [choiceId];
    else if (current.length < need) next = [...current, choiceId];
    else return;
    onChange({ ...picks, [group.id]: next });
  };

  return (
    <div className="space-y-5">
      {groups.map((group) => {
        const choices = availableChoices(group, gender);
        const need = requiredPicks(group, gender);
        if (!need) return null;
        const chosen = picks[group.id] || [];
        const swapped = group.replaces ? choices.filter((c) => !c.keep && chosen.includes(c.id)) : [];
        const keeps = chosen.some((id) => choices.find((c) => c.id === id)?.keep);
        return (
          <fieldset key={group.id} disabled={disabled}>
            <legend className="w-full flex items-center justify-between gap-2 mb-2 text-[11px] font-black uppercase tracking-wider text-ink">
              <span className="flex items-center gap-1.5">{group.freebie && <Gift className="w-3.5 h-3.5 text-gold" />}{group.name}</span>
              <span className={`font-mono text-[10px] ${chosen.length === need ? 'text-emerald-700' : 'text-gold-soft'}`}>
                {need === 1 ? 'Choose 1' : `Choose ${need} · ${chosen.length} of ${need}`}
              </span>
            </legend>
            {group.freebie && <p className="mb-2 text-xs font-sans text-neutral-700">Free with your package. Choose which one you want:</p>}
            {group.replaces && (
              <p className="mb-2 text-xs font-sans text-neutral-700">
                {choices.some((c) => c.keep)
                  ? <>Your package includes <b>{group.replaces}</b>. Keep it, or exchange it for {need === 1 ? 'one' : 'some'} of these.</>
                  : <>Instead of <b>{group.replaces}</b>, you get {need === 1 && choices.length === 1 ? 'this' : 'your choice of these'}:</>}
              </p>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {choices.map((choice) => {
                const selected = chosen.includes(choice.id);
                const full = !selected && need > 1 && chosen.length >= need;
                return (
                  <button
                    key={choice.id}
                    type="button"
                    role={need === 1 ? 'radio' : 'checkbox'}
                    aria-checked={selected}
                    disabled={disabled || full}
                    onClick={() => toggle(group, choice.id)}
                    className={`min-h-[44px] px-3 py-2 flex items-start gap-2.5 border-2 text-left text-xs font-semibold cursor-pointer transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                      selected ? 'bg-obsidian text-gold border-line' : 'bg-panel text-ink border-neutral-300 hover:border-line'
                    }`}
                  >
                    <span className={`shrink-0 mt-0.5 w-5 h-5 flex items-center justify-center border-2 ${need === 1 ? 'rounded-full' : ''} ${
                      selected ? 'border-gold bg-gold text-on-gold' : 'border-neutral-400'
                    }`}>
                      {selected && <Check className="w-3 h-3" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block">{choice.keep ? `Keep ${choice.label}` : choice.label}</span>
                      {choice.keep && <span className="block text-[10px] font-normal opacity-75">Included in your package</span>}
                      {!!choice.items?.length && (
                        <span className="block text-[10px] font-normal opacity-75">Comes with: {choice.items.join(' · ')}</span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
            {swapped.length > 0 && (
              <p role="status" className="mt-2 flex items-start gap-1.5 p-2 border border-gold bg-gold-wash text-xs font-bold font-sans text-ink">
                <ArrowLeftRight className="w-3.5 h-3.5 shrink-0 mt-0.5 text-gold" />
                {keeps
                  ? <span>You keep {group.replaces} and add {swapped.map((c) => c.label).join(', ')}.</span>
                  : <span>{group.replaces} will be exchanged for {swapped.map((c) => c.label).join(', ')}.</span>}
              </p>
            )}
          </fieldset>
        );
      })}
      {error && <p role="alert" className="text-xs font-bold text-red-700">{error}</p>}
    </div>
  );
};
