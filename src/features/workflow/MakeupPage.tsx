import { useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ClientResponseError } from 'pocketbase';
import { pb } from '../../db/pocketbase';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { ConfirmModal } from '../../components/common/ConfirmModal';
import { studioDate } from '../../utils/studioDay';
import type { MuaTeam } from './muaTeam';
import { useWorkflowData, workflowApi, workflowError } from '../../hooks/useWorkflowData';
import { MakeupClientTable, type MakeupTableView } from './MakeupTables';
import { MuaTeamOverview } from './MuaTeamOverview';
import { requiresConfirmation, type MakeupAssignment } from './makeupAssignment';
import { stationButton, stationCard, StationLayout } from './StationLayout';
import { StationTabs } from './StationTabs';

type Action = 'assign' | 'claim' | 'start' | 'complete' | 'release';
const tabs = [
  { id: 'team', label: 'MUA Team Overview' },
  { id: 'waiting', label: 'Unassigned Clients' },
  { id: 'assigned', label: 'Assigned Clients' },
  { id: 'completed', label: 'Completed Services' },
] as const;
type MakeupTab = typeof tabs[number]['id'];
const noRows: MakeupAssignment[] = [];

export function MakeupPage({ embedded = false, teamSettings }: { embedded?: boolean; teamSettings?: ReactNode }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [selection, setSelection] = useState<MakeupTab>();
  const [views, setViews] = useState<Partial<Record<MakeupTab, MakeupTableView>>>({});
  const [date, setDate] = useState(() => studioDate());
  const teamPath = `/makeup-team?date=${encodeURIComponent(date)}${selection === 'team' ? '&overview=1' : ''}`;
  const { data: team, error: teamError, refresh: refreshTeam } = useWorkflowData<MuaTeam>(teamPath, undefined, true);
  const admin = user?.role === 'admin';
  const manage = admin || !!team?.manage;
  const availableTabs = tabs.filter(({ id }) => id === 'team' ? manage : id === 'waiting' ? manage || team?.canClaim : true);
  const defaultTab = admin ? 'waiting' : 'assigned';
  const activeTab = selection && availableTabs.some(({ id }) => id === selection) ? selection : defaultTab;
  const queueTab = activeTab === 'waiting' || activeTab === 'assigned';
  const { data, error, refresh } = useWorkflowData<MakeupAssignment[]>(queueTab ? '/makeup?completed=0' : null);
  const { data: completed, error: completedError, refresh: refreshCompleted } =
    useWorkflowData<MakeupAssignment[]>(activeTab === 'completed' ? `/makeup-completed?date=${encodeURIComponent(date)}` : null);
  const workingLock = useRef(false);
  const [working, setWorking] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [unavailable, setUnavailable] = useState<{ id: string; version?: number }>();
  const [release, setRelease] = useState<MakeupAssignment>();
  const [confirmCompletion, setConfirmCompletion] = useState<MakeupAssignment>();
  const [assignment, setAssignment] = useState<{ row: MakeupAssignment; artistId: string }>();
  const artists = useMemo(() => team?.artists.filter((artist) => !artist.disabled) ?? [], [team]);
  const targets = artists.filter((artist) => !artist.parent || team?.allowSelf);
  const queueRows = useMemo(() => {
    if (activeTab === 'waiting') return data?.filter((row) => row.state === 'waiting' &&
      !(unavailable?.id === row.id && unavailable.version === row.version)) ?? noRows;
    if (activeTab === 'assigned') return data?.filter((row) => row.state === 'claimed' || row.state === 'in_progress') ?? noRows;
    return noRows;
  }, [activeTab, data, unavailable]);
  const view = views[activeTab] ?? {};

  function updateView(change: MakeupTableView) {
    setViews((current) => ({ ...current, [activeTab]: { ...current[activeTab], ...change } }));
  }

  function refreshTables() {
    refresh();
    refreshTeam();
    refreshCompleted();
  }

  async function update(row: MakeupAssignment, action: Action, targetId?: string) {
    if (workingLock.current) return;
    workingLock.current = true;
    setWorking(true);
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
      if (action === 'complete') toast.success(requiresConfirmation(row)
        ? 'Service confirmed. The client is in the photography queue.'
        : 'Makeup or grooming completed. The client is in the photography queue.');
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
      refreshTables();
      workingLock.current = false;
      setWorking(false);
    }
  }

  function assignControl(row: MakeupAssignment) {
    if (!manage || !row.eligible) return null;
    const available = targets.filter((artist) => artist.id !== row.artistId);
    return (
      <select aria-label={`Assign ${row.name} to an artist`} className="min-h-10 max-w-full border border-line bg-panel px-2"
        disabled={working || !available.length} value=""
        onChange={(event) => setAssignment({ row, artistId: event.target.value })}>
        <option value="">{!available.length ? 'No eligible artist' : row.artistId ? 'Reassign to…' : 'Assign to…'}</option>
        {available.map((artist) => <option key={artist.id} value={artist.id}>
          {artist.name}{artist.parent ? ' (Parent)' : ''}
        </option>)}
      </select>
    );
  }

  function waitingActions(row: MakeupAssignment) {
    return manage ? assignControl(row) : team?.canClaim && (
      <button type="button" className={stationButton} disabled={working} onClick={() => void update(row, 'claim')}>Select student</button>
    );
  }

  function assignedActions(row: MakeupAssignment) {
    const canPerform = admin || row.artistId === user?.id;
    const confirmation = requiresConfirmation(row);
    const starts = row.state === 'claimed' && !confirmation;
    return <>
      {canPerform && <button type="button" className={stationButton} disabled={working || !row.eligible}
        onClick={() => admin && !starts ? setConfirmCompletion(row) : void update(row, starts ? 'start' : 'complete')}>
        {confirmation ? 'Confirm service' : starts ? (admin ? 'Start on behalf of MUA' : 'Mark in progress')
          : admin ? 'Record completion' : 'Complete makeup / grooming'}
      </button>}
      {manage && row.artistId && <>
        {assignControl(row)}
        <button type="button" className={stationButton} disabled={working} onClick={() => setRelease(row)}>Release assignment</button>
      </>}
    </>;
  }

  return (
    <StationLayout title="Makeup / Grooming" badge="MUA Station" liveLabel="Live Queue"
      description="Manage MUA assignments and service confirmations." refresh={refreshTables} embedded={embedded}>
      <StationTabs label="Makeup and grooming views" active={activeTab} onChange={setSelection}
        tabs={availableTabs.map((tab) => ({
          ...tab,
          count: tab.id === 'team' && team?.date === date ? artists.length
            : tab.id === 'completed' ? completed?.length
              : tab.id === activeTab && data ? queueRows.length : undefined,
        }))}>
        {teamError && activeTab !== 'completed' && <p role="alert" className="text-sm font-bold text-red-700">{teamError}</p>}
        {queueTab && error && <p role="alert" className="text-sm font-bold text-red-700">{error}</p>}
        {activeTab === 'completed' && completedError && <p role="alert" className="text-sm font-bold text-red-700">{completedError}</p>}
        {activeTab === 'completed' && (
          <label className="flex flex-wrap items-center gap-2 text-xs font-bold">
            Completion date (Philippine time)
            <input type="date" className="min-h-10 border border-line bg-panel px-2" value={date}
              onChange={(event) => setDate(event.target.value || studioDate())} />
          </label>
        )}
        {activeTab === 'team' ? (
          <>
            <MuaTeamOverview team={team} date={date} onDateChange={setDate} failed={!!teamError}
              sort={view.sort ?? null} onSort={(sort) => updateView({ sort })} />
            {admin && teamSettings && (
              <details className="border border-line bg-panel">
                <summary className="cursor-pointer px-3 py-2 text-xs font-bold text-gold-soft">Makeup artist team settings</summary>
                {teamSettings}
              </details>
            )}
          </>
        ) : (
          <MakeupClientTable key={activeTab} kind={activeTab} view={view} onViewChange={updateView}
            title={activeTab === 'completed' ? 'Completed services' : activeTab === 'waiting'
              ? 'Unassigned clients' : manage ? 'Assigned clients' : 'Your assignments'}
            rows={activeTab === 'completed' ? completed ?? noRows : queueRows}
            loading={activeTab === 'completed' ? !completed && !completedError : !data && !error}
            empty={activeTab === 'completed' ? 'No completed services for this date.' : activeTab === 'waiting'
              ? 'No unassigned clients waiting for MUA.' : 'No active assigned clients.'}
            renderAction={activeTab === 'waiting' ? waitingActions : undefined}
            renderDetailsActions={activeTab === 'assigned' ? assignedActions : undefined} />
        )}
      </StationTabs>
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
        onConfirm={async () => { if (release) await update(release, 'release'); }}
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
