import { REGISTRATION_TERMS_CLAUSES } from '../../constants/studio';
import type { ClientKind } from '../../types';
import { formatCurrency } from '../../utils/formatters';
import { keepValidPicks, optionGroups } from '../../utils/packageOptions';
import { registrationAddOns } from './registrationAddOns';
import { activeKind, availableKinds, registrationSteps, type RegistrationConfiguration, type RegistrationDraft, type RegistrationQuote, type RegistrationStepId } from './registrationDraft';

export const recaptureSignature = 'Sign again on the Review & sign step. Signatures are cleared when the form reloads.';

export function registrationTerms(config: RegistrationConfiguration | null, kind: ClientKind | '') {
  return kind === 'walkin' && config?.walkinTerms?.length ? config.walkinTerms : REGISTRATION_TERMS_CLAUSES;
}

export const termsKey = (config: RegistrationConfiguration | null, kind: ClientKind | '') => JSON.stringify([kind, registrationTerms(config, kind)]);

const quoted = ({ id, name, amount }: { id: string; name: string; amount: number }) => ({ id, name, amount });

export function makeRegistrationQuote(
  pkg: Parameters<typeof registrationAddOns>[0],
  { selected, defaultAddOn }: Pick<ReturnType<typeof registrationAddOns>, 'selected' | 'defaultAddOn'>,
  terms: string,
): RegistrationQuote {
  return {
    package: pkg ? quoted(pkg) : undefined,
    addOns: selected.map(quoted),
    automatic: defaultAddOn ? quoted(defaultAddOn) : undefined,
    options: JSON.stringify(optionGroups(pkg)),
    terms,
  };
}

export function reconcileRegistration(draft: RegistrationDraft, config: RegistrationConfiguration) {
  const kind = activeKind(availableKinds(config), draft.chosenKind);
  const old = draft.quote;
  const next = { ...draft, hadSignature: false, notices: [...draft.notices] };
  const addNotice = (message: string) => { if (!next.notices.includes(message)) next.notices.push(message); };
  const review = (message: string, step: RegistrationStepId) => {
    addNotice(message);
    next.reviewNeeded = true;
    if (registrationSteps.indexOf(step) < registrationSteps.indexOf(next.step)) {
      next.step = step;
    }
    if (registrationSteps.indexOf(step) < registrationSteps.indexOf(next.reached)) next.reached = step;
  };
  const pkg = config.packages.find((item) => item.id === draft.selectedPackageId
    && !!kind && [kind, 'both'].includes(item.client_kind || 'school'));
  if (draft.selectedPackageId && !pkg) {
    review(`${old?.package?.name ?? 'Your selected package'} is no longer available. Choose a package to continue.`, 'package');
    next.selectedPackageId = null;
  }
  const offeredAddOns = config.addOns.filter((item) => !!kind && [kind, 'both'].includes(item.client_kind || 'both'));
  const extras = registrationAddOns(pkg, offeredAddOns, draft.selectedAddOns);
  next.selectedAddOns = extras.selected.map(({ id }) => id);
  const terms = termsKey(config, kind);
  const quote = makeRegistrationQuote(pkg, extras, terms);
  const changedPrice = (before: { name: string; amount: number }, after: { amount: number }, step: RegistrationStepId) => {
    if (before.amount !== after.amount) {
      review(`${before.name} changed from ${formatCurrency(before.amount, { exact: true })} to ${formatCurrency(after.amount, { exact: true })}.`, step);
    }
  };
  for (const id of draft.selectedAddOns) {
    const before = old?.addOns.find((item) => item.id === id);
    const after = quote.addOns.find((item) => item.id === id);
    if (!after) review(`${before?.name ?? 'A selected add-on'} is no longer available. Its charge was removed.`, 'extras');
    else if (before) changedPrice(before, after, 'extras');
  }
  if (pkg && old?.package?.id === pkg.id) {
    changedPrice(old.package, pkg, 'extras');
    if (old.options !== quote.options) review('The package options changed. Review your choices.', optionGroups(pkg).length ? 'options' : 'about');
    if (old.automatic?.id === quote.automatic?.id) {
      if (old.automatic && quote.automatic) changedPrice(old.automatic, quote.automatic, 'extras');
    } else {
      review('The automatically applied service changed. Review the updated bill.', 'extras');
    }
  }
  const gender = draft.gender === 'female' || draft.gender === 'male' ? draft.gender : '';
  const groups = optionGroups(pkg);
  next.optionPicks = keepValidPicks(groups, gender, draft.optionPicks);
  for (const group of groups) {
    const priorPicks = draft.optionPicks[group.id] ?? [];
    if (priorPicks.length && !next.optionPicks[group.id]?.length) next.optionPicks[group.id] = [];
  }

  if (kind === 'school') {
    if (draft.selectedOrgId && !config.organizations.some((school) => school.id === draft.selectedOrgId)) {
      next.selectedOrgId = '';
      review('Your selected school is no longer available. Choose a school to continue.', 'school');
    }
    if (draft.preferredLevelId && !config.levels.some((level) => level.id === draft.preferredLevelId && level.organization === next.selectedOrgId)) {
      next.preferredLevelId = '';
      if (next.selectedOrgId) review('Your academic level changed. Choose a level and course.', 'school');
    }
    if (draft.preferredCourseId && !config.schoolCourses.some((row) => row.course_id === draft.preferredCourseId
      && row.level === next.preferredLevelId && row.school_id === next.selectedOrgId && row.expand?.course_id)) {
      next.preferredCourseId = '';
      if (next.preferredLevelId) review('Your selected course is no longer offered for this school and level.', 'school');
    }
  } else if (kind === 'walkin' && draft.sessionTypeId) {
    const session = config.sessionTypes.find((item) => item.id === draft.sessionTypeId);
    if (!session) {
      next.sessionTypeId = '';
      review('Your selected session is no longer available. Choose a session to continue.', 'school');
    } else if (session.on_location && (!draft.eventDate || !draft.eventVenue.trim())) {
      review('This session requires an event date and venue.', 'school');
    }
  }
  if (draft.termsAccepted && old?.terms !== terms) {
    next.termsAccepted = false;
    review('Review and accept the current terms on the Review & sign step.', 'sign');
  }
  if (draft.hadSignature) addNotice(recaptureSignature);
  next.quote = quote;
  return next;
}
