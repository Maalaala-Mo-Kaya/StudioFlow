import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Pencil, Plus, Save, Tags } from 'lucide-react';
import { Modal } from '../../components/common/Modal';
import { pb } from '../../db/pocketbase';
import { useToast } from '../../context/ToastContext';
import { workflowError } from '../../hooks/useWorkflowData';
import { codeFromName, SHOT_CODE_PATTERN, useShotTypes, type ShotType } from './shotTypes';

interface CatalogItem { id: string; name: string; category: string }
interface Draft { name: string; code: string; items: string[]; is_active: boolean }

const blank: Draft = { name: '', code: '', items: [], is_active: true };
const input = 'w-full min-h-[44px] text-xs sm:text-sm px-3.5 py-2 border border-neutral-400 bg-canvas focus:bg-panel';
const label = 'block text-[11px] font-black text-ink uppercase tracking-wider mb-1.5';

/**
 * Admin: the shot types photographers tag their shots with (Toga with cap, Family…). Linking a type
 * to catalog items (an attire, a freebie) tells the Chooser which types each package includes.
 */
export const ShotTypesSettings: React.FC = () => {
  const { toast } = useToast();
  const { data, refresh } = useShotTypes();
  const types = data?.types;
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [form, setForm] = useState<Draft>(blank);
  const [codeTouched, setCodeTouched] = useState(false);
  const [editing, setEditing] = useState<ShotType | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let live = true;
    pb.collection('catalog_items').getFullList<CatalogItem>({ sort: 'category,name', fields: 'id,name,category', requestKey: null })
      .then((list) => { if (live) setItems(list); })
      .catch(() => { /* the item picker stays empty */ });
    return () => { live = false; };
  }, []);
  const itemName = useMemo(() => new Map(items.map((item) => [item.id, item.name])), [items]);

  const add = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const sort = Math.max(0, ...(types ?? []).map((type) => type.sort)) + 10;
      await pb.collection('shot_types').create({ ...form, sort });
      toast.success(`Shot type "${form.name.trim()}" added.`);
      setForm(blank);
      setCodeTouched(false);
      refresh();
    } catch (error) {
      toast.error(workflowError(error));
    } finally {
      setSaving(false);
    }
  };

  // Up / down swaps the sort numbers of two neighbours.
  const move = async (index: number, step: -1 | 1) => {
    const list = types ?? [];
    const a = list[index];
    const b = list[index + step];
    if (!a || !b) return;
    try {
      const sortA = a.sort === b.sort ? b.sort + step : b.sort;
      await pb.collection('shot_types').update(a.id, { sort: sortA });
      await pb.collection('shot_types').update(b.id, { sort: a.sort });
      refresh();
    } catch (error) {
      toast.error(workflowError(error));
    }
  };

  const toggle = async (type: ShotType) => {
    try {
      await pb.collection('shot_types').update(type.id, { is_active: !type.active });
      refresh();
    } catch (error) {
      toast.error(workflowError(error));
    }
  };

  return (
    <section aria-label="Shot types" className="bg-panel border-2 border-line shadow-lux p-6 space-y-4">
      <div className="flex items-center gap-3 pb-3 border-b-2 border-line">
        <div className="w-8 h-8 bg-obsidian text-gold flex items-center justify-center shrink-0"><Tags className="w-4 h-4" /></div>
        <div>
          <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-ink m-0">Shot types</h3>
          <p className="text-[11px] text-neutral-500">
            What kind of picture each photo is. Photographers pick the type on the Photo Floor; the Chooser shows the photos by
            type and asks for one of each type in the client's package.
          </p>
        </div>
      </div>

      <ul className="m-0 list-none space-y-2 p-0">
        {(types ?? []).map((type, index) => (
          <li key={type.id} className={`flex flex-wrap items-center gap-2 border border-line p-2.5 ${type.active ? '' : 'opacity-60'}`}>
            <div className="min-w-0 flex-1">
              <p className="m-0 text-sm font-bold text-ink">
                {type.name} <span className="ml-1 font-mono text-[10px] text-neutral-500">[{type.code}]</span>
                {!type.active && <span className="ml-2 text-[10px] font-black uppercase text-neutral-500">Off</span>}
              </p>
              <p className="m-0 text-[11px] text-neutral-600">
                {type.items.length
                  ? `In packages with: ${type.items.map((id) => itemName.get(id) ?? 'removed item').join(', ')}`
                  : 'Not linked to a package item: never required by the Chooser.'}
              </p>
            </div>
            <div className="flex shrink-0 gap-1">
              <button type="button" aria-label={`Move ${type.name} up`} disabled={index === 0} onClick={() => void move(index, -1)}
                className="p-2 border border-line text-ink cursor-pointer disabled:opacity-30"><ArrowUp size={14} /></button>
              <button type="button" aria-label={`Move ${type.name} down`} disabled={index === (types?.length ?? 0) - 1} onClick={() => void move(index, 1)}
                className="p-2 border border-line text-ink cursor-pointer disabled:opacity-30"><ArrowDown size={14} /></button>
              <button type="button" onClick={() => void toggle(type)}
                className="px-2 border border-line text-[10px] font-black uppercase text-ink cursor-pointer">{type.active ? 'Turn off' : 'Turn on'}</button>
              <button type="button" aria-label={`Edit ${type.name}`} onClick={() => setEditing(type)}
                className="p-2 border border-gold text-gold cursor-pointer"><Pencil size={14} /></button>
            </div>
          </li>
        ))}
        {types?.length === 0 && <li className="text-xs text-neutral-600">No shot types yet.</li>}
      </ul>

      <form onSubmit={add} className="space-y-3 border-t border-line pt-4">
        <p className="m-0 text-[11px] font-black uppercase tracking-wider text-ink">Add a shot type</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className={label}>Name</span>
            <input className={input} value={form.name} maxLength={60} required placeholder="e.g. Filipiniana"
              onChange={(event) => {
                const name = event.target.value;
                setForm((current) => ({ ...current, name, code: codeTouched ? current.code : codeFromName(name) }));
              }} />
          </label>
          <label className="block">
            <span className={label}>File label (fixed once added)</span>
            <input className={`${input} font-mono uppercase`} value={form.code} maxLength={24} required placeholder="FILIPINIANA"
              onChange={(event) => { setCodeTouched(true); setForm((current) => ({ ...current, code: event.target.value.toUpperCase() })); }} />
            {form.code && !SHOT_CODE_PATTERN.test(form.code.trim()) && (
              <span className="mt-1 block text-[11px] text-red-700">Letters, numbers, spaces and dashes only.</span>
            )}
          </label>
        </div>
        <ItemPicker items={items} chosen={form.items} onChange={(chosen) => setForm((current) => ({ ...current, items: chosen }))} />
        <button type="submit" disabled={saving || !form.name.trim() || !SHOT_CODE_PATTERN.test(form.code.trim())}
          className="btn-tactile min-h-[46px] w-full inline-flex items-center justify-center gap-2 bg-gold text-on-gold text-xs font-black uppercase tracking-wider cursor-pointer disabled:opacity-50">
          <Plus className="w-4 h-4" /> {saving ? 'Saving…' : 'Add shot type'}
        </button>
      </form>

      {editing && (
        <EditShotType type={editing} items={items} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refresh(); }} />
      )}
    </section>
  );
};

