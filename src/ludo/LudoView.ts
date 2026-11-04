import Phaser from 'phaser';
import { FONT_DISPLAY, FONT_UI } from '../config';
import { HOME, HOME_COLS, LUDO_COLORS, RING, SAFE_CELLS, START_IDX, YARD_SLOTS, type LudoColor, type LudoState } from '../../shared/ludo';
import { bakeTexture } from '../systems/Bake';

export const CELL = 40;
export const BOARD = CELL * 15;
export const OX = 340;
export const OY = 60;
export const BOARD_PAD = 26;

const unit = (x: number, y: number): { x: number; y: number } => ({ x: OX + x * CELL, y: OY + y * CELL });
const center = (cx: number, cy: number): { x: number; y: number } => unit(cx + 0.5, cy + 0.5);

/** Screen position of a token given its relative progress (-1 yard .. 56 home). */
export function tokenPoint(color: LudoColor, p: number, idx: number): { x: number; y: number } {
  if (p < 0) return unit(...YARD_SLOTS[color][idx]);
  if (p <= 50) return center(...RING[(START_IDX[color] + p) % 52]);
  if (p < HOME) return center(...HOME_COLS[color][p - 51]);
  // finished: rest in the centre, pointing at the owner's side
  const side = [[-0.75, 0], [0, -0.75], [0.75, 0], [0, 0.75]][color];
  const spread = [[0, -0.3], [0, 0.3], [-0.3, 0], [0.3, 0]][color];
  const k = idx - 1.5;
  return unit(7.5 + side[0] + spread[0] * k * 0.9, 7.5 + side[1] + spread[1] * k * 0.9);
}

const lighten = (c: number, a: number): number => Phaser.Display.Color.ValueToColor(c).lighten(a).color;
const darken = (c: number, a: number): number => Phaser.Display.Color.ValueToColor(c).darken(a).color;
function mix(a: number, b: number, t: number): number {
  const c = Phaser.Display.Color.Interpolate.ColorWithColor(Phaser.Display.Color.ValueToColor(a), Phaser.Display.Color.ValueToColor(b), 1, Math.min(1, Math.max(0, t)));
  return Phaser.Display.Color.GetColor(c.r, c.g, c.b);
}
/** Vertical gradient built from thin bands (canvas baking has no gradient fills). */
function vbands(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, top: number, bottom: number, n = 12): void {
  for (let i = 0; i < n; i++) g.fillStyle(mix(top, bottom, i / (n - 1)), 1).fillRect(x, y + (h * i) / n, w, h / n + 1);
}

