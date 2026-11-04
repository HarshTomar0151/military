import Phaser from 'phaser';
import { COLORS, FONT_DISPLAY, FONT_UI } from '../config';
import { HOME, HOME_COLS, LUDO_COLORS, RING, SAFE_CELLS, START_IDX, YARD_SLOTS, type LudoColor, type LudoState } from '../../shared/ludo';
import { bakeTexture } from '../systems/Bake';

export const CELL = 40;
export const BOARD = CELL * 15;
export const OX = 340;
export const OY = 60;

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

/** Bakes the board texture once and returns its key. */
export function bakeBoard(scene: Phaser.Scene): string {
  const key = 'ld:board';
  bakeTexture(scene, key, OX - 8, OY - 8, BOARD + 16, BOARD + 16, (g) => {
    g.fillStyle(0x1b1b2a, 1).fillRoundedRect(OX - 8, OY - 8, BOARD + 16, BOARD + 16, 18);
    g.fillStyle(0xfffbf0, 1).fillRoundedRect(OX, OY, BOARD, BOARD, 10);
    const rect = (cx: number, cy: number, w: number, h: number): [number, number, number, number] => [OX + cx * CELL, OY + cy * CELL, w * CELL, h * CELL];

    // yards
    const yardOrigin: [number, number][] = [[0, 0], [9, 0], [9, 9], [0, 9]];
    yardOrigin.forEach(([yx, yy], c) => {
      const col = LUDO_COLORS[c];
      g.fillStyle(col, 1).fillRect(...rect(yx, yy, 6, 6));
      g.fillStyle(0xffffff, 1).fillRoundedRect(OX + (yx + 0.9) * CELL, OY + (yy + 0.9) * CELL, 4.2 * CELL, 4.2 * CELL, 14);
      g.lineStyle(3, darken(col, 25), 1).strokeRoundedRect(OX + (yx + 0.9) * CELL, OY + (yy + 0.9) * CELL, 4.2 * CELL, 4.2 * CELL, 14);
      YARD_SLOTS[c].forEach(([sx, sy]) => {
        const p = unit(sx, sy);
        g.fillStyle(lighten(col, 35), 1).fillCircle(p.x, p.y, CELL * 0.62);
        g.lineStyle(2.5, darken(col, 20), 1).strokeCircle(p.x, p.y, CELL * 0.62);
      });
    });

    // outer track
    RING.forEach(([cx, cy], i) => {
      const startOf = START_IDX.indexOf(i);
      g.fillStyle(startOf >= 0 ? LUDO_COLORS[startOf] : 0xffffff, 1).fillRect(...rect(cx, cy, 1, 1));
      g.lineStyle(1.5, 0x666666, 1).strokeRect(...rect(cx, cy, 1, 1));
      if (SAFE_CELLS.has(i)) {
        const p = center(cx, cy);
        g.fillStyle(startOf >= 0 ? 0xffffff : 0x9a9a9a, 0.95);
        const pts: Phaser.Math.Vector2[] = [];
        for (let k = 0; k < 10; k++) {
          const r = k % 2 === 0 ? CELL * 0.34 : CELL * 0.14;
          const a = -Math.PI / 2 + (k * Math.PI) / 5;
          pts.push(new Phaser.Math.Vector2(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r));
        }
        g.fillPoints(pts, true);
      }
    });
    // home columns
    HOME_COLS.forEach((col, c) => {
      col.forEach(([cx, cy]) => {
        g.fillStyle(LUDO_COLORS[c], 1).fillRect(...rect(cx, cy, 1, 1));
        g.lineStyle(1.5, 0x666666, 1).strokeRect(...rect(cx, cy, 1, 1));
      });
    });
    // centre triangles
    const c0 = unit(6, 6);
    const c1 = unit(9, 6);
    const c2 = unit(9, 9);
    const c3 = unit(6, 9);
    const m = unit(7.5, 7.5);
    const tri = (a: { x: number; y: number }, b: { x: number; y: number }, color: number): void => {
      g.fillStyle(color, 1).fillTriangle(a.x, a.y, b.x, b.y, m.x, m.y);
      g.lineStyle(1.5, 0x555555, 1).strokeTriangle(a.x, a.y, b.x, b.y, m.x, m.y);
    };
    tri(c0, c3, LUDO_COLORS[0]);
    tri(c0, c1, LUDO_COLORS[1]);
    tri(c1, c2, LUDO_COLORS[2]);
    tri(c3, c2, LUDO_COLORS[3]);
    g.lineStyle(4, 0x1b1b2a, 1).strokeRoundedRect(OX, OY, BOARD, BOARD, 10);
  });
  return key;
}

