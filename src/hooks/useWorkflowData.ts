import { useCallback, useEffect, useRef, useState } from 'react';
import { kioskPb, pb } from '../db/pocketbase';
import { mountSubscription, useRealtimeClient } from './useRealtimeClient';

export const workflowApi = '/api/studioflow';

export function workflowError(error: unknown) {
  return error instanceof Error ? error.message : 'The station could not complete the request.';
}

export function useWorkflowData<T>(path: string | null, interval = 8_000, keepPreviousData = false, publicTopic?: string) {
  const [result, setResult] = useState<{ path: string; dataPath?: string; data?: T; error?: string; pending?: boolean }>();
  const refreshRef = useRef<() => void>(() => {});
  const refresh = useCallback(() => refreshRef.current(), []);
  const staffRealtime = useRealtimeClient();
  const realtime = publicTopic ? kioskPb : staffRealtime;

  useEffect(() => {
    if (path === null) return;
    const controller = new AbortController();
    const { signal } = controller;
    let generation = 0;
    let inFlight = false;
    let queued = false;
    let debounce: number | undefined;
    const load = async () => {
      const request = ++generation;
      inFlight = true;
      setResult((current) => ({
        ...(current?.dataPath === path || keepPreviousData ? current : undefined),
        path, pending: true, error: undefined,
      }));
      try {
        const data = await (publicTopic ? kioskPb : pb).send<T>(
          workflowApi + path, { signal, ...(publicTopic ? { cache: 'no-store' } : {}) },
        );
        if (!signal.aborted && request === generation) setResult({ path, dataPath: path, data });
      } catch (error) {
        if (!signal.aborted && request === generation) {
          console.error('Failed to refresh workflow data:', error);
          setResult((current) => ({
            ...current, path, pending: false, error: 'Could not load the latest data.',
          }));
        }
      } finally {
        if (!signal.aborted && request === generation) {
          inFlight = false;
          if (queued) {
            queued = false;
            scheduleRefresh();
          }
        }
      }
    };
    refreshRef.current = () => {
      window.clearTimeout(debounce);
      void load();
    };
    const scheduleRefresh = () => {
      window.clearTimeout(debounce);
      debounce = window.setTimeout(() => {
        if (inFlight) queued = true;
        else refresh();
      }, 120);
    };
    void load();
    const stop = mountSubscription((listener) => realtime.realtime.subscribe(publicTopic || 'studioflow-workflow', listener), scheduleRefresh);
    const timer = window.setInterval(scheduleRefresh, interval);
    window.addEventListener('focus', scheduleRefresh);
    return () => {
      controller.abort();
      refreshRef.current = () => {};
      window.clearTimeout(debounce);
      window.clearInterval(timer);
      window.removeEventListener('focus', scheduleRefresh);
      stop();
    };
  }, [path, interval, keepPreviousData, refresh, realtime, publicTopic]);

  const data = path !== null && (result?.dataPath === path || keepPreviousData) ? result?.data : undefined;
  const pending = path !== null && (result?.path !== path || !!result.pending);
  return {
    data,
    error: path !== null && result?.path === path ? result.error : undefined,
    loading: pending && data === undefined,
    refreshing: pending && data !== undefined,
    refresh,
  };
}
