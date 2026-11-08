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
}

export const TermsAndSignatureSection: React.FC<TermsAndSignatureSectionProps> = ({
  termsAccepted,
  onTermsAcceptedChange,
  onSignatureChange,
  errors,
}) => {
  return (
    <>
      {/* SECTION 4: Terms & Conditions */}
      <section aria-labelledby="sec-terms">
        <div className="flex items-center justify-between pb-2.5 border-b-2 border-[#0A0A0A] mb-4">
          <h2
            id="sec-terms"
            className="text-xs sm:text-sm font-black uppercase tracking-[0.15em] text-[#0A0A0A] m-0"
          >
            <span className="font-mono text-[#9A7816] mr-2">04 //</span>
            Studio Terms &amp; Conditions
          </h2>
          <span className="font-mono text-[10px] text-neutral-500 uppercase">
            {REGISTRATION_TERMS_CLAUSES.length} Clauses
          </span>
        </div>

        <div className="bg-[#F8F7F4] border border-neutral-300 p-4 text-xs text-neutral-700 space-y-1.5 max-h-48 overflow-y-auto leading-relaxed">
          {REGISTRATION_TERMS_CLAUSES.map((clause, index) => (
            <p key={index}>
              <strong>{index + 1}.</strong> {clause}
            </p>
          ))}
        </div>

        <label className="mt-4 flex items-start gap-3 cursor-pointer select-none p-3.5 border border-neutral-300 hover:border-[#0A0A0A] has-[[aria-invalid=true]]:border-red-600 bg-[#F8F7F4] transition">
          <input
            {...validationProps('terms_accepted', errors.terms_accepted)}
            type="checkbox"
            required
            checked={termsAccepted}
            onChange={(e) => onTermsAcceptedChange(e.target.checked)}
            className="mt-0.5 w-5 h-5 accent-[#0A0A0A] shrink-0"
          />
          <span className="text-xs sm:text-sm font-bold text-[#0A0A0A]">
            I have read and agree to the Hi-Light Studio Terms &amp; Conditions and authorize the
            processing of my graduation portrait data.
          </span>
        </label>
        <RegistrationFieldError field="terms_accepted" errors={errors} />
      </section>

      {/* SECTION 5: Digital Signature */}
      <section {...validationProps('signature', errors.signature)} aria-labelledby="sec-signature" tabIndex={-1}>
        <div className="flex items-center justify-between pb-2.5 border-b-2 border-[#0A0A0A] mb-4">
          <h2
            id="sec-signature"
            className="text-xs sm:text-sm font-black uppercase tracking-[0.15em] text-[#0A0A0A] m-0"
          >
            <span className="font-mono text-[#9A7816] mr-2">05 //</span>
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