/** Bakes the premium board once and returns its key. */
export function bakeBoard(scene: Phaser.Scene): string {
  const key = 'ld:board:v2';
  const R = BOARD_PAD;
  bakeTexture(scene, key, OX - R, OY - R, BOARD + R * 2, BOARD + R * 2, (g) => {
    // soft drop shadow
    for (let i = 0; i < 6; i++) g.fillStyle(0x000000, 0.07).fillRoundedRect(OX - 14 - i, OY - 8 - i, BOARD + 28 + i * 2, BOARD + 28 + i * 2, 26);
    // gold bezel (concentric rings = metallic gradient)
    for (let i = 0; i < 16; i++) {
      g.fillStyle(mix(0xffe9a0, 0x8e5f10, i / 15), 1).fillRoundedRect(OX - 16 + i, OY - 16 + i, BOARD + 32 - i * 2, BOARD + 32 - i * 2, Math.max(4, 24 - i));
    }
    g.lineStyle(2, 0xffffff, 0.35).strokeRoundedRect(OX - 15, OY - 15, BOARD + 30, BOARD + 30, 23);
    g.fillStyle(0x2a1a08, 1).fillRoundedRect(OX - 2, OY - 2, BOARD + 4, BOARD + 4, 6);
    g.fillStyle(0xfffcf3, 1).fillRoundedRect(OX, OY, BOARD, BOARD, 5);

    const rect = (cx: number, cy: number, w: number, h: number): [number, number, number, number] => [OX + cx * CELL, OY + cy * CELL, w * CELL, h * CELL];

    // yards
    const yardOrigin: [number, number][] = [[0, 0], [9, 0], [9, 9], [0, 9]];
    yardOrigin.forEach(([yx, yy], c) => {
      const col = LUDO_COLORS[c];
      const [rx, ry, rw, rh] = rect(yx, yy, 6, 6);
      vbands(g, rx, ry, rw, rh, lighten(col, 14), darken(col, 18));
      g.fillStyle(0xffffff, 0.12).fillRect(rx, ry, rw, 3);
      const px = OX + (yx + 0.85) * CELL;
      const py = OY + (yy + 0.85) * CELL;
      const ps = 4.3 * CELL;
      g.fillStyle(0x000000, 0.22).fillRoundedRect(px, py + 5, ps, ps, 18);
      g.fillStyle(0xffffff, 1).fillRoundedRect(px, py, ps, ps, 18);
      g.fillStyle(0xeceef3, 1).fillRoundedRect(px + 4, py + ps * 0.55, ps - 8, ps * 0.4, 14);
      g.fillStyle(0xffffff, 1).fillRoundedRect(px + 4, py + 4, ps - 8, ps * 0.5, 14);
      g.lineStyle(3, darken(col, 22), 1).strokeRoundedRect(px, py, ps, ps, 18);
      YARD_SLOTS[c].forEach(([sx, sy]) => {
        const p = unit(sx, sy);
        g.fillStyle(0x000000, 0.18).fillCircle(p.x, p.y + 2.5, CELL * 0.64);
        g.fillStyle(lighten(col, 38), 1).fillCircle(p.x, p.y, CELL * 0.6);
        g.fillStyle(darken(col, 5), 0.5).fillCircle(p.x + 1, p.y + 2, CELL * 0.46);
        g.lineStyle(2.5, darken(col, 22), 1).strokeCircle(p.x, p.y, CELL * 0.6);
      });
    });

    // outer track
    RING.forEach(([cx, cy], i) => {
      const startOf = START_IDX.indexOf(i);
      const [x, y, w, h] = rect(cx, cy, 1, 1);
      if (startOf >= 0) {
        vbands(g, x, y, w, h, lighten(LUDO_COLORS[startOf], 18), darken(LUDO_COLORS[startOf], 12), 6);
      } else {
        g.fillStyle(0xffffff, 1).fillRect(x, y, w, h);
        g.fillStyle(0xe9ebf1, 1).fillRect(x, y + h * 0.62, w, h * 0.38);
      }
      g.lineStyle(1.2, 0x9aa0ac, 1).strokeRect(x, y, w, h);
      if (SAFE_CELLS.has(i)) {
        const p = center(cx, cy);
        const pts: Phaser.Math.Vector2[] = [];
        for (let k = 0; k < 10; k++) {
          const r = k % 2 === 0 ? CELL * 0.35 : CELL * 0.15;
          const a = -Math.PI / 2 + (k * Math.PI) / 5;
          pts.push(new Phaser.Math.Vector2(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r));
        }
        g.fillStyle(startOf >= 0 ? 0xffffff : 0xf2b705, 1).fillPoints(pts, true);
        g.lineStyle(1.2, startOf >= 0 ? 0x000000 : 0x9a6a00, startOf >= 0 ? 0.25 : 0.7).strokePoints(pts, true);
      }
    });
    // home columns
    HOME_COLS.forEach((col, c) => {
      col.forEach(([cx, cy]) => {
        const [x, y, w, h] = rect(cx, cy, 1, 1);
        vbands(g, x, y, w, h, lighten(LUDO_COLORS[c], 16), darken(LUDO_COLORS[c], 8), 6);
        g.lineStyle(1.2, darken(LUDO_COLORS[c], 35), 0.9).strokeRect(x, y, w, h);
      });
    });
    // entry arrows (the square just before each home column)
    const arrows: [number, number, number, number][] = [[0, 7, 1, 0], [7, 0, 0, 1], [14, 7, -1, 0], [7, 14, 0, -1]];
    arrows.forEach(([cx, cy, dx, dy], c) => {
      const p = center(cx, cy);
      const s = CELL * 0.26;
      g.fillStyle(LUDO_COLORS[c], 1).fillTriangle(
        p.x + dx * s * 1.1, p.y + dy * s * 1.1,
        p.x - dx * s * 0.8 - dy * s, p.y - dy * s * 0.8 + dx * s,
        p.x - dx * s * 0.8 + dy * s, p.y - dy * s * 0.8 - dx * s,
      );
    });

    // centre home: four sheened triangles + gold jewel
    const c0 = unit(6, 6);
    const c1 = unit(9, 6);
    const c2 = unit(9, 9);
    const c3 = unit(6, 9);
    const m = unit(7.5, 7.5);
    const tri = (a: { x: number; y: number }, b: { x: number; y: number }, color: number): void => {
      g.fillStyle(color, 1).fillTriangle(a.x, a.y, b.x, b.y, m.x, m.y);
      const ax = m.x + (a.x - m.x) * 0.55;
      const ay = m.y + (a.y - m.y) * 0.55;
      const bx = m.x + (b.x - m.x) * 0.55;
      const by = m.y + (b.y - m.y) * 0.55;
      g.fillStyle(lighten(color, 22), 0.55).fillTriangle(ax, ay, bx, by, m.x, m.y);
      g.lineStyle(2, 0xf2c14e, 1).strokeTriangle(a.x, a.y, b.x, b.y, m.x, m.y);
    };
    tri(c0, c3, LUDO_COLORS[0]);
    tri(c0, c1, LUDO_COLORS[1]);
    tri(c1, c2, LUDO_COLORS[2]);
    tri(c3, c2, LUDO_COLORS[3]);
    g.fillStyle(0x000000, 0.25).fillCircle(m.x, m.y + 2, CELL * 0.36);
    g.fillStyle(0xf2c14e, 1).fillCircle(m.x, m.y, CELL * 0.34);
    g.fillStyle(0xfff2b8, 1).fillCircle(m.x, m.y, CELL * 0.26);
    LUDO_COLORS.forEach((col, k) => {
      const a = (Math.PI / 2) * k + Math.PI / 4;
      g.fillStyle(col, 1).fillTriangle(m.x, m.y, m.x + Math.cos(a - 0.78) * CELL * 0.22, m.y + Math.sin(a - 0.78) * CELL * 0.22, m.x + Math.cos(a + 0.78) * CELL * 0.22, m.y + Math.sin(a + 0.78) * CELL * 0.22);
    });
    g.lineStyle(3, 0x2a1a08, 0.9).strokeRoundedRect(OX, OY, BOARD, BOARD, 5);
  });
  return key;
}

