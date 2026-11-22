import React, { useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Pencil } from 'lucide-react';
import { useRegistrationForm } from './useRegistrationForm';
import { RegistrationConfirmation } from './components/RegistrationConfirmation';
import { MasterListLookup } from './components/MasterListLookup';
import { ClientInfoSection } from './components/ClientInfoSection';
import { ContactDetailsSection } from './components/ContactDetailsSection';
import { PackageSelectionSection } from './components/PackageSelectionSection';
import { TermsAndSignatureSection } from './components/TermsAndSignatureSection';
import { RegistrationSummarySidebar } from './components/RegistrationSummarySidebar';
import { RegistrationStepBar } from './components/RegistrationSteps';
import { ClientKindPicker } from './components/ClientKindPicker';
import { WalkInDetailsSection } from './components/WalkInDetailsSection';
import { MakeupLookSection } from './components/MakeupLookSection';
import { PackageOptionsSection } from './components/PackageOptionsSection';
import { RegistrationFieldError } from './components/RegistrationFieldError';
import { genderOptions, validationProps, type RegistrationErrors } from './registrationValidation';
import { availableChoices, chosenOptionLines } from '../../utils/packageOptions';
import { formatCurrency } from '../../utils/formatters';

type StepId = 'package' | 'options' | 'about' | 'school' | 'extras' | 'sign';
type Field = keyof RegistrationErrors;

/**
 * The kiosk, one step at a time: ① package (and school / walk-in), ② package options (with the
 * gender, since some choices are for girls or boys only; skipped when the package has none),
 * ③ about you, ④ school or session, ⑤ add-ons and payment, ⑥ review and sign. Next checks only
 * that step's fields; Submit checks all of them and opens the step with the first problem.
 */
