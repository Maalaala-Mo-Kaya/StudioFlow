import { useCallback, useEffect, useRef, useState } from 'react';
import { kioskPb, pb } from '../db/pocketbase';
import { mountSubscription, useRealtimeClient } from './useRealtimeClient';

export const workflowApi = '/api/studioflow';

export function workflowError(error: unknown) {
  return error instanceof Error ? error.message : 'The station could not complete the request.';
}

export function useWorkflowData<T>(path: string | null, interval = 8_000, keepPreviousData = false, publicTopic?: string) {
  const [result, setResult] = useState<{ path: string; data?: T; error?: string }>();
  const refreshRef = useRef<() => void>(() => {});
  const refresh = useCallback(() => refreshRef.current(), []);
  const staffRealtime = useRealtimeClient();
  const realtime = publicTopic ? kioskPb : staffRealtime;

  useEffect(() => {
    if (path === null) return;
    const controller = new AbortController();
    const { signal } = controller;
    let generation = 0;
    let debounce: number | undefined;
    const load = async () => {
      const request = ++generation;
      try {
        const data = await (publicTopic ? kioskPb : pb).send<T>(
          workflowApi + path, { signal, ...(publicTopic ? { cache: 'no-store' } : {}) },
        );
        if (!signal.aborted && request === generation) setResult({ path, data });
      } catch (error) {
        if (!signal.aborted && request === generation) {
          setResult((current) => ({
            path, data: current?.path === path || keepPreviousData ? current?.data : undefined, error: workflowError(error),
          }));
        }
      }
    };
    refreshRef.current = () => {
      window.clearTimeout(debounce);
      debounce = window.setTimeout(load, 120);
    };
    void load();
    const stop = mountSubscription((listener) => realtime.realtime.subscribe(publicTopic || 'studioflow-workflow', listener), refresh);
    const timer = window.setInterval(refresh, interval);
    window.addEventListener('focus', refresh);
    return () => {
      controller.abort();
      refreshRef.current = () => {};
      window.clearTimeout(debounce);
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      stop();
    };
  }, [path, interval, keepPreviousData, refresh, realtime, publicTopic]);

  return {
    data: path !== null && (result?.path === path || keepPreviousData) ? result?.data : undefined,
    error: result?.path === path ? result.error : undefined,
    refresh,
  };
}
