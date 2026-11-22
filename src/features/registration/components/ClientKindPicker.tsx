import React from 'react';
import { GraduationCap, Camera } from 'lucide-react';
import type { ClientKind } from '../../../types';
import { validationProps, type RegistrationErrors } from '../registrationValidation';
import { RegistrationFieldError } from './RegistrationFieldError';

const OPTIONS: Record<ClientKind, { title: string; hint: string; Icon: typeof Camera }> = {
  school: { title: 'School / Graduation', hint: 'Graduation pictorial through your school or campus.', Icon: GraduationCap },
  walkin: { title: 'Walk-in / Studio Client', hint: 'Family or personal portraits, and events like weddings or birthdays.', Icon: Camera },
};

/** Shown only when both client types are switched on. */
export const ClientKindPicker: React.FC<{
  kinds: ClientKind[];
  value: ClientKind | '';
  onChange: (kind: ClientKind) => void;
  errors: RegistrationErrors;
}> = ({ kinds, value, onChange, errors }) => (
  <section aria-labelledby="sec-client-kind">
    <div className="flex items-center justify-between pb-2.5 border-b-2 border-line mb-4">
      <h2 id="sec-client-kind" className="text-xs sm:text-sm font-black uppercase tracking-[0.15em] text-ink m-0">
        Type of Client
      </h2>
      <span className="font-mono text-[10px] text-neutral-500 uppercase">Required *</span>
    </div>
    <div {...validationProps('client_kind', errors.client_kind)} role="radiogroup" tabIndex={-1} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {kinds.map((kind) => {
        const { title, hint, Icon } = OPTIONS[kind];
        const selected = value === kind;
        return (
          <button
            key={kind}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(kind)}
            className={`btn-tactile text-left flex items-start gap-3 p-4 border-2 cursor-pointer transition ${
              selected ? 'border-line bg-gold-wash shadow-lux-gold' : 'border-neutral-300 bg-canvas hover:border-line'
            }`}
          >
            <span className={`w-10 h-10 shrink-0 flex items-center justify-center ${selected ? 'bg-gold text-on-gold' : 'bg-obsidian text-gold'}`}>
              <Icon className="w-5 h-5" />
            </span>
            <span>
              <span className="block text-sm font-black uppercase tracking-wide text-ink">{title}</span>
              <span className="block text-xs text-neutral-600 mt-0.5">{hint}</span>
            </span>
          </button>
        );
      })}
    </div>
    <RegistrationFieldError field="client_kind" errors={errors} />
  </section>
);
