import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Pencil, Check, X, Printer, Frame, Box, Store, Shirt, Palette, Loader2, ShieldCheck, AlertTriangle, Search, LayoutGrid, List } from 'lucide-react';
import type { CatalogItem, CatalogItemCategory, CatalogItemInput, StaffUser } from '../../../types';
import { useToast } from '../../../context/ToastContext';
import { formatCurrency } from '../../../utils/formatters';
import { RecordActionButton, recordActionGroup } from '../../../components/common/RecordActionButton';
import { PackageKindInput } from './PackageFormInputs';
import type { PackageKind } from '../useAdminData';
import { PACKAGE_KIND_LABELS } from '../packageLabels';
import { ITEM_CATEGORY_LABELS } from '../packageLabels';

const CATEGORY_HELP: Record<CatalogItemCategory, string> = {
  print: 'A print size, such as 11R or wallet size. Counted in "N pcs hard printout copy".',
  frame: 'A frame, such as 13x16 classic frame. Chosen as the package\'s Frame.',
  other: 'Anything else: a service or a freebie (Free family picture).',
  attire: 'What the client wears for a set of shots: Toga w/out cap, Toga w/ cap, Filipiniana, Glamour shots.',
  background: 'The backdrop of a set of shots: Colored, B&W.',
};
const ICONS = { print: Printer, frame: Frame, other: Box, attire: Shirt, background: Palette } as const;
const CATEGORY_ORDER = ['print', 'frame', 'attire', 'background', 'other'] as const;
/** Attires and backgrounds describe poses; they aren't sold on their own. */
const sellable = (category: CatalogItemCategory) => category === 'print' || category === 'frame' || category === 'other';

/** Single items grouped by kind, or as one list; remembered per device. */
type ItemLayout = 'grouped' | 'list';
const ITEM_LAYOUT_KEY = 'studioflow-single-items-layout';
function savedItemLayout(): ItemLayout {
  try {
    return localStorage.getItem(ITEM_LAYOUT_KEY) === 'list' ? 'list' : 'grouped';
  } catch {
    return 'grouped';
  }
}

interface CatalogItemsPanelProps {
  items: CatalogItem[];
  staffAccounts: StaffUser[];
  onSave: (id: string | null, data: CatalogItemInput) => Promise<CatalogItem>;
  onDelete: (id: string) => Promise<void>;
}

function PhotographyRequirementFields({ enabled, setEnabled, ids, setIds, staff, disabled }: {
  enabled: boolean; setEnabled: (enabled: boolean) => void; ids: string[]; setIds: (ids: string[]) => void;
  staff: StaffUser[]; disabled: boolean;
}) {
  const options = staff.filter((user) => (user.role === 'photographer' && !user.disabled) || ids.includes(user.id));
  return (
    <fieldset disabled={disabled} className="space-y-2 border border-line bg-canvas p-3">
      <legend className="px-1 text-[11px] font-black uppercase tracking-wider text-ink">Photography Requirements <span className="font-normal normal-case">(optional)</span></legend>
      <label className="flex items-center gap-2 font-bold">
        <input type="checkbox" className="size-4 accent-gold" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
        Requires Photography Session
      </label>
      {enabled && <>
        <p className="font-bold">Required Photographer(s)</p>
        <p className="font-sans text-neutral-600">Every selected photographer must finish their session before the client moves to Photo Chooser.</p>
        <div className="max-h-36 space-y-1 overflow-y-auto">
          {options.map((user) => (
            <label key={user.id} className="flex min-h-8 items-center gap-2">
              <input type="checkbox" className="size-4 accent-gold" checked={ids.includes(user.id)}
                onChange={(event) => setIds(event.target.checked ? [...ids, user.id] : ids.filter((id) => id !== user.id))} />
              {user.name || user.username}{(user.disabled || user.role !== 'photographer') && ' (unavailable)'}
            </label>
          ))}
          {!options.length && <p className="text-neutral-600">No enabled photographer accounts.</p>}
        </div>
      </>}
    </fieldset>
  );
}

