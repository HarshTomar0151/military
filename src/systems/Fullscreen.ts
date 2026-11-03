import { store } from './Storage';

type FsDoc = Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => Promise<void> };
type FsEl = HTMLElement & { webkitRequestFullscreen?: (o?: object) => Promise<void> };

export const isTouchDevice = (): boolean =>
  window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;

export const canFullscreen = (): boolean => {
  const el = document.documentElement as FsEl;
  return !!(el.requestFullscreen || el.webkitRequestFullscreen);
};

export const isFullscreen = (): boolean => {
  const d = document as FsDoc;
  return !!(d.fullscreenElement || d.webkitFullscreenElement);
};

/** Running as an installed app (Add to Home Screen) – already has no browser bars. */
export const isStandalone = (): boolean =>
  window.matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

export async function enterFullscreen(): Promise<boolean> {
  const el = document.documentElement as FsEl;
  const fn = el.requestFullscreen ?? el.webkitRequestFullscreen;
  if (!fn) return false;
  try {
    await fn.call(el, { navigationUI: 'hide' });
    try {
      // Android Chrome only allows this while fullscreen
      await (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape');
    } catch {
      /* not supported – the rotate hint overlay covers portrait */
    }
    return true;
  } catch {
    return false;
  }
}

export async function exitFullscreen(): Promise<void> {
  const d = document as FsDoc;
  try {
    if (d.exitFullscreen) await d.exitFullscreen();
    else await d.webkitExitFullscreen?.();
  } catch {
    /* ignore */
  }
}

export async function toggleFullscreen(): Promise<boolean> {
  if (isFullscreen()) {
    await exitFullscreen();
    return false;
  }
  return enterFullscreen();
}

/**
 * On touch devices a tap switches to fullscreen (browsers require a user gesture). We keep trying on
 * the next taps until it works, and never force it again once the player leaves fullscreen.
 */
export function installAutoFullscreen(): void {
  let attempts = 0;
  let done = false;
  let pending = false;
  const handler = (): void => {
    if (done || pending || attempts >= 8) return;
    if (!isTouchDevice() || !store.settings.autoFullscreen || isStandalone() || !canFullscreen()) return;
    if (isFullscreen()) {
      done = true;
      return;
    }
    attempts++;
    pending = true;
    void enterFullscreen().then((ok) => {
      pending = false;
      if (ok) done = true;
    });
  };
  window.addEventListener('pointerup', (e) => {
    if (e.pointerType === 'touch') handler();
  });
  window.addEventListener('touchend', handler);
  window.addEventListener('click', handler);
}
