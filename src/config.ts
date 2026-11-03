// Global constants: logical resolution, theme colors and tuning values.

export const GAME_W = 1280;
export const GAME_H = 720;

/** Real canvas width (>= GAME_W). GAME_W stays the width the menus are designed for. */
export let SCREEN_W = GAME_W;
export function setScreenWidth(w: number): void {
  SCREEN_W = w;
}
/** Extra space on each side of the 1280-wide design area. */
export const viewPad = (): number => (SCREEN_W - GAME_W) / 2;
/** Notch insets in game units (filled in by systems/Viewport). */
export const SAFE = { l: 0, r: 0 };

export const FONT_DISPLAY = 'Orbitron, "Segoe UI", sans-serif';
export const FONT_UI = 'Rajdhani, "Segoe UI", sans-serif';

export const COLORS = {
  bg: 0x070b08,
  panel: 0x0d1610,
  panelLight: 0x14221a,
  line: 0x1f4a26,
  neon: 0x39ff14,
  neonDim: 0x1c8a0a,
  text: '#d8ffe0',
  textDim: '#7fa889',
  amber: 0xffb020,
  danger: 0xff3b3b,
  ice: 0x35d6ff,
  team0: 0x35a7ff,
  team1: 0xff5a3c,
};

export const hex = (n: number): string => '#' + n.toString(16).padStart(6, '0');

export const DEPTH = {
  bg: 0,
  platforms: 10,
  pickups: 20,
  players: 30,
  projectiles: 40,
  fx: 50,
  names: 60,
};

export const PHYS = {
  gravity: 1500,
  runSpeed: 270,
  groundAccel: 3200,
  airAccel: 1700,
  groundFriction: 2600,
  airFriction: 420,
  jumpVel: -560,
  doubleJumpVel: -500,
  jetAccel: 2800,
  jetMaxRise: -360,
  jetFuelMax: 100,
  jetDrain: 0, // jetpack fuel is unlimited
  jetRegenGround: 48,
  jetRegenAir: 14,
  jetRegenDelay: 0.55,
  maxFall: 900,
  bodyW: 26,
  bodyH: 50,
  coyote: 0.09,
};

export const CAMERA_ZOOM = 0.86;
/** Phones get a closer camera so characters and bullets are bigger on a small screen. */
export const CAMERA_ZOOM_TOUCH = 1.12;
