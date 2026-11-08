import React from 'react';
import { ShoppingBag, Check, ShieldCheck, ArrowRight, Loader2, Sparkles } from 'lucide-react';
import type { Package, AddOn, Organization, Course } from '../../../types';
import { formatCurrency } from '../../../utils/formatters';

interface RegistrationSummarySidebarProps {
  familyName: string;
  givenName: string;
  middleName?: string;
  organizations: Organization[];
  selectedOrgId: string;
  courses: Course[];
  selectedCourseId: string;
  packages: Package[];
  selectedPackageId: string | null;
  addOnsList: AddOn[];
  selectedAddOns: string[];
  totalAmount: number;
  paymentType: 'full' | 'downpayment';
  onPaymentTypeChange: (type: 'full' | 'downpayment') => void;
  termsAccepted: boolean;
  hasSignature: boolean;
  isSubmitting: boolean;
}

export const RegistrationSummarySidebar: React.FC<RegistrationSummarySidebarProps> = ({
  familyName,
  givenName,
  middleName,
  organizations,
  selectedOrgId,
  courses,
  selectedCourseId,
  packages,
  selectedPackageId,
  addOnsList,
  selectedAddOns,
  totalAmount,
  paymentType,
  onPaymentTypeChange,
  termsAccepted,
  hasSignature,
  isSubmitting,
}) => {
  const selectedOrg = organizations.find((o) => o.id === selectedOrgId);
  const selectedCourse = courses.find((c) => c.id === selectedCourseId);
  const selectedPkg = packages.find((p) => p.id === selectedPackageId);

  const activeAddOns = addOnsList.filter((a) => selectedAddOns.includes(a.id));

  const amountDueNow = selectedPkg && paymentType === 'downpayment' ? Math.ceil(totalAmount * 0.5) : totalAmount;
  const remainingBalance = totalAmount - amountDueNow;

  const fullName = [
    familyName.trim(),
    [givenName.trim(), middleName?.trim()].filter(Boolean).join(' '),
  ]
    .filter(Boolean)
    .join(', ')
    .toUpperCase();

  return (
    <aside
      aria-label="Live Job Order Summary"
      className="hidden lg:block w-full bg-[#0A0A0A] text-white border-2 border-[#0A0A0A] shadow-[8px_8px_0px_#C9A227] p-5 font-mono text-xs sticky top-6 space-y-5 animate-enter"
    >
      {/* Masthead Header */}
      <div className="pb-3 border-b-2 border-neutral-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShoppingBag className="w-4 h-4 text-[#C9A227]" />
          <h3 className="font-mono text-xs font-black uppercase tracking-[0.2em] text-[#C9A227]">
            Job Order Summary
          </h3>
        </div>
        <span className="text-[10px] text-neutral-400 font-mono">LIVE PREVIEW</span>
      </div>

      {/* Participant Profile Preview */}
      <div className="p-3 bg-[#141414] border border-neutral-800 space-y-1.5">
        <span className="text-[9px] uppercase font-bold text-neutral-500 block tracking-widest">
          Candidate Profile
        </span>
        <div className="font-black text-sm text-white truncate">
          {fullName || 'Awaiting Name Input...'}
        </div>
        <div className="text-[11px] text-neutral-400 truncate">
          {selectedOrg?.code || selectedOrg?.name || 'School Not Selected'} •{' '}
          {selectedCourse?.code || selectedCourse?.name || 'Degree Program'}
        </div>
      </div>

      {/* Selected Package Breakdown */}
      <div className="space-y-2">
        <span className="text-[9px] uppercase font-bold text-neutral-500 block tracking-widest">
          Chosen Pictorial Package
        </span>
        {selectedPkg ? (
          <div className="p-3 bg-[#171717] border border-[#C9A227]/40 flex justify-between items-start">
            <div>
              <div className="flex items-center gap-1.5">
                <span className="px-1.5 py-0.5 bg-[#C9A227] text-[#0A0A0A] font-black text-[9px] uppercase">
                  {selectedPkg.code}
                </span>
                <span className="font-black text-xs uppercase text-white truncate max-w-[170px]">
                  {selectedPkg.name}
                </span>
              </div>
            </div>
            <span className="font-black text-[#C9A227] text-sm shrink-0 ml-2">
              {formatCurrency(selectedPkg.amount)}
            </span>
          </div>
        ) : (
          <div className="p-3 border border-dashed border-neutral-700 text-neutral-500 text-center italic text-[11px]">
            Please select a package from Section 03
          </div>
        )}
      </div>

      {/* Selected Add-ons Breakdown */}
      {activeAddOns.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-[9px] uppercase font-bold text-neutral-500 block tracking-widest">
            Selected Add-Ons ({activeAddOns.length})
          </span>
          <div className="space-y-1 max-h-[120px] overflow-y-auto pr-1">
            {activeAddOns.map((addon) => (
              <div
                key={addon.id}
                className="flex justify-between items-center py-1 px-2 bg-[#171717] border border-neutral-800 text-[11px]"
              >
                <div className="flex items-center gap-1.5 text-neutral-300 truncate">
                  <Sparkles className="w-3 h-3 text-[#C9A227] shrink-0" />
                  <span className="truncate">{addon.name}</span>
                </div>
                <span className="font-black text-[#9A7816] shrink-0 ml-2">
                  +{formatCurrency(addon.amount)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Payment Mode Selection */}
      <div className="p-3 bg-[#141414] border border-neutral-800 space-y-2">
        <span className="text-[9px] uppercase font-bold text-[#C9A227] block tracking-widest">
          Counter Payment Mode
        </span>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={!selectedPkg}
            onClick={() => onPaymentTypeChange('full')}
            className={`btn-tactile py-1.5 text-[10px] font-black uppercase tracking-wider border cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${
              selectedPkg && paymentType === 'full'
                ? 'bg-[#C9A227] text-[#0A0A0A] border-[#C9A227]'
                : 'bg-transparent text-neutral-400 border-neutral-700 hover:border-neutral-500'
            }`}
          >
            Full Payment
          </button>
          <button
            type="button"
            disabled={!selectedPkg}
            onClick={() => onPaymentTypeChange('downpayment')}
            className={`btn-tactile py-1.5 text-[10px] font-black uppercase tracking-wider border cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${
              selectedPkg && paymentType === 'downpayment'
                ? 'bg-[#C9A227] text-[#0A0A0A] border-[#C9A227]'
                : 'bg-transparent text-neutral-400 border-neutral-700 hover:border-neutral-500'
            }`}
          >
            50% Downpayment
          </button>
        </div>
      </div>

      {/* Financial Settlement Tally */}
      <div className="border-t border-neutral-800 pt-3 space-y-1.5 text-xs font-mono">
        <div className="flex justify-between text-neutral-400">
          <span>Total Contract Billed:</span>
          <span className="font-bold text-white">{selectedPkg ? formatCurrency(totalAmount) : '₱0.00'}</span>
        </div>
        <div className="flex justify-between text-[#C9A227] font-black">
          <span>Amount Due at Cashier:</span>
          <span className="text-sm">{selectedPkg ? formatCurrency(amountDueNow) : '₱0.00'}</span>
        </div>
        {remainingBalance > 0 && (
          <div className="flex justify-between text-neutral-400 text-[11px]">
            <span>Remaining Balance Due:</span>
            <span className="text-red-400 font-bold">{formatCurrency(remainingBalance)}</span>
          </div>
        )}
      </div>

      {/* Compliance Verification Checkmarks */}
      <div className="border-t border-neutral-800 pt-3 space-y-1.5 text-[11px]">
        <div className="flex items-center gap-2">
          <div
            className={`w-3.5 h-3.5 flex items-center justify-center border ${
              termsAccepted
                ? 'bg-[#C9A227] border-[#C9A227] text-[#0A0A0A]'
                : 'border-neutral-600'
            }`}
          >
            {termsAccepted && <Check className="w-3 h-3 stroke-[3]" />}
          </div>
          <span className={termsAccepted ? 'text-neutral-200 font-bold' : 'text-neutral-500'}>
            Studio Terms &amp; Policies Accepted
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div
            className={`w-3.5 h-3.5 flex items-center justify-center border ${
              hasSignature
                ? 'bg-[#C9A227] border-[#C9A227] text-[#0A0A0A]'
                : 'border-neutral-600'
            }`}
          >
            {hasSignature && <Check className="w-3 h-3 stroke-[3]" />}
          </div>
          <span className={hasSignature ? 'text-neutral-200 font-bold' : 'text-neutral-500'}>
            Touch Signature Captured on File
          </span>
        </div>
      </div>

      {/* Primary Submit Action */}
      <button
        type="submit"
        form="client-registration-form"
        disabled={isSubmitting}
        className="btn-tactile w-full py-3.5 px-4 bg-[#C9A227] hover:bg-[#dfba3f] text-[#0A0A0A] font-black text-xs uppercase tracking-widest border border-[#C9A227] shadow-[4px_4px_0px_#0A0A0A] flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-all"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Submitting Job Order...</span>
          </>
        ) : (
          <>
            <span>Submit Registration</span>
            <ArrowRight className="w-4 h-4" />
          </>
        )}
      </button>

      <div className="text-center text-[10px] text-neutral-500 font-mono flex items-center justify-center gap-1.5 pt-1">
        <ShieldCheck className="w-3.5 h-3.5 text-[#C9A227]" />
        <span>Instant FCFS Queue Allocation</span>
      </div>
    </aside>
  );
};
