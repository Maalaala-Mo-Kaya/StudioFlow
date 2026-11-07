import type { RegistrationAddOn } from '../types';

export function getRegistrationAddOns(value: unknown): RegistrationAddOn[] {
  let data = value;
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch {
      return [];
    }
  }
  return Array.isArray(data) ? data.filter((item): item is RegistrationAddOn =>
    typeof item?.name === 'string' && typeof item.amount === 'number' && Number.isFinite(item.amount)
  ) : [];
}

export function sumAddOnAmounts(items: RegistrationAddOn[]) {
  return items.reduce((total, item) => total + Math.round(item.amount * 100), 0) / 100;
}
