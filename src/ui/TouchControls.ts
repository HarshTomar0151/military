import Phaser from 'phaser';
import { COLORS, FONT_DISPLAY, GAME_H, GAME_W } from '../config';
import { touchState } from '../systems/InputManager';
import { store } from '../systems/Storage';

interface Btn {
  id: 'fire' | 'jump' | 'jet' | 'grenade' | 'reload' | 'switch';
  x: number;
  y: number;
  r: number;
  label: string;
  right: boolean;
  pointer: number;
  label_t?: Phaser.GameObjects.Text;
}

interface Stick {
  homeX: number;
  homeY: number;
  cx: number;
  cy: number;
  r: number;
  pointer: number;
  vx: number;
  vy: number;
  floating: boolean;
}

/**
 * On-screen controls: floating move stick (left), fixed aim stick (right) and action buttons.
 * Raw pointer routing (multi-touch aware); writes into the shared `touchState`.
 */
export class TouchControls {
  private g: Phaser.GameObjects.Graphics;
  private move: Stick;
  private aim: Stick;
  private btns: Btn[];
  private scale: number;
  private alpha: number;

  constructor(private scene: Phaser.Scene) {
    this.scale = store.settings.touchScale;
    this.alpha = store.settings.touchOpacity;
    touchState.active = true;
    const s = this.scale;
    const L = (x: number): number => x * s;
    const R = (x: number): number => GAME_W - (GAME_W - x) * s;
    const B = (y: number): number => GAME_H - (GAME_H - y) * s;

    this.move = { homeX: L(170), homeY: B(565), cx: L(170), cy: B(565), r: 80 * s, pointer: -1, vx: 0, vy: 0, floating: true };
    this.aim = { homeX: R(1110), homeY: B(565), cx: R(1110), cy: B(565), r: 80 * s, pointer: -1, vx: 0, vy: 0, floating: false };
    this.btns = [
      { id: 'fire', x: R(935), y: B(615), r: 54 * s, label: 'FIRE', right: true, pointer: -1 },
      { id: 'jump', x: L(335), y: B(635), r: 46 * s, label: 'JUMP', right: false, pointer: -1 },
      { id: 'jet', x: L(355), y: B(515), r: 46 * s, label: 'JET', right: false, pointer: -1 },
      { id: 'grenade', x: R(975), y: B(485), r: 34 * s, label: 'NADE', right: true, pointer: -1 },
      { id: 'reload', x: R(860), y: B(525), r: 30 * s, label: 'RLD', right: true, pointer: -1 },
      { id: 'switch', x: R(1195), y: B(395), r: 34 * s, label: 'SWAP', right: true, pointer: -1 },
    ];
    this.g = scene.add.graphics().setDepth(90);
    for (const b of this.btns) {
      b.label_t = scene.add
        .text(b.x, b.y, b.label, { fontFamily: FONT_DISPLAY, fontSize: `${Math.round(b.r * 0.38)}px`, fontStyle: '700', color: '#d8ffe0' })
        .setOrigin(0.5)
        .setDepth(91)
        .setAlpha(this.alpha + 0.2);
    }

    scene.input.addPointer(4);
    scene.input.on('pointerdown', this.onDown, this);
    scene.input.on('pointermove', this.onMove, this);
    scene.input.on('pointerup', this.onUp, this);
    scene.input.on('pointerupoutside', this.onUp, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
  }

  private onDown(p: Phaser.Input.Pointer): void {
    for (const b of this.btns) {
      if (b.pointer === -1 && Math.hypot(p.x - b.x, p.y - b.y) <= b.r * 1.25) {
        b.pointer = p.id;
        this.pressButton(b, true);
        return;
      }
    }
    if (this.aim.pointer === -1 && Math.hypot(p.x - this.aim.homeX, p.y - this.aim.homeY) <= this.aim.r * 1.7) {
      this.aim.pointer = p.id;
      this.dragStick(this.aim, p);
      return;
    }
    if (this.move.pointer === -1 && p.x < GAME_W * 0.42 && p.y > GAME_H * 0.2) {
      this.move.pointer = p.id;
      this.move.cx = Phaser.Math.Clamp(p.x, this.move.r + 10, GAME_W * 0.42);
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
    switch (b.id) {
      case 'fire': t.shoot = down; break;
      case 'jump': t.jump = down; break;
      case 'jet': t.jet = down; break;
      case 'grenade': if (down) t.grenade = true; break;
      case 'reload': if (down) t.reload = true; break;
      case 'switch': if (down) t.switchWeapon = true; break;
    }
  }

  update(): void {
    const t = touchState;
    const dz = 0.18;
    const mx = Math.abs(this.move.vx) < dz ? 0 : this.move.vx;
    t.moveX = Phaser.Math.Clamp(mx * 1.25, -1, 1);
    t.moveY = this.move.vy;
    t.aimActive = this.aim.pointer !== -1;
    t.aimMag = Math.hypot(this.aim.vx, this.aim.vy);
    if (t.aimActive && t.aimMag > 0.12) t.aimAngle = Math.atan2(this.aim.vy, this.aim.vx);

    const g = this.g;
    g.clear();
    const a = this.alpha;
    const drawStick = (s: Stick, active: boolean, ring?: number): void => {
      g.fillStyle(0x0d1610, a * 0.55).fillCircle(s.cx, s.cy, s.r);
      g.lineStyle(2, COLORS.neon, a * (active ? 1 : 0.6)).strokeCircle(s.cx, s.cy, s.r);
      if (ring) g.lineStyle(1.5, COLORS.danger, a * 0.7).strokeCircle(s.cx, s.cy, s.r * ring);
      g.fillStyle(COLORS.neon, a * (active ? 0.85 : 0.4)).fillCircle(s.cx + s.vx * s.r, s.cy + s.vy * s.r, s.r * 0.42);
    };
    drawStick(this.move, this.move.pointer !== -1);
    drawStick(this.aim, this.aim.pointer !== -1, store.settings.autoFire ? 0.82 : undefined);
    for (const b of this.btns) {
      const on = b.pointer !== -1;
      const col = b.id === 'fire' ? COLORS.danger : b.id === 'jet' ? COLORS.amber : COLORS.neon;
      g.fillStyle(on ? col : 0x0d1610, on ? a * 0.55 : a * 0.55).fillCircle(b.x, b.y, b.r);
      g.lineStyle(2.5, col, a * (on ? 1 : 0.75)).strokeCircle(b.x, b.y, b.r);
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
