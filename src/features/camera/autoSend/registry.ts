/**
 * Ties Auto-send to the camera actions on the Photo Floor:
 * - Before a camera changes client (link, unlink, Mark Done, a session start or finish), the last
 *   shots on this laptop are sent first, so they reach the client they were taken of.
 * - A link made from this device notes its time, so shots taken right after Call Client (before
 *   the page has seen the new link) still count as the new client's.
 */
type Flush = (timeoutMs?: number) => Promise<unknown>;

const flushers = new Map<string, Flush>();
const linkStarts = new Map<string, number>();

export function registerFlush(stationId: string, flush: Flush) {
  flushers.set(stationId, flush);
  return () => {
    if (flushers.get(stationId) === flush) flushers.delete(stationId);
  };
}

/** Sends this laptop's last shots for the camera. Throws when they can't all go (the action should wait). */
export async function flushAutoSend(stationId: string | undefined, timeoutMs?: number) {
  const flush = stationId ? flushers.get(stationId) : undefined;
  if (flush) await flush(timeoutMs);
}

export function noteLinkStart(stationId: string, at = Date.now()) {
  linkStarts.set(stationId, at);
}

/** The time a link was started from this device in the last minute, once. */
export function takeLinkStart(stationId: string) {
  const at = linkStarts.get(stationId);
  linkStarts.delete(stationId);
  return at !== undefined && Date.now() - at < 60_000 ? at : undefined;
}
