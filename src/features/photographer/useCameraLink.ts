import { useCallback, useEffect, useRef, useState } from 'react';
import { useWorkflowData, workflowError } from '../../hooks/useWorkflowData';
import { useToast } from '../../context/ToastContext';
import { cameraAction, setCameraShotType, type CameraStatus } from '../camera/cameraApi';
import { flushAutoSend, noteLinkStart } from '../camera/autoSend/registry';
import { currentShotType, noteShotType } from '../camera/shotTypes';

const storageKey = 'studioflow-camera-station';
const scanInterval = 4_000;

function savedStation() {
  try { return localStorage.getItem(storageKey) || ''; } catch { return ''; }
}

/**
 * The camera this photographer device controls. While the Photo Floor is open
 * the station is scanned every few seconds, so new shots reach the linked
 * client's folder almost immediately (the server also scans once a minute).
 */
export function useCameraLink() {
  const { toast } = useToast();
  const stationList = useWorkflowData<CameraStatus[]>('/camera');
  const { data: stations, refresh } = stationList;
  const [selectedId, setSelectedId] = useState(savedStation);
  const [live, setLive] = useState<CameraStatus | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const actionPending = useRef(false);
  const actionVersion = useRef(0);

  const listed = stations?.find((station) => station.id === selectedId) ?? null;
  const camera = live?.id === selectedId ? live : listed;

  const select = useCallback((id: string) => {
    if (actionPending.current) return;
    setSelectedId(id);
    setLive(null);
    setError('');
    try {
      if (id) localStorage.setItem(storageKey, id);
      else localStorage.removeItem(storageKey);
    } catch { /* per-device convenience only */ }
  }, []);

  const enabled = !!listed?.enabled;
  useEffect(() => {
    if (!selectedId || !enabled) return;
    let active = true;
    let scanning = false;
    const tick = async () => {
      if (actionPending.current || scanning) return;
      scanning = true;
      const version = actionVersion.current;
      try {
        const status = await cameraAction(selectedId, 'scan');
        if (active && version === actionVersion.current) { setLive(status); setError(''); }
      } catch (err) {
        if (active && version === actionVersion.current) setError(workflowError(err));
      } finally {
        scanning = false;
      }
    };
    void tick();
    const timer = window.setInterval(tick, scanInterval);
    return () => { active = false; window.clearInterval(timer); };
  }, [selectedId, enabled]);

  const run = useCallback(async (action: 'start' | 'end' | 'claim-waiting' | 'scan', registration?: string) => {
    if (!selectedId || actionPending.current) return false;
    actionPending.current = true;
    actionVersion.current++;
    setBusy(true);
    try {
      if (action === 'start' || action === 'end') {
        // The last shots still on this laptop go to the client they were taken of, first.
        await flushAutoSend(selectedId);
        if (action === 'start') noteLinkStart(selectedId);
      }
      setLive(await cameraAction(selectedId, action, registration));
      setError('');
      refresh();
      return true;
    } catch (err) {
      toast.error('Camera import: ' + workflowError(err));
      return false;
    } finally {
      actionPending.current = false;
      setBusy(false);
    }
  }, [selectedId, refresh, toast]);

  // The shot type: the camera's (saved on the server, so the Photo Sender's shots get it too).
  // A change made here is shown at once; the server's value is taken again once it has it.
  const localChange = useRef(0);
  const serverType = camera?.enabled ? camera.shotType ?? '' : null;
  useEffect(() => {
    if (serverType === null || Date.now() - localChange.current < 8_000) return;
    if (serverType !== currentShotType()) noteShotType(serverType);
  }, [serverType]);
  const setShotType = useCallback(async (code: string) => {
    localChange.current = Date.now();
    noteShotType(code);
    if (!selectedId || !enabled) return true;
    try {
      setLive(await setCameraShotType(selectedId, code));
      return true;
    } catch (err) {
      toast.error('Shot type: ' + workflowError(err));
      return false;
    }
  }, [selectedId, enabled, toast]);

  return {
    setShotType,
    stations: stations ?? [],
    stationList,
    selectedId: listed ? selectedId : '',
    select,
    camera: listed ? camera : null,
    error,
    busy,
    linkClient: (registrationId: string) => run('start', registrationId),
    unlinkClient: (registrationId?: string) => run('end', registrationId),
    claimWaiting: () => run('claim-waiting'),
    sync: () => run('scan'),
  };
}
