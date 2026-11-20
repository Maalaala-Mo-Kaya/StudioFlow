import { useState, type FormEvent } from 'react';
import { pb } from '../../../db/pocketbase';
import { useToast } from '../../../context/ToastContext';
import { useWorkflowData, workflowApi, workflowError } from '../../../hooks/useWorkflowData';
import type { MuaTeam } from '../../workflow/muaTeam';
import { stationButton } from '../../workflow/StationLayout';

export function MuaTeamSettings() {
  const { data, error, refresh } = useWorkflowData<MuaTeam>('/makeup-team');
  return <section className="border-2 border-line bg-panel p-5 lg:col-span-2">
    <h3 className="mb-3 text-sm font-black uppercase tracking-wider">Makeup Artist Team</h3>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {!data && !error && <p role="status" className="text-sm">Loading MUA settings…</p>}
    {data && <TeamForm key={`${data.parentId}:${data.allowSelf}`} team={data} refresh={refresh} />}
  </section>;
}

function TeamForm({ team, refresh }: { team: MuaTeam; refresh: () => void }) {
  const [parentId, setParentId] = useState(team.parentId || '');
  const [allowSelf, setAllowSelf] = useState(!!team.allowSelf);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const missingParent = parentId && !team.artists.some((artist) => artist.id === parentId);
  const changed = parentId !== (team.parentId || '') || allowSelf !== !!team.allowSelf;

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await pb.send(workflowApi + '/makeup-team', { method: 'POST', body: { parentId, allowSelf } });
      toast.success('MUA team settings saved.');
      refresh();
    } catch (error) {
      toast.error(workflowError(error));
    } finally {
      setSaving(false);
    }
  }

  return <form onSubmit={(event) => void save(event)} className="space-y-3">
    <div className="flex flex-wrap items-end gap-3">
      <label className="min-w-0 text-xs font-bold">Parent MUA
        <select disabled={saving} className="mt-1 block min-h-10 w-full border border-line bg-canvas px-2" value={parentId}
          onChange={(event) => { setParentId(event.target.value); if (!event.target.value) setAllowSelf(false); }}>
          <option value="">No Parent — shared self-claim queue</option>
          {missingParent && <option value={parentId} disabled>Previous Parent unavailable</option>}
          {team.artists.map((artist) => <option key={artist.id} value={artist.id} disabled={artist.disabled}>
            {artist.name}{artist.disabled ? ' (disabled)' : ''}
          </option>)}
        </select>
      </label>
      <label className="flex min-h-10 items-center gap-2 text-xs font-bold">
        <input type="checkbox" className="accent-gold" checked={allowSelf} disabled={!parentId || saving}
          onChange={(event) => setAllowSelf(event.target.checked)} />
        Allow Parent MUA to Accept Clients
      </label>
      <button className={stationButton} disabled={!changed || saving} type="submit">{saving ? 'Saving…' : 'Save MUA team'}</button>
    </div>
    {team.artists.length === 0 ? <p className="text-sm">Create an account with the Makeup Artist role to set up a team.</p> :
      <ul className="flex flex-wrap gap-2 text-xs">
        {team.artists.map((artist) => <li key={artist.id} className="border border-line px-2 py-1">
          <strong>{artist.name}</strong> · {artist.parent ? 'Parent' : team.parentId ? 'Child' : 'Makeup artist'} · {artist.disabled ? 'Disabled' : 'Enabled'}
        </li>)}
      </ul>}
    <p className="text-xs text-neutral-600">Use Makeup &amp; Photo Selection to view assignments and reassign clients.</p>
  </form>;
}
