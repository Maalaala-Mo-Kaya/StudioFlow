import React from 'react';

interface ContactDetailsSectionProps {
  mobileNumber: string;
  onMobileNumberChange: (value: string) => void;
  email: string;
  onEmailChange: (value: string) => void;
}

export const ContactDetailsSection: React.FC<ContactDetailsSectionProps> = ({
  mobileNumber,
  onMobileNumberChange,
  email,
  onEmailChange,
}) => {
  return (
    <section aria-labelledby="sec-contact">
      <div className="flex items-center justify-between pb-2.5 border-b-2 border-[#0A0A0A] mb-5">
        <h2
          id="sec-contact"
          className="text-xs sm:text-sm font-black uppercase tracking-[0.15em] text-[#0A0A0A] m-0"
        >
          <span className="font-mono text-[#9A7816] mr-2">02 //</span>
          Contact Details
        </h2>
        <span className="font-mono text-[10px] text-neutral-500 uppercase">SMS &amp; Drive Link</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-[11px] font-black text-[#0A0A0A] uppercase tracking-wider mb-1.5">
            Mobile Number <span className="text-red-600">*</span>
          </label>
          <input
            type="tel"
            required
            placeholder="0917-000-0000"
            value={mobileNumber}
            onChange={(e) => onMobileNumberChange(e.target.value)}
            className="w-full min-h-[48px] text-sm px-3.5 py-2.5 border border-neutral-400 focus:border-[#0A0A0A] bg-[#F8F7F4] focus:bg-white font-mono font-bold"
          />
        </div>
        <div>
          <label className="block text-[11px] font-black text-[#0A0A0A] uppercase tracking-wider mb-1.5">
            Email Address
          </label>
          <input
            type="email"
            placeholder="graduate@email.com"
            value={email}
            onChange={(e) => onEmailChange(e.target.value)}
            className="w-full min-h-[48px] text-sm px-3.5 py-2.5 border border-neutral-400 focus:border-[#0A0A0A] bg-[#F8F7F4] focus:bg-white font-semibold"
          />
        </div>
      </div>
    </section>
  );
};
