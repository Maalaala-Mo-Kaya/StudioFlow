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
    cached = pb.send<StudioCalendar>('/api/studioflow/studio-calendar', { requestKey: null })
      .catch(() => { cached = null; return { start: '', today: day }; });
  }
  return cached;
}

/**
 * Bounds for report / export date pickers: `start` (empty until loaded, or when unknown) and `today`.
 * Use with `clampDay` so a typed date outside the range is pulled back in.
 */
export function useStudioCalendar(): StudioCalendar {
  const [calendar, setCalendar] = useState<StudioCalendar>(() => ({ start: '', today: studioDate() }));
  useEffect(() => {
    let live = true;
    void load().then((value) => { if (live) setCalendar(value); });
    return () => { live = false; };
  }, []);
  return calendar;
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
