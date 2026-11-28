import React, { useEffect, useState } from 'react';
import { Download, KeyRound, Laptop } from 'lucide-react';
import { Modal } from '../../components/common/Modal';
import { ConfirmModal } from '../../components/common/ConfirmModal';
import { pb } from '../../db/pocketbase';
import { useToast } from '../../context/ToastContext';
import { workflowApi, workflowError } from '../../hooks/useWorkflowData';
import { downloadBlob } from '../../utils/downloadBlob';
import type { CameraStatus } from './cameraApi';

interface SenderKey {
  camera: string;
  name: string;
  key: string;
  watchFolder: string;
}

const label = 'block text-[11px] font-black text-ink uppercase tracking-wider mb-1.5';
const local = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/** The address the laptop should use: this page's server, unless it was opened on the server PC itself. */
function guessServer() {
  try {
    const url = new URL(pb.baseURL, window.location.href);
    return local.has(url.hostname) ? '' : url.origin;
  } catch {
    return '';
  }
}

/** "http://192.168.1.10:8090" (no path); empty when it isn't a usable address. */
function cleanServer(value: string) {
  const trimmed = value.trim().replace(/\/+$/, '');
  if (!/^https?:\/\/[^\s/?#]+$/i.test(trimmed)) return '';
  try {
    const url = new URL(trimmed);
    return local.has(url.hostname) ? '' : url.origin;
  } catch {
    return '';
  }
}

/**
 * Download the Photo Sender set up for one camera (server address, camera and its key inside), so
 * the photographer only runs the installer and types the EOS folder. Admins can reset the key.
 */
export const PhotoSenderModal: React.FC<{ station: CameraStatus; isAdmin: boolean; onClose: () => void }> = ({ station, isAdmin, onClose }) => {
  const { toast } = useToast();
  const [senderKey, setSenderKey] = useState<SenderKey | null>(null);
  const [loadError, setLoadError] = useState('');
  const [server, setServer] = useState(guessServer);
  const [busy, setBusy] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const serverOk = !!cleanServer(server);

  useEffect(() => {
    let live = true;
    pb.send<SenderKey>(`${workflowApi}/camera-sender/${station.id}/key`, { requestKey: null })
      .then((result) => { if (live) setSenderKey(result); })
      .catch((err) => { if (live) setLoadError(workflowError(err)); });
    return () => { live = false; };
  }, [station.id]);

  const download = async () => {
    const address = cleanServer(server);
    if (!senderKey || !address) return;
    setBusy(true);
    try {
      const { buildSenderKit, kitFolderName } = await import('./photoSenderKit');
      const blob = buildSenderKit({ server: address, camera: senderKey.camera, cameraName: senderKey.name, key: senderKey.key });
      downloadBlob(blob, `${kitFolderName(senderKey.name)}.zip`);
      toast.success('Photo Sender downloaded. Extract it on the laptop and run install-photo-sender.bat.');
    } catch (err) {
      toast.error(workflowError(err));
    } finally {
      setBusy(false);
    }
  };

  const resetKey = async () => {
    try {
      const result = await pb.send<SenderKey>(`${workflowApi}/camera-sender/${station.id}/key/reset`, { method: 'POST', body: {}, requestKey: null });
      setSenderKey(result);
      toast.success('New key made. Download the Photo Sender again for each laptop that sends for this camera.');
    } catch (err) {
      toast.error(workflowError(err));
      throw err;
    }
  };

  return (
    <Modal title="Photo Sender" subtitle={station.name} icon={Laptop} size="md" busy={busy} onClose={onClose}>
      <div className="space-y-4 text-xs text-neutral-700">
        <p className="m-0">
          A ready-made Photo Sender for this camera. It sends each shot from the laptop to StudioFlow over the studio
          network, so the camera folder doesn't need Windows sharing.
        </p>

        <div>
          <label htmlFor="sender-server" className={label}>Server address the laptop uses <span className="text-red-600">*</span></label>
          <input id="sender-server" value={server} onChange={(event) => setServer(event.target.value)}
            placeholder="http://192.168.1.10:8090" spellCheck={false}
            className="w-full min-h-[44px] text-xs sm:text-sm px-3.5 py-2 border border-neutral-400 bg-canvas focus:bg-panel font-mono" />
          <p className={`mt-1.5 text-[11px] ${server && !serverOk ? 'text-red-700' : 'text-neutral-500'}`}>
            {server && !serverOk
              ? 'Use the address the laptop opens StudioFlow with, like http://192.168.1.10:8090 (not localhost).'
              : "The address shown in the server window under \"On client devices\". Opening this page on the laptop fills it in."}
          </p>
        </div>

        <ol className="list-decimal pl-4 space-y-1.5 m-0">
          <li>Download, then copy the zip to the photographer's laptop (or download it on the laptop).</li>
          <li>Extract it and double-click <strong>install-photo-sender.bat</strong>. If Windows warns, choose <em>More info → Run anyway</em>.</li>
          <li>Type the folder EOS Utility saves into (Enter for <span className="font-mono">C:\EOS_Out</span>). It checks the connection and starts.</li>
        </ol>

        {!station.enabled && (
          <p className="m-0 border border-amber-300 bg-amber-50 p-2.5 text-amber-900">
            This camera is turned off. The sender keeps the shots on the laptop until it's on.
          </p>
        )}
        {loadError && <p className="m-0 text-red-700">{loadError}</p>}

        <p className="m-0 text-[11px] text-neutral-500">
          The download holds this camera's key: give it only to studio laptops.
          {isAdmin ? ' If a laptop is lost, reset the key.' : ' If a laptop is lost, ask an admin to reset the key.'}
        </p>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-between gap-2 pt-3 border-t border-line">
          {isAdmin ? (
            <button type="button" disabled={busy || !senderKey} onClick={() => setConfirmReset(true)}
              className="btn-tactile min-h-[46px] px-4 inline-flex items-center justify-center gap-2 border border-red-300 text-red-700 text-xs font-black uppercase tracking-wider cursor-pointer disabled:opacity-50">
              <KeyRound className="w-4 h-4" /> Reset key
            </button>
          ) : <span />}
          <button type="button" disabled={busy || !senderKey || !serverOk} onClick={() => void download()}
            className="btn-tactile min-h-[46px] px-5 inline-flex items-center justify-center gap-2 bg-gold text-on-gold text-xs font-black uppercase tracking-wider cursor-pointer disabled:opacity-50">
            <Download className="w-4 h-4" /> {busy ? 'Preparing…' : senderKey ? 'Download' : 'Loading…'}
          </button>
        </div>
      </div>
      <ConfirmModal
        isOpen={confirmReset}
        title="Reset Photo Sender key"
        message={<>Make a new key for <strong>{station.name}</strong>? Laptops with the old download stop sending (their shots wait on the laptop) until they install the new download.</>}
        confirmText="Reset key"
        isDestructive
        onConfirm={resetKey}
        onClose={() => setConfirmReset(false)}
      />
    </Modal>
  );
};