export function CategoryPicker({ value, onChange }: { value: CatalogItemCategory; onChange: (value: CatalogItemCategory) => void }) {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
      {CATEGORY_ORDER.map((category) => {
        const Icon = ICONS[category];
        return (
          <button key={category} type="button" aria-pressed={value === category} onClick={() => onChange(category)}
            className={`btn-tactile min-h-[38px] px-2 flex items-center justify-center gap-1.5 border text-[10px] font-black uppercase cursor-pointer ${
              value === category ? 'bg-obsidian text-gold border-line' : 'bg-canvas text-neutral-600 border-neutral-300'
            }`}>
            <Icon className="w-3.5 h-3.5" /> {ITEM_CATEGORY_LABELS[category]}
          </button>
        );
      })}
    </div>
  );
}

/** A price box; empty means 0. */
function PriceInput({ value, onChange, label }: { value: string; onChange: (value: string) => void; label: string }) {
  return (
    <input value={value} onChange={(e) => onChange(e.target.value)} inputMode="decimal" aria-label={label} placeholder="0.00"
      className="w-full min-h-[42px] px-3 py-2 border border-neutral-400 bg-canvas font-semibold placeholder:font-normal placeholder:text-neutral-400" />
  );
}
/** The typed price, rounded to centavos; NaN when it isn't a price. */
const toAmount = (value: string) => {
  const n = Number(value.trim() || 0);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : NaN;
};

/**
 * Edits one single item in a popup. On Save the item is written, then read back from the database
 * (handleSaveCatalogItem checks name, kind, price, client type and the kiosk listing); the popup
 * shows what the database now holds, or what differs.
 */
