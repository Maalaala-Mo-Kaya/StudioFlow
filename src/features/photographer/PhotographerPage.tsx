import React from 'react';
import { Camera, Volume2 } from 'lucide-react';
import { usePhotographerQueue } from './usePhotographerQueue';
import { PhotographerQueueCard } from './components/PhotographerQueueCard';
import { PhotographerHistoryList } from './components/PhotographerHistoryList';
import { CameraImportPanel } from './components/CameraImportPanel';
import { useCameraLink } from './useCameraLink';
import type { Registration } from '../../types';
import { playStudioChime } from '../../utils/audio';
import { StationLayout } from '../workflow/StationLayout';
import { StationTabs } from '../workflow/StationTabs';

export const PhotographerPage: React.FC = () => {
  const {
    queue,
    recentlyDone,
    loading,
    loadError,
    activeTab,
    setActiveTab,
    currentlyShootingId,
    fetchLiveQueue,
    handleCallStudent,
    handleMarkDone,
  } = usePhotographerQueue();
  const camera = useCameraLink();
  const linkedId = camera.camera?.client?.id ?? '';

  // Calling a client points this device's camera at them; finishing the shoot
  // sends the last shots and releases the camera for the next client.
  const callStudent = async (reg: Registration) => {
    if (await handleCallStudent(reg) && camera.camera?.enabled) await camera.linkClient(reg.id);
  };
  const markDone = async (reg: Registration) => {
    if (linkedId === reg.id) await camera.unlinkClient(reg.id);
    await handleMarkDone(reg);
  };

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
        {activeTab === 'queue' && <CameraImportPanel link={camera} />}

        {/* QUEUE CARDS GRID */}
        {activeTab === 'queue' && (
          <div className="animate-enter-delay-1">
            {loading ? (
              <div className="bg-panel border-2 border-line p-16 text-center font-mono text-neutral-500 text-xs uppercase tracking-widest">
                Syncing live studio queue...
              </div>
            ) : queue.length === 0 ? !loadError && (
              <div className="bg-panel border-2 border-line p-12 sm:p-20 text-center shadow-lux">
                <div className="w-12 h-12 bg-obsidian text-gold flex items-center justify-center mx-auto mb-4">
                  <Camera className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-black text-ink uppercase tracking-wider">
                  Studio Floor Queue is Clear
                </h3>
                <p className="text-xs sm:text-sm text-neutral-500 max-w-sm mx-auto mt-1">
                  New paid clients will appear here with an audio chime as soon as the cashier
                  confirms their payment.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {queue.map((reg, idx) => (
                  <PhotographerQueueCard
                    key={reg.id}
                    registration={reg}
                    index={idx}
                    isShooting={reg.id === currentlyShootingId || reg.status === 'shooting'}
                    onCallStudent={callStudent}
                    onMarkDone={markDone}
                    cameraName={camera.camera?.enabled ? camera.camera.name : ''}
                    cameraLinked={linkedId === reg.id}
                    onLinkCamera={camera.linkClient}
                  />
                ))}
              </div>
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
