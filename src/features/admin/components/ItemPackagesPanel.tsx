import React, { useState } from 'react';
import { Plus, Trash2, Check, X, Layers } from 'lucide-react';
import type { CatalogItem, CatalogItemCategory, ItemPackage } from '../../../types';
import { useToast } from '../../../context/ToastContext';
import { makeCatalog, setPrints, setSummary } from '../../../utils/catalogRender';
import { ITEM_CATEGORY_LABELS } from '../packageLabels';
import { CategoryPicker } from './CatalogItemsPanel';
import { RecordActionButton, recordActionGroup } from '../../../components/common/RecordActionButton';
import { Modal } from '../../../components/common/Modal';

interface ItemPackagesPanelProps {
  items: CatalogItem[];
  sets: ItemPackage[];
  onSave: (id: string | null, data: { name: string; items: ItemPackage['items'] }) => Promise<ItemPackage>;
  onDelete: (id: string) => Promise<void>;
  onSaveItem: (id: string | null, data: { name: string; category: CatalogItemCategory }) => Promise<CatalogItem>;
}

type Row = { item: string; qty: number };

/** A dropdown of single items, grouped Print / Frame / Other. */
export function ItemSelect({ items, value, onChange, placeholder = 'Choose an item…', only }: {
  items: CatalogItem[]; value: string; onChange: (id: string) => void; placeholder?: string; only?: CatalogItemCategory[];
}) {
  const groups = (only ?? ['print', 'frame', 'other'] as CatalogItemCategory[]);
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label="Item"
      className="w-full min-w-0 min-h-[38px] p-1.5 border border-neutral-400 bg-panel font-semibold truncate">
      <option value="">{placeholder}</option>
      {groups.map((g) => {
        const list = items.filter((i) => (i.category || 'other') === g);
        return list.length ? (
          <optgroup key={g} label={ITEM_CATEGORY_LABELS[g]}>
            {list.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </optgroup>
        ) : null;
      })}
    </select>
  );
}

/**
 * ② Saved poses (item_packages): a title and single items with quantities ("Colored toga w/out cap" =
 * 11R × 1, Wallet × 2). Templates only: a package copies a saved pose in, then owns its copy.
 */