function CatalogItemEditModal({ item, staffAccounts, onSave, onClose }: {
  item: CatalogItem; staffAccounts: StaffUser[]; onSave: (id: string, data: CatalogItemInput) => Promise<CatalogItem>; onClose: () => void;
}) {
  const [name, setName] = useState(item.name);
  const [category, setCategory] = useState<CatalogItemCategory>(item.category || 'other');
  const [price, setPrice] = useState(item.amount ? String(item.amount) : '');
  const [kind, setKind] = useState<PackageKind>((item.client_kind || 'both') as PackageKind);
  const [atKiosk, setAtKiosk] = useState(!!item.is_active);
  const [photographers, setPhotographers] = useState(item.required_photographers || []);
  const [requiresPhotography, setRequiresPhotography] = useState(photographers.length > 0);
  const [state, setState] = useState<{ phase: 'edit' | 'saving' } | { phase: 'saved'; stored: CatalogItem } | { phase: 'failed'; message: string }>({ phase: 'edit' });
  const busy = state.phase === 'saving';
  const amount = toAmount(price);
  const canSell = sellable(category);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const problem = !name.trim() ? 'Enter the item name.'
    : canSell && Number.isNaN(amount) ? 'Enter a valid price, such as 150 or 150.50.'
    : canSell && atKiosk && !(amount > 0) ? 'Set a price above zero to sell it at the kiosk.'
    : category === 'other' && requiresPhotography && !photographers.length ? 'Select at least one photographer.'
    : '';

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (problem || busy) return;
    const data: CatalogItemInput = canSell
      ? { name: name.trim(), category, amount, client_kind: kind, is_active: atKiosk }
      : { name: name.trim(), category, amount: 0, is_active: false };
    data.required_photographers = category === 'other' && requiresPhotography ? photographers : [];
    setState({ phase: 'saving' });
    try {
      setState({ phase: 'saved', stored: await onSave(item.id, data) });
    } catch (err) {
      setState({ phase: 'failed', message: err instanceof Error ? err.message : 'The item could not be saved.' });
    }
  };

  const label = 'block text-[11px] font-black uppercase tracking-wider text-ink mb-1';
  return createPortal(
    <div role="dialog" aria-modal="true" aria-labelledby="edit-item-title"
      onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-obsidian/85 backdrop-blur-xs animate-modal">
      <form onSubmit={save} className="w-full max-w-lg max-h-[92vh] overflow-y-auto bg-panel border-2 border-line shadow-lux-gold p-5 sm:p-6 space-y-4 font-mono text-xs">
        <div className="flex items-center justify-between pb-3 border-b-2 border-line">
          <h3 id="edit-item-title" className="flex items-center gap-2 text-xs sm:text-sm font-black uppercase tracking-wider text-ink">
            <Pencil className="w-4 h-4 text-gold" /> Edit single item
          </h3>
          <button type="button" onClick={onClose} aria-label="Close" disabled={busy}
            className="w-8 h-8 flex items-center justify-center border border-line bg-canvas hover:bg-gold hover:text-on-gold cursor-pointer disabled:opacity-50"><X className="w-4 h-4" /></button>
        </div>

        {state.phase === 'saved' ? (
          <div role="status" className="p-3 border-2 border-emerald-500 bg-emerald-50 text-emerald-800 space-y-1.5 font-sans">
            <p className="flex items-center gap-2 font-black uppercase text-[11px] tracking-wider"><ShieldCheck className="w-4 h-4" /> Confirmed in the database</p>
            <p className="text-sm font-bold">{state.stored.name}</p>
            <ul className="text-xs space-y-0.5">
              <li>Kind: {ITEM_CATEGORY_LABELS[state.stored.category || 'other']}</li>
              {sellable(state.stored.category || 'other') && <>
                <li>Price: <b>{state.stored.amount ? `${formatCurrency(state.stored.amount, { exact: true })} each` : 'No price'}</b></li>
                <li>Offered to: {PACKAGE_KIND_LABELS[(state.stored.client_kind || 'both') as PackageKind]}</li>
                <li>Kiosk: {state.stored.is_active ? <b>sold at {formatCurrency(state.stored.amount ?? 0, { exact: true })}</b> : 'not sold on its own'}</li>
              </>}
              {!!state.stored.required_photographers?.length && <li>Required photographers · {state.stored.required_photographers.length}</li>}
            </ul>
            <p className="text-[11px]">Packages using it are updated. Job orders already sold keep their price.</p>
          </div>
        ) : (
          <>
            <label className="block">
              <span className={label}>Item name <span className="text-red-500">*</span></span>
              <input value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={120} disabled={busy}
                className="w-full min-h-[42px] px-3 py-2 border border-neutral-400 bg-canvas font-semibold" />
            </label>
            <div>
              <span className={label}>Kind</span>
              <CategoryPicker value={category} onChange={setCategory} />
              <p className="mt-1 text-[10px] font-sans text-neutral-600">{CATEGORY_HELP[category]}</p>
            </div>
            {canSell && (
              <>
                <label className="block">
                  <span className={label}>Price (₱ each)</span>
                  <PriceInput value={price} onChange={setPrice} label="Item price" />
                </label>
                <PackageKindInput value={kind} onChange={setKind} />
                <label className="flex items-center gap-2 font-bold cursor-pointer">
                  <input type="checkbox" className="size-4 accent-gold" checked={atKiosk} onChange={(e) => setAtKiosk(e.target.checked)} disabled={busy} />
                  <Store className="w-4 h-4 text-gold" /> Sell it on its own at the kiosk
                </label>
              </>
            )}
            {category === 'other' && <PhotographyRequirementFields enabled={requiresPhotography} setEnabled={setRequiresPhotography}
              ids={photographers} setIds={setPhotographers} staff={staffAccounts} disabled={busy} />}
            {state.phase === 'failed' && (
              <p role="alert" className="flex items-start gap-2 p-2 border border-red-500 bg-red-50 text-red-800 font-sans">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> {state.message}
              </p>
            )}
            {problem && state.phase !== 'failed' && <p className="text-[11px] font-sans text-amber-800">{problem}</p>}
          </>
        )}

        <div className="flex justify-end gap-2 pt-3 border-t-2 border-line">
          {state.phase === 'saved' ? (
            <button type="button" onClick={onClose} autoFocus
              className="btn-tactile min-h-[42px] px-5 flex items-center gap-1.5 bg-obsidian text-gold border border-line font-black uppercase cursor-pointer">
              <Check className="w-4 h-4" /> Done
            </button>
          ) : (
            <>
              <button type="button" onClick={onClose} disabled={busy}
                className="btn-tactile min-h-[42px] px-4 border border-neutral-400 bg-canvas font-bold uppercase cursor-pointer disabled:opacity-50">Cancel</button>
              <button type="submit" disabled={busy || !!problem}
                className="btn-tactile min-h-[42px] px-5 flex items-center gap-1.5 bg-obsidian text-gold border border-line font-black uppercase cursor-pointer disabled:opacity-50">
                {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Checking the database…</> : <><Check className="w-4 h-4" /> Save</>}
              </button>
            </>
          )}
        </div>
      </form>
    </div>,
    document.body,
  );
}

