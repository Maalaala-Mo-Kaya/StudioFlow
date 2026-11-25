import { useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { CalendarDays, Check, ChevronDown, Clock3, Settings2, UserPlus } from 'lucide-react';
import { ClientResponseError } from 'pocketbase';
import { pb } from '../../db/pocketbase';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { ConfirmModal } from '../../components/common/ConfirmModal';
import { Modal } from '../../components/common/Modal';
import { studioDate } from '../../utils/studioDay';
import { clampDay, useStudioCalendar } from '../../hooks/useStudioCalendar';
import type { MuaTeam } from './muaTeam';
import { useWorkflowData, workflowApi, workflowError } from '../../hooks/useWorkflowData';
import { MakeupClientsView, type MakeupTableView } from './MakeupTables';
import { MuaTeamOverview } from './MuaTeamOverview';
import { requiresConfirmation, type MakeupAssignment } from './makeupAssignment';
import { StationTabs } from './StationTabs';
import { StationLayout, stationCard } from './StationLayout';
import { makeupField, makeupPrimary, makeupSecondary } from './makeupStyles';

type Action = 'assign' | 'claim' | 'start' | 'complete' | 'release';
const tabs = [
  { id: 'team', label: 'Team' },
  { id: 'waiting', label: 'Unassigned' },
  { id: 'assigned', label: 'Assigned' },
  { id: 'completed', label: 'Completed' },
] as const;
type MakeupTab = typeof tabs[number]['id'];
const noRows: MakeupAssignment[] = [];

export function MakeupPage({ embedded = false, teamSettings }: { embedded?: boolean; teamSettings?: ReactNode }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [selection, setSelection] = useState<MakeupTab>();
  const [views, setViews] = useState<Partial<Record<MakeupTab, MakeupTableView>>>({});
  const [date, setDate] = useState(() => studioDate());
  // Completion dates from the studio's first day to today.
  const calendar = useStudioCalendar();
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
  const [assignment, setAssignment] = useState<MakeupAssignment>();
  const [artistId, setArtistId] = useState('');
  const artists = useMemo(() => team?.artists.filter((artist) => !artist.disabled) ?? [], [team]);
  const targets = artists.filter((artist) => !artist.parent || team?.allowSelf);
  const waiting = useMemo(() => data?.filter((row) => row.state === 'waiting' &&
    !(unavailable?.id === row.id && unavailable.version === row.version)), [data, unavailable]);
  const assigned = useMemo(() => data?.filter((row) => row.state === 'claimed' || row.state === 'in_progress'), [data]);
  const queueRows = activeTab === 'waiting' ? waiting : assigned;
  const availableArtists = targets.filter((artist) => artist.id !== assignment?.artistId);
  const selectedArtist = availableArtists.find((artist) => artist.id === artistId);
  const activeError = activeTab === 'team' ? teamError : activeTab === 'completed' ? completedError : error;
  const loading = !activeError && (activeTab === 'team' ? team?.date !== date : activeTab === 'completed' ? !completed : !data);
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
    const hasArtists = targets.some((artist) => artist.id !== row.artistId);
    return (
      <button type="button" aria-label={`${row.artistId ? 'Reassign' : 'Assign'} ${row.name}`}
        className={row.artistId ? makeupSecondary : makeupPrimary} disabled={working || !hasArtists}
        onClick={() => { setArtistId(''); setAssignment(row); }}>
        <UserPlus className="size-4 shrink-0" aria-hidden="true" />
        {teamError ? 'Artist list unavailable' : !team ? 'Loading artists…' : !hasArtists ? 'No eligible artist'
          : row.artistId ? 'Reassign' : 'Assign artist'}
      </button>
    );
  }

  function waitingActions(row: MakeupAssignment) {
    return manage ? assignControl(row) : team?.canClaim && (
      <button type="button" className={makeupPrimary} disabled={working || !row.eligible} onClick={() => void update(row, 'claim')}>
        <UserPlus className="size-4 shrink-0" aria-hidden="true" /> Claim client
      </button>
    );
  }

  function assignedActions(row: MakeupAssignment) {
    const canPerform = admin || row.artistId === user?.id;
    const confirmation = requiresConfirmation(row);
    const starts = row.state === 'claimed' && !confirmation;
    return <>
      {canPerform && <button type="button" className={`${makeupPrimary} w-full sm:w-auto`} disabled={working || !row.eligible}
        onClick={() => admin && !starts ? setConfirmCompletion(row) : void update(row, starts ? 'start' : 'complete')}>
        {starts ? <Clock3 className="size-4" aria-hidden="true" /> : <Check className="size-4" aria-hidden="true" />}
        {confirmation ? 'Confirm service' : starts ? (admin ? 'Start for artist' : 'Start service') : 'Mark complete'}
      </button>}
      {manage && row.artistId && <>
        {assignControl(row)}
        <button type="button" className={makeupSecondary} disabled={working} onClick={() => setRelease(row)}>Release</button>
      </>}
    </>;
  }

  return (
    <StationLayout title={<>Makeup &amp; <span className={embedded ? 'text-gold-soft' : 'text-gold'}>Grooming</span></>} badge="MUA Station" compactHeader={embedded}
      liveLabel={loading || activeError ? undefined : 'Live Queue'}
      description={embedded ? undefined : manage ? 'Assign clients and track makeup and grooming services.' : 'Manage your clients and confirm completed services.'}
      refresh={refreshTables} embedded={embedded}>
      <StationTabs label="Makeup and grooming views" active={activeTab} onChange={setSelection}
        tabs={availableTabs.map(({ id, label }) => ({
          id,
          label: id === 'assigned' && !manage ? 'My clients' : label,
          count: id === 'team' ? team && artists.length : id === 'completed' ? completed?.length
            : id === 'waiting' ? waiting?.length : assigned?.length,
        }))}>
        {(activeError || (queueTab && teamError)) && <p role="alert" className="border border-red-500/40 bg-red-500/10 p-3 text-sm text-ink">
          {activeError || teamError} Use Sync to try again.
        </p>}
        {activeTab === 'completed' && (
          <label className="flex flex-wrap items-center gap-2 text-sm font-semibold">
            <CalendarDays className="size-4 text-gold-soft" aria-hidden="true" /> Completion date
            <input type="date" className={makeupField} value={date}
              min={calendar.start || undefined} max={studioDate()}
              onChange={(event) => setDate(clampDay(event.target.value || studioDate(), calendar.start, studioDate()))} />
            <span className="font-normal text-ink/70">Philippine time</span>
          </label>
        )}
        {activeTab === 'team' ? (
          <>
            <MuaTeamOverview team={team} date={date} onDateChange={setDate} failed={!!teamError} embedded={embedded}
              sort={view.sort ?? null} onSort={(sort) => updateView({ sort })} />
            {admin && teamSettings && (
              <details className="group border border-line bg-panel">
                <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2.5 px-4 py-3 text-sm font-semibold text-ink hover:bg-gold-wash focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-gold [&::-webkit-details-marker]:hidden">
                  <Settings2 className="size-4 shrink-0 text-gold-soft" aria-hidden="true" />
                  Makeup artist team settings
                  <ChevronDown className="ml-auto size-4 shrink-0 text-gold-soft group-open:rotate-180" aria-hidden="true" />
                </summary>
                {teamSettings}
              </details>
            )}
          </>
        ) : (
          <MakeupClientsView key={activeTab} kind={activeTab} view={view} onViewChange={updateView}
            title={activeTab === 'completed' ? 'Completed services' : activeTab === 'waiting'
              ? 'Unassigned clients' : manage ? 'Assigned clients' : 'Your assignments'}
            rows={(activeTab === 'completed' ? completed : queueRows) ?? noRows}
            loading={loading} failed={!!activeError}
            renderAction={activeTab === 'waiting' ? waitingActions : activeTab === 'assigned' ? assignedActions : undefined} />
        )}
      </StationTabs>
      {conflict && (
        <div role="alertdialog" aria-modal="true" aria-labelledby="makeup-conflict" className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
          <div className={`${stationCard} max-w-sm space-y-4`}>
            <h2 id="makeup-conflict" className="text-sm font-black uppercase tracking-wide">Client already assigned</h2>
            <p>Another artist already has this client. Refresh the queue to see who is available.</p>
            <button autoFocus type="button" className={makeupPrimary} onClick={() => { setConflict(false); refresh(); }}>Back to queue</button>
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
      {assignment && (
        <Modal title={assignment.artistId ? 'Reassign client' : 'Assign client'}
          subtitle={assignment.name} icon={UserPlus} size="md" busy={working} onClose={() => setAssignment(undefined)}
          footer={<>
            <button type="button" className={makeupSecondary} disabled={working} onClick={() => setAssignment(undefined)}>Cancel</button>
            <button type="button" className={`${makeupPrimary} flex-1 sm:flex-none`} disabled={working || !selectedArtist}
              onClick={async () => {
                if (!selectedArtist) return;
                try {
                  await update(assignment, 'assign', selectedArtist.id);
                  setAssignment(undefined);
                } catch { /* The update displays the error and keeps the selection available to retry. */ }
              }}>
              {working ? 'Saving…' : assignment.artistId ? 'Reassign client' : 'Assign client'}
            </button>
          </>}>
          <fieldset className="space-y-2 font-sans text-sm" disabled={working}>
            <legend className="mb-3 text-sm font-black uppercase tracking-wide">Choose an artist</legend>
            {assignment.state === 'in_progress' && <p className="mb-3 text-ink/75">The new artist will start this service from the beginning.</p>}
            {availableArtists.length === 0 && <p className="text-ink/75">There are no eligible artists right now.</p>}
            {availableArtists.map((artist, index) => (
              <label key={artist.id} className={`flex min-h-14 cursor-pointer items-center gap-3 border p-3 focus-within:outline-2 focus-within:outline-gold ${artist.id === artistId ? 'border-gold bg-gold-wash' : 'border-line bg-panel hover:border-gold'}`}>
                <input type="radio" name="makeup-artist" value={artist.id} checked={artist.id === artistId}
                  onChange={() => setArtistId(artist.id)} autoFocus={index === 0} className="size-4 shrink-0 accent-gold" />
                <span className="min-w-0 wrap-break-word">
                  <span className="block font-semibold text-ink">{artist.name}{artist.parent && ' · Team lead'}</span>
                  {(!team?.report || team.date === team.today) && (
                    <span className="block text-ink/70">{artist.pending} pending · {artist.inProgress} in progress</span>
                  )}
                </span>
              </label>
            ))}
          </fieldset>
        </Modal>
      )}
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
