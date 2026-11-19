import { useState } from 'react';
import { ClientResponseError } from 'pocketbase';
import { pb } from '../../db/pocketbase';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { ConfirmModal } from '../../components/common/ConfirmModal';
import { formatQueueNumber } from '../../utils/formatters';
import { useWorkflowData, workflowApi, workflowError } from '../../hooks/useWorkflowData';
import { stationButton, stationCard, stationGrid, StationLayout, StationStudentDetails, type StationStudent } from './StationLayout';

type MakeupState = 'waiting' | 'claimed' | 'in_progress' | 'completed';
type Action = 'claim' | 'start' | 'complete' | 'release';
interface MakeupAssignment extends StationStudent {
  service: string;
  services?: { source: keyof typeof serviceSource; name: string; types?: { id: string; name: string }[] }[];
  state: MakeupState;
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
  const { data, error, refresh } = useWorkflowData<MakeupAssignment[]>('/makeup');
  const [working, setWorking] = useState<string>();
  const [conflict, setConflict] = useState(false);
  const [unavailable, setUnavailable] = useState<{ id: string; version: number }>();
  const [release, setRelease] = useState<MakeupAssignment>();
  const [confirmCompletion, setConfirmCompletion] = useState<MakeupAssignment>();
  const admin = user?.role === 'admin';
  const waiting = data?.filter((row) => row.state === 'waiting' &&
    !(unavailable?.id === row.id && unavailable.version === row.version)) ?? [];
  const active = data?.filter((row) => row.state === 'claimed' || row.state === 'in_progress') ?? [];
  const completed = data?.filter((row) => row.state === 'completed') ?? [];

  async function update(row: MakeupAssignment, action: Action) {
    setWorking(row.id);
    try {
      await pb.send(`${workflowApi}/makeup/${row.id}/${action}`, {
        method: 'POST',
        body: {
          version: row.version == null ? undefined : String(row.version),
          ...(action === 'release' ? { artistId: row.artistId } : {}),
          ...(admin && (action === 'start' || action === 'complete') ? { onBehalf: true, artistId: row.artistId } : {}),
        },
      });
      if (action === 'complete') toast.success('Makeup or grooming completed. The student is in the photographer queue.');
    } catch (error) {
      if (error instanceof ClientResponseError && error.status === 409 && error.response.data?.reason?.code === 'already_assigned') {
        setUnavailable({ id: row.id, version: row.version });
        setConflict(true);
      } else {
        toast.error(workflowError(error));
      }
    } finally {
      refresh();
      setWorking(undefined);
    }
  }

  function section(title: string, rows: MakeupAssignment[], empty: string) {
    return (
      <section className="space-y-3">
        <h2 className="text-lg font-black uppercase">{title} <span className="text-sm font-mono text-[#765b12]">({rows.length})</span></h2>
        {rows.length === 0 && <p className="text-sm text-neutral-600">{empty}</p>}
        <div className={stationGrid}>
          {rows.map((row) => (
            <article key={row.id} className={`${stationCard} space-y-3`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono px-2 py-1 bg-[#0A0A0A] text-[#C9A227] text-sm font-black">{formatQueueNumber(row.queueNumber)}</span>
                <span className="text-xs font-black uppercase">{stateLabel[row.state]}</span>
              </div>
              <StationStudentDetails student={row} />
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
              {row.artistName && admin && <p className="text-xs font-bold">MUA {row.artistName}</p>}
              {row.completedAt && <p className="text-xs">{new Date(row.completedAt.replace(' ', 'T')).toLocaleString()}</p>}
              {row.state !== 'waiting' && row.state !== 'completed' && !row.eligible &&
                <p className="text-xs font-bold text-red-700">Registration or payment is no longer eligible.</p>}
              {!admin && row.state === 'waiting' && (
                <button type="button" className={stationButton} disabled={!!working} onClick={() => void update(row, 'claim')}>Select student</button>
              )}
              {!admin && (row.state === 'claimed' || row.state === 'in_progress') && (
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
                  <button type="button" className={stationButton} disabled={!!working} onClick={() => setRelease(row)}>Release assignment</button>
                </div>
              )}
            </article>
          ))}
        </div>
      </section>
    );
  }

  return (
    <StationLayout title="Makeup / Grooming Queue" refresh={refresh} embedded={embedded}>
      {error && <p role="alert" className="text-sm font-bold text-red-700">{error}</p>}
      {!data && !error && <p role="status">Syncing makeup queue…</p>}
      {data && <>
        {section(admin ? 'Active assignments' : 'Your assignments', active, 'No active assignments.')}
        {section('Waiting queue', waiting, 'No students are waiting for makeup or grooming.')}
        {admin && section('Completed services', completed, 'No completed services.')}
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
        message={`Release ${release?.name ?? 'this student'} so an available makeup artist can claim them?`}
        confirmText="Release assignment"
        onConfirm={() => { if (release) void update(release, 'release'); }}
        onClose={() => setRelease(undefined)}
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
