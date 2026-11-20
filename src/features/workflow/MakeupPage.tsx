import { useState } from 'react';
import { ClientResponseError } from 'pocketbase';
import { pb } from '../../db/pocketbase';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { ConfirmModal } from '../../components/common/ConfirmModal';
import { formatQueueNumber } from '../../utils/formatters';
import { makeupLookLabel } from '../../constants/makeupLook';
import { studioDate } from '../../utils/studioDay';
import type { MuaTeam } from './muaTeam';
import { useWorkflowData, workflowApi, workflowError } from '../../hooks/useWorkflowData';
import { stationButton, stationCard, stationGrid, StationLayout, StationStudentDetails, type StationStudent } from './StationLayout';

type MakeupState = 'waiting' | 'claimed' | 'in_progress' | 'completed';
type Action = 'assign' | 'claim' | 'start' | 'complete' | 'release';
interface MakeupAssignment extends StationStudent {
  service: string;
  services?: { source: keyof typeof serviceSource; name: string; types?: { id: string; name: string }[] }[];
  state: MakeupState;
  /** The client's preferred look from the kiosk (full | light | grooming) and note; empty when not asked. */
  look?: string;
  lookNote?: string;
  version: number;
  artistId: string;
  artistName: string;
  completedAt: string;
  eligible: boolean;
}

const stateLabel: Record<MakeupState, string> = {
  waiting: 'Waiting', claimed: 'Claimed', in_progress: 'In progress', completed: 'Completed',
};

const serviceSource = {
  package: 'Selected package',
  add_on: 'Selected add-on',
  admin: 'Admin correction',
  legacy: 'Existing job order',
};

