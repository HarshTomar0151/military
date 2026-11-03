import Phaser from 'phaser';
import { COLORS, FONT_DISPLAY, GAME_H, GAME_W, SAFE, SCREEN_W } from '../config';
import { touchState } from '../systems/InputManager';
import { store } from '../systems/Storage';

type BtnId = 'fire' | 'jump' | 'jet' | 'grenade' | 'nadeType' | 'reload' | 'switch';

interface Btn {
  id: BtnId;
  x: number;
  y: number;
  r: number;
  label: string;
  pointer: number;
  press: number; // 0..1 eased press animation
}

interface Stick {
  homeX: number;
  homeY: number;
  cx: number;
  cy: number;
  r: number;
  pointer: number;
  vx: number; // raw vector (-1..1)
  vy: number;
  sx: number; // smoothed vector used for gameplay
  sy: number;
  floating: boolean;
}

const DEAD = 0.1;

/** Smooth, deadzone-rescaled stick value. */
function shape(v: number): number {
  const a = Math.abs(v);
  if (a < DEAD) return 0;
  return Math.sign(v) * Math.min(1, (a - DEAD) / (1 - DEAD));
}

const buzz = (ms: number): void => {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* haptics unsupported */
  }
};

function drawIcon(g: Phaser.GameObjects.Graphics, id: BtnId, x: number, y: number, r: number, a: number): void {
  const w = Math.max(2.5, r * 0.07);
  g.lineStyle(w, 0xffffff, a);
  g.fillStyle(0xffffff, a);
  switch (id) {
    case 'fire': {
      g.strokeCircle(x, y, r * 0.3);
      g.fillCircle(x, y, r * 0.06);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) g.lineBetween(x + dx * r * 0.4, y + dy * r * 0.4, x + dx * r * 0.62, y + dy * r * 0.62);
      break;
    }
    case 'jump': {
      for (const o of [-0.2, 0.14]) g.beginPath().moveTo(x - r * 0.34, y + o * r + r * 0.1).lineTo(x, y + o * r - r * 0.22).lineTo(x + r * 0.34, y + o * r + r * 0.1).strokePath();
      break;
    }
    case 'jet': {
      g.fillRoundedRect(x - r * 0.2, y - r * 0.42, r * 0.4, r * 0.48, 4);
      g.fillStyle(0xffb020, a).fillTriangle(x - r * 0.16, y + r * 0.1, x + r * 0.16, y + r * 0.1, x, y + r * 0.5);
      g.fillStyle(0xfff0a0, a).fillTriangle(x - r * 0.08, y + r * 0.1, x + r * 0.08, y + r * 0.1, x, y + r * 0.32);
      break;
    }
    case 'grenade': {
      g.fillCircle(x, y + r * 0.1, r * 0.3);
      g.fillRect(x - r * 0.08, y - r * 0.32, r * 0.16, r * 0.14);
      g.strokeCircle(x + r * 0.2, y - r * 0.3, r * 0.1);
      break;
    }
    case 'nadeType': {
      for (const [dx, dy] of [[-0.26, 0.16], [0.26, 0.16], [0, -0.26]]) g.fillCircle(x + dx * r, y + dy * r, r * 0.13);
      break;
    }
    case 'reload': {
      const end = 4.2;
      g.beginPath().arc(x, y, r * 0.3, -0.7, end).strokePath();
      const ex = x + Math.cos(end) * r * 0.3;
      const ey = y + Math.sin(end) * r * 0.3;
      const tx = Math.cos(end + Math.PI / 2);
      const ty = Math.sin(end + Math.PI / 2);
      const nx = Math.cos(end);
      const ny = Math.sin(end);
      g.fillTriangle(ex + tx * r * 0.16, ey + ty * r * 0.16, ex + nx * r * 0.11, ey + ny * r * 0.11, ex - nx * r * 0.11, ey - ny * r * 0.11);
      break;
    }
    case 'switch': {
      g.lineBetween(x - r * 0.34, y - r * 0.15, x + r * 0.3, y - r * 0.15);
      g.fillTriangle(x + r * 0.38, y - r * 0.15, x + r * 0.22, y - r * 0.27, x + r * 0.22, y - r * 0.03);
      g.lineBetween(x + r * 0.34, y + r * 0.15, x - r * 0.3, y + r * 0.15);
      g.fillTriangle(x - r * 0.38, y + r * 0.15, x - r * 0.22, y + r * 0.03, x - r * 0.22, y + r * 0.27);
      break;
    }
  }
}

/**
 * On-screen controls: floating move stick (left), fixed aim stick (right) and action buttons.
 * Raw pointer routing (multi-touch aware); writes into the shared `touchState`.
 * Input is smoothed per frame so tiny thumb jitters don't make the aim or movement twitch.
 */
export class TouchControls {
  private g: Phaser.GameObjects.Graphics;
  private move: Stick;
  private aim: Stick;
  private btns: Btn[];
  private alpha: number;
  private autoFiring = false;
  private aimAngle = 0;

