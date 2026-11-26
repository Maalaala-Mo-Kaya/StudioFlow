import React, { useEffect, useRef, useState } from 'react';
import { Aperture, Camera, CheckCircle2, ChevronDown, ChevronUp, FolderInput, Maximize2, Undo2, Users, Volume2 } from 'lucide-react';
import { Modal } from '../../components/common/Modal';
import { formatClientName, formatJobOrderNo, formatQueueNumber } from '../../utils/formatters';
import { usePhotographerQueue } from './usePhotographerQueue';
import { BoughtDetails, CopyPathButton, FloorVisits, PhotographerQueueCard } from './components/PhotographerQueueCard';
import { PhotographerHistoryList } from './components/PhotographerHistoryList';
import { CameraImportPanel } from './components/CameraImportPanel';
import { ShootGallery } from './components/ShootGallery';
import { ReshootModal } from './components/ReshootModal';
import { useCameraLink } from './useCameraLink';
import type { CameraStatus } from '../camera/cameraApi';
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
  // Clients this device's camera already shot go after the rest (they wait for another camera), so
  // each station sees first who it still has to shoot.
  const shotHere = (reg: Registration) => !!station && (reg.floor_visits ?? []).some((visit) => visit.camera === station.id);
  const waiting = queue.filter((reg) => reg.id !== selectedId);
  const unselected = [...waiting.filter((reg) => !shotHere(reg)), ...waiting.filter(shotHere)];
  const busy = queueBusy || camera.busy;
  // The on-set client's full card opens in a popup when they are called. Closing it only hides the card:
  // the client stays selected (and the camera linked) until Mark Done.
  const [onSetOpenId, setOnSetOpenId] = useState('');
  const onSetOpen = !!selected && onSetOpenId === selected.id;
  const sendingHere = !!station?.enabled && !!selected && station.client?.id === selected.id;
  const [boughtOpen, setBoughtOpen] = useState(false);
  const [reshooting, setReshooting] = useState<{ registration: Registration; task?: PhotographyTask; paid?: boolean }>();
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

  // Single-session clients: several photographers may shoot the same client at once, each on their
  // own camera. Mark Done while another camera is still linked to the client asks first: leave the
  // client on the floor for the others, or finish them (the server then files the other cameras'
  // last shots and unlinks them).
  const [doneCheck, setDoneCheck] = useState<{ registration: Registration; others: CameraStatus[]; lastCamera: boolean }>();
  const finishClient = (reg: Registration) => runQueueAction(async () => {
    if (linkedId === reg.id && !await camera.unlinkClient(reg.id)) return;
    if (await handleMarkDone(reg)) {
      setSelectedWithoutCamera((id) => id === reg.id ? '' : id);
      setOnSetOpenId((id) => id === reg.id ? '' : id);
    }
  });
  // With more than one camera turned on, Mark Done also asks when no other camera is linked yet: a
  // client often goes from one camera (solo) to the next (group), so finishing must be a choice.
  const markDone = (reg: Registration) => {
    const others = camera.stations.filter((entry) => entry.client?.id === reg.id && !entry.taskId && entry.id !== station?.id);
    const otherCameras = camera.stations.filter((entry) => entry.enabled && entry.id !== station?.id);
    // Every other camera already shot this client: this is most likely the last stop.
    const visits = reg.floor_visits ?? [];
    const lastCamera = otherCameras.every((entry) => visits.some((visit) => visit.camera === entry.id));
    if (others.length || otherCameras.length) setDoneCheck({ registration: reg, others, lastCamera });
    else void finishClient(reg);
  };
  const leaveForOthers = (reg: Registration, others: CameraStatus[]) => runQueueAction(async () => {
    if (linkedId === reg.id && !await camera.unlinkClient(reg.id)) return;
    setSelectedWithoutCamera((id) => id === reg.id ? '' : id);
    setOnSetOpenId((id) => id === reg.id ? '' : id);
    const who = others.map((entry) => entry.photographerName || entry.name).join(', ');
    toast.success(`Your camera is free. ${formatClientName(reg)} stays on the Photo Floor for ${who || 'the next camera'}.`);
  });

  // Back to the queue at their place (the queue is ordered by queue number). Their shots stay in
  // their folder; Select on their card links the camera to them again.
  const returnToQueue = (reg: Registration) => runQueueAction(async () => {
    if (linkedId === reg.id && !await camera.unlinkClient(reg.id)) return;
    setSelectedWithoutCamera((id) => id === reg.id ? '' : id);
    setOnSetOpenId((id) => id === reg.id ? '' : id);
    toast.success(`${formatClientName(reg)} is back in the queue.`);
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
                narrow
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
                    {station?.enabled && station.client?.id === selected.id && (
                      <div role="status" className="border border-emerald-700 bg-obsidian-2 px-3 py-2 font-mono text-[11px] text-emerald-400 min-w-0">
                        <p className="m-0 flex items-center gap-2 font-black uppercase tracking-wider">
                          <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-emerald-400 motion-safe:animate-status-pulse" />
                          Sending shots to this client
                          {station.client.photoCount !== null && <span className="ml-auto text-white">{station.client.photoCount} in folder</span>}
                        </p>
                        {station.client.folder && (
                          <p className="m-0 mt-1 flex items-center gap-1.5 text-neutral-400 min-w-0">
                            <FolderInput className="size-3 shrink-0 text-emerald-400" aria-hidden="true" />
                            <span className="truncate" title={station.client.folder}>{station.client.folder}</span>
                          </p>
                        )}
                      </div>
                    )}
                    <FloorVisits registration={selected} dark />
                    <div className="border border-neutral-800 bg-obsidian-2 px-3 py-2">
                      <button type="button" aria-expanded={boughtOpen} onClick={() => setBoughtOpen((open) => !open)}
                        className="flex w-full items-center justify-between gap-2 font-mono text-[11px] font-black uppercase tracking-wider text-gold cursor-pointer">
                        <span className="min-w-0 truncate">
                          {boughtOpen ? 'Hide' : 'Show'} what was bought
                          <span className="ml-2 text-neutral-400">{selected.expand?.package?.name || 'Pictorial package'}</span>
                        </span>
                        {boughtOpen ? <ChevronUp className="size-4 shrink-0" aria-hidden="true" /> : <ChevronDown className="size-4 shrink-0" aria-hidden="true" />}
                      </button>
                      {boughtOpen && <BoughtDetails registration={selected} dark />}
                    </div>
                    <div className={`grid gap-2.5 ${selectedTask ? 'grid-cols-2' : 'grid-cols-3'}`}>
                      <button type="button" onClick={() => setOnSetOpenId(selected.id)}
                        className="btn-tactile flex min-h-[46px] cursor-pointer items-center justify-center gap-1.5 border border-line bg-obsidian-2 text-xs font-black uppercase tracking-wider text-white hover:border-gold">
                        <Maximize2 className="size-4 text-gold" aria-hidden="true" /> Open
                      </button>
                      {!selectedTask && (
                        <button type="button" disabled={busy} onClick={() => returnToQueue(selected)}
                          title="Stop sending shots to this client and put them back in the queue at their place"
                          className="btn-tactile flex min-h-[46px] cursor-pointer items-center justify-center gap-1.5 border border-line bg-obsidian-2 text-xs font-black uppercase tracking-wider text-white hover:border-gold disabled:cursor-default disabled:opacity-50">
                          <Undo2 className="size-4 text-gold" aria-hidden="true" /> Return to Queue
                        </button>
                      )}
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
                  nextUp={index === 0 && !shotHere(reg)}
                  shotHere={shotHere(reg)}
                  compact
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
          // The on-set popup is for the shots: a slim toolbar, then the gallery across the full width.
          // What the client bought is on the Selected card (Show what was bought).
          <Modal title={formatClientName(selected)} icon={Camera} size="full"
            onClose={() => setOnSetOpenId('')}
            subtitle={<>On set · {formatJobOrderNo(selected.job_order_no)} · {formatQueueNumber(selected.queue_number)}</>}>
            <div className="flex flex-wrap items-center gap-2">
              {sendingHere ? (
                <span role="status" className="inline-flex min-h-10 items-center gap-2 border border-emerald-700 bg-obsidian-2 px-3 font-mono text-[11px] font-black uppercase tracking-wider text-emerald-400">
                  <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-emerald-400 motion-safe:animate-status-pulse" />
                  {station?.name} → sending shots here
                </span>
              ) : (
                <span className="text-[11px] text-neutral-600">No camera is sending to this client. Shot on a memory card? Use Add photos from card below.</span>
              )}
              <CopyPathButton registrationId={selected.id} className="min-h-10 px-3 text-[10px]" />
              {!activePhotographyTasks(selected).length && (
                <button type="button" disabled={busy} onClick={() => markDone(selected)}
                  className="btn-tactile ml-auto inline-flex min-h-10 cursor-pointer items-center gap-1.5 border border-line bg-gold px-4 text-xs font-black uppercase tracking-wider text-on-gold disabled:cursor-default disabled:opacity-50">
                  <CheckCircle2 className="size-4 stroke-[2.5]" aria-hidden="true" /> Mark Done
                </button>
              )}
            </div>
            {activePhotographyTasks(selected).length > 0 && (
              <div className="mt-3">
                <SessionActions registration={selected} station={station} photographerId={photographerId} busy={busy}
                  onStart={startTask} onFinish={finishTask} />
              </div>
            )}
            <ShootGallery registrationId={selected.id} />
          </Modal>
        )}

        {/* COMPLETED SHOOTS HISTORY */}
        {activeTab === 'history' && (loading && !recentlyDone.length
          ? <p role="status" className="text-sm text-neutral-600">Loading completed sessions…</p>
          : (recentlyDone.length > 0 || !loadError) && <PhotographerHistoryList recentlyDone={recentlyDone} busy={busy}
            admin={user?.role === 'admin'}
            onReshoot={(registration, task) => setReshooting({ registration, task })}
            onPaidRetake={(registration) => setReshooting({ registration, paid: true })} />)}

        {doneCheck && (
          <Modal title={doneCheck.others.length ? 'Others are still shooting' : 'Next camera or finish?'}
            subtitle={formatClientName(doneCheck.registration)} icon={Users} size="md"
            busy={busy} onClose={() => setDoneCheck(undefined)}
            footer={<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" disabled={busy} onClick={() => { const { registration } = doneCheck; setDoneCheck(undefined); void finishClient(registration); }}
                className={`btn-tactile min-h-[46px] px-4 text-xs font-black uppercase tracking-wider disabled:opacity-50 ${!doneCheck.others.length && doneCheck.lastCamera
                  ? 'bg-gold text-on-gold' : 'border border-line text-ink'}`}>
                {doneCheck.others.length ? 'Finish anyway' : 'Finish → Photo Chooser'}
              </button>
              <button type="button" disabled={busy} onClick={() => { const { registration, others } = doneCheck; setDoneCheck(undefined); void leaveForOthers(registration, others); }}
                className={`btn-tactile min-h-[46px] px-5 text-xs font-black uppercase tracking-wider disabled:opacity-50 ${doneCheck.others.length || !doneCheck.lastCamera
                  ? 'bg-gold text-on-gold' : 'border border-gold text-gold'}`}>
                {doneCheck.others.length ? 'Leave them on the floor' : 'Send to next camera'}
              </button>
            </div>}>
            {doneCheck.others.length ? (
              <div className="space-y-3 text-sm text-ink">
                <p className="m-0">Another camera is still linked to this client:</p>
                <ul className="m-0 space-y-1 pl-4 list-disc">
                  {doneCheck.others.map((entry) => (
                    <li key={entry.id}><strong>{entry.name}</strong>{entry.photographerName && <> · {entry.photographerName}</>}</li>
                  ))}
                </ul>
                <p className="m-0"><strong>Leave them on the floor:</strong> your camera is freed and the client stays on the Photo Floor, so the others keep shooting. Whoever finishes last presses Mark Done.</p>
                <p className="m-0 text-neutral-600"><strong>Finish anyway:</strong> the client goes to the Photo Chooser now. The other cameras send their last shots to this client and are unlinked.</p>
              </div>
            ) : (
              <div className="space-y-3 text-sm text-ink">
                <p className="m-0">Is <strong>{formatClientName(doneCheck.registration)}</strong> going to another camera next (for example a group picture)?</p>
                {(doneCheck.registration.floor_visits ?? []).length > 0 && (
                  <div className="space-y-1">
                    <p className="m-0 text-xs font-bold text-neutral-600">Already shot at:</p>
                    <FloorVisits registration={doneCheck.registration} />
                  </div>
                )}
                {doneCheck.lastCamera && (
                  <p className="m-0 text-xs font-bold text-emerald-700">Every other camera has already shot this client, so this is probably the last stop.</p>
                )}
                <p className="m-0"><strong>Send to next camera:</strong> your camera is freed and the client stays on the Photo Floor. The next photographer calls them and presses Mark Done when they finish.</p>
                <p className="m-0 text-neutral-600"><strong>Finish → Photo Chooser:</strong> this was the last camera. The client goes to the Photo Chooser.</p>
              </div>
            )}
          </Modal>
        )}

        {reshooting && (
          <ReshootModal registration={reshooting.registration} task={reshooting.task} paid={reshooting.paid}
            onClose={() => setReshooting(undefined)} onDone={(reg, task) => {
              const paid = reshooting.paid;
              setReshooting(undefined);
              setActiveTab('queue');
              void fetchLiveQueue();
              if (paid) {
                toast.success(`Paid retake started: ${formatClientName(reg)} is back with the photographers. Add the retake fee in Admin → Students → Edit.`);
              } else if (!task) {
                toast.success(`${formatClientName(reg)} is back on set.`);
                // Link this device's camera and open the shots, as Select does.
                void selectClient(reg);
              } else if (task.photographerId === photographerId) {
                toast.success(`${task.name} is open again for ${formatClientName(reg)}.`);
                // Start the reopened session on this device's camera, as Call Client does.
                void startTask(reg, task);
              } else {
                toast.success(`${task.name} is back in ${task.photographerName || 'the photographer'}'s queue for ${formatClientName(reg)}.`);
              }
            }} />
        )}
      </StationTabs>
    </StationLayout>
  );
};
