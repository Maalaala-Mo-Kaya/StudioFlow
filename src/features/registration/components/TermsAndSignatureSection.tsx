import React from 'react';
import { REGISTRATION_TERMS_CLAUSES } from '../../../constants/studio';
import { SignaturePad } from '../../../components/SignaturePad';
import { validationProps, type RegistrationErrors } from '../registrationValidation';
import { RegistrationFieldError } from './RegistrationFieldError';

interface TermsAndSignatureSectionProps {
  termsAccepted: boolean;
  onTermsAcceptedChange: (accepted: boolean) => void;
  onSignatureChange: (blob: Blob | null, dataUrl?: string | null) => void;
  errors: RegistrationErrors;
  /** Clauses to show; defaults to the school/graduation terms. */
  clauses?: readonly string[];
  walkIn?: boolean;
}

export const TermsAndSignatureSection: React.FC<TermsAndSignatureSectionProps> = ({
  termsAccepted,
  onTermsAcceptedChange,
  onSignatureChange,
  errors,
  clauses = REGISTRATION_TERMS_CLAUSES,
  walkIn = false,
}) => {
  return (
    <>
      {/* SECTION 4: Terms & Conditions */}
      <section aria-labelledby="sec-terms">
        <div className="flex items-center justify-between pb-2.5 border-b-2 border-line mb-4">
          <h2
            id="sec-terms"
            className="text-xs sm:text-sm font-black uppercase tracking-[0.15em] text-ink m-0"
          >
            Studio Terms &amp; Conditions
          </h2>
          <span className="font-mono text-[10px] text-neutral-500 uppercase">
            {clauses.length} Clauses
          </span>
        </div>

        <div className="bg-canvas border border-neutral-300 p-4 text-xs text-neutral-700 space-y-1.5 max-h-48 overflow-y-auto leading-relaxed">
          {clauses.map((clause, index) => (
            <p key={index}>
              <strong>{index + 1}.</strong> {clause}
            </p>
          ))}
        </div>

        <label className="mt-4 flex items-start gap-3 cursor-pointer select-none p-3.5 border border-neutral-300 hover:border-line has-[[aria-invalid=true]]:border-red-600 bg-canvas transition">
          <input
            {...validationProps('terms_accepted', errors.terms_accepted)}
            type="checkbox"
            required
            checked={termsAccepted}
            onChange={(e) => onTermsAcceptedChange(e.target.checked)}
            className="mt-0.5 w-5 h-5 accent-gold shrink-0"
          />
          <span className="text-xs sm:text-sm font-bold text-ink">
            I have read and agree to the Hi-Light Studio Terms &amp; Conditions and authorize the
            processing of my {walkIn ? 'portrait and event' : 'graduation portrait'} data.
          </span>
        </label>
        <RegistrationFieldError field="terms_accepted" errors={errors} />
      </section>

      {/* SECTION 5: Digital Signature */}
      <section {...validationProps('signature', errors.signature)} aria-labelledby="sec-signature" tabIndex={-1}>
        <div className="flex items-center justify-between pb-2.5 border-b-2 border-line mb-4">
          <h2
            id="sec-signature"
            className="text-xs sm:text-sm font-black uppercase tracking-[0.15em] text-ink m-0"
          >
            Customer&apos;s Digital Signature
          </h2>
          <span className="font-mono text-[10px] text-neutral-500 uppercase">Touch / Stylus</span>
        </div>

        <SignaturePad onChange={onSignatureChange} />
        <RegistrationFieldError field="signature" errors={errors} />
      </section>
    </>
  );
};