  constructor(private scene: Phaser.Scene) {
    const s = store.settings.touchScale;
    this.alpha = store.settings.touchOpacity;
    touchState.active = true;
    const L = (x: number): number => x * s + SAFE.l;
    const R = (x: number): number => SCREEN_W - (GAME_W - x) * s - SAFE.r;
    const B = (y: number): number => GAME_H - (GAME_H - y) * s;

    const stick = (hx: number, hy: number, floating: boolean): Stick => ({
      homeX: hx, homeY: hy, cx: hx, cy: hy, r: 98 * s, pointer: -1, vx: 0, vy: 0, sx: 0, sy: 0, floating,
    });
    this.move = stick(L(190), B(555), true);
    this.aim = stick(R(1090), B(550), false);

    const defs: { id: BtnId; x: number; y: number; r: number; label: string }[] = [
      { id: 'fire', x: R(905), y: B(610), r: 68, label: 'FIRE' },
      { id: 'jump', x: L(375), y: B(625), r: 58, label: 'JUMP' },
      { id: 'jet', x: L(415), y: B(490), r: 58, label: 'JET' },
      { id: 'grenade', x: R(945), y: B(465), r: 46, label: 'NADE' },
      { id: 'nadeType', x: R(1050), y: B(385), r: 38, label: 'TYPE' },
      { id: 'reload', x: R(795), y: B(520), r: 40, label: 'RLD' },
      { id: 'switch', x: R(1190), y: B(385), r: 42, label: 'SWAP' },
    ];
    this.g = scene.add.graphics().setDepth(90);
    this.btns = defs.map((d) => ({
      ...d,
      x: d.x,
      y: d.y,
      r: d.r * s,
      pointer: -1,
      press: 0,
    }));

    scene.input.addPointer(4);
    scene.input.on('pointerdown', this.onDown, this);
    scene.input.on('pointermove', this.onMove, this);
    scene.input.on('pointerup', this.onUp, this);
    scene.input.on('pointerupoutside', this.onUp, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
  }

  private onDown(p: Phaser.Input.Pointer): void {
    // buttons win over sticks; generous hit radius so thumbs don't miss
    let best: Btn | null = null;
    let bestD = Infinity;
    for (const b of this.btns) {
      if (b.pointer !== -1) continue;
      const d = Math.hypot(p.x - b.x, p.y - b.y);
      if (d <= b.r * 1.3 && d < bestD) {
        best = b;
        bestD = d;
      }
    }
    if (best) {
      best.pointer = p.id;
      this.pressButton(best, true);
      return;
    }
    if (this.aim.pointer === -1 && Math.hypot(p.x - this.aim.homeX, p.y - this.aim.homeY) <= this.aim.r * 1.8) {
      this.aim.pointer = p.id;
      this.dragStick(this.aim, p);
      return;
    }
    if (this.move.pointer === -1 && p.x < SCREEN_W * 0.45 && p.y > GAME_H * 0.2) {
      this.move.pointer = p.id;
      this.move.cx = Phaser.Math.Clamp(p.x, this.move.r + 10, SCREEN_W * 0.45);
      this.move.cy = Phaser.Math.Clamp(p.y, GAME_H * 0.3, GAME_H - this.move.r - 10);
      this.dragStick(this.move, p);
    }
  }

  private onMove(p: Phaser.Input.Pointer): void {
    if (this.move.pointer === p.id) this.dragStick(this.move, p);
    if (this.aim.pointer === p.id) this.dragStick(this.aim, p);
  }

  private onUp(p: Phaser.Input.Pointer): void {
    for (const b of this.btns) {
      if (b.pointer === p.id) {
        b.pointer = -1;
        this.pressButton(b, false);
      }
    }
    if (this.move.pointer === p.id) {
      this.move.pointer = -1;
      this.move.vx = this.move.vy = 0;
      this.move.cx = this.move.homeX;
      this.move.cy = this.move.homeY;
    }
    if (this.aim.pointer === p.id) {
      this.aim.pointer = -1;
      this.aim.vx = this.aim.vy = 0;
    }
  }

  private dragStick(s: Stick, p: Phaser.Input.Pointer): void {
    let dx = p.x - s.cx;
    let dy = p.y - s.cy;
    const len = Math.hypot(dx, dy);
    if (len > s.r) {
      if (s.floating) {
        // drag the base along with the thumb so it never runs out of travel
        s.cx += (dx / len) * (len - s.r);
        s.cy += (dy / len) * (len - s.r);
      }
      dx = (dx / len) * s.r;
      dy = (dy / len) * s.r;
    }
    s.vx = dx / s.r;
    s.vy = dy / s.r;
  }

  private pressButton(b: Btn, down: boolean): void {
    const t = touchState;
    if (down) buzz(b.id === 'fire' ? 8 : 14);
    switch (b.id) {
      case 'fire': t.shoot = down; break;
      case 'jump': t.jump = down; break;
      case 'jet': t.jet = down; break;
      case 'grenade': if (down) t.grenade = true; break;
      case 'nadeType': if (down) t.cycleNade = true; break;
      case 'reload': if (down) t.reload = true; break;
      case 'switch': if (down) t.switchWeapon = true; break;
    }
  }

  update(dt: number): void {
    const t = touchState;
    // frame-rate independent smoothing: fast enough to feel instant, slow enough to hide jitter
    const kMove = 1 - Math.exp(-dt * 28);
    const kKnob = 1 - Math.exp(-dt * 40);
    const m = this.move;
    const a = this.aim;
    m.sx += (shape(m.vx) - m.sx) * kMove;
    m.sy += (m.vy - m.sy) * kMove;
    a.sx += (a.vx - a.sx) * kKnob;
    a.sy += (a.vy - a.sy) * kKnob;

    t.moveX = Math.abs(m.sx) < 0.02 ? 0 : Phaser.Math.Clamp(m.sx * 1.15, -1, 1);
    t.moveY = m.sy;

    const mag = Math.hypot(a.vx, a.vy);
    t.aimActive = a.pointer !== -1;
    t.aimMag = mag;
    if (t.aimActive && mag > DEAD) {
      // ease toward the thumb direction along the shortest arc
      const target = Math.atan2(a.vy, a.vx);
      const diff = Phaser.Math.Angle.Wrap(target - this.aimAngle);
      this.aimAngle = Phaser.Math.Angle.Wrap(this.aimAngle + diff * (1 - Math.exp(-dt * 38)));
      t.aimAngle = this.aimAngle;
    }
    // auto-fire at the rim with hysteresis so it doesn't flicker on/off at the threshold
    if (t.aimActive && store.settings.autoFire) {
      if (!this.autoFiring && mag > 0.84) this.autoFiring = true;
      else if (this.autoFiring && mag < 0.68) this.autoFiring = false;
    } else {
      this.autoFiring = false;
    }
    t.aimMag = this.autoFiring ? 1 : Math.min(mag, 0.8);

    const g = this.g;
    g.clear();
    const al = this.alpha;
    const drawStick = (s: Stick, active: boolean, ring?: number): void => {
      g.fillStyle(0xffffff, al * 0.07).fillCircle(s.cx, s.cy, s.r);
      g.lineStyle(3, 0xffffff, al * (active ? 0.95 : 0.65)).strokeCircle(s.cx, s.cy, s.r);
      g.lineStyle(1.5, 0xffffff, al * 0.22).strokeCircle(s.cx, s.cy, s.r * 0.55);
      if (ring) g.lineStyle(2, 0xff5a4a, al * (this.autoFiring ? 1 : 0.5)).strokeCircle(s.cx, s.cy, s.r * ring);
      const kx = s.cx + s.sx * s.r;
      const ky = s.cy + s.sy * s.r;
      g.fillStyle(0xffffff, al * (active ? 0.5 : 0.25)).fillCircle(kx, ky, s.r * 0.42);
      g.lineStyle(3, 0xffffff, al * (active ? 1 : 0.6)).strokeCircle(kx, ky, s.r * 0.42);
      if (s === this.aim) {
        // crosshair on the aim knob
        g.lineStyle(2, 0xffffff, Math.min(1, al + 0.2)).strokeCircle(kx, ky, s.r * 0.14);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) g.lineBetween(kx + dx * s.r * 0.2, ky + dy * s.r * 0.2, kx + dx * s.r * 0.3, ky + dy * s.r * 0.3);
      }
    };
    drawStick(m, m.pointer !== -1);
    drawStick(a, a.pointer !== -1, store.settings.autoFire ? 0.84 : undefined);

    const kPress = 1 - Math.exp(-dt * 30);
    for (const b of this.btns) {
      const on = b.pointer !== -1;
      b.press += ((on ? 1 : 0) - b.press) * kPress;
      const r = b.r * (1 - 0.08 * b.press);
      const tint = b.id === 'fire' ? 0xff6a5a : 0xffffff;
      g.fillStyle(tint, al * (0.1 + 0.3 * b.press)).fillCircle(b.x, b.y, r);
      g.lineStyle(3, tint, al * (0.75 + 0.25 * b.press)).strokeCircle(b.x, b.y, r);
      if (b.press > 0.05) g.lineStyle(6, 0xffffff, al * 0.3 * b.press).strokeCircle(b.x, b.y, r + 5);
      drawIcon(g, b.id, b.x, b.y, r, Math.min(1, al + 0.2));
    }
  }

  destroy(): void {
    this.scene.input.off('pointerdown', this.onDown, this);
    this.scene.input.off('pointermove', this.onMove, this);
    this.scene.input.off('pointerup', this.onUp, this);
    this.scene.input.off('pointerupoutside', this.onUp, this);
    touchState.active = false;
    touchState.moveX = touchState.moveY = 0;
    touchState.shoot = touchState.jump = touchState.jet = touchState.aimActive = false;
  }
}
