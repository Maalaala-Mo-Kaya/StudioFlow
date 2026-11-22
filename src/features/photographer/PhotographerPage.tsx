import React, { useEffect, useRef, useState } from 'react';
import { Aperture, Camera, CheckCircle2, Maximize2, Volume2 } from 'lucide-react';
import { Modal } from '../../components/common/Modal';
import { formatClientName, formatJobOrderNo, formatQueueNumber } from '../../utils/formatters';
import { usePhotographerQueue } from './usePhotographerQueue';
import { PhotographerQueueCard } from './components/PhotographerQueueCard';
import { PhotographerHistoryList } from './components/PhotographerHistoryList';
import { CameraImportPanel } from './components/CameraImportPanel';
import { useCameraLink } from './useCameraLink';
import type { PhotographyTask, Registration } from '../../types';
import { playStudioChime } from '../../utils/audio';
import { StationLayout } from '../workflow/StationLayout';
import { StationClientQueue } from '../workflow/StationClientQueue';
import { StationTabs } from '../workflow/StationTabs';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { workflowError } from '../../hooks/useWorkflowData';
import { activePhotographyTasks, photographyAction, photographyStatus } from './photographyTasks';
import { PhotographyProgress } from './components/PhotographyProgress';

function SessionActions({ registration, station, photographerId, busy, onStart, onFinish }: {
  registration: Registration;
  station: ReturnType<typeof useCameraLink>['camera'];
  photographerId?: string;
  busy: boolean;
  onStart: (reg: Registration, task: PhotographyTask) => void;
  onFinish: (reg: Registration, task: PhotographyTask) => void;
}) {
  return <PhotographyProgress registration={registration} action={(task) => {
    if (!photographerId || task.status === 'completed' || (task.photographerId && task.photographerId !== photographerId)) return null;
    const linkedHere = registration.id === station?.client?.id && station.taskId === task.id && station.photographerId === photographerId;
    return <button type="button" disabled={busy || !!task.finishingAt || (!linkedHere && !!station?.client)}
      className="btn-tactile mt-1 min-h-10 border border-line bg-gold px-3 font-bold text-on-gold disabled:opacity-50"
      onClick={() => linkedHere ? onFinish(registration, task) : onStart(registration, task)}>
      {task.finishingAt ? 'Syncing photos…' : linkedHere ? 'Mark Done' : `Call Client · ${task.name}`}
    </button>;
  }} />;
}