/** One glossy token per colour (radial shading from concentric discs). */
function bakeToken(scene: Phaser.Scene, c: LudoColor): string {
  const key = `ld:tok2:${c}`;
  const col = LUDO_COLORS[c];
  bakeTexture(scene, key, -24, -24, 48, 48, (g) => {
    g.fillStyle(0x000000, 0.14).fillEllipse(2, 9, 40, 22);
    g.fillStyle(0x000000, 0.28).fillEllipse(2, 8, 30, 15);
    g.fillStyle(darken(col, 55), 1).fillCircle(0, 0, 18);
    for (let r = 16; r >= 3; r -= 1.6) g.fillStyle(mix(darken(col, 22), lighten(col, 28), (16 - r) / 13), 1).fillCircle(-(16 - r) * 0.18, -(16 - r) * 0.22, r);
    g.lineStyle(2, lighten(col, 45), 0.5).strokeCircle(0, 0, 11.5);
    g.fillStyle(darken(col, 28), 0.55).fillCircle(0, 1.5, 4.5);
    g.fillStyle(0xffffff, 0.85).fillEllipse(-5.5, -7, 9, 5);
    g.fillStyle(0xffffff, 0.35).fillCircle(5, 6, 2);
  });
  return key;
}

interface TokenSprite {
  img: Phaser.GameObjects.Image;
  x: number;
  y: number;
  animating: boolean;
}

export class LudoView {
  readonly tokens: TokenSprite[][] = [];
  private hl: Phaser.GameObjects.Graphics;
  private glow: Phaser.GameObjects.Graphics;
  private hlList: { seat: number; token: number }[] = [];
  private active = -1;
  private t = 0;