export const ItemPackagesPanel: React.FC<ItemPackagesPanelProps> = ({ items, sets, onSave, onDelete, onSaveItem }) => {
  const { toast } = useToast();
  // The pose being edited, in a popup. The "Save a pose" form stays on the page for new ones.
  const [editingId, setEditingId] = useState<string | null>(null);
  // Bumped after a new pose is saved, so the form starts empty again.
  const [formKey, setFormKey] = useState(0);
  const catalog = makeCatalog(items, sets);
  const editing = editingId ? sets.find((set) => set.id === editingId) : undefined;

  return (
    <div className="space-y-6 font-mono text-xs">
      <div className="bg-panel border-2 border-line shadow-lux p-5 space-y-3">
        <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-ink pb-2 border-b-2 border-line">② Save a pose</h3>
        <p className="font-sans text-xs text-neutral-600">
          A saved pose is a ready-made starting point, e.g. <b>Colored toga w/out cap</b> = 11R × 1, Wallet size × 2. In the package
          builder, “From saved pose” copies it into the package, where you can change its sizes and quantities without affecting other
          packages. Editing or deleting a saved pose never changes a package. You can also save a pose from inside the builder.
        </p>
        <PoseForm key={formKey} items={items} sets={sets} onSave={onSave} onSaveItem={onSaveItem} onDone={() => setFormKey((k) => k + 1)} />
      </div>

      <div className="bg-panel border-2 border-line shadow-lux p-5 space-y-2">
        <h4 className="flex items-center justify-between font-black uppercase text-ink">
          <span className="flex items-center gap-2"><Layers className="w-4 h-4 text-gold" /> Saved poses</span>
          <span className="text-[10px] bg-obsidian text-gold px-2 py-0.5">{sets.length}</span>
        </h4>
        {!sets.length && <p className="text-neutral-500 font-sans italic">None yet.</p>}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
          {sets.map((set) => (
            <div key={set.id} className={`p-2.5 border bg-canvas ${editingId === set.id ? 'border-gold' : 'border-neutral-300'}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-black uppercase text-ink">{set.name}</div>
                  <div className="text-[10px] text-neutral-600 font-sans">{setSummary(set, catalog)}</div>
                  {setPrints(set, catalog) > 0 && <div className="text-[10px] font-bold text-gold-soft">{setPrints(set, catalog)} prints</div>}
                </div>
                <span className={recordActionGroup}>
                  <RecordActionButton variant="edit" recordName={set.name} onClick={() => setEditingId(set.id)} />
                  <RecordActionButton variant="delete" recordName={set.name}
                    onClick={async () => {
                      try { await onDelete(set.id); toast.success(`"${set.name}" deleted.`); } catch (err) { toast.error(err instanceof Error ? err.message : 'Could not be deleted.'); }
                    }} />
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {editing && (
        <Modal title="Edit saved pose" subtitle={editing.name} icon={Layers} size="md" onClose={() => setEditingId(null)}>
          <div className="font-mono text-xs space-y-3">
            <p className="font-sans text-xs text-neutral-600">Packages that copied this pose keep their own copy.</p>
            <PoseForm items={items} sets={sets} pose={editing} onSave={onSave} onSaveItem={onSaveItem}
              onDone={() => setEditingId(null)} onCancel={() => setEditingId(null)} />
          </div>
        </Modal>
      )}
    </div>
  );
};

interface PoseFormProps {
  items: CatalogItem[];
  sets: ItemPackage[];
  /** The saved pose being edited; none for a new one. */
  pose?: ItemPackage;
  onSave: ItemPackagesPanelProps['onSave'];
  onSaveItem: ItemPackagesPanelProps['onSaveItem'];
  onDone: () => void;
  onCancel?: () => void;
}

/** A saved pose's title and items, for a new pose (on the page) or an edit (in the popup). */
const PoseForm: React.FC<PoseFormProps> = ({ items, sets, pose, onSave, onSaveItem, onDone, onCancel }) => {
  const { toast } = useToast();
  const editingId = pose?.id ?? null;
  const [name, setName] = useState(pose?.name ?? '');
  const [rows, setRows] = useState<Row[]>(pose?.items.length ? pose.items.map((i) => ({ item: i.item, qty: i.qty })) : [{ item: '', qty: 1 }]);
  const [newItem, setNewItem] = useState('');
  const [newItemCategory, setNewItemCategory] = useState<CatalogItemCategory>('print');
  const [busy, setBusy] = useState(false);
  const catalog = makeCatalog(items, sets);

  const chosen = rows.filter((r) => r.item);
  const prints = setPrints({ id: '', name, items: chosen }, catalog);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      await onSave(editingId, { name: name.trim(), items: chosen.map((r) => ({ item: r.item, qty: Math.max(1, Math.floor(r.qty || 1)) })) });
      toast.success(editingId ? `"${name.trim()}" saved. Packages that copied it keep their own copy.` : `"${name.trim()}" saved.`);
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not be saved.');
    } finally {
      setBusy(false);
    }
  };

  const addNewItem = async () => {
    if (!newItem.trim()) return;
    try {
      const created = await onSaveItem(null, { name: newItem.trim(), category: newItemCategory });
      setRows((list) => [...list.filter((r) => r.item), { item: created.id, qty: 1 }]);
      setNewItem('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'The item could not be created.');
    }
  };

  return (
    <form onSubmit={save} className="space-y-3">
      <label className="block">
        <span className="block text-[11px] font-black uppercase mb-1">Pose title <span className="text-red-500">*</span></span>
        <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} placeholder="e.g. Colored toga w/out cap"
          className="w-full min-h-[42px] px-3 py-2 border border-neutral-400 bg-canvas font-semibold placeholder:italic placeholder:font-normal placeholder:text-neutral-400" />
      </label>

      <div className="space-y-1.5">
        <span className="block text-[11px] font-black uppercase">Items and quantity</span>
        {rows.map((row, index) => (
          <div key={index} className="grid grid-cols-[minmax(0,1fr)_6rem_auto] gap-1.5 items-center">
            <ItemSelect items={items} value={row.item} onChange={(id) => setRows(rows.map((r, i) => (i === index ? { ...r, item: id } : r)))} />
            <input type="number" min={1} max={999} value={row.qty} aria-label="Quantity"
              onChange={(e) => setRows(rows.map((r, i) => (i === index ? { ...r, qty: Number(e.target.value) } : r)))}
              className="w-full min-h-[38px] p-1.5 border border-neutral-400 bg-panel font-black text-center" />
            <button type="button" title="Remove" onClick={() => setRows(rows.length > 1 ? rows.filter((_, i) => i !== index) : [{ item: '', qty: 1 }])}
              className="p-2 text-neutral-500 hover:text-red-600 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
        ))}
        <button type="button" onClick={() => setRows([...rows, { item: '', qty: 1 }])}
          className="flex items-center gap-1 px-2 py-1 text-[10px] font-bold uppercase border border-neutral-400 hover:border-line cursor-pointer">
          <Plus className="w-3 h-3" /> Item
        </button>
      </div>

      <div className="p-2.5 border border-dashed border-neutral-400 space-y-2">
        <span className="block text-[10px] font-black uppercase text-neutral-600">Item not in the list? Create it here</span>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-1.5">
          <input value={newItem} onChange={(e) => setNewItem(e.target.value)} placeholder="e.g. 11R"
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void addNewItem(); } }}
            className="w-full p-1.5 border border-neutral-400 bg-panel font-semibold placeholder:italic placeholder:font-normal placeholder:text-neutral-400" />
          <button type="button" onClick={() => void addNewItem()} disabled={!newItem.trim()}
            className="px-3 py-1.5 bg-obsidian text-gold border border-line text-[10px] font-black uppercase cursor-pointer disabled:opacity-50">Create &amp; add</button>
        </div>
        <CategoryPicker value={newItemCategory} onChange={setNewItemCategory} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <span className="text-[11px] font-bold text-gold-soft">{prints ? `${prints} hard printout ${prints === 1 ? 'copy' : 'copies'}` : 'No prints'}</span>
        <div className="flex gap-2">
          {onCancel && (
            <button type="button" onClick={onCancel}
              className="flex items-center gap-1 px-3 py-2 border border-neutral-400 font-bold uppercase cursor-pointer"><X className="w-3.5 h-3.5" /> Cancel</button>
          )}
          <button type="submit" disabled={busy || !name.trim()}
            className="btn-tactile flex items-center gap-1.5 px-4 py-2 bg-obsidian text-gold border border-line font-black uppercase cursor-pointer disabled:opacity-50">
            <Check className="w-4 h-4" /> {editingId ? 'Save changes' : 'Save pose'}
          </button>
        </div>
      </div>
    </form>
  );
};
