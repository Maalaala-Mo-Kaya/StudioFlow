// After a new version is deployed (npm run deploy / run.bat --build), a tab that was already open still
// runs the old app, whose lazily loaded files (Excel / Word / PDF exports …) were replaced by new ones
// with other names. Loading one then fails ("Failed to fetch dynamically imported module"). The fix is
// to reload the page once, which loads the new version.

const STALE = /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS/i;
const KEY = 'studioflow-reloaded-for-new-version';

export function isStaleBuildError(value: unknown): boolean {
  const text = value instanceof Error ? value.message : typeof value === 'string' ? value : String((value as { message?: unknown })?.message ?? '');
  return STALE.test(text);
}

/** Reloads the page to load the new version, at most once every 30 seconds (no reload loops). */
export function reloadForNewVersion(): boolean {
  try {
    const last = Number(sessionStorage.getItem(KEY) || 0);
    if (Date.now() - last < 30_000) return false;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    // Storage blocked: still reload once; a loop is not possible without the old tab state.
  }
  window.location.reload();
  return true;
}