/** One baked glossy token per colour. */
function bakeToken(scene: Phaser.Scene, c: LudoColor): string {
  const key = `ld:tok:${c}`;
  const col = LUDO_COLORS[c];
  bakeTexture(scene, key, -22, -22, 44, 44, (g) => {
    g.fillStyle(0x000000, 0.28).fillEllipse(2, 6, 32, 20);
    g.fillStyle(0x15151f, 1).fillCircle(0, 0, 17);
    g.fillStyle(col, 1).fillCircle(0, 0, 14.5);
    g.fillStyle(lighten(col, 20), 1).fillCircle(0, -1, 9);
    g.fillStyle(darken(col, 20), 1).fillCircle(0, 1.5, 4.5);
    g.fillStyle(0xffffff, 0.75).fillCircle(-5, -6, 3.2);
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
  private hlList: { seat: number; token: number }[] = [];
  private t = 0;

  constructor(private scene: Phaser.Scene, state: LudoState) {
    const key = bakeBoard(scene);
    scene.add.image(OX - 8, OY - 8, key).setOrigin(0, 0).setScale(0.5).setDepth(0);
    for (let c = 0; c < 4; c++) bakeToken(scene, c as LudoColor);
    this.hl = scene.add.graphics().setDepth(900);
    state.seats.forEach((seat, si) => {
      this.tokens[si] = [0, 1, 2, 3].map((ti) => {
        const p = tokenPoint(seat.color, -1, ti);
        const img = scene.add.image(p.x, p.y, `ld:tok:${seat.color}`).setScale(0.5).setDepth(100 + p.y);
        return { img, x: p.x, y: p.y, animating: false };
      });
    });
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
      const sx = tk.x;
      const sy = tk.y;
      this.scene.tweens.addCounter({
        from: 0, to: 1, duration: perStep, ease: 'Sine.easeInOut',
        onUpdate: (tw) => {
          const u = tw.getValue() ?? 0;
          tk.x = sx + (target.x - sx) * u;
          tk.y = sy + (target.y - sy) * u;
          tk.img.setPosition(tk.x, tk.y - Math.sin(u * Math.PI) * 11).setDepth(900 + tk.y).setScale(0.5 + 0.07 * Math.sin(u * Math.PI));
        },
        onComplete: () => {
          tk.x = target.x;
          tk.y = target.y;
          tk.img.setPosition(tk.x, tk.y);
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
    const sx = tk.x;
    const sy = tk.y;
    this.scene.tweens.addCounter({
      from: 0, to: 1, duration: 620, ease: 'Cubic.easeIn',
      onUpdate: (tw) => {
        const u = tw.getValue() ?? 0;
        tk.x = sx + (to.x - sx) * u;
        tk.y = sy + (to.y - sy) * u;
        tk.img.setPosition(tk.x, tk.y - Math.sin(u * Math.PI) * 60).setDepth(900 + tk.y).setAngle(u * 360);
      },
      onComplete: () => {
        tk.animating = false;
        tk.img.setAngle(0).setPosition(to.x, to.y);
        tk.x = to.x;
        tk.y = to.y;
        done();
      },
    });
  }

  setHighlights(list: { seat: number; token: number }[]): void {
    this.hlList = list;
  }

  update(dt: number): void {
    this.t += dt;
    const g = this.hl;
    g.clear();
    for (const h of this.hlList) {
      const tk = this.tokens[h.seat]?.[h.token];
      if (!tk) continue;
      const pulse = 0.5 + 0.5 * Math.sin(this.t * 7);
      g.lineStyle(4, 0xffffff, 0.9).strokeCircle(tk.img.x, tk.img.y, 21 + pulse * 4);
      g.lineStyle(2, 0xffc233, 0.6 + pulse * 0.4).strokeCircle(tk.img.x, tk.img.y, 25 + pulse * 4);
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
  private hint: Phaser.GameObjects.Text;
  private size = 78;

  constructor(scene: Phaser.Scene, x: number, y: number, onTap: () => void) {
    super(scene, x, y);
    this.g = scene.add.graphics();
    this.hint = scene.add.text(0, 56, '', { fontFamily: FONT_UI, fontSize: '15px', fontStyle: '700', color: '#ffffff' }).setOrigin(0.5).setStroke('#000', 4);
    const hit = scene.add.rectangle(0, 0, this.size + 30, this.size + 30, 0xffffff, 0.001).setInteractive({ useHandCursor: true });
    this.add([this.g, this.hint, hit]);
    hit.on('pointerdown', () => onTap());
    scene.add.existing(this);
    this.setDepth(2000);
    this.draw();
    scene.events.on('update', this.tick, this);
    this.once(Phaser.GameObjects.Events.DESTROY, () => scene.events.off('update', this.tick, this));
  }

  setHint(t: string): void {
    this.hint.setText(t);
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

  private pulse = 0;
  private tick(_t: number, d: number): void {
    if (!this.glow) return;
    this.pulse += d * 0.006;
    this.setScale(1 + 0.05 * Math.sin(this.pulse * 2));
  }

  private draw(): void {
    const g = this.g;
    const s = this.size;
    g.clear();
    g.fillStyle(0x000000, 0.3).fillRoundedRect(-s / 2 + 4, -s / 2 + 7, s, s, 16);
    if (this.glow) g.fillStyle(this.ring, 0.25).fillRoundedRect(-s / 2 - 8, -s / 2 - 8, s + 16, s + 16, 22);
    g.fillStyle(0xffffff, 1).fillRoundedRect(-s / 2, -s / 2, s, s, 16);
    g.lineStyle(5, this.ring, 1).strokeRoundedRect(-s / 2, -s / 2, s, s, 16);
    g.fillStyle(0x000000, 0.06).fillRoundedRect(-s / 2 + 6, -s / 2 + s * 0.55, s - 12, s * 0.38, 10);
    for (const i of PIPS[this.value] ?? []) {
      const px = ((i % 3) - 1) * s * 0.27;
      const py = (Math.floor(i / 3) - 1) * s * 0.27;
      g.fillStyle(this.value === 1 ? 0xe53935 : 0x1b1b2a, 1).fillCircle(px, py, s * 0.075);
    }
  }

  /** Tumble through random faces, then land on `v`. */
  roll(v: number, ms: number, done: () => void): void {
    const scene = this.scene;
    let last = 0;
    scene.tweens.addCounter({
      from: 0, to: 1, duration: ms,
      onUpdate: (tw) => {
        const u = tw.getValue() ?? 0;
        this.setAngle(Math.sin(u * 30) * 18 * (1 - u));
        this.y += 0;
        if (scene.time.now - last > 70) {
          last = scene.time.now;
          this.setValue(1 + Math.floor(Math.random() * 6));
        }
      },
      onComplete: () => {
        this.setAngle(0);
        this.setValue(v);
        scene.tweens.add({ targets: this, scale: { from: 1.25, to: 1 }, duration: 220, ease: 'Back.easeOut', onComplete: () => done() });
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
  private status: Phaser.GameObjects.Text;
  private dots: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, private seat: number, private color: LudoColor, name: string, bot: boolean) {
    const pos = CARD_POS[color];
    this.c = scene.add.container(pos.x, pos.y).setDepth(50);
    this.g = scene.add.graphics();
    const col = LUDO_COLORS[color];
    const initial = scene.add.text(46, 46, (name[0] ?? '?').toUpperCase(), { fontFamily: FONT_DISPLAY, fontSize: '30px', fontStyle: '900', color: '#ffffff' }).setOrigin(0.5);
    const nm = scene.add.text(92, 14, name.slice(0, 14), { fontFamily: FONT_UI, fontSize: '22px', fontStyle: '700', color: '#ffffff' }).setStroke('#000', 3);
    this.status = scene.add.text(92, 44, bot ? 'COMPUTER' : '', { fontFamily: FONT_UI, fontSize: '15px', fontStyle: '700', color: '#d8e6dc' });
    this.dots = scene.add.graphics();
    this.c.add([this.g, initial, nm, this.status, this.dots]);
    this.draw(false, col, 0);
  }

  private draw(active: boolean, col: number, home: number): void {
    const g = this.g;
    g.clear();
    g.fillStyle(0x0d1530, 0.88).fillRoundedRect(0, 0, 260, 92, 16);
    g.lineStyle(active ? 4 : 2, active ? 0xffc233 : 0xffffff, active ? 1 : 0.35).strokeRoundedRect(0, 0, 260, 92, 16);
    g.fillStyle(col, 1).fillCircle(46, 46, 30);
    g.lineStyle(3, 0xffffff, 0.95).strokeCircle(46, 46, 30);
    const d = this.dots;
    d.clear();
    for (let i = 0; i < 4; i++) {
      d.fillStyle(i < home ? col : 0x000000, i < home ? 1 : 0.4).fillCircle(98 + i * 24, 76, 8);
      d.lineStyle(1.5, 0xffffff, 0.6).strokeCircle(98 + i * 24, 76, 8);
    }
  }

  update(state: LudoState, activeSeat: number, label: string): void {
    const col = LUDO_COLORS[this.color];
    const home = state.tokens[this.seat].filter((p) => p === HOME).length;
    this.draw(activeSeat === this.seat && state.phase !== 'over', col, home);
    if (label) this.status.setText(label);
    else this.status.setText(state.seats[this.seat].bot ? 'COMPUTER' : '');
  }
}

export { COLORS };
