import React from 'react';
import { Sparkles } from 'lucide-react';
import { MAKEUP_LOOK_NOTE_MAX } from '../../../constants/makeupLook';
import { validationProps, type RegistrationErrors } from '../registrationValidation';
import { RegistrationFieldError } from './RegistrationFieldError';

interface MakeupLookSectionProps {
  note: string;
  onNoteChange: (value: string) => void;
  errors: RegistrationErrors;
}

/**
 * Shown when the package or an add-on includes makeup / grooming (and the studio asks it):
 * the look the client wants, so the makeup artist knows before they sit down.
 */
export const MakeupLookSection: React.FC<MakeupLookSectionProps> = ({ note, onNoteChange, errors }) => {
  return (
    <section aria-labelledby="sec-look-note">
      <div className="flex items-center justify-between pb-2.5 border-b-2 border-line mb-5">
        <h2 id="sec-look-note" className="text-xs sm:text-sm font-black uppercase tracking-[0.15em] text-ink m-0">
          <span className="font-mono text-gold-soft mr-2">03B //</span>
          Note for the Makeup Artist
        </h2>
        <span className="font-mono text-[10px] text-neutral-500 uppercase">For your makeup artist</span>
      </div>
      <div>
        <label htmlFor="registration-makeup_look_note" className="flex items-center gap-1.5 text-[11px] font-black text-ink uppercase tracking-wider mb-1.5">
          <Sparkles className="w-3.5 h-3.5 text-gold-soft" />
          Note for the makeup artist <span className="font-normal normal-case">(optional)</span>
        </label>
        <input
          {...validationProps('makeup_look_note', errors.makeup_look_note)}
          value={note}
          maxLength={MAKEUP_LOOK_NOTE_MAX}
          placeholder="Tell your makeup artist what you want, your preferences, or anything they should know in advance..."
          onChange={(event) => onNoteChange(event.target.value)}
          className="w-full min-h-[48px] text-sm px-3.5 py-2.5 border border-neutral-400 focus:border-line bg-canvas focus:bg-panel font-bold aria-invalid:border-red-600"
        />
        <RegistrationFieldError field="makeup_look_note" errors={errors} />
      </div>
    </section>
  );
};
