import React from 'react';
import { ArrowRight } from 'lucide-react';
import { useRegistrationForm } from './useRegistrationForm';
import { RegistrationConfirmation } from './components/RegistrationConfirmation';
import { MasterListLookup } from './components/MasterListLookup';
import { ClientInfoSection } from './components/ClientInfoSection';
import { ContactDetailsSection } from './components/ContactDetailsSection';
import { PackageSelectionSection } from './components/PackageSelectionSection';
import { TermsAndSignatureSection } from './components/TermsAndSignatureSection';
import { RegistrationSummarySidebar } from './components/RegistrationSummarySidebar';

export const RegisterPage: React.FC = () => {
  const form = useRegistrationForm();

  if (form.submittedRecord) {
    return (
      <RegistrationConfirmation record={form.submittedRecord} onReset={form.resetForm} />
    );
  }

  return (
    <div className="w-full max-w-[1680px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 py-6 sm:py-8">
      {/* Architectural Masthead Banner */}
      <div className="animate-enter bg-[#0A0A0A] text-white p-6 sm:p-8 mb-8 border-2 border-[#0A0A0A] shadow-[6px_6px_0px_#C9A227]">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-5 border-b border-neutral-800">
          <div>
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-[#C9A227] block mb-1.5">
              FORM // GRADUATION &amp; PORTRAIT JOB ORDER
            </span>
            <h1 className="text-2xl sm:text-4xl font-black tracking-tight uppercase text-white leading-none">
              Client <span className="text-[#C9A227]">Registration</span>
            </h1>
          </div>
          <span className="font-mono text-[11px] text-neutral-400 uppercase tracking-widest">
            HI-LIGHT STUDIO • CEBU
          </span>
        </div>

        <p className="text-xs sm:text-sm text-neutral-300 mt-4 max-w-3xl leading-relaxed">
          Complete your academic profile, select your portrait package, and sign below to generate
          your official Job Order and studio queue number.
        </p>

        {/* Sharp Step Index Bar */}
        <div className="grid grid-cols-4 gap-2 mt-6 pt-4 border-t border-neutral-800 font-mono text-[10px] font-bold uppercase tracking-wider">
          <div className="flex items-center gap-1.5 text-[#C9A227]">
            <span className="px-1.5 py-0.5 bg-[#C9A227] text-[#0A0A0A] font-black">01</span>
            <span className="truncate">Client</span>
          </div>
          <div className="flex items-center gap-1.5 text-neutral-400">
            <span className="px-1.5 py-0.5 border border-neutral-700 text-[#C9A227]">02</span>
            <span className="truncate">Contact</span>
          </div>
          <div className="flex items-center gap-1.5 text-neutral-400">
            <span className="px-1.5 py-0.5 border border-neutral-700 text-[#C9A227]">03</span>
            <span className="truncate">Package</span>
          </div>
          <div className="flex items-center gap-1.5 text-neutral-400">
            <span className="px-1.5 py-0.5 border border-neutral-700 text-[#C9A227]">04</span>
            <span className="truncate">Sign</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Form & Master Lookup (8 cols on lg) */}
        <div className="lg:col-span-8 space-y-6">
          {/* Optional Master List Quick Match */}
          <MasterListLookup
            masterList={form.masterList}
            isSearching={form.isSearching}
            onToggleSearch={() => form.setIsSearching(!form.isSearching)}
            searchName={form.searchName}
            onSearchNameChange={form.setSearchName}
            onSelectItem={form.selectFromMasterList}
          />

          {/* Main Registration Form */}
          <form
            id="client-registration-form"
            onSubmit={form.handleSubmit}
            className="animate-enter-delay-1 space-y-8 bg-white border-2 border-[#0A0A0A] p-5 sm:p-8 shadow-[6px_6px_0px_#0A0A0A]"
          >
            <ClientInfoSection
              familyName={form.familyName}
              onFamilyNameChange={form.setFamilyName}
              givenName={form.givenName}
              onGivenNameChange={form.setGivenName}
              middleName={form.middleName}
              onMiddleNameChange={form.setMiddleName}
              organizations={form.organizations}
              selectedOrgId={form.selectedOrgId}
              onOrgChange={form.setSelectedOrgId}
              levels={form.levels}
              selectedLevelId={form.selectedLevelId}
              onLevelChange={form.setSelectedLevelId}
              courses={form.courses}
              schoolCatalogLoading={form.schoolCatalogLoading}
              schoolCatalogFailed={form.schoolCatalogFailed}
              selectedCourseId={form.selectedCourseId}
              onCourseChange={form.setSelectedCourseId}
              section={form.section}
              onSectionChange={form.setSection}
            />

            <ContactDetailsSection
              mobileNumber={form.mobileNumber}
              onMobileNumberChange={form.setMobileNumber}
              email={form.email}
              onEmailChange={form.setEmail}
            />

            <PackageSelectionSection
              packages={form.packages}
              selectedPackageId={form.selectedPackageId}
              onSelectPackage={form.setSelectedPackageId}
              addOnsList={form.addOnsList}
              selectedAddOns={form.selectedAddOns}
              onToggleAddOn={form.toggleAddOn}
              paymentType={form.paymentType}
              onPaymentTypeChange={form.setPaymentType}
              totalAmount={form.totalAmount}
            />

            <TermsAndSignatureSection
              termsAccepted={form.termsAccepted}
              onTermsAcceptedChange={form.setTermsAccepted}
              onSignatureChange={form.handleSignatureChange}
            />

            {/* Submit Action at the bottom of the form */}
            <div className="pt-3 border-t border-neutral-200">
              <button
                type="submit"
                disabled={form.isSubmitting}
                className="btn-tactile w-full min-h-[54px] py-4 px-6 bg-[#0A0A0A] hover:bg-neutral-900 disabled:bg-neutral-400 text-[#C9A227] border-2 border-[#0A0A0A] font-black text-xs sm:text-sm uppercase tracking-[0.2em] shadow-[4px_4px_0px_#C9A227] flex items-center justify-center gap-2 cursor-pointer transition-all"
              >
                <span>
                  {form.isSubmitting
                    ? 'Recording Official Job Order...'
                    : 'Submit Registration'}
                </span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </form>
        </div>

        {/* Right Column: Sticky Live Job Order Summary & Checkout (4 cols on lg) */}
        <aside className="lg:col-span-4 lg:sticky lg:top-6 space-y-6">
          <RegistrationSummarySidebar
            familyName={form.familyName}
            givenName={form.givenName}
            middleName={form.middleName}
            organizations={form.organizations}
            selectedOrgId={form.selectedOrgId}
            courses={form.courses}
            selectedCourseId={form.selectedCourseId}
            packages={form.packages}
            selectedPackageId={form.selectedPackageId}
            addOnsList={form.addOnsList}
            selectedAddOns={form.selectedAddOns}
            totalAmount={form.totalAmount}
            paymentType={form.paymentType}
            onPaymentTypeChange={form.setPaymentType}
            termsAccepted={form.termsAccepted}
            hasSignature={form.hasSignature}
            isSubmitting={form.isSubmitting}
            onSubmit={form.handleSubmit}
          />
        </aside>
      </div>
    </div>
  );
};
