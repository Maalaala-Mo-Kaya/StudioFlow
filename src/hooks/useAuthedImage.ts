import { useEffect, useState, type RefObject } from 'react';
import { pb } from '../db/pocketbase';

// Loads a staff-only photo (sent with the staff token) once its element scrolls near
// the screen, and frees the object URL when the element goes away or the URL changes.
export function useAuthedImage(url: string | null, ref: RefObject<Element | null>) {
  const [state, setState] = useState<{ url: string; objectUrl: string; failed: boolean }>();

  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    let objectUrl = '';
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return;
      observer.disconnect();
      void fetch(pb.buildURL(url), {
        headers: { Authorization: pb.authStore.token },
        signal: controller.signal,
      }).then((response) => {
        if (!response.ok) throw new Error('Photo unavailable.');
        return response.blob();
      }).then((blob) => {
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setState({ url, objectUrl, failed: false });
      }).catch(() => { if (!controller.signal.aborted) setState({ url, objectUrl: '', failed: true }); });
    }, { rootMargin: '250px' });
    if (ref.current) observer.observe(ref.current);
    return () => {
      observer.disconnect();
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url, ref]);

  const current = state?.url === url ? state : undefined;
  return { src: current?.objectUrl ?? '', failed: current?.failed ?? false };
}