export const RegisterPage: React.FC = () => {
  const form = useRegistrationForm();
  const closed = form.studioLoaded && form.availableKinds.length === 0;
  const showSchool = form.clientKind === 'school';
  const gender = form.gender === 'male' || form.gender === 'female' ? form.gender : '';
  const hasOptions = form.packageOptionGroups.length > 0;
  const stepIds: StepId[] = ['package', ...(hasOptions ? ['options' as const] : []), 'about', 'school', 'extras', 'sign'];
  const labels: Record<StepId, string> = {
    package: 'Package', options: 'Options', about: 'About you',
    school: form.isWalkIn ? 'Session' : 'School', extras: 'Add-ons', sign: 'Review & sign',
  };
  // The fields each step asks for (an error on one of them opens that step).
  const fieldsOf = (id: StepId): Field[] => ({
    package: ['client_kind', 'package'] as Field[],
    options: ['gender', 'package_options'] as Field[],
    about: ['family_name', 'given_name', 'email', 'mobile_number', ...(hasOptions ? [] : ['gender', 'package_options'])] as Field[],
    school: ['organization', 'level', 'course', 'session_type', 'event_date', 'event_venue'] as Field[],
    extras: ['makeup_look', 'makeup_look_note'] as Field[],
    sign: ['terms_accepted', 'signature'] as Field[],
  })[id];

  const [stepId, setStepId] = useState<StepId>('package');
  const [reachedId, setReachedId] = useState<StepId>('package');
  // A step that no longer exists (the options step after choosing a package without options) falls back.
  const index = Math.max(0, stepIds.indexOf(stepId) >= 0 ? stepIds.indexOf(stepId)
    : stepIds.indexOf(stepId === 'options' ? 'about' : 'package'));
  const reached = Math.max(index, stepIds.indexOf(reachedId));
  const current = stepIds[index];
  const top = useRef<HTMLDivElement>(null);

  const goTo = (next: number) => {
    const id = stepIds[Math.max(0, Math.min(stepIds.length - 1, next))];
    setStepId(id);
    if (stepIds.indexOf(id) > reached) setReachedId(id);
    requestAnimationFrame(() => top.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
  };

  // Errors that belong to an earlier step (from Submit, or the server) open that step.
  const [seenErrors, setSeenErrors] = useState(form.errors);
  if (seenErrors !== form.errors) {
    setSeenErrors(form.errors);
    const withError = stepIds.findIndex((id) => fieldsOf(id).some((field) => form.errors[field]));
    if (withError >= 0 && withError !== index) setStepId(stepIds[withError]);
  }

  /** Next: only this step's fields must be right. */
  const next = () => {
    const all = form.collectErrors();
    const mine: RegistrationErrors = {};
    for (const field of fieldsOf(current)) if (all[field]) mine[field] = all[field];
    if (Object.keys(mine).length) { form.showErrors(mine); return; }
    form.showErrors({});
    goTo(index + 1);
  };

  if (form.submittedRecord) {
    // The next client starts over at step 1 with no steps done.
    return <RegistrationConfirmation record={form.submittedRecord} onReset={() => {
      setStepId('package');
      setReachedId('package');
      form.resetForm();
    }} />;
  }

  const selectedPackage = form.packages.find((pkg) => pkg.id === form.selectedPackageId);
  const optionLines = chosenOptionLines(form.packageOptionGroups.map((group) => ({
    group_id: group.id, group: group.name, replaces: group.replaces,
    choices: availableChoices(group, gender).filter((choice) => (form.optionPicks[group.id] || []).includes(choice.id)),
  })));
  const school = form.organizations.find((org) => org.id === form.selectedOrgId);
  const level = form.levels.find((item) => item.id === form.selectedLevelId);
  const course = form.courses.find((item) => item.id === form.selectedCourseId);
  const addOns = form.addOnsList.filter((addon) => form.selectedAddOns.includes(addon.id));
  const isLast = index === stepIds.length - 1;

  const genderPicker = (
    <section aria-labelledby="sec-gender">
      <h2 id="sec-gender" className="pb-2.5 mb-4 border-b-2 border-line text-xs sm:text-sm font-black uppercase tracking-[0.15em] text-ink">
        Who is this for? <span className="text-red-600">*</span>
      </h2>
      <div {...validationProps('gender', form.errors.gender)} tabIndex={-1} role="radiogroup" aria-label="Gender"
        className="grid grid-cols-2 gap-3 max-w-md outline-none">
        {genderOptions.map((option) => (
          <button key={option.value} type="button" role="radio" aria-checked={form.gender === option.value}
            onClick={() => form.setGender(option.value)}
            className={`btn-tactile min-h-[52px] border-2 text-sm font-black uppercase tracking-wider cursor-pointer ${
              form.gender === option.value ? 'border-gold bg-gold text-on-gold' : 'border-line bg-canvas text-ink hover:border-gold'
            }`}>
            {option.label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-[11px] font-sans text-neutral-500">Some options are for girls or boys only.</p>
      <RegistrationFieldError field="gender" errors={form.errors} />
    </section>
  );

  return (
    <div className="w-full max-w-[1680px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 py-6 sm:py-8">
      {/* Architectural Masthead Banner */}
      <div ref={top} className="scroll-mt-24 animate-enter bg-obsidian text-white p-6 sm:p-8 border-2 border-b-0 border-line shadow-lux-gold">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-5 border-b border-neutral-800">
          <div>
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-gold block mb-1.5">
              FORM // {form.isWalkIn ? 'PORTRAIT & EVENT JOB ORDER' : form.clientKind === 'school' ? 'GRADUATION PICTORIAL JOB ORDER' : 'GRADUATION, PORTRAIT & EVENT JOB ORDER'}
            </span>
            <h1 className="text-2xl sm:text-4xl font-black tracking-tight uppercase text-white leading-none">
              Client <span className="text-gold">Registration</span>
            </h1>
          </div>
          <span className="font-mono text-[11px] text-neutral-400 uppercase tracking-widest">
            Step {index + 1} of {stepIds.length} · {labels[current]}
          </span>
        </div>
        <p className="text-xs sm:text-sm text-neutral-300 mt-4 max-w-3xl leading-relaxed">
          Choose your package, tell us about you, then review and sign. One step at a time.
        </p>
      </div>
      <RegistrationStepBar steps={stepIds.map((id) => ({ id, label: labels[id] }))} current={index} reached={reached} onSelect={goTo} />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="min-w-0 lg:col-span-8 space-y-6">
          {closed && (
            <div role="alert" className="bg-panel border-2 border-line p-6 text-center text-sm font-bold text-ink shadow-lux">
              Registration is closed right now. Please ask the studio staff.
            </div>
          )}

          {!closed && <form
            id="client-registration-form"
            noValidate
            onSubmit={(event) => { if (isLast) void form.handleSubmit(event); else { event.preventDefault(); next(); } }}
            className="animate-enter-delay-1 bg-panel border-2 border-line shadow-lux"
          >
            <div className="p-5 sm:p-8 space-y-8">
              {current === 'package' && (<>
                {form.availableKinds.length > 1 && (
                  <ClientKindPicker kinds={form.availableKinds} value={form.clientKind} onChange={form.setClientKind} errors={form.errors} />
                )}
                <PackageSelectionSection
                  part="cards"
                  packages={form.packages}
                  selectedPackageId={form.selectedPackageId}
                  onSelectPackage={form.setSelectedPackageId}
                  addOnsList={form.addOnsList}
                  defaultAddOn={form.defaultAddOn}
                  selectedAddOns={form.selectedAddOns}
                  onToggleAddOn={form.toggleAddOn}
                  paymentType={form.paymentType}
                  onPaymentTypeChange={form.setPaymentType}
                  totalAmount={form.totalAmount}
                  errors={form.errors}
                  gender={gender}
                  emptyMessage={form.catalogError || (form.catalogLoading ? 'Loading packages and add-ons…'
                    : form.clientKind ? undefined : 'Choose the type of client above to see the packages.')}
                />
              </>)}

              {current === 'options' && (<>
                {genderPicker}
                <PackageOptionsSection
                  packageName={selectedPackage?.name ?? 'the package'}
                  groups={form.packageOptionGroups}
                  gender={gender}
                  picks={form.optionPicks}
                  onChange={form.setOptionPicks}
                  errors={form.errors}
                />
              </>)}

              {current === 'about' && (<>
                {showSchool && <MasterListLookup
                  masterList={form.masterList}
                  isSearching={form.isSearching}
                  onToggleSearch={() => form.setIsSearching(!form.isSearching)}
                  searchName={form.searchName}
                  onSearchNameChange={form.setSearchName}
                  onSelectItem={form.selectFromMasterList}
                />}
                <ClientInfoSection
                  part="person"
                  showGender={!hasOptions}
                  showSchool={showSchool}
                  familyName={form.familyName}
                  onFamilyNameChange={form.setFamilyName}
                  givenName={form.givenName}
                  onGivenNameChange={form.setGivenName}
                  middleName={form.middleName}
                  onMiddleNameChange={form.setMiddleName}
                  gender={form.gender}
                  onGenderChange={form.setGender}
                  studentId={form.studentId}
                  onStudentIdChange={form.setStudentId}
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
                  errors={form.errors}
                />
                <ContactDetailsSection
                  mobileNumber={form.mobileNumber}
                  onMobileNumberChange={form.setMobileNumber}
                  email={form.email}
                  onEmailChange={form.setEmail}
                  errors={form.errors}
                />
              </>)}

              {current === 'school' && (form.isWalkIn ? (
                <WalkInDetailsSection
                  sessionTypes={form.sessionTypes}
                  sessionTypeId={form.sessionTypeId}
                  onSessionTypeChange={form.setSessionTypeId}
                  selectedSession={form.selectedSession}
                  eventDate={form.eventDate}
                  onEventDateChange={form.setEventDate}
                  eventVenue={form.eventVenue}
                  onEventVenueChange={form.setEventVenue}
                  clientOrg={form.clientOrg}
                  onClientOrgChange={form.setClientOrg}
                  notes={form.notes}
                  onNotesChange={form.setNotes}
                  errors={form.errors}
                />
              ) : (
                <ClientInfoSection
                  part="school"
                  showSchool
                  familyName={form.familyName}
                  onFamilyNameChange={form.setFamilyName}
                  givenName={form.givenName}
                  onGivenNameChange={form.setGivenName}
                  middleName={form.middleName}
                  onMiddleNameChange={form.setMiddleName}
                  gender={form.gender}
                  onGenderChange={form.setGender}
                  studentId={form.studentId}
                  onStudentIdChange={form.setStudentId}
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
                  errors={form.errors}
                />
              ))}

              {current === 'extras' && (<>
                <h2 className="pb-2.5 border-b-2 border-line text-xs sm:text-sm font-black uppercase tracking-[0.15em] text-ink">Add-ons &amp; payment</h2>
                <PackageSelectionSection
                  part="extras"
                  packages={form.packages}
                  selectedPackageId={form.selectedPackageId}
                  onSelectPackage={form.setSelectedPackageId}
                  addOnsList={form.addOnsList}
                  defaultAddOn={form.defaultAddOn}
                  selectedAddOns={form.selectedAddOns}
                  onToggleAddOn={form.toggleAddOn}
                  paymentType={form.paymentType}
                  onPaymentTypeChange={form.setPaymentType}
                  totalAmount={form.totalAmount}
                  errors={form.errors}
                  gender={gender}
                />
                {form.asksLook && (
                  <MakeupLookSection note={form.makeupLookNote} onNoteChange={form.setMakeupLookNote} errors={form.errors} />
                )}
              </>)}

              {current === 'sign' && (<>
                <section aria-labelledby="sec-review">
                  <h2 id="sec-review" className="pb-2.5 mb-4 border-b-2 border-line text-xs sm:text-sm font-black uppercase tracking-[0.15em] text-ink">
                    Review your job order
                  </h2>
                  <dl className="divide-y divide-neutral-200 border border-line">
                    {([
                      ['package', 'Package', selectedPackage ? `${selectedPackage.name} · ${formatCurrency(selectedPackage.amount, { exact: true })}` : '—'],
                      ...(hasOptions ? [['options', 'Your options', [genderOptions.find((g) => g.value === form.gender)?.label, ...optionLines].filter(Boolean).join(' · ') || '—']] : []),
                      ['about', 'About you', [`${form.familyName}, ${form.givenName} ${form.middleName}`.trim(),
                        hasOptions ? '' : genderOptions.find((g) => g.value === form.gender)?.label, form.mobileNumber, form.email].filter(Boolean).join(' · ')],
                      ['school', labels.school, form.isWalkIn
                        ? [form.selectedSession?.name, form.eventDate, form.eventVenue, form.clientOrg].filter(Boolean).join(' · ') || '—'
                        : [school?.name, level?.name, course?.code || course?.name, form.section, form.studentId && `ID ${form.studentId}`].filter(Boolean).join(' · ') || '—'],
                      ['extras', 'Add-ons & payment', [
                        ...addOns.map((addon) => `${addon.name} (+${formatCurrency(addon.amount)})`),
                        ...(form.defaultAddOn ? [`${form.defaultAddOn.name} (+${formatCurrency(form.defaultAddOn.amount)})`] : []),
                        form.paymentType === 'downpayment' ? '50% downpayment' : 'Full payment',
                      ].join(' · ')],
                    ] as [StepId, string, string][]).map(([id, title, value]) => (
                      <div key={id} className="flex items-start justify-between gap-3 p-3">
                        <div className="min-w-0">
                          <dt className="text-[10px] font-black uppercase tracking-wider text-gold-soft">{title}</dt>
                          <dd className="mt-0.5 text-sm font-semibold text-ink break-words">{value}</dd>
                        </div>
                        <button type="button" onClick={() => goTo(stepIds.indexOf(id))}
                          className="shrink-0 inline-flex items-center gap-1 px-2 py-1 border border-line text-[10px] font-black uppercase cursor-pointer hover:border-gold">
                          <Pencil className="w-3 h-3" /> Edit
                        </button>
                      </div>
                    ))}
                    <div className="flex items-center justify-between gap-3 p-3 bg-obsidian">
                      <span className="text-[11px] font-black uppercase tracking-wider text-gold">Total job order</span>
                      <span className="font-mono text-xl font-black text-gold">{formatCurrency(form.totalAmount, { exact: true })}</span>
                    </div>
                  </dl>
                </section>
                <TermsAndSignatureSection
                  termsAccepted={form.termsAccepted}
                  onTermsAcceptedChange={form.setTermsAccepted}
                  onSignatureChange={form.handleSignatureChange}
                  errors={form.errors}
                  walkIn={form.isWalkIn}
                  clauses={form.isWalkIn ? form.walkinTerms : undefined}
                />
              </>)}
            </div>

            {/* Back / Next, pinned to the bottom of the screen on phones, with the running total. */}
            {/* Three fixed columns (Back · total · Next) so the total is never covered on a narrow phone:
                the buttons say just "Back" / "Next" there, and "Next: <step>" from sm up. */}
            <div className="sticky bottom-0 z-20 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 sm:gap-3 border-t-2 border-line bg-panel/95 backdrop-blur-xs p-2.5 sm:p-3 sm:px-8">
              <button type="button" disabled={index === 0} onClick={() => goTo(index - 1)} aria-label="Back"
                className="btn-tactile min-h-[48px] px-3 sm:px-4 inline-flex items-center gap-1.5 border-2 border-line bg-canvas text-ink text-xs font-black uppercase tracking-wider cursor-pointer disabled:opacity-30 disabled:cursor-default">
                <ArrowLeft className="w-4 h-4 shrink-0" /> <span className="hidden min-[380px]:inline">Back</span>
              </button>
              <div className="min-w-0 text-center">
                <div className="font-mono text-[9px] font-bold uppercase tracking-widest text-neutral-500">Total</div>
                <div className="truncate font-mono text-sm min-[380px]:text-base sm:text-lg font-black text-gold-soft">
                  {selectedPackage ? formatCurrency(form.totalAmount, { exact: true }) : '—'}
                </div>
              </div>
              <button type="submit" disabled={form.isSubmitting}
                aria-label={isLast ? 'Submit registration' : `Next: ${labels[stepIds[index + 1]]}`}
                className="btn-tactile min-h-[48px] px-3.5 sm:px-5 inline-flex items-center justify-center gap-1.5 bg-obsidian text-gold border-2 border-line text-xs font-black uppercase tracking-[0.12em] sm:tracking-[0.15em] shadow-lux-gold cursor-pointer disabled:opacity-50 whitespace-nowrap">
                {isLast ? (form.isSubmitting ? 'Submitting…' : 'Submit') : (
                  <>Next<span className="hidden sm:inline">: {labels[stepIds[index + 1]]}</span></>
                )}
                <ArrowRight className="w-4 h-4 shrink-0" />
              </button>
            </div>
          </form>}
        </div>

        {/* Live job order summary (desktop); phones see the total in the bottom bar and the review step. */}
        <aside className="hidden lg:block lg:col-span-4 lg:sticky lg:top-24 space-y-6">
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
            defaultAddOn={form.defaultAddOn}
            selectedAddOns={form.selectedAddOns}
            totalAmount={form.totalAmount}
            paymentType={form.paymentType}
            onPaymentTypeChange={form.setPaymentType}
            termsAccepted={form.termsAccepted}
            hasSignature={form.hasSignature}
            isSubmitting={form.isSubmitting}
            optionLines={optionLines}
            profileLine={form.isWalkIn
              ? [form.clientOrg.trim() || 'Walk-in', form.selectedSession?.name || 'Session not selected'].join(' • ')
              : form.clientKind ? undefined : 'Choose the type of client'}
          />
        </aside>
      </div>
    </div>
  );
};