export function MakeupPage({ embedded = false }: { embedded?: boolean }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { data, error, refresh } = useWorkflowData<MakeupAssignment[]>('/makeup?completed=1');
  const [date, setDate] = useState(() => studioDate());
  const { data: team, error: teamError, refresh: refreshTeam } = useWorkflowData<MuaTeam>(`/makeup-team?date=${encodeURIComponent(date)}`);
  const [working, setWorking] = useState<string>();
  const [conflict, setConflict] = useState(false);
  const [unavailable, setUnavailable] = useState<{ id: string; version: number }>();
  const [release, setRelease] = useState<MakeupAssignment>();
  const [confirmCompletion, setConfirmCompletion] = useState<MakeupAssignment>();
  const [assignment, setAssignment] = useState<{ row: MakeupAssignment; artistId: string }>();
  const admin = user?.role === 'admin';
  const manage = !!team?.manage;
  const targets = team?.artists.filter((artist) => !artist.disabled && (!artist.parent || team.allowSelf)) ?? [];
  const waiting = data?.filter((row) => row.state === 'waiting' &&
    !(unavailable?.id === row.id && unavailable.version === row.version)) ?? [];
  const active = data?.filter((row) => row.state === 'claimed' || row.state === 'in_progress') ?? [];
  const completed = data?.filter((row) => row.state === 'completed' && row.completedAt
    && studioDate(0, Date.parse(row.completedAt.replace(' ', 'T'))) === date) ?? [];

  async function update(row: MakeupAssignment, action: Action, targetId?: string) {
    setWorking(row.id);
    try {
      await pb.send(`${workflowApi}/makeup/${row.id}/${action}`, {
        method: 'POST',
        body: {
          version: row.version == null ? undefined : String(row.version),
          ...(action === 'release' ? { artistId: row.artistId } : {}),
          ...(action === 'assign' ? { artistId: targetId } : {}),
          ...(admin && (action === 'start' || action === 'complete') ? { onBehalf: true, artistId: row.artistId } : {}),
        },
      });
      if (action === 'complete') toast.success('Makeup or grooming completed. The student is in the photographer queue.');
      if (action === 'assign') toast.success(row.artistId ? 'Client reassigned.' : 'Client assigned.');
      if (action === 'release') toast.success('Assignment released.');
    } catch (error) {
      if (error instanceof ClientResponseError && error.status === 409 && error.response.data?.reason?.code === 'already_assigned') {
        setUnavailable({ id: row.id, version: row.version });
        setConflict(true);
      } else {
        toast.error(workflowError(error));
        if (action === 'assign') throw error;
      }
    } finally {
      refresh();
      refreshTeam();
      setWorking(undefined);
    }
  }

  function section(title: string, rows: MakeupAssignment[], empty: string) {
    return (
      <section className="space-y-3">
        <h2 className="text-lg font-black uppercase">{title} <span className="text-sm font-mono text-gold-soft">({rows.length})</span></h2>
        {rows.length === 0 && <p className="text-sm text-neutral-600">{empty}</p>}
        <div className={stationGrid}>
          {rows.map((row) => (
            <article key={row.id} className={`${stationCard} space-y-3`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono px-2 py-1 bg-obsidian text-gold text-sm font-black">{formatQueueNumber(row.queueNumber)}</span>
                <span className="text-xs font-black uppercase">{stateLabel[row.state]}</span>
              </div>
              <StationStudentDetails student={row} />
              {(row.look || row.lookNote) && (
                <div className="border-2 border-gold bg-gold-wash px-3 py-2">
                  <p className="text-[10px] font-black uppercase tracking-wider text-gold-soft">Preferred look</p>
                  {row.look && <p className="text-base font-black uppercase text-ink">{makeupLookLabel(row.look) || row.look}</p>}
                  {row.lookNote && <p className="text-sm text-ink break-words">“{row.lookNote}”</p>}
                </div>
              )}
              <div className="border-t border-neutral-300 pt-2">
                <p className="text-xs font-black uppercase">MUA Service</p>
                {row.services?.length ? (
                  <ul className="space-y-1">
                    {row.services.map(({ name, source, types }, index) => (
                      <li key={index} className="text-sm break-words">
                        {types?.length ? types.map((type) => type.name).join(', ') + ' · ' : ''}{name}
                        {' '}<span className="text-xs text-neutral-600">({serviceSource[source]})</span>
                      </li>
                    ))}
                  </ul>
                ) : <p className="text-sm">{row.service || 'Makeup / grooming'}</p>}
              </div>
              {row.artistId && manage && <p className="text-xs font-bold">MUA {row.artistName}</p>}
              {row.state === 'waiting' && <p className="text-xs">Payment confirmed · eligible for MUA</p>}
              {row.completedAt && <p className="text-xs">{new Date(row.completedAt.replace(' ', 'T')).toLocaleString()}</p>}
              {row.state !== 'waiting' && row.state !== 'completed' && !row.eligible &&
                <p className="text-xs font-bold text-red-700">Registration or payment is no longer eligible.</p>}
              {team?.canClaim && row.state === 'waiting' && (
                <button type="button" className={stationButton} disabled={!!working} onClick={() => void update(row, 'claim')}>Select student</button>
              )}
              {manage && row.eligible && row.state !== 'completed' && (
                <div className="flex flex-wrap items-center gap-2">
                  <select aria-label={`Assign ${row.name} to an artist`} className="min-h-10 max-w-full border border-line bg-panel px-2"
                    disabled={!!working || !targets.some((artist) => artist.id !== row.artistId)} value=""
                    onChange={(event) => setAssignment({ row, artistId: event.target.value })}>
                    <option value="">{row.artistId ? 'Reassign to…' : 'Assign to…'}</option>
                    {targets.filter((artist) => artist.id !== row.artistId).map((artist) =>
                      <option key={artist.id} value={artist.id}>{artist.name}{artist.parent ? ' (Parent)' : ''}</option>)}
                  </select>
                  {!targets.some((artist) => artist.id !== row.artistId) && <p className="text-xs">No eligible alternative artist.</p>}
                </div>
              )}
              {!admin && row.artistId === user?.id && (row.state === 'claimed' || row.state === 'in_progress') && (
                <button type="button" className={stationButton} disabled={!!working || !row.eligible} onClick={() => void update(row, row.state === 'claimed' ? 'start' : 'complete')}>
                  {row.state === 'claimed' ? 'Mark in progress' : 'Complete makeup / grooming'}
                </button>
              )}
              {admin && (row.state === 'claimed' || row.state === 'in_progress') && (
                <div className="flex flex-wrap gap-2">
                  <button type="button" className={stationButton} disabled={!!working || !row.eligible}
                    onClick={() => row.state === 'claimed' ? void update(row, 'start') : setConfirmCompletion(row)}>
                    {row.state === 'claimed' ? 'Start on behalf of MUA' : 'Record completion'}
                  </button>
                </div>
              )}
              {manage && row.artistId && (row.state === 'claimed' || row.state === 'in_progress') &&
                <button type="button" className={stationButton} disabled={!!working} onClick={() => setRelease(row)}>Release assignment</button>}
            </article>
          ))}
        </div>
      </section>
    );
  }

  return (
    <StationLayout title="Makeup / Grooming Queue" refresh={() => { refresh(); refreshTeam(); }} embedded={embedded}>
      {error && <p role="alert" className="text-sm font-bold text-red-700">{error}</p>}
      {teamError && <p role="alert" className="text-sm font-bold text-red-700">{teamError}</p>}
      {data && !team && !teamError && <p role="status" className="text-sm">Loading MUA team…</p>}
      {!data && !error && <p role="status">Syncing makeup queue…</p>}
      {data && <>
        <label className="flex flex-wrap items-center gap-2 text-xs font-bold">
          Completion date (Philippine time)
          <input type="date" className="min-h-10 border border-line bg-panel px-2" value={date}
            onChange={(event) => setDate(event.target.value || studioDate())} />
        </label>
        {manage && team && <section className="space-y-2">
          <h2 className="text-lg font-black uppercase">MUA team status</h2>
          {team.artists.length === 0 && <p className="text-sm">No MUA accounts have been set up.</p>}
          <ul className={stationGrid}>
            {team.artists.map((artist) => <li className={stationCard} key={artist.id}>
              <strong>{artist.name}</strong> <span className="text-xs">{artist.parent ? 'Parent' : 'Artist'}{artist.disabled ? ' · Disabled' : ''}</span>
              <p className="text-xs">{artist.pending} pending · {artist.inProgress} in progress · {artist.completed} clients completed</p>
            </li>)}
          </ul>
        </section>}
        {(manage || team?.canClaim) && section('Unassigned clients', waiting, 'No students are waiting for makeup or grooming.')}
        {section(manage ? 'Assigned clients' : 'Your assignments', active, 'No active assignments.')}
        {section('Completed services', completed, 'No services completed on this date.')}
      </>}
      {conflict && (
        <div role="alertdialog" aria-modal="true" aria-labelledby="makeup-conflict" className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
          <div className={`${stationCard} max-w-sm space-y-4`}>
            <h2 id="makeup-conflict" className="font-black uppercase">Student already assigned</h2>
            <p>This student has already been selected by another makeup artist.</p>
            <button autoFocus type="button" className={stationButton} onClick={() => { setConflict(false); refresh(); }}>Back to waiting queue</button>
          </div>
        </div>
      )}
      <ConfirmModal
        isOpen={!!release}
        title="Release makeup assignment"
        message={`Return ${release?.name ?? 'this client'} to the unassigned queue?`}
        confirmText="Release assignment"
        onConfirm={() => { if (release) void update(release, 'release'); }}
        onClose={() => setRelease(undefined)}
      />
      <ConfirmModal isOpen={!!assignment}
        title={assignment?.row.artistId ? 'Reassign client' : 'Assign client'}
        message={assignment && `Assign ${assignment.row.name} to ${targets.find((artist) => artist.id === assignment.artistId)?.name ?? 'the selected MUA'}?${assignment.row.state === 'in_progress' ? ' The new artist will start from the pending queue.' : ''}`}
        confirmText={assignment?.row.artistId ? 'Reassign' : 'Assign'}
        onConfirm={async () => { if (assignment) await update(assignment.row, 'assign', assignment.artistId); }}
        onClose={() => setAssignment(undefined)}
      />
      <ConfirmModal
        isOpen={!!confirmCompletion}
        title="Confirm performing MUA"
        message={`Confirm that ${confirmCompletion?.artistName} completed all required services for ${confirmCompletion?.name}. Your account will be recorded as the person confirming completion.`}
        confirmText="Confirm completion"
        onConfirm={async () => { if (confirmCompletion) await update(confirmCompletion, 'complete'); }}
        onClose={() => setConfirmCompletion(undefined)}
      />
    </StationLayout>
  );
}
