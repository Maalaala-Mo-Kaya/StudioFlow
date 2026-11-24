import { tableFilterControl } from '../../components/common/DataTable';
import { stationButton } from './StationLayout';

export const makeupPrimary = `${stationButton} min-h-11 focus-visible:outline-2 focus-visible:outline-gold`;
export const makeupSecondary = 'btn-tactile inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 border border-gold bg-canvas px-3 py-2 text-xs font-black uppercase tracking-wide text-gold-soft hover:bg-gold-wash focus-visible:outline-2 focus-visible:outline-gold disabled:opacity-40';
export const makeupField = `${tableFilterControl} min-h-11 max-sm:text-base`;
export const makeupTable = 'max-md:border-0 max-md:bg-transparent max-md:shadow-none [&>div.grid]:p-0 [&_nav_button]:min-h-11 [&_nav_select]:min-h-11';