  constructor(private scene: Phaser.Scene, state: LudoState) {
    const key = bakeBoard(scene);
    scene.add.image(OX - BOARD_PAD, OY - BOARD_PAD, key).setOrigin(0, 0).setScale(0.5).setDepth(0);
    for (let c = 0; c < 4; c++) bakeToken(scene, c as LudoColor);
    this.glow = scene.add.graphics().setDepth(5);
    this.hl = scene.add.graphics().setDepth(900);
    state.seats.forEach((seat, si) => {
      this.tokens[si] = [0, 1, 2, 3].map((ti) => {
        const p = tokenPoint(seat.color, -1, ti);
        const img = scene.add.image(p.x, p.y, `ld:tok2:${seat.color}`).setScale(0.5).setDepth(100 + p.y);
        return { img, x: p.x, y: p.y, animating: false };
      });
    });
  }

  /** Colour of the yard that should pulse (the player whose turn it is), or -1. */
  setActive(color: number): void {
    this.active = color;
  }

  /** Place every (non-animating) token according to the given tokens array, offsetting stacked ones. */
  layout(state: LudoState, tokens: number[][] = state.tokens): void {
    const groups = new Map<string, { seat: number; ti: number; x: number; y: number }[]>();
    state.seats.forEach((seat, si) => {
      tokens[si].forEach((p, ti) => {
        const pt = tokenPoint(seat.color, p, ti);
        const k = `${Math.round(pt.x)},${Math.round(pt.y)}`;
        const arr = groups.get(k) ?? [];
        arr.push({ seat: si, ti, ...pt });
        groups.set(k, arr);
      });
    });
    groups.forEach((arr) => {
      arr.forEach((o, i) => {
        const yardOrHome = tokens[o.seat][o.ti] < 0 || tokens[o.seat][o.ti] === HOME;
        const spread = yardOrHome ? 0 : 9;
        const off = (i - (arr.length - 1) / 2) * spread;
        const tk = this.tokens[o.seat][o.ti];
        if (tk.animating) return;
        tk.x = o.x + off;
        tk.y = o.y + (arr.length > 1 && !yardOrHome ? -Math.abs(off) * 0.2 : 0);
        tk.img.setPosition(tk.x, tk.y).setDepth(100 + tk.y).setScale(arr.length > 1 && !yardOrHome ? 0.42 : 0.5);
      });
    });
  }

  /** Expanding ring where a token lands. */
  ripple(x: number, y: number, color: number, big = false): void {
    const c = this.scene.add.circle(x, y, 8, 0xffffff, 0).setStrokeStyle(big ? 4 : 3, color, 0.9).setDepth(950);
    this.scene.tweens.add({ targets: c, scale: big ? 4.2 : 2.6, alpha: 0, duration: big ? 520 : 380, ease: 'Cubic.easeOut', onComplete: () => c.destroy() });
  }

