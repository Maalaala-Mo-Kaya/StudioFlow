import { useEffect, useState } from 'react';
import { pb } from '../db/pocketbase';
import { studioDate } from '../utils/studioDay';

/** The studio's first day (first registration, Manila) and today: the range report pickers allow. */
export interface StudioCalendar { start: string; today: string }

let cached: Promise<StudioCalendar> | null = null;
let cachedOn = '';

function load(): Promise<StudioCalendar> {
  // Fetched once per studio day (a new day moves "today").
  const day = studioDate();
  if (!cached || cachedOn !== day) {
    cachedOn = day;
    const request = pb.send<StudioCalendar>('/api/studioflow/studio-calendar', { requestKey: null });
    cached = request;
    void request.catch((error: unknown) => {
      if (cached === request) cached = null;
      console.error('Failed to load the studio calendar:', error);
    });
  }
  return cached;
}

/**
 * Bounds for report / export date pickers: `start` (empty until loaded, or when unknown) and `today`.
 * Use with `clampDay` so a typed date outside the range is pulled back in.
 */
export function useStudioCalendar() {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ attempt: number; calendar?: StudioCalendar }>();
  useEffect(() => {
    let live = true;
    void load().then(
      (calendar) => { if (live) setResult({ attempt, calendar }); },
      () => { if (live) setResult({ attempt }); },
    );
    return () => { live = false; };
  }, [attempt]);
  const loading = result?.attempt !== attempt;
  return {
    ...(result?.calendar ?? { start: '', today: studioDate() }),
    loading,
    error: !loading && !result?.calendar ? 'Could not load the studio calendar.' : undefined,
    onRetry: () => setAttempt((current) => current + 1),
  };
}

/**
 * Keeps a picked YYYY-MM-DD inside [min, max] (either bound may be empty = open). Browsers enforce
 * min / max in the calendar but not for a typed date, so pickers pass their value through this.
 */
export function clampDay(value: string, min?: string, max?: string): string {
  if (!value) return value;
  if (min && value < min) return min;
  if (max && value > max) return max;
  return value;
}
