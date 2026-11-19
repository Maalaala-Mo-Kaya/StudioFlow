import { useState } from 'react';
import { pb } from '../../../db/pocketbase';
import { useToast } from '../../../context/ToastContext';
import { workflowError } from '../../../hooks/useWorkflowData';
import type { MuaServiceType } from '../../../types';
import { stationButton, stationCard } from '../../workflow/StationLayout';

export function MuaServiceCatalog({ categories, error, refresh }: {
  categories?: MuaServiceType[];
  error?: string;
  refresh: () => void;
}) {
  const { toast } = useToast();
  const [editing, setEditing] = useState<MuaServiceType>();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  async function save(id: string | undefined, values: { name?: string; is_active?: boolean }) {
    setBusy(true);
    try {
      const collection = pb.collection('mua_service_types');
      if (id) await collection.update(id, values);
      else await collection.create(values);
      refresh();
      return true;
    } catch (failure) {
      toast.error(workflowError(failure));
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={`${stationCard} space-y-3`}>
      <h3 className="text-sm font-black uppercase">MUA Service Types</h3>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <form className="flex flex-wrap items-end gap-2" onSubmit={async (event) => {
        event.preventDefault();
        if (!name.trim()) return;
        const saved = await save(editing?.id, editing ? { name: name.trim() } : { name: name.trim(), is_active: true });
        if (saved) { setEditing(undefined); setName(''); }
      }}>
        <label className="min-w-40 flex-1">
          <span className="block text-xs font-bold">{editing ? 'Rename service type' : 'New service type'}</span>
          <input required maxLength={100} value={name} onChange={(event) => setName(event.target.value)}
            className="min-h-10 w-full border border-black bg-[#F8F7F4] px-2" />
        </label>
        <button type="submit" className={stationButton} disabled={busy}>{editing ? 'Save name' : 'Add service type'}</button>
        {editing && <button type="button" className={stationButton} disabled={busy}
          onClick={() => { setEditing(undefined); setName(''); }}>Cancel</button>}
      </form>
      <ul className="divide-y divide-neutral-200">
        {categories?.map((category) => (
          <li key={category.id} className="flex flex-wrap justify-between items-center gap-2 py-2">
            <span className="font-bold">{category.name}{category.is_active ? '' : ' (inactive)'}</span>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={stationButton} disabled={busy}
                onClick={() => { setEditing(category); setName(category.name); }}>Rename</button>
              <button type="button" className={stationButton} disabled={busy}
                onClick={() => void save(category.id, { is_active: !category.is_active })}>
                {category.is_active ? 'Deactivate' : 'Reactivate'}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