  /** Little burst of coloured dots (captures, reaching home). */
  burst(x: number, y: number, color: number, n = 14): void {
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n + Math.random() * 0.4;
      const d = 26 + Math.random() * 34;
      const dot = this.scene.add.circle(x, y, 3 + Math.random() * 3, i % 3 === 0 ? 0xffffff : color, 1).setDepth(960);
      this.scene.tweens.add({ targets: dot, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, alpha: 0, scale: 0.3, duration: 520 + Math.random() * 240, ease: 'Cubic.easeOut', onComplete: () => dot.destroy() });
    }
  }

  /** Hop a token along the track from `from` to `to`; calls done when it lands. */
  hop(state: LudoState, seat: number, token: number, from: number, to: number, perStep: number, done: () => void, onStep?: () => void): void {
    const tk = this.tokens[seat][token];
    const color = state.seats[seat].color;
    tk.animating = true;
    const path: { x: number; y: number }[] = [];
    if (from === -1) path.push(tokenPoint(color, 0, token));
    else for (let p = from + 1; p <= to; p++) path.push(tokenPoint(color, p, token));
    let i = 0;
    const step = (): void => {
      if (i >= path.length) {
        tk.animating = false;
        done();
        return;
      }
      const target = path[i++];
      const last = i === path.length;
      const sx = tk.x;
      const sy = tk.y;
      this.scene.tweens.addCounter({
        from: 0, to: 1, duration: perStep, ease: 'Sine.easeInOut',
        onUpdate: (tw) => {
          const u = tw.getValue() ?? 0;
          tk.x = sx + (target.x - sx) * u;
          tk.y = sy + (target.y - sy) * u;
          tk.img.setPosition(tk.x, tk.y - Math.sin(u * Math.PI) * 13).setDepth(900 + tk.y).setScale(0.5 + 0.08 * Math.sin(u * Math.PI));
        },
        onComplete: () => {
          tk.x = target.x;
          tk.y = target.y;
          tk.img.setPosition(tk.x, tk.y);
          this.ripple(tk.x, tk.y, LUDO_COLORS[color], last);
          onStep?.();
          step();
        },
      });
    };
    step();
  }

  /** A captured token flies back to its yard. */
  sendHome(state: LudoState, seat: number, token: number, done: () => void): void {
    const tk = this.tokens[seat][token];
    const to = tokenPoint(state.seats[seat].color, -1, token);
    tk.animating = true;
    this.burst(tk.x, tk.y, LUDO_COLORS[state.seats[seat].color]);
    const sx = tk.x;
    const sy = tk.y;
    this.scene.tweens.addCounter({
      from: 0, to: 1, duration: 640, ease: 'Cubic.easeIn',
      onUpdate: (tw) => {
        const u = tw.getValue() ?? 0;
        tk.x = sx + (to.x - sx) * u;
        tk.y = sy + (to.y - sy) * u;
        tk.img.setPosition(tk.x, tk.y - Math.sin(u * Math.PI) * 64).setDepth(900 + tk.y).setAngle(u * 360);
      },
      onComplete: () => {
        tk.animating = false;
        tk.img.setAngle(0).setPosition(to.x, to.y);
        tk.x = to.x;
        tk.y = to.y;
        this.ripple(to.x, to.y, LUDO_COLORS[state.seats[seat].color]);
        done();
      },
    });
  }

  setHighlights(list: { seat: number; token: number }[]): void {
    this.hlList = list;
  }

  update(dt: number): void {
    this.t += dt;
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 6);
    const gg = this.glow;
    gg.clear();
    if (this.active >= 0) {
      const yardOrigin: [number, number][] = [[0, 0], [9, 0], [9, 9], [0, 9]];
      const [yx, yy] = yardOrigin[this.active];
      const p = unit(yx, yy);
      const col = LUDO_COLORS[this.active];
      gg.lineStyle(9, col, 0.18 + 0.22 * pulse).strokeRect(p.x - 3, p.y - 3, 6 * CELL + 6, 6 * CELL + 6);
      gg.lineStyle(3, 0xffffff, 0.35 + 0.35 * pulse).strokeRect(p.x + 2, p.y + 2, 6 * CELL - 4, 6 * CELL - 4);
    }
    const g = this.hl;
    g.clear();
    for (const h of this.hlList) {
      const tk = this.tokens[h.seat]?.[h.token];
      if (!tk) continue;
      g.fillStyle(0xffffff, 0.18 + 0.12 * pulse).fillCircle(tk.img.x, tk.img.y, 24 + pulse * 3);
      g.lineStyle(4, 0xffffff, 0.95).strokeCircle(tk.img.x, tk.img.y, 21 + pulse * 4);
      g.lineStyle(2.5, 0xffc233, 0.6 + pulse * 0.4).strokeCircle(tk.img.x, tk.img.y, 26 + pulse * 4);
    }
  }
}

// ------------------------------------------------------------------------- dice

const PIPS: Record<number, number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };

