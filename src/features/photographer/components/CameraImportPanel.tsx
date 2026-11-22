import React, { useState } from 'react';
import { Aperture, FolderInput, AlertTriangle, Unlink, Send, Settings2 } from 'lucide-react';
import { CameraSettings } from '../../camera/CameraSettings';
import { formatJobOrderNo } from '../../../utils/formatters';
import { sinceLabel } from '../../camera/cameraApi';
import type { useCameraLink } from '../useCameraLink';

type CameraLink = ReturnType<typeof useCameraLink>;

export const CameraImportPanel: React.FC<{ link: CameraLink; disabled: boolean }> = ({ link, disabled }) => {
  const { stations, selectedId, select, camera, error } = link;
  const client = camera?.client;
  const [showSettings, setShowSettings] = useState(false);

  return (
    <section aria-label="Camera import" className="animate-enter-delay-1 bg-panel border-2 border-line shadow-lux p-4 sm:p-5 mb-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 bg-obsidian text-gold flex items-center justify-center shrink-0">
            <Aperture className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-xs sm:text-sm font-black uppercase tracking-wider text-ink m-0">Camera Auto-Import</h2>
            <p className="text-[11px] text-neutral-500">
              New shots move from the camera folder into the linked client's folder.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 min-w-0">
        {stations.length > 0 ? (
          <label className="flex items-center gap-2 min-w-0 w-full sm:w-auto text-[11px] font-black uppercase tracking-wider text-ink">
            <span className="shrink-0">This device:</span>
            <select
              disabled={disabled}
              value={selectedId}
              onChange={(event) => select(event.target.value)}
              className="min-w-0 flex-1 sm:flex-none sm:max-w-[260px] min-h-[40px] px-3 py-1.5 border border-neutral-400 bg-panel text-xs font-bold uppercase"
            >
              <option value="">No camera</option>
              {stations.map((station) => (
                <option key={station.id} value={station.id}>
                  {station.name}{station.enabled ? '' : ' (off)'}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="text-[11px] text-neutral-500 sm:text-right">
            No camera is set up yet. Press <strong className="text-ink">Set Up</strong> to add one.
          </p>
        )}
        <button
          type="button"
          onClick={() => setShowSettings((value) => !value)}
          aria-expanded={showSettings}
          className="btn-tactile min-h-[40px] inline-flex items-center gap-1.5 px-3 py-1.5 bg-obsidian text-gold text-[10px] font-black uppercase tracking-wider cursor-pointer"
        >
          <Settings2 className="w-3.5 h-3.5" /> {showSettings ? 'Close Setup' : 'Set Up'}
        </button>
        </div>
      </div>

      {showSettings && (
        <div className="mt-4 pt-4 border-t border-neutral-500/20">
          <CameraSettings />
        </div>
      )}

      {camera && (
        <div className="mt-4 pt-4 border-t border-neutral-500/20 space-y-3">
          <div className="flex items-center gap-2 font-mono text-[11px] text-neutral-500 min-w-0">
            <FolderInput className="w-3.5 h-3.5 text-gold shrink-0" />
            <span className="truncate" title={camera.watchFolder}>{camera.watchFolder}</span>
          </div>

          {!camera.enabled && (
            <Notice>This camera is turned off. Turn it on under Set Up.</Notice>
          )}
          {camera.enabled && !camera.folderOk && (
            <Notice tone="red">The camera folder can't be found on the server PC. Check that the drive or share is connected.</Notice>
          )}

          {client ? (
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-obsidian text-white border border-gold p-3.5">
              <div className="min-w-0">
                <div className="font-mono text-[10px] font-black uppercase tracking-widest text-gold">
                  <span className="inline-block w-1.5 h-1.5 bg-emerald-400 animate-status-pulse mr-1.5 align-middle" />
                  Sending photos to
                </div>
                <div className="text-base font-black uppercase tracking-tight truncate">
                  {client.name} <span className="font-mono text-gold-soft text-sm">{formatJobOrderNo(client.jobOrder)}</span>
                </div>
                <div className="font-mono text-[11px] text-neutral-400">
                  {camera.sessionImported} this session
                  {client.photoCount !== null && ` · ${client.photoCount} in client folder`}
                  {' · last photo '}{sinceLabel(camera.lastImport)}
                </div>
              </div>
              {camera.taskId ? (
                <p role="status" className="text-xs font-bold text-gold">{camera.finishing ? 'Waiting for photos to finish syncing' : 'Linked to a photography session'}</p>
              ) : <button
                type="button"
                disabled={disabled}
                onClick={() => void link.unlinkClient(client.id)}
                className="btn-tactile shrink-0 min-h-[40px] inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-obsidian-2 text-gold border border-gold text-[11px] font-black uppercase tracking-wider cursor-pointer disabled:opacity-50"
              >
                <Unlink className="w-3.5 h-3.5" /> Stop Sending
              </button>}
            </div>
          ) : camera.enabled && (
            <p className="text-xs text-neutral-600">
              No client linked. Press <strong className="text-ink">Call Client</strong> or <strong className="text-ink">Select</strong> on a card to send photos to that client.
            </p>
          )}

          {camera.waiting > 0 && (
            <Notice>
              <span>
                {camera.waiting} photo{camera.waiting === 1 ? ' is' : 's are'} in the camera folder but not assigned to anyone
                {client ? ' (they were there before this client was linked).' : '. Link a client to assign new shots.'}
              </span>
              {client && (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => void link.claimWaiting()}
                  className="btn-tactile mt-2 sm:mt-0 sm:ml-3 shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 bg-gold text-on-gold text-[10px] font-black uppercase tracking-wider cursor-pointer disabled:opacity-50"
                >
                  <Send className="w-3 h-3" /> Send them to {client.name.split(' ')[0]}
                </button>
              )}
            </Notice>
          )}

          {(camera.lastError || error) && <Notice tone="red">{error || camera.lastError}</Notice>}

          <div className="font-mono text-[10px] text-neutral-400 uppercase tracking-wider">
            Folder checked {sinceLabel(camera.lastScan)}
          </div>
        </div>
      )}
    </section>
  );
};

const Notice: React.FC<{ tone?: 'amber' | 'red'; children: React.ReactNode }> = ({ tone = 'amber', children }) => (
  <div
    role={tone === 'red' ? 'alert' : 'status'}
    className={`flex flex-col sm:flex-row sm:items-center gap-2 border p-3 text-xs ${
      tone === 'red' ? 'bg-red-50 border-red-300 text-red-800' : 'bg-amber-50 border-amber-300 text-amber-900'
    }`}
  >
    <AlertTriangle className="w-4 h-4 shrink-0" />
    <div className="flex-1 flex flex-col sm:flex-row sm:items-center">{children}</div>
  </div>
);