/**
 * ① Single items: the building blocks of poses, packages and freebies. Each has its own
 * price (one piece) and is sold on its own at the kiosk only while "Sell at kiosk" is on.
 */
export const CatalogItemsPanel: React.FC<CatalogItemsPanelProps> = ({ items, staffAccounts, onSave, onDelete }) => {
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [category, setCategory] = useState<CatalogItemCategory>('print');
  const [price, setPrice] = useState('');
  const [kind, setKind] = useState<PackageKind>('both');
  const [editing, setEditing] = useState<CatalogItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [photographers, setPhotographers] = useState<string[]>([]);
  const [requiresPhotography, setRequiresPhotography] = useState(false);
  const missingPhotographer = category === 'other' && requiresPhotography && !photographers.length;
  // Which items show: one kind (or all), by name; grouped by kind or as one list.
  const [show, setShow] = useState<CatalogItemCategory | 'all'>('all');
  const [query, setQuery] = useState('');
  const [layout, setLayout] = useState<ItemLayout>(savedItemLayout);
  const chooseLayout = (next: ItemLayout) => {
    setLayout(next);
    try { localStorage.setItem(ITEM_LAYOUT_KEY, next); } catch { /* optional */ }
  };
  const counts = Object.fromEntries(CATEGORY_ORDER.map((group) =>
    [group, items.filter((i) => (i.category || 'other') === group).length])) as Record<CatalogItemCategory, number>;
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shownItems = items
    .filter((i) => (show === 'all' || (i.category || 'other') === show) && words.every((word) => i.name.toLowerCase().includes(word)))
    .sort((a, b) => CATEGORY_ORDER.indexOf(a.category || 'other') - CATEGORY_ORDER.indexOf(b.category || 'other') || a.name.localeCompare(b.name));

  const run = async (action: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await action();
      toast.success(done);
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not be saved.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || missingPhotographer) return;
    const amount = toAmount(price);
    if (Number.isNaN(amount)) { toast.error('Enter a valid price, such as 150 or 150.50.'); return; }
    const data: CatalogItemInput = { name: name.trim(), category };
    if (sellable(category)) Object.assign(data, { amount, client_kind: kind });
    if (category === 'other' && requiresPhotography) data.required_photographers = photographers;
    if (await run(() => onSave(null, data), `"${name.trim()}" added.`)) {
      // Keep the new item in view when another kind was being shown.
      if (show !== 'all' && show !== category) setShow(category);
      setName('');
      setPrice('');
      setPhotographers([]);
      setRequiresPhotography(false);
    }
  };

  /** Sell at kiosk (sellable kinds), Edit and Delete: the same in both layouts. */
  const itemActions = (item: CatalogItem) => {
    const group = item.category || 'other';
    return (
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
        {sellable(group) && <button type="button" disabled={busy} aria-pressed={!!item.is_active}
          title={item.is_active ? 'Sold at the kiosk. Click to stop selling it.' : item.amount ? 'Click to sell it at the kiosk.' : 'Set a price first to sell it at the kiosk.'}
          onClick={() => {
            if (!item.is_active && !item.amount) { toast.error(`Set a price for "${item.name}" first.`); return; }
            void run(() => onSave(item.id, { is_active: !item.is_active }),
              item.is_active ? `"${item.name}" is no longer sold at the kiosk.` : `"${item.name}" is now sold at the kiosk.`);
          }}
          className={`flex items-center gap-1 px-1.5 py-1 border text-[9px] font-black uppercase cursor-pointer ${
            item.is_active ? 'bg-emerald-50 text-emerald-700 border-emerald-500' : 'text-neutral-500 border-neutral-300 hover:border-line'
          }`}>
          <Store className="w-3 h-3" /> {item.is_active ? 'At kiosk' : 'Sell at kiosk'}
        </button>}
        <span className={recordActionGroup}>
          <RecordActionButton variant="edit" recordName={item.name} onClick={() => setEditing(item)} />
          <RecordActionButton variant="delete" recordName={item.name} disabled={busy}
            onClick={() => void run(() => onDelete(item.id), `"${item.name}" deleted.`)} />
        </span>
      </div>
    );
  };

  return (
    <div className="space-y-6 font-mono text-xs">
      <form onSubmit={create} className="bg-panel border-2 border-line shadow-lux p-5 space-y-3">
        <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-ink pb-2 border-b-2 border-line">① Create a single item</h3>
        <p className="font-sans text-xs text-neutral-600">
          Use single items in poses (with a quantity), in packages, as the frame, or as freebies. The price is for one
          piece bought on its own: the kiosk shows an item only after you switch on <b>Sell at kiosk</b>. Package prices stay as set on each package.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-[1fr_9rem_auto] gap-3 items-end">
          <label className="block">
            <span className="block text-[11px] font-black uppercase mb-1">Item name <span className="text-red-500">*</span></span>
            <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={120}
              placeholder={{ print: 'e.g. 11R or Wallet size', frame: 'e.g. 13x16 classic frame', attire: 'e.g. Toga w/out cap', background: 'e.g. Colored or B&W', other: 'e.g. Free family picture' }[category]}
              className="w-full min-h-[42px] px-3 py-2 border border-neutral-400 bg-canvas font-semibold placeholder:italic placeholder:font-normal placeholder:text-neutral-400" />
          </label>
          {sellable(category) ? (
            <label className="block">
              <span className="block text-[11px] font-black uppercase mb-1">Price (₱ each)</span>
              <PriceInput value={price} onChange={setPrice} label="Price" />
            </label>
          ) : <span />}
          <button type="submit" disabled={busy || !name.trim() || missingPhotographer}
            className="btn-tactile min-h-[42px] px-4 flex items-center justify-center gap-1.5 bg-obsidian text-gold border border-line font-black uppercase cursor-pointer disabled:opacity-50">
            <Plus className="w-4 h-4" /> Add item
          </button>
        </div>
        <CategoryPicker value={category} onChange={setCategory} />
        {sellable(category) && <PackageKindInput value={kind} onChange={setKind} />}
        {category === 'other' && <PhotographyRequirementFields enabled={requiresPhotography} setEnabled={setRequiresPhotography}
          ids={photographers} setIds={setPhotographers} staff={staffAccounts} disabled={busy} />}
        <p className="text-[10px] font-sans text-neutral-600">{CATEGORY_HELP[category]}</p>
      </form>

      {/* Find items: one kind at a time (e.g. only Attire), by name, grouped or as one list. */}
      <div className="bg-panel border-2 border-line shadow-lux p-3 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <div role="radiogroup" aria-label="Show item kind" className="flex flex-wrap gap-1.5">
            {(['all', ...CATEGORY_ORDER] as const).map((value) => {
              const Icon = value === 'all' ? null : ICONS[value];
              const count = value === 'all' ? items.length : counts[value];
              return (
                <button key={value} type="button" role="radio" aria-checked={show === value} onClick={() => setShow(value)}
                  className={`min-h-[34px] px-2.5 flex items-center gap-1.5 border text-[10px] font-black uppercase cursor-pointer ${
                    show === value ? 'bg-obsidian text-gold border-line' : 'bg-canvas text-neutral-600 border-neutral-300 hover:border-line'}`}>
                  {Icon && <Icon className="w-3.5 h-3.5" aria-hidden="true" />}
                  {value === 'all' ? 'All' : ITEM_CATEGORY_LABELS[value]}
                  <span className="text-[9px] opacity-70">{count}</span>
                </button>
              );
            })}
          </div>
          <label className="relative flex-1 min-w-[180px]">
            <span className="sr-only">Search items</span>
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-500" aria-hidden="true" />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search items…"
              className="w-full min-h-[34px] border border-line bg-canvas pl-7 pr-2 text-xs" />
          </label>
          {/* How the items are shown, remembered on this device. */}
          <span role="radiogroup" aria-label="Show items as" className="flex border border-line">
            {([['grouped', 'By category', LayoutGrid], ['list', 'List', List]] as const).map(([value, label, Icon]) => (
              <button key={value} type="button" role="radio" aria-checked={layout === value} onClick={() => chooseLayout(value)}
                className={`min-h-[32px] px-2.5 flex items-center gap-1 text-[10px] font-black uppercase cursor-pointer ${
                  layout === value ? 'bg-obsidian text-gold' : 'bg-panel text-neutral-600 hover:text-ink'}`}>
                <Icon className="w-3.5 h-3.5" aria-hidden="true" /> {label}
              </button>
            ))}
          </span>
        </div>
        {(query.trim() || show !== 'all') && (
          <p className="text-[11px] text-neutral-600" aria-live="polite">
            {shownItems.length} of {items.length} items{show !== 'all' ? ` · ${ITEM_CATEGORY_LABELS[show]} only` : ''}
          </p>
        )}
      </div>

      {layout === 'list' ? (
        <div className="bg-panel border-2 border-line shadow-lux p-3">
          {!shownItems.length ? <p className="p-4 text-center text-neutral-500 font-sans italic">No item matches.</p> : (
            <div className="overflow-x-auto border border-line">
              <table className="w-full min-w-[640px] border-collapse text-xs">
                <thead>
                  <tr className="bg-obsidian text-gold text-left text-[10px] uppercase tracking-wider">
                    <th className="p-2">Item</th>
                    <th className="p-2">Kind</th>
                    <th className="p-2 text-right">Price</th>
                    <th className="p-2">Clients</th>
                    <th className="p-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {shownItems.map((item) => {
                    const group = item.category || 'other';
                    const Icon = ICONS[group];
                    return (
                      <tr key={item.id} className="border-t border-line hover:bg-gold-wash">
                        <td className="p-2 font-semibold text-ink break-words">{item.name}</td>
                        <td className="p-2 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase"><Icon className="w-3.5 h-3.5 text-gold" aria-hidden="true" />{ITEM_CATEGORY_LABELS[group]}</span>
                        </td>
                        <td className={`p-2 text-right whitespace-nowrap ${item.amount ? 'font-bold text-gold-soft' : 'text-neutral-500 italic'}`}>
                          {sellable(group) ? (item.amount ? formatCurrency(item.amount, { exact: true }) : 'No price') : '—'}
                        </td>
                        <td className="p-2 text-[10px] uppercase whitespace-nowrap">
                          {sellable(group) ? PACKAGE_KIND_LABELS[(item.client_kind || 'both') as PackageKind] : '—'}
                        </td>
                        <td className="p-2">{itemActions(item)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : CATEGORY_ORDER.filter((group) => show === 'all' || show === group).map((group) => {
        const list = shownItems.filter((i) => (i.category || 'other') === group);
        const selling = list.filter((i) => i.is_active).length;
        const Icon = ICONS[group];
        // While searching, kinds with no match are left out instead of saying "None yet".
        if (query.trim() && !list.length) return null;
        return (
          <div key={group} className="bg-panel border-2 border-line shadow-lux p-5 space-y-2">
            <h4 className="flex items-center justify-between font-black uppercase text-ink">
              <span className="flex items-center gap-2"><Icon className="w-4 h-4 text-gold" /> {ITEM_CATEGORY_LABELS[group]} items</span>
              <span className="text-[10px] bg-obsidian text-gold px-2 py-0.5">{list.length}{selling ? ` · ${selling} at kiosk` : ''}</span>
            </h4>
            {!list.length && <p className="text-neutral-500 font-sans italic">None yet.</p>}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
              {list.map((item) => (
                <div key={item.id} className="p-2 border border-neutral-300 bg-canvas">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <span className="block font-semibold text-ink break-words">{item.name}</span>
                      {sellable(group) && (
                        <span className={`block text-[10px] ${item.amount ? 'text-gold-soft font-bold' : 'text-neutral-500 italic'}`}>
                          {item.amount ? `${formatCurrency(item.amount, { exact: true })} each` : 'No price'}
                          {' · '}{PACKAGE_KIND_LABELS[(item.client_kind || 'both') as PackageKind]}
                        </span>
                      )}
                    </div>
                    {itemActions(item)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
      {editing && <CatalogItemEditModal item={editing} staffAccounts={staffAccounts} onSave={onSave} onClose={() => setEditing(null)} />}
    </div>
  );
};