export class Dice extends Phaser.GameObjects.Container {
  private g: Phaser.GameObjects.Graphics;
  private value = 0;
  private ring = 0xffffff;
  private glow = false;
  private hintText: Phaser.GameObjects.Text;
  private lift = 0;
  private size = 80;
  private pulse = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, onTap: () => void) {
    super(scene, x, y);
    this.g = scene.add.graphics();
    this.hintText = scene.add.text(0, 66, '', { fontFamily: FONT_UI, fontSize: '14px', fontStyle: '700', color: '#ffffff' }).setOrigin(0.5);
    const hit = scene.add.rectangle(0, 0, this.size + 40, this.size + 40, 0xffffff, 0.001).setInteractive({ useHandCursor: true });
    this.add([this.g, this.hintText, hit]);
    hit.on('pointerdown', () => onTap());
    scene.add.existing(this);
    this.setDepth(2000);
    this.draw();
    scene.events.on('update', this.tick, this);
    this.once(Phaser.GameObjects.Events.DESTROY, () => scene.events.off('update', this.tick, this));
  }

  setHint(t: string): void {
    this.hintText.setText(t);
    this.draw();
  }

  setRing(color: number, glow: boolean): void {
    this.ring = color;
    this.glow = glow;
    this.draw();
  }

  setValue(v: number): void {
    this.value = v;
    this.draw();
  }

  private tick(_t: number, d: number): void {
    if (!this.glow) return;
    this.pulse += d * 0.005;
    this.draw();
  }

  private draw(): void {
    const g = this.g;
    const s = this.size;
    g.clear();
    const p = 0.5 + 0.5 * Math.sin(this.pulse * 2);
    // glowing pad under the dice
    if (this.glow) {
      g.fillStyle(this.ring, 0.12 + 0.1 * p).fillCircle(0, 6, 74 + p * 5);
      g.fillStyle(this.ring, 0.2 + 0.12 * p).fillCircle(0, 6, 58);
    } else {
      g.fillStyle(0xffffff, 0.05).fillCircle(0, 6, 56);
    }
    // contact shadow (shrinks while the dice is in the air)
    g.fillStyle(0x000000, 0.32 - this.lift * 0.006).fillEllipse(2, s / 2 + 6, s * (0.9 - this.lift * 0.008), 14);
    const y0 = -this.lift;
    // body: bevelled ivory cube face
    g.fillStyle(0xb9bccb, 1).fillRoundedRect(-s / 2, -s / 2 + y0 + 5, s, s, 18);
    g.fillStyle(0xf4f4f8, 1).fillRoundedRect(-s / 2, -s / 2 + y0, s, s, 18);
    g.fillStyle(0xffffff, 1).fillRoundedRect(-s / 2 + 4, -s / 2 + y0 + 3, s - 8, s * 0.6, 14);
    g.lineStyle(4, this.ring, 1).strokeRoundedRect(-s / 2, -s / 2 + y0, s, s, 18);
    g.fillStyle(0xffffff, 0.7).fillEllipse(-s * 0.18, -s * 0.36 + y0, s * 0.34, 7);
    for (const i of PIPS[this.value] ?? []) {
      const px = ((i % 3) - 1) * s * 0.27;
      const py = (Math.floor(i / 3) - 1) * s * 0.27 + y0;
      const pip = this.value === 1 ? 0xe53935 : 0x15162b;
      g.fillStyle(0x000000, 0.25).fillCircle(px + 1, py + 2, s * 0.085);
      g.fillStyle(pip, 1).fillCircle(px, py, s * 0.08);
      g.fillStyle(0xffffff, 0.35).fillCircle(px - s * 0.025, py - s * 0.028, s * 0.026);
    }
    if (this.hintText.text) {
      const w = this.hintText.width + 26;
      g.fillStyle(0x000000, 0.55).fillRoundedRect(-w / 2, 55, w, 24, 12);
      g.lineStyle(1.5, this.ring, 0.9).strokeRoundedRect(-w / 2, 55, w, 24, 12);
    }
  }

  /** Tumble through random faces with a bounce, then land on `v`. */
  roll(v: number, ms: number, done: () => void): void {
    const scene = this.scene;
    let last = 0;
    scene.tweens.addCounter({
      from: 0, to: 1, duration: ms,
      onUpdate: (tw) => {
        const u = tw.getValue() ?? 0;
        this.setAngle(Math.sin(u * 28) * 20 * (1 - u));
        this.lift = Math.abs(Math.sin(u * Math.PI * 3)) * 26 * (1 - u * 0.6);
        if (scene.time.now - last > 70) {
          last = scene.time.now;
          this.value = 1 + Math.floor(Math.random() * 6);
        }
        this.draw();
      },
      onComplete: () => {
        this.setAngle(0);
        this.lift = 0;
        this.setValue(v);
        scene.tweens.add({ targets: this, scale: { from: 1.28, to: 1 }, duration: 240, ease: 'Back.easeOut', onComplete: () => done() });
      },
    });
  }
}

// ------------------------------------------------------------------------ cards

export const CARD_POS: { x: number; y: number; dx: number; dy: number }[] = [
  { x: 30, y: 44, dx: 160, dy: 250 },
  { x: 990, y: 44, dx: 1120, dy: 250 },
  { x: 990, y: 580, dx: 1120, dy: 470 },
  { x: 30, y: 580, dx: 160, dy: 470 },
];

