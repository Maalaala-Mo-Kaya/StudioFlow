// Form controls shared by the package builder and the add-on forms.
import React from 'react';
import type { RevenueCategory } from '../../../types';
import { formatCurrency } from '../../../utils/formatters';
import { revenueLabels } from '../packageLabels';
import type { PackageKind } from '../useAdminData';

export function RevenueInput({ value, onChange }: { value: RevenueCategory | ''; onChange: (value: RevenueCategory | '') => void }) {
  return <label className="block text-xs font-bold">
    Revenue classification <span className="text-red-600">*</span>
    <select required className={`mt-1 block min-h-10 w-full border bg-panel px-2 ${value ? 'border-line' : 'border-red-500'}`}
      value={value} onChange={(event) => onChange(event.target.value as RevenueCategory | '')}>
      {!value && <option value="" disabled>Choose Studio or MUA…</option>}
      <option value="studio">{revenueLabels.studio}</option>
      <option value="mua">{revenueLabels.mua}</option>
    </select>
  </label>;
}

/** A catalog record's revenue type; a missing one is a red warning (its sales stay unallocated). */
export function RevenueBadge({ value }: { value?: RevenueCategory | '' }) {
  if (value) return <span className="text-[10px] font-bold uppercase">{revenueLabels[value]}</span>;
  return (
    <span title="Its sales can't be counted as Studio or MUA revenue. Edit it and choose one."
      className="px-2 py-0.5 text-[10px] font-black uppercase border border-red-500 bg-red-50 text-red-700">
      {revenueLabels['']}: edit to choose
    </span>
  );
}

export function MuaRequirementInput({ checked, onChange, revenue, amount }: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  revenue: RevenueCategory | '';
  amount: number;
}) {
  if (revenue !== 'mua' && !checked) return null;
  return (
    <fieldset className="border border-neutral-400 bg-panel px-3 py-2">
      <legend className="px-1 text-[10px] font-black uppercase">MUA service</legend>
      <label className="flex items-center gap-2 text-[11px] font-bold uppercase">
        <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)}
          className="size-4 accent-gold" />
        {revenue === 'mua' ? 'This is an MUA Service' : 'Keep existing Makeup / Grooming queue requirement'}
      </label>
      {revenue === 'mua' ? (
        <div className="mt-1 space-y-1 text-xs text-neutral-600">
          {checked && <p className="font-bold text-gold-soft">{formatCurrency(amount, { exact: true })} per completion before discounts</p>}
          <p>Use this for standalone MUA charges. For portrait bundles, price the MUA service as a separate add-on.</p>
        </div>
      ) : <p className="mt-1 text-xs text-neutral-600">This item keeps its queue requirement. Artist earnings need a verified MUA allocation.</p>}
    </fieldset>
  );
}

export function MuaRequirementBadge({ required, revenue }: { required?: boolean; revenue?: RevenueCategory | '' }) {
  return (
    <span className={`inline-block px-2 py-0.5 text-[10px] font-bold uppercase border ${
      required ? 'bg-gold-wash border-gold text-gold-soft' : 'bg-panel border-neutral-300 text-neutral-700'
    }`}>
      {required ? (revenue === 'mua' ? 'MUA Service' : 'MUA Queue Only') : 'No MUA Required'}
    </span>
  );
}

export function DefaultAddOnInput({ checked, onChange, disabled }: {
  checked: boolean; onChange: (checked: boolean) => void; disabled: boolean;
}) {
  return (
    <fieldset className="mt-2 border border-neutral-400 bg-panel px-3 py-2" disabled={disabled}>
      <legend className="px-1 text-[10px] font-black uppercase">Default addon rule</legend>
      <label className="flex items-center gap-2 text-[11px] font-bold">
        <input type="checkbox" className="size-4 shrink-0 accent-gold" checked={checked}
          onChange={(event) => onChange(event.target.checked)} />
        Automatically apply if the client has no Makeup / Grooming service
      </label>
      {disabled ? <p className="mt-1 text-[10px] text-neutral-600">Available only for Other Payment — MUA add-ons.</p>
        : <p className="mt-1 text-[10px] text-neutral-600">Automatically adds this service when no Makeup / Grooming is selected. The client must still receive MUA confirmation before entering the photography queue.</p>}
    </fieldset>
  );
}

/** Which kiosk form offers the package. */
export const PackageKindInput: React.FC<{ value: PackageKind; onChange: (value: PackageKind) => void }> = ({ value, onChange }) => (
  <fieldset>
    <legend className="block text-[11px] font-black uppercase mb-1">Offered To</legend>
    <div className="grid grid-cols-3 gap-1.5">
      {(['school', 'walkin', 'both'] as const).map((kind) => (
        <button key={kind} type="button" aria-pressed={value === kind} onClick={() => onChange(kind)}
          className={`btn-tactile min-h-[38px] px-2 border text-[10px] font-black uppercase cursor-pointer ${
            value === kind ? 'bg-obsidian text-gold border-line' : 'bg-canvas text-neutral-600 border-neutral-300'
          }`}>
          {kind === 'school' ? 'School' : kind === 'walkin' ? 'Walk-in' : 'Both'}
        </button>
      ))}
    </div>
  </fieldset>
);
