import { useCallback, useEffect, useRef, useState } from 'react';
import { pb } from '../db/pocketbase';
import { mountSubscription, useRealtimeClient } from './useRealtimeClient';

export const workflowApi = '/api/studioflow';

export function workflowError(error: unknown) {
  return error instanceof Error ? error.message : 'The station could not complete the request.';
}

export function useWorkflowData<T>(path: string | null, interval = 8_000, keepPreviousData = false) {
  const [result, setResult] = useState<{ path: string; data?: T; error?: string }>();
  const refreshRef = useRef<() => void>(() => {});
  const refresh = useCallback(() => refreshRef.current(), []);
  const realtime = useRealtimeClient();

  useEffect(() => {
    if (path === null) return;
    let live = true;
    let generation = 0;
    let debounce: number | undefined;
    const load = async () => {
      const request = ++generation;
      try {
        const data = await pb.send<T>(workflowApi + path, {});
        if (live && request === generation) setResult({ path, data });
      } catch (error) {
        if (live && request === generation) {
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
    refreshRef.current();
    const stop = mountSubscription((listener) => realtime.realtime.subscribe('studioflow-workflow', listener), refresh);
    const timer = window.setInterval(refresh, interval);
    window.addEventListener('focus', refresh);
    return () => {
      live = false;
      refreshRef.current = () => {};
      window.clearTimeout(debounce);
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      stop();
    };
  }, [path, interval, keepPreviousData, refresh, realtime]);

  return {
    data: path !== null && (result?.path === path || keepPreviousData) ? result?.data : undefined,
    error: result?.path === path ? result.error : undefined,
    refresh,
  };
}