export class SeatCard {
  private c: Phaser.GameObjects.Container;
  private g: Phaser.GameObjects.Graphics;
  private glow: Phaser.GameObjects.Graphics;
  private status: Phaser.GameObjects.Text;
  private dots: Phaser.GameObjects.Graphics;
  private active = false;
  private t = 0;

  constructor(scene: Phaser.Scene, private seat: number, private color: LudoColor, name: string, bot: boolean) {
    const pos = CARD_POS[color];
    this.c = scene.add.container(pos.x, pos.y).setDepth(50);
    this.g = scene.add.graphics();
    this.glow = scene.add.graphics();
    const initial = scene.add.text(46, 46, (name[0] ?? '?').toUpperCase(), { fontFamily: FONT_DISPLAY, fontSize: '30px', fontStyle: '900', color: '#ffffff' }).setOrigin(0.5).setStroke('#00000066', 4);
    const nm = scene.add.text(92, 12, name.slice(0, 14), { fontFamily: FONT_UI, fontSize: '22px', fontStyle: '700', color: '#ffffff' }).setStroke('#000000', 3);
    this.status = scene.add.text(92, 42, bot ? 'COMPUTER' : '', { fontFamily: FONT_UI, fontSize: '14px', fontStyle: '700', color: '#aebbd0' });
    this.dots = scene.add.graphics();
    this.c.add([this.g, this.glow, initial, nm, this.status, this.dots]);
    this.draw(false, 0);
  }

  private draw(active: boolean, home: number): void {
    const col = LUDO_COLORS[this.color];
    const g = this.g;
    g.clear();
    g.fillStyle(0x000000, 0.3).fillRoundedRect(0, 6, 260, 92, 18);
    g.fillStyle(0x0e1636, 0.94).fillRoundedRect(0, 0, 260, 92, 18);
    g.fillStyle(0xffffff, 0.06).fillRoundedRect(3, 3, 254, 38, { tl: 15, tr: 15, bl: 6, br: 6 });
    g.fillStyle(col, 1).fillRoundedRect(0, 0, 14, 92, { tl: 18, bl: 18, tr: 0, br: 0 });
    g.lineStyle(active ? 3.5 : 1.5, active ? 0xffc233 : 0xffffff, active ? 1 : 0.22).strokeRoundedRect(0, 0, 260, 92, 18);
    g.fillStyle(col, 1).fillCircle(50, 46, 30);
    g.fillStyle(0xffffff, 0.22).fillEllipse(42, 32, 30, 14);
    g.lineStyle(3, 0xffffff, 0.95).strokeCircle(50, 46, 30);
    const d = this.dots;
    d.clear();
    for (let i = 0; i < 4; i++) {
      const x = 100 + i * 26;
      d.fillStyle(0x000000, 0.45).fillCircle(x, 76, 9);
      if (i < home) {
        d.fillStyle(col, 1).fillCircle(x, 76, 8);
        d.fillStyle(0xffffff, 0.7).fillCircle(x - 2.5, 73, 2.5);
      }
      d.lineStyle(1.5, 0xffffff, 0.55).strokeCircle(x, 76, 9);
    }
  }

  tick(dt: number): void {
    this.t += dt;
    const g = this.glow;
    g.clear();
    if (!this.active) return;
    const p = 0.5 + 0.5 * Math.sin(this.t * 6);
    g.lineStyle(5, 0xffc233, 0.25 + 0.3 * p).strokeCircle(50, 46, 35 + p * 2);
    g.lineStyle(7, 0xffc233, 0.1 + 0.12 * p).strokeRoundedRect(-3, -3, 266, 98, 20);
  }

  update(state: LudoState, activeSeat: number, label: string): void {
    const home = state.tokens[this.seat].filter((p) => p === HOME).length;
    this.active = activeSeat === this.seat && state.phase !== 'over';
    this.draw(this.active, home);
    this.status.setColor(this.active ? '#ffc233' : '#aebbd0');
    if (label) this.status.setText(label);
    else this.status.setText(state.seats[this.seat].bot ? 'COMPUTER' : '');
  }
}
