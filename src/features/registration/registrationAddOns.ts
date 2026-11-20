import type { AddOn, Package } from '../../types';

/** The registration catalog supplies effective MUA requirements for new orders. */
export function registrationAddOns(
  selectedPackage: Package | undefined, offeredAddOns: AddOn[], selectedIds: string[],
) {
  const manualAddOns = offeredAddOns.filter((item) => !item.default_when_no_mua);
  const selected = manualAddOns.filter((item) => selectedIds.includes(item.id));
  const requiresMua = !!selectedPackage && (!!selectedPackage.requires_mua || selected.some((item) => item.requires_mua));
  const defaultAddOn = selectedPackage && !requiresMua
    ? offeredAddOns.find((item) => item.default_when_no_mua)
    : undefined;
  const totalAmount = selectedPackage
    ? [selectedPackage, ...selected, ...(defaultAddOn ? [defaultAddOn] : [])]
      .reduce((total, item) => total + Math.round(item.amount * 100), 0) / 100
    : 0;

  return { manualAddOns, selected, requiresMua, defaultAddOn, totalAmount };
}
