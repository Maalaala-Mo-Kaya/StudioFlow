// Labels shared by the package and add-on screens.
import type { AddOn } from '../../types';
import type { PackageKind } from './useAdminData';

export const revenueLabels = { studio: 'Studio revenue', mua: 'Other Payment — MUA', '': 'Revenue review needed' };

export const PACKAGE_KIND_LABELS: Record<PackageKind, string> = { school: 'For school', walkin: 'For walk-in', both: 'School & walk-in' };

/** An add-on's client type; empty (older records) means both. */
export const addOnKind = (add: AddOn): PackageKind => (add.client_kind || 'both') as PackageKind;

/** ① Single item kinds. */
export const ITEM_CATEGORY_LABELS: Record<import('../../types').CatalogItemCategory, string> = { print: 'Print', frame: 'Frame', other: 'Other', attire: 'Attire', background: 'Background' };