function EditShotType({ type, items, onClose, onSaved }: { type: ShotType; items: CatalogItem[]; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [draft, setDraft] = useState<Draft>({ name: type.name, code: type.code, items: type.items, is_active: type.active });
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      await pb.collection('shot_types').update(type.id, { name: draft.name, items: draft.items, is_active: draft.is_active });
      toast.success('Shot type saved.');
      onSaved();
    } catch (error) {
      toast.error(workflowError(error));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal title={`Edit ${type.name}`} subtitle={<>File label <span className="font-mono">[{type.code}]</span> stays the same: photos already taken keep it.</>}
      icon={Tags} size="lg" busy={saving} onClose={onClose}
      footer={<div className="flex justify-end gap-2">
        <button type="button" disabled={saving} onClick={onClose}
          className="btn-tactile min-h-11 border border-line px-4 text-xs font-black uppercase tracking-wider text-ink">Cancel</button>
        <button type="button" disabled={saving || !draft.name.trim()} onClick={() => void save()}
          className="btn-tactile inline-flex min-h-11 items-center gap-2 bg-gold px-5 text-xs font-black uppercase tracking-wider text-on-gold disabled:opacity-50">
          <Save className="size-4" /> {saving ? 'Saving…' : 'Save'}
        </button>
      </div>}>
      <div className="space-y-4">
        <label className="block">
          <span className={label}>Name</span>
          <input className={input} value={draft.name} maxLength={60} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
        </label>
        <label className="flex items-center gap-2 text-xs font-bold text-ink">
          <input type="checkbox" checked={draft.is_active} onChange={(event) => setDraft({ ...draft, is_active: event.target.checked })} className="size-4" />
          On (shown on the Photo Floor; required by the Chooser when the package includes it)
        </label>
        <ItemPicker items={items} chosen={draft.items} onChange={(chosen) => setDraft({ ...draft, items: chosen })} />
      </div>
    </Modal>
  );
}

/** Catalog items a package may include that stand for this type, grouped by kind, with a search. */
function ItemPicker({ items, chosen, onChange }: { items: CatalogItem[]; chosen: string[]; onChange: (chosen: string[]) => void }) {
  const [search, setSearch] = useState('');
  const picked = new Set(chosen);
  const query = search.trim().toLowerCase();
  const shown = items.filter((item) => !query || item.name.toLowerCase().includes(query) || picked.has(item.id));
  const groups = ['attire', 'background', 'other', 'print', 'frame'].map((category) => ({
    category, items: shown.filter((item) => item.category === category),
  })).filter((group) => group.items.length);
  const toggle = (id: string) => onChange(picked.has(id) ? chosen.filter((value) => value !== id) : [...chosen, id]);
  return (
    <div className="space-y-2">
      <span className={label}>Package items that mean this type</span>
      <p className="m-0 text-[11px] text-neutral-600">
        A client's package includes this type when it has one of these: an attire on a pose (Toga with cap), or a freebie
        (FAMILY PICTURE). Leave empty for a type no package asks for.
      </p>
      <input type="search" className={input} value={search} placeholder="Search items" onChange={(event) => setSearch(event.target.value)} />
      <div className="max-h-64 space-y-3 overflow-y-auto border border-line p-2">
        {groups.map((group) => (
          <div key={group.category}>
            <p className="m-0 mb-1 text-[10px] font-black uppercase tracking-wider text-neutral-500">{group.category}</p>
            {group.items.map((item) => (
              <label key={item.id} className="flex min-h-9 items-center gap-2 px-1 text-xs text-ink cursor-pointer">
                <input type="checkbox" checked={picked.has(item.id)} onChange={() => toggle(item.id)} className="size-4" />
                {item.name}
              </label>
            ))}
          </div>
        ))}
        {!groups.length && <p className="m-0 text-xs text-neutral-600">No items match.</p>}
      </div>
    </div>
  );
}
