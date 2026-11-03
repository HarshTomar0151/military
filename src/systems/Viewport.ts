import Phaser from 'phaser';
import { GAME_H, GAME_W, SAFE, SCREEN_W, setScreenWidth } from '../config';

/**
 * The game is designed on a 1280x720 canvas, but phones are wider than 16:9. We keep the height at 720 and
 * widen the canvas to the real aspect ratio so the game fills the whole screen (no black bars).
 * Menus stay centred in the design area; the in-game HUD and touch controls hug the true screen edges.
 */
export function computeScreenW(): number {
  const aspect = window.innerWidth / Math.max(1, window.innerHeight);
  return Phaser.Math.Clamp(Math.round((GAME_H * aspect) / 2) * 2, GAME_W, 1900);
}

/** Notch / rounded-corner insets (iPhone landscape), converted to game units. */
export function measureSafeInsets(): void {
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
  document.body.appendChild(probe);
  const cs = getComputedStyle(probe);
  const k = GAME_H / Math.max(1, window.innerHeight);
  SAFE.l = (parseFloat(cs.paddingLeft) || 0) * k;
  SAFE.r = (parseFloat(cs.paddingRight) || 0) * k;
  probe.remove();
}

const KEEP_RUNNING = new Set(['Boot', 'Game', 'HUD', 'Cricket']);

/** Re-fit the canvas when the window / orientation / browser bars change (debounced). */
export function installResizeHandler(game: Phaser.Game): void {
  let timer = 0;
  const apply = (): void => {
    measureSafeInsets();
    const w = computeScreenW();
    if (Math.abs(w - SCREEN_W) < 8) return;
    setScreenWidth(w);
    game.scale.setGameSize(w, GAME_H);
    game.scale.refresh();
    // menus rebuild themselves for the new width; a running match keeps its layout until it ends
    for (const s of game.scene.getScenes(true)) {
      if (!KEEP_RUNNING.has(s.scene.key)) s.scene.restart();
    }
  };
  const schedule = (): void => {
    window.clearTimeout(timer);
    timer = window.setTimeout(apply, 350);
  };
  window.addEventListener('resize', schedule);
  window.addEventListener('orientationchange', schedule);
}