export const PhotographerPage: React.FC = () => {
  const {
    queue,
    photographyRecords,
    recentlyDone,
    loading,
    loadError,
    activeTab,
    setActiveTab,
    fetchLiveQueue,
    handleCallStudent,
    handleMarkDone,
  } = usePhotographerQueue();
  const user = useAuth().user;
  const userId = user?.id;
  const photographerId = user?.role === 'photographer' ? user.id : undefined;
  const { toast } = useToast();
  const camera = useCameraLink();
  const [selectedWithoutCamera, setSelectedWithoutCamera] = useState('');
  const [queueBusy, setQueueBusy] = useState(false);
  const queueActionPending = useRef(false);
  const station = camera.camera;
  const linkedId = !station?.taskId || station.photographerId === userId ? station?.client?.id : undefined;
  const selectedId = station?.enabled ? linkedId : selectedWithoutCamera;
  const selected = queue.find((reg) => reg.id === selectedId);
  const selectedTask = selected && activePhotographyTasks(selected).find((task) => task.id === station?.taskId && task.photographerId === userId);
  const unselected = queue.filter((reg) => reg.id !== selectedId);
  const busy = queueBusy || camera.busy;
  // The on-set client's full card opens in a popup when they are called. Closing it only hides the card:
  // the client stays selected (and the camera linked) until Mark Done.
  const [onSetOpenId, setOnSetOpenId] = useState('');
  const onSetOpen = !!selected && onSetOpenId === selected.id;
  const finishing = useRef(new Map<string, string>());
  useEffect(() => {
    for (const [registration, taskId] of finishing.current) {
      const reg = photographyRecords.find((record) => record.id === registration);
      const task = reg && activePhotographyTasks(reg).find((entry) => entry.id === taskId);
      if (!reg || task?.status !== 'completed') continue;
      finishing.current.delete(registration);
      toast.success(photographyStatus(reg) === 'Photography Officially Done'
        ? 'Photography Officially Done. The client is ready for Photo Chooser.'
        : 'Your session is complete. The client is waiting for the remaining sessions.');
    }
  }, [photographyRecords, toast]);

  const runQueueAction = async (action: () => Promise<void>) => {
    if (queueActionPending.current || camera.busy) return;
    queueActionPending.current = true;
    setQueueBusy(true);
    try {
      await action();
    } finally {
      queueActionPending.current = false;
      setQueueBusy(false);
    }
  };

  const selectClient = (reg: Registration) => runQueueAction(async () => {
    if (reg.status !== 'shooting' && !await handleCallStudent(reg)) return;
    if (station?.enabled) {
      await camera.linkClient(reg.id);
    } else {
      setSelectedWithoutCamera(reg.id);
    }
    setOnSetOpenId(reg.id);
  });

  const markDone = (reg: Registration) => runQueueAction(async () => {
    if (linkedId === reg.id && !await camera.unlinkClient(reg.id)) return;
    if (await handleMarkDone(reg)) {
      setSelectedWithoutCamera((id) => id === reg.id ? '' : id);
      setOnSetOpenId((id) => id === reg.id ? '' : id);
    }
  });

  const startTask = (reg: Registration, task: PhotographyTask) => runQueueAction(async () => {
    if (!station?.enabled) {
      toast.error('Choose an enabled camera under Camera Auto-Import.');
      return;
    }
    try {
      await photographyAction(reg.id, 'start', { taskId: task.id, cameraId: station.id });
      setOnSetOpenId(reg.id);
      playStudioChime();
      await camera.sync();
    } catch (error) {
      toast.error(workflowError(error));
    } finally {
      void fetchLiveQueue();
    }
  });

  const finishTask = (reg: Registration, task: PhotographyTask) => runQueueAction(async () => {
    try {
      const result = await photographyAction(reg.id, 'done', { taskId: task.id });
      if (result.syncing) {
        finishing.current.set(reg.id, task.id);
        toast.success('Finishing your session. The camera stays linked while photos sync.');
        await camera.sync();
      }
    } catch (error) {
      toast.error(workflowError(error));
    } finally {
      void fetchLiveQueue();
    }
  });

  return (
    <StationLayout title={<>Photographer <span className="text-gold">Session Queue</span></>}
      badge="Photo Floor" liveLabel="Live Queue" description="Manage clients waiting for photography." refresh={fetchLiveQueue}
      actions={<button type="button" onClick={playStudioChime}
        className="btn-tactile flex min-h-11 items-center gap-2 border border-line bg-obsidian-2 px-4 text-xs font-black uppercase tracking-wide text-gold hover:border-gold focus-visible:outline-2">
        <Volume2 className="size-4" aria-hidden="true" /> Chime
      </button>}>
      <StationTabs label="Photography queue views" active={activeTab} onChange={setActiveTab} tabs={[
        { id: 'queue', label: 'Waiting Queue', count: queue.length },
        { id: 'history', label: 'Completed Today', count: recentlyDone.length },
      ]}>
        {loadError && <p role="alert" className="text-sm font-bold text-red-700">{loadError}</p>}
        {activeTab === 'queue' && <CameraImportPanel link={camera} disabled={busy} />}

        {activeTab === 'queue' && (
          <div className="animate-enter-delay-1">
            {loading ? (
              <div className="bg-panel border-2 border-line p-16 text-center font-mono text-neutral-500 text-xs uppercase tracking-widest">
                Syncing live studio queue...
              </div>
            ) : (!loadError || queue.length > 0) && (
              <StationClientQueue
                placeholderIcon={<Camera className="size-7 text-gold" aria-hidden="true" />}
                empty={selected ? 'No other clients in the queue.' : 'The studio floor queue is clear.'}
                selected={selected && (
                  <div className="border-2 border-gold bg-obsidian p-4 space-y-3 shadow-lux-gold">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-mono text-[10px] font-black uppercase tracking-widest text-gold">On set · {formatQueueNumber(selected.queue_number)}</p>
                        <p className="mt-0.5 text-lg font-black uppercase leading-snug text-white wrap-break-word">{formatClientName(selected)}</p>
                        <p className="font-mono text-[11px] text-neutral-400">{formatJobOrderNo(selected.job_order_no)}</p>
                        {selectedTask && <p className="mt-1 text-xs font-bold text-gold">{selectedTask.name}</p>}
                      </div>
                      {station?.enabled && (
                        <span className="inline-flex shrink-0 items-center gap-1 border border-emerald-700 px-1.5 py-0.5 font-mono text-[9px] font-black uppercase text-emerald-400">
                          <Aperture className="size-3" aria-hidden="true" /> {station.name}
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2.5">
                      <button type="button" onClick={() => setOnSetOpenId(selected.id)}
                        className="btn-tactile flex min-h-[46px] cursor-pointer items-center justify-center gap-1.5 border border-line bg-obsidian-2 text-xs font-black uppercase tracking-wider text-white hover:border-gold">
                        <Maximize2 className="size-4 text-gold" aria-hidden="true" /> Open
                      </button>
                      <button type="button" disabled={busy || !!selectedTask?.finishingAt || (!!activePhotographyTasks(selected).length && !selectedTask)}
                        onClick={() => selectedTask ? finishTask(selected, selectedTask) : markDone(selected)}
                        className="btn-tactile flex min-h-[46px] cursor-pointer items-center justify-center gap-1.5 border border-line bg-gold text-xs font-black uppercase tracking-wider text-on-gold disabled:cursor-default disabled:opacity-50">
                        <CheckCircle2 className="size-4 stroke-[2.5]" aria-hidden="true" /> {selectedTask?.finishingAt ? 'Syncing photos…' : 'Mark Done'}
                      </button>
                    </div>
                  </div>
                )}
                unselected={unselected.map((reg, index) => <PhotographerQueueCard
                  key={reg.id}
                  registration={reg}
                  nextUp={index === 0}
                  busy={busy}
                  onSelect={selectClient}
                  onMarkDone={markDone}
                  sessionActions={activePhotographyTasks(reg).length > 0 ? <SessionActions registration={reg} station={station}
                    photographerId={photographerId} busy={busy} onStart={startTask} onFinish={finishTask} /> : undefined}
                />)}
              />
            )}
          </div>
        )}

        {onSetOpen && selected && (
          <Modal title={formatClientName(selected)} icon={Camera} size="md" onClose={() => setOnSetOpenId('')}
            subtitle={<>On set · {formatJobOrderNo(selected.job_order_no)} · {formatQueueNumber(selected.queue_number)}</>}>
            <PhotographerQueueCard
              key={selected.id}
              registration={selected}
              selected
              busy={busy}
              onMarkDone={markDone}
              sessionActions={activePhotographyTasks(selected).length > 0 ? <SessionActions registration={selected} station={station}
                photographerId={photographerId} busy={busy} onStart={startTask} onFinish={finishTask} /> : undefined}
              cameraName={station?.enabled ? station.name : ''}
            />
          </Modal>
        )}

        {/* COMPLETED SHOOTS HISTORY */}
        {activeTab === 'history' && (loading && !recentlyDone.length
          ? <p role="status" className="text-sm text-neutral-600">Loading completed sessions…</p>
          : (recentlyDone.length > 0 || !loadError) && <PhotographerHistoryList recentlyDone={recentlyDone} />)}
      </StationTabs>
    </StationLayout>
  );
};
