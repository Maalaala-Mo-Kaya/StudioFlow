import { kioskPb } from '../../db/pocketbase';
import type { AddOn, ClientKind, Level, Organization, Package, SchoolCourse, SessionType } from '../../types';
import type { OptionPicks } from '../../utils/packageOptions';

export const registrationSteps = ['package', 'options', 'about', 'school', 'extras', 'sign'] as const;
export type RegistrationStepId = typeof registrationSteps[number];

export interface RegistrationConfiguration {
  version: string;
  schoolEnabled: boolean;
  walkinEnabled: boolean;
  walkinTerms: string[] | null;
  organizations: Organization[];
  levels: Level[];
  schoolCourses: SchoolCourse[];
  sessionTypes: SessionType[];
  packages: Package[];
  addOns: AddOn[];
}

interface QuotedItem { id: string; name: string; amount: number }
export interface RegistrationQuote {
  package?: QuotedItem;
  addOns: QuotedItem[];
  automatic?: QuotedItem;
  options: string;
  terms: string;
}

export const textFields = [
  'sessionTypeId', 'eventDate', 'eventVenue', 'clientOrg', 'notes',
  'familyName', 'givenName', 'middleName', 'gender', 'studentId', 'selectedOrgId',
  'preferredLevelId', 'preferredCourseId', 'section', 'department', 'mobileNumber', 'email', 'makeupLookNote',
] as const;
type TextFields = Record<typeof textFields[number], string>;

export type RegistrationDraft = TextFields & {
  requestId: string;
  chosenKind: ClientKind | '';
  selectedPackageId: string | null;
  selectedAddOns: string[];
  optionPicks: OptionPicks;
  paymentType: 'full' | 'downpayment';
  termsAccepted: boolean;
  hadSignature: boolean;
  step: RegistrationStepId;
  reached: RegistrationStepId;
  quote?: RegistrationQuote;
  notices: string[];
  reviewNeeded: boolean;
};

const key = `studioflow-registration-draft-v1:${kioskPb.baseURL}`;
export const registrationDraftLifetime = 2 * 60 * 60 * 1000;
let checkedOpener = false;

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function item(value: unknown): QuotedItem | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const { id, name, amount } = value as Partial<QuotedItem>;
  if (typeof id === 'string' && typeof name === 'string' && typeof amount === 'number' && Number.isFinite(amount)) {
    return { id, name, amount };
  }
}

export function clearRegistrationDraft() {
  try { sessionStorage.removeItem(key); } catch { /* The browser may block storage. */ }
}

export function readRegistrationDraft(): RegistrationDraft | null {
  try {
    if (!checkedOpener) {
      checkedOpener = true;
      const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
      // A newly opened tab can inherit a copy of its opener's sessionStorage.
      if (window.opener && navigation?.type === 'navigate') clearRegistrationDraft();
    }
    const saved = JSON.parse(sessionStorage.getItem(key) ?? 'null');
    if (!saved || typeof saved.savedAt !== 'number' || Date.now() - saved.savedAt > registrationDraftLifetime) {
      clearRegistrationDraft();
      return null;
    }
    const value = saved.draft;
    if (!value || typeof value.requestId !== 'string') return null;
    const text = Object.fromEntries(textFields.map((field) => [field, typeof value[field] === 'string' ? value[field] : ''])) as TextFields;
    const validStep = (step: unknown) => registrationSteps.find((id) => id === step) ?? 'package';
    const quote = value.quote && typeof value.quote.terms === 'string' && typeof value.quote.options === 'string'
      ? {
        package: item(value.quote.package), automatic: item(value.quote.automatic),
        addOns: Array.isArray(value.quote.addOns) ? value.quote.addOns.flatMap((raw: unknown) => item(raw) ?? []) : [],
        terms: value.quote.terms, options: value.quote.options,
      } : undefined;
    return {
      ...text,
      requestId: value.requestId,
      chosenKind: value.chosenKind === 'school' || value.chosenKind === 'walkin' ? value.chosenKind : '',
      selectedPackageId: typeof value.selectedPackageId === 'string' ? value.selectedPackageId : null,
      selectedAddOns: strings(value.selectedAddOns),
      optionPicks: Object.fromEntries(Object.entries(value.optionPicks ?? {}).map(([id, picks]) => [id, strings(picks)])),
      paymentType: value.paymentType === 'downpayment' ? 'downpayment' : 'full',
      termsAccepted: value.termsAccepted === true,
      hadSignature: value.hadSignature === true,
      step: validStep(value.step), reached: validStep(value.reached), quote,
      notices: strings(value.notices), reviewNeeded: value.reviewNeeded === true,
    };
  } catch {
    clearRegistrationDraft();
    return null;
  }
}

export function saveRegistrationDraft(serialized: string) {
  try {
    sessionStorage.setItem(key, `{"savedAt":${Date.now()},"draft":${serialized}}`);
    return true;
  } catch {
    return false;
  }
}

export const availableKinds = (configuration?: RegistrationConfiguration | null): ClientKind[] => [
  ...(configuration?.schoolEnabled ? ['school' as const] : []),
  ...(configuration?.walkinEnabled ? ['walkin' as const] : []),
];

export function activeKind(kinds: ClientKind[], choice: ClientKind | ''): ClientKind | '' {
  return kinds.length === 1 ? kinds[0] : choice && kinds.includes(choice) ? choice : '';
}
