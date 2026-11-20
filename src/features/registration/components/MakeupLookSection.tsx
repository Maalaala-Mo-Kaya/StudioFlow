import React from 'react';
import { Sparkles } from 'lucide-react';
import { MAKEUP_LOOKS, MAKEUP_LOOK_NOTE_MAX, type MakeupLook } from '../../../constants/makeupLook';
import { validationProps, type RegistrationErrors } from '../registrationValidation';
import { RegistrationFieldError } from './RegistrationFieldError';

interface MakeupLookSectionProps {
  value: MakeupLook | '';
  onChange: (value: MakeupLook) => void;
  note: string;
  onNoteChange: (value: string) => void;
  errors: RegistrationErrors;
}

/**
 * Shown when the package or an add-on includes makeup / grooming (and the studio asks it):
 * the look the client wants, so the makeup artist knows before they sit down.
 */
export const MakeupLookSection: React.FC<MakeupLookSectionProps> = ({ value, onChange, note, onNoteChange, errors }) => {
  const field = validationProps('makeup_look', errors.makeup_look);
  return (
    <section aria-labelledby="sec-look">
      <div className="flex items-center justify-between pb-2.5 border-b-2 border-line mb-5">
        <h2 id="sec-look" className="text-xs sm:text-sm font-black uppercase tracking-[0.15em] text-ink m-0">
          <span className="font-mono text-gold-soft mr-2">03B //</span>
          Preferred Look
        </h2>
        <span className="font-mono text-[10px] text-neutral-500 uppercase">For your makeup artist</span>
      </div>

      <p className="text-xs text-neutral-600 mb-3">
        Your package includes makeup / grooming. Choose the look you want so the makeup artist can prepare. <span className="text-red-600">*</span>
      </p>

      <div
        role="radiogroup"
        id={field.id}
        tabIndex={-1}
        aria-label="Preferred look"
        aria-invalid={field['aria-invalid']}
        aria-describedby={field['aria-describedby']}
        className="grid grid-cols-1 sm:grid-cols-3 gap-3"
      >
        {MAKEUP_LOOKS.map((look) => {
          const selected = value === look.value;
          return (
            <button
              key={look.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(look.value)}
              className={`btn-tactile min-h-[88px] text-left p-4 border-2 cursor-pointer transition-colors ${
                selected ? 'border-gold bg-gold-wash shadow-lux-gold' : errors.makeup_look ? 'border-red-600 bg-canvas' : 'border-neutral-400 bg-canvas hover:border-line'
              }`}
            >
              <span className="flex items-center gap-2 text-sm font-black uppercase text-ink">
                <span className={`w-4 h-4 shrink-0 rounded-full border-2 flex items-center justify-center ${selected ? 'border-gold' : 'border-neutral-400'}`}>
                  {selected && <span className="w-2 h-2 rounded-full bg-gold" />}
                </span>
                {look.label}
              </span>
              <span className="block mt-1.5 text-[11px] text-neutral-600 leading-snug">{look.hint}</span>
            </button>
          );
        })}
      </div>
      <RegistrationFieldError field="makeup_look" errors={errors} />

      <div className="mt-4">
        <label htmlFor="registration-makeup_look_note" className="flex items-center gap-1.5 text-[11px] font-black text-ink uppercase tracking-wider mb-1.5">
          <Sparkles className="w-3.5 h-3.5 text-gold-soft" />
          Note for the makeup artist <span className="font-normal normal-case">(optional)</span>
        </label>
        <input
          {...validationProps('makeup_look_note', errors.makeup_look_note)}
          value={note}
          maxLength={MAKEUP_LOOK_NOTE_MAX}
          placeholder="e.g. no lipstick, sensitive skin, allergic to …"
          onChange={(event) => onNoteChange(event.target.value)}
          className="w-full min-h-[48px] text-sm px-3.5 py-2.5 border border-neutral-400 focus:border-line bg-canvas focus:bg-panel font-bold aria-invalid:border-red-600"
        />
        <RegistrationFieldError field="makeup_look_note" errors={errors} />
      </div>
    </section>
  );
};
