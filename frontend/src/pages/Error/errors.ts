/**
 * After a deploy, a browser still running the previous build asks for lazy-loaded
 * chunks that no longer exist. Browsers word that failure differently.
 */
export const isChunkLoadError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS/i.test(
    message,
  );
};

const RELOAD_FLAG = 'wl:reloaded-for-new-version';

/** Reloads once per tab to pick up the new build; returns false if it already tried. */
export const reloadOnceForNewVersion = (): boolean => {
  try {
    if (sessionStorage.getItem(RELOAD_FLAG)) return false;
    sessionStorage.setItem(RELOAD_FLAG, '1');
  } catch {
    return false; // storage blocked: don't risk a reload loop
  }
  window.location.reload();
  return true;
};
