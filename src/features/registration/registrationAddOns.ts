import type { AddOn, Package } from '../../types';

/** The registration catalog supplies effective MUA requirements for new orders. */
export function registrationAddOns(
  selectedPackage: Package | undefined, offeredAddOns: AddOn[], selectedIds: string[], configured = new Map<string, AddOn>(),
) {
  const manualAddOns = offeredAddOns.filter((item) => !item.default_when_no_mua && !configured.has(item.id));
  const selected = manualAddOns.filter((item) => selectedIds.includes(item.id));
  const purchased = [...selected, ...configured.values()];
  const requiresMua = !!selectedPackage && (!!selectedPackage.requires_mua || purchased.some((item) => item.requires_mua));
  const defaultAddOn = selectedPackage && !requiresMua
    ? offeredAddOns.find((item) => item.default_when_no_mua)
    : undefined;
  const totalAmount = selectedPackage
    ? [selectedPackage, ...purchased, ...(defaultAddOn ? [defaultAddOn] : [])]
      .reduce((total, item) => total + Math.round(item.amount * 100), 0) / 100
    : 0;

  return { manualAddOns, selected, requiresMua, defaultAddOn, totalAmount };
}
