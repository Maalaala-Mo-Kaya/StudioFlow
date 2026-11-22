import React, { useRef, useState } from 'react';
import { Camera, Volume2 } from 'lucide-react';
import { usePhotographerQueue } from './usePhotographerQueue';
import { PhotographerQueueCard } from './components/PhotographerQueueCard';
import { PhotographerHistoryList } from './components/PhotographerHistoryList';
import { CameraImportPanel } from './components/CameraImportPanel';
import { useCameraLink } from './useCameraLink';
import type { Registration } from '../../types';
import { playStudioChime } from '../../utils/audio';
import { StationLayout } from '../workflow/StationLayout';
import { StationClientQueue } from '../workflow/StationClientQueue';
import { StationTabs } from '../workflow/StationTabs';

export const PhotographerPage: React.FC = () => {
  const {
    queue,
    recentlyDone,
    loading,
    loadError,
    activeTab,
    setActiveTab,
    fetchLiveQueue,
    handleCallStudent,
    handleMarkDone,
  } = usePhotographerQueue();
  const camera = useCameraLink();
  const [selectedWithoutCamera, setSelectedWithoutCamera] = useState('');
  const [queueBusy, setQueueBusy] = useState(false);
  const queueActionPending = useRef(false);
  const station = camera.camera;
  const linkedId = station?.client?.id;
  const selectedId = station?.enabled ? linkedId : selectedWithoutCamera;
  const selected = queue.find((reg) => reg.id === selectedId);
  const unselected = queue.filter((reg) => reg.id !== selectedId);
  const busy = queueBusy || camera.busy;

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
  });

  const markDone = (reg: Registration) => runQueueAction(async () => {
    if (linkedId === reg.id && !await camera.unlinkClient(reg.id)) return;
    if (await handleMarkDone(reg)) {
      setSelectedWithoutCamera((id) => id === reg.id ? '' : id);
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
                selected={selected && <PhotographerQueueCard
                  key={selected.id}
                  registration={selected}
                  selected
                  busy={busy}
                  onMarkDone={markDone}
                  cameraName={station?.enabled ? station.name : ''}
                />}
                unselected={unselected.map((reg, index) => <PhotographerQueueCard
                  key={reg.id}
                  registration={reg}
                  nextUp={index === 0}
                  busy={busy}
                  onSelect={selectClient}
                  onMarkDone={markDone}
                />)}
              />
            )}
          </div>
        )}

        {/* COMPLETED SHOOTS HISTORY */}
        {activeTab === 'history' && (loading && !recentlyDone.length
          ? <p role="status" className="text-sm text-neutral-600">Loading completed sessions…</p>
          : (recentlyDone.length > 0 || !loadError) && <PhotographerHistoryList recentlyDone={recentlyDone} />)}
      </StationTabs>
    </StationLayout>
  );
};
