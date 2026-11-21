import type { AddOn, Package } from '../../types';
import { parsePackageInclusions } from '../../utils/formatters';

export const sectionTypes = {
  header: 'Category header', inclusions: 'Inclusion list', prints: 'Print breakdown',
  options: 'Interactive options', info: 'Information', conditional: 'Conditional information',
} as const;

export interface PackageChoice {
  id: string;
  name: string;
  description?: string;
  image?: string;
  recommendation?: 'male' | 'female' | 'any' | '';
  preselect?: boolean;
  addOn?: string;
  paid?: boolean;
}

export interface PackageSection {
  id: string;
  type: keyof typeof sectionTypes;
  title: string;
  description?: string;
  image?: string;
  when?: { section: string; choice: string };
  freebies?: boolean;
  items?: { name: string; description?: string; quantity?: number; image?: string; addOn?: string }[];
  prints?: { pose: string; size: string; quantity: number; notes?: string; alternative?: string }[];
  choices?: PackageChoice[];
  min?: number;
  max?: number;
  display?: 'list' | 'cards' | 'dropdown';
}

export interface PackageDefinition {
  cover?: string;
  advertisedPrints?: number;
  frame?: string;
  reviewNotes?: string;
  sections: PackageSection[];
}

export type PackageAnswers = Record<string, string[]>;
export interface PackageConfiguration {
  version: number;
  answers: PackageAnswers;
}

export interface SoldPackageConfiguration extends PackageConfiguration {
  definition: PackageDefinition;
  selections: {
    section: string; sectionTitle: string; choice: string; name: string;
    quantity: number; amount: number; addOn?: string;
  }[];
  summary: string;
}

export interface PackageDraft {
  code: string;
  name: string;
  amount: number;
  description: string;
  client_kind: 'school' | 'walkin' | 'both';
  revenue_category: 'studio' | 'mua' | '';
  photo_selection_limit: number;
  requires_mua: boolean;
  is_active: boolean;
  builder: PackageDefinition;
}

export function definition(pkg: Pick<Package, 'builder' | 'inclusions' | 'freebies'>): PackageDefinition {
  return pkg.builder ?? { sections: (['inclusions', 'freebies'] as const).flatMap((field) => {
    const items = parsePackageInclusions(pkg[field]).map((name) => ({ name }));
    return items.length ? [{
      id: field, title: field === 'freebies' ? 'Freebies' : 'Package inclusions',
      type: 'inclusions' as const, freebies: field === 'freebies', items,
    }] : [];
  }) };
}

export function hasOptions(pkg: Package) {
  return pkg.builder?.sections.some((section) => section.type === 'options') ?? false;
}

export function visible(section: PackageSection, previous: PackageAnswers) {
  return !section.when || !!previous[section.when.section]?.includes(section.when.choice);
}

export function resolveAnswers(builder: PackageDefinition, answers: PackageAnswers, gender = '', applyDefaults = false) {
  const result: PackageAnswers = {};
  for (const section of builder.sections) {
    if (section.type !== 'options' || !visible(section, result)) continue;
    const choices = section.choices ?? [];
    const defaults = [
      ...choices.filter((choice) => choice.preselect && gender && choice.recommendation === gender),
      ...choices.filter((choice) => choice.preselect && choice.recommendation === 'any'),
    ];
    result[section.id] = Object.hasOwn(answers, section.id)
      ? answers[section.id] : applyDefaults ? defaults.slice(0, section.max ?? 1).map(({ id }) => id) : [];
  }
  return result;
}

export function configurationErrors(builder: PackageDefinition, answers: PackageAnswers) {
  const errors: Record<string, string> = {};
  for (const section of builder.sections) {
    if (section.type !== 'options' || !visible(section, answers)) continue;
    const selected = answers[section.id] ?? [];
    const min = section.min ?? 0;
    const max = section.max ?? 1;
    if (new Set(selected).size !== selected.length || selected.some((id) => !section.choices?.some((choice) => choice.id === id))) {
      errors[section.id] = 'Review the selected choices.';
    } else if (selected.length < min || selected.length > max) {
      errors[section.id] = min === max ? `Select exactly ${min}.` : `Select between ${min} and ${max}.`;
    }
  }
  return errors;
}

export function selectedChoices(pkg: Package, configuration?: PackageConfiguration) {
  if (!pkg.builder || !configuration || pkg.builder_version !== configuration.version) return [];
  const answers = resolveAnswers(pkg.builder, configuration.answers);
  return pkg.builder.sections.flatMap((section) => (section.choices ?? [])
    .filter((choice) => answers[section.id]?.includes(choice.id))
    .map((choice) => ({ section, choice })));
}

export function configuredAddOns(pkg: Package | undefined, configuration: PackageConfiguration | undefined, catalog: AddOn[]) {
  const items = new Map<string, AddOn>();
  if (!pkg) return items;
  for (const { choice } of selectedChoices(pkg, configuration)) {
    const item = catalog.find((entry) => entry.id === choice.addOn && entry.is_active !== false && !entry.default_when_no_mua
      && ((entry.client_kind || 'both') === 'both' || entry.client_kind === (pkg.client_kind || 'school')));
    if (item && (!items.has(item.id) || !choice.paid)) items.set(item.id, { ...item, amount: choice.paid ? item.amount : 0 });
  }
  return items;
}

export function packageQuote(pkg: Package, configuration: PackageConfiguration, catalog: AddOn[]) {
  return {
    version: configuration.version,
    answers: configuration.answers,
    quotedBase: Math.round(pkg.amount * 100),
    quotedAddOns: Object.fromEntries([...configuredAddOns(pkg, configuration, catalog)]
      .map(([id, item]) => [id, Math.round(item.amount * 100)])),
  };
}
