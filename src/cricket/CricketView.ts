import Phaser from 'phaser';
import { GAME_H, GAME_W, SCREEN_W, viewPad } from '../config';
import type { BallOutcome, Delivery, ShotDir, ShotStyle } from '../../shared/cricket';
import { bakeTexture, partImage } from '../systems/Bake';

export const TEAM_COLORS = [0x35a7ff, 0xff7a3c];

// ---- camera-behind-the-batter geometry (screen space, 1280x720)
export const FAR_Y = 300; // bowler's stumps
export const NEAR_Y = 640; // batter's stumps
export const CONTACT = { x: 640, y: 598 };
const RELEASE_Y = 318;

/** Perspective scale: far end of the pitch is small, the batter end is big. */
export const persp = (y: number): number => Phaser.Math.Clamp(0.3 + 0.7 * ((y - 280) / 380), 0.24, 1.3);

interface Seg {
  x0: number; y0: number; z0: number;
  x1: number; y1: number; z1: number;
  dur: number;
  arc: number;
  onEnd?: () => void;
}

interface Fielder {
  img: Phaser.GameObjects.Image;
  hx: number;
  hy: number;
  x: number;
  y: number;
  jump: number;
}

interface Confetti { x: number; y: number; vx: number; vy: number; life: number; color: number; s: number }

const FIELD_POS: [number, number][] = [
  [900, 430], [1010, 372], [805, 346], [475, 346], [300, 405], [175, 470], [560, 292], [725, 292], [1110, 330], [150, 330],
];
const TARGETS: Record<number, Record<ShotDir, [number, number]>> = {
  1: { off: [800, 520], leg: [480, 520], straight: [640, 455] },
  2: { off: [930, 430], leg: [350, 430], straight: [640, 385] },
  3: { off: [1020, 352], leg: [260, 352], straight: [705, 325] },
  4: { off: [1195, 302], leg: [85, 302], straight: [640, 274] },
  6: { off: [1235, 215], leg: [45, 215], straight: [640, 170] },
};

const LINE_X = { off: 46, middle: 0, leg: -46 } as const;
const TB = { fast: 0.64, medium: 0.6, spin: 0.55, yorker: 0.92 } as const;

/** Rendering for the cricket match: stadium, players, ball flight, shots and celebrations. No game rules here. */
export class CricketView {
  private fx: Phaser.GameObjects.Graphics;
  private bowler!: Phaser.GameObjects.Image;
  private batter!: Phaser.GameObjects.Container;
  private batterBody!: Phaser.GameObjects.Image;
  private bat!: Phaser.GameObjects.Image;
  private stumps: Phaser.GameObjects.Image[] = [];
  private bails: Phaser.GameObjects.Image[] = [];
  private farStumps: Phaser.GameObjects.Image[] = [];
  private fielders: Fielder[] = [];
  private confetti: Confetti[] = [];
  private flashes: { x: number; y: number; life: number }[] = [];

  // ball
  private startAt = 0;
  private flightMs = 1;
  private delivery: Delivery | null = null;
  private phase: 'none' | 'flight' | 'hold' | 'post' = 'none';
  private segs: Seg[] = [];
  private segIdx = 0;
  private segStart = 0;
  private ballPos = { x: 0, y: 0, z: 0 };
  private ballAlpha = 1;
  private trail: { x: number; y: number }[] = [];
  private wideLine = false;

  arrived = false;
  ringOn = false;
  private bowlerBase = { x: 640, y: 262 };
  private batTeam = 0;

  constructor(private scene: Phaser.Scene) {
    this.bakeStadium();
    this.bakeProps();
    this.buildActors(0);
    this.fx = scene.add.graphics().setDepth(5000);
  }

  // ------------------------------------------------------------------ static art

  private bakeStadium(): void {
    const s = this.scene;
    const pad = viewPad();
    const key = `cr:stadium:${Math.round(pad)}`;
    bakeTexture(s, key, -pad, 0, GAME_W + 2 * pad, GAME_H, (g) => {
      // night sky
      const bands = 26;
      for (let i = 0; i < bands; i++) {
        const t = i / (bands - 1);
        const c = Phaser.Display.Color.Interpolate.ColorWithColor(
          new Phaser.Display.Color(8, 18, 38), new Phaser.Display.Color(38, 78, 120), 1, t,
        );
        g.fillStyle(Phaser.Display.Color.GetColor(c.r, c.g, c.b), 1).fillRect(-pad, (i * 190) / bands, GAME_W + 2 * pad, 190 / bands + 1);
      }
      // stands: tiers with crowd
      let seed = 7;
      const rnd = (): number => {
        seed = (seed * 16807) % 2147483647;
        return seed / 2147483647;
      };
      const crowd = [0xe84c4c, 0xf5c542, 0x4cc9f0, 0xffffff, 0x9b5de5, 0x38d96b, 0xff8fab];
      for (let row = 0; row < 6; row++) {
        const y = 108 + row * 25;
        g.fillStyle(row % 2 ? 0x1c2433 : 0x232c3d, 1).fillRect(-pad, y, GAME_W + 2 * pad, 26);
        for (let x = -pad + 6; x < GAME_W + pad; x += 9 + Math.floor(rnd() * 3)) {
          g.fillStyle(crowd[Math.floor(rnd() * crowd.length)], 0.9).fillCircle(x, y + 9 + rnd() * 4, 3.2);
          g.fillStyle(0xf0c8a0, 0.9).fillCircle(x, y + 3 + rnd() * 2, 2);
        }
      }
      g.fillStyle(0x0f1420, 1).fillRect(-pad, 258, GAME_W + 2 * pad, 6);
      // advertising hoarding
      const ad = [0x39ff14, 0x35a7ff, 0xff7a3c, 0xf5c542, 0x9b5de5];
      for (let x = -Math.ceil(pad / 160) * 160; x < GAME_W + pad; x += 160) {
        g.fillStyle(ad[Math.abs(Math.round(x / 160)) % ad.length], 1).fillRect(x, 262, 158, 18);
        g.fillStyle(0x000000, 0.25).fillRect(x, 262, 158, 3);
      }
      // outfield with mowing stripes (perspective)
      let y = 280;
      let i = 0;
      while (y < GAME_H) {
        const h = 10 + i * 2.6;
        g.fillStyle(i % 2 ? 0x2b7a3a : 0x338a44, 1).fillRect(-pad, y, GAME_W + 2 * pad, h + 1);
        y += h;
        i++;
      }
      // boundary rope
      g.lineStyle(4, 0xffffff, 0.9);
      g.beginPath();
      for (let x = -pad; x <= GAME_W + pad; x += 20) {
        const k = Math.max(-1.7, Math.min(1.7, (x - 640) / 640));
        const py = 281 + 16 * k * k;
        if (x === -pad) g.moveTo(x, py);
        else g.lineTo(x, py);
      }
      g.strokePath();
      // 30-yard circle
      g.lineStyle(2, 0xffffff, 0.22);
      for (let a = 0; a < Math.PI * 2; a += 0.18) {
        g.beginPath();
        g.arc(640, 470, 360, a, a + 0.09);
        g.strokePath();
      }
      // pitch (trapezoid)
      g.fillStyle(0xcdb57d, 1);
      g.fillPoints(
        [new Phaser.Math.Vector2(614, 282), new Phaser.Math.Vector2(666, 282), new Phaser.Math.Vector2(800, 735), new Phaser.Math.Vector2(480, 735)],
        true,
      );
      g.fillStyle(0xb99f66, 0.5);
      g.fillPoints(
        [new Phaser.Math.Vector2(630, 282), new Phaser.Math.Vector2(650, 282), new Phaser.Math.Vector2(680, 735), new Phaser.Math.Vector2(600, 735)],
        true,
      );
      // creases
      const crease = (yy: number, hw: number): void => {
        g.lineStyle(3, 0xffffff, 0.85).lineBetween(640 - hw, yy, 640 + hw, yy);
      };
      crease(FAR_Y + 6, 40);
      crease(NEAR_Y - 26, 168);
      g.lineStyle(2, 0xffffff, 0.5).lineBetween(640 - 56, NEAR_Y - 26, 640 - 56, NEAR_Y + 40);
      g.lineStyle(2, 0xffffff, 0.5).lineBetween(640 + 56, NEAR_Y - 26, 640 + 56, NEAR_Y + 40);
      // floodlights
      for (const fx of [70 - pad, GAME_W + pad - 70]) {
        g.fillStyle(0x3a4256, 1).fillRect(fx - 4, 20, 8, 100);
        for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) g.fillStyle(0xfff6d0, 1).fillRect(fx - 24 + c * 12, 6 + r * 11, 9, 8);
        g.fillStyle(0xfff6d0, 0.07).fillCircle(fx, 30, 90);
      }
    });
    this.scene.add.image(-pad, 0, key).setOrigin(0, 0).setScale(0.5).setDepth(-10);
    // soft vignette to focus the pitch
    const v = this.scene.add.graphics().setDepth(4000);
    v.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0.55, 0.55, 0, 0).fillRect(-pad, 0, GAME_W + 2 * pad, 90);
    v.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0, 0, 0.6, 0.6).fillRect(-pad, GAME_H - 190, GAME_W + 2 * pad, 190);
  }

  private person(key: string, shirt: number, pants: number, cap: number, skin: number, pads: boolean): void {
    bakeTexture(this.scene, key, -24, -112, 48, 114, (g) => {
      g.fillStyle(pants, 1).fillRect(-10, -46, 8, 42).fillRect(2, -46, 8, 42);
      if (pads) g.fillStyle(0xf4f4f4, 1).fillRoundedRect(-11, -42, 10, 30, 3).fillRoundedRect(1, -42, 10, 30, 3);
      g.fillStyle(0x16191c, 1).fillRect(-11, -4, 10, 4).fillRect(1, -4, 10, 4);
      g.fillStyle(shirt, 1).fillRoundedRect(-15, -82, 30, 40, 6);
      g.fillStyle(0xffffff, 0.2).fillRect(-15, -82, 30, 5);
      g.fillStyle(shirt, 1).fillRoundedRect(-21, -80, 7, 30, 3).fillRoundedRect(14, -80, 7, 30, 3);
      g.fillStyle(skin, 1).fillCircle(-17.5, -48, 3.6).fillCircle(17.5, -48, 3.6);
      g.fillStyle(skin, 1).fillCircle(0, -94, 11);
      g.fillStyle(cap, 1).fillEllipse(0, -99, 25, 15).fillRect(-12, -99, 24, 4);
    });
  }

  private bakeProps(): void {
    for (const c of TEAM_COLORS) {
      const k = c.toString(16);
      this.person(`cr:man:${k}`, c, 0x20304a, Phaser.Display.Color.ValueToColor(c).darken(35).color, 0xd9a577, false);
      this.person(`cr:bat:${k}`, c, 0xf2f2f2, 0x14181d, 0xd9a577, true);
    }
    bakeTexture(this.scene, 'cr:willow', -7, -4, 14, 78, (g) => {
      g.fillStyle(0x2a2a2a, 1).fillRoundedRect(-2.5, -2, 5, 22, 2);
      g.fillStyle(0xe8c98a, 1).fillRoundedRect(-6, 18, 12, 56, 3);
      g.fillStyle(0xffffff, 0.3).fillRect(-4, 20, 3, 50);
      g.fillStyle(0x9a6b3a, 1).fillRect(-6, 70, 12, 4);
    });
    bakeTexture(this.scene, 'cr:stump', -4, -78, 8, 80, (g) => {
      g.fillStyle(0xf1e3b8, 1).fillRoundedRect(-3, -76, 6, 76, 2);
      g.fillStyle(0xffffff, 0.35).fillRect(-3, -76, 2, 76);
    });
    bakeTexture(this.scene, 'cr:bail', -9, -4, 18, 6, (g) => {
      g.fillStyle(0xffe9a8, 1).fillRoundedRect(-8, -2, 16, 4, 2);
    });
  }

  private buildActors(batTeam: number): void {
    const s = this.scene;
    const bowlCol = TEAM_COLORS[1 - batTeam].toString(16);
    const batCol = TEAM_COLORS[batTeam].toString(16);
    this.batTeam = batTeam;

    // wickets
    for (const [arr, y, scale] of [[this.farStumps, FAR_Y, persp(FAR_Y) * 0.75], [this.stumps, NEAR_Y, persp(NEAR_Y)]] as [Phaser.GameObjects.Image[], number, number][]) {
      for (let i = -1; i <= 1; i++) {
        const im = partImage(s, 'cr:stump', -4, -78, 8, 80, 640 + i * 15 * scale, y).setScale(0.5 * scale).setDepth(y + 1);
        arr.push(im);
      }
    }
    for (let i = 0; i < 2; i++) {
      this.bails.push(partImage(s, 'cr:bail', -9, -4, 18, 6, 640 + (i ? 7 : -7) * persp(NEAR_Y), NEAR_Y - 74 * persp(NEAR_Y)).setScale(0.5 * persp(NEAR_Y)).setDepth(NEAR_Y + 2));
    }

    this.bowler = partImage(s, `cr:man:${bowlCol}`, -24, -112, 48, 114, this.bowlerBase.x, this.bowlerBase.y);
    this.bowler.setScale(0.5 * persp(262)).setDepth(262);

    this.batterBody = partImage(s, `cr:bat:${batCol}`, -24, -112, 48, 114);
    this.bat = partImage(s, 'cr:willow', -7, -4, 14, 78, 17, -46).setScale(0.7).setAngle(18).setOrigin(0.5, 0.05);
    this.batter = s.add.container(612, 604, [this.batterBody, this.bat]);
    this.batter.setScale(persp(604) * 0.95).setDepth(604);
    this.batterBody.setScale(0.5);

    for (const [fx, fy] of FIELD_POS) {
      const im = partImage(s, `cr:man:${bowlCol}`, -24, -112, 48, 114, fx, fy);
      this.fielders.push({ img: im, hx: fx, hy: fy, x: fx, y: fy, jump: 0 });
    }
    this.layoutFielders();
  }

  private layoutFielders(): void {
    for (const f of this.fielders) {
      const sc = 0.5 * persp(f.y) * 0.9;
      f.img.setPosition(f.x, f.y - f.jump).setScale(sc).setDepth(f.y);
    }
  }

  /** Swap kit colours when the innings changes. */
  setBattingTeam(batTeam: number): void {
    if (batTeam === this.batTeam && this.fielders.length) return;
    const bowlCol = TEAM_COLORS[1 - batTeam].toString(16);
    const batCol = TEAM_COLORS[batTeam].toString(16);
    this.batTeam = batTeam;
    this.bowler.setTexture(`cr:man:${bowlCol}`);
    this.batterBody.setTexture(`cr:bat:${batCol}`);
    for (const f of this.fielders) f.img.setTexture(`cr:man:${bowlCol}`);
  }

  // ------------------------------------------------------------------- ball control

  resetBall(): void {
    this.phase = 'none';
    this.arrived = false;
    this.ringOn = false;
    this.segs = [];
    this.trail = [];
    this.ballAlpha = 1;
    this.delivery = null;
    this.bat.setAngle(18);
    this.batter.setPosition(612, 604).setAngle(0);
    this.bowler.setPosition(this.bowlerBase.x, this.bowlerBase.y).setScale(0.5 * persp(262)).setDepth(262);
    this.stumps.forEach((st, i) => {
      st.setPosition(640 + (i - 1) * 15 * persp(NEAR_Y), NEAR_Y).setAngle(0).setAlpha(1);
    });
    this.bails.forEach((b, i) => {
      b.setPosition(640 + (i ? 7 : -7) * persp(NEAR_Y), NEAR_Y - 74 * persp(NEAR_Y)).setAngle(0).setAlpha(1);
    });
    this.fielders.forEach((f) => {
      f.x = f.hx;
      f.y = f.hy;
      f.jump = 0;
    });
    this.layoutFielders();
  }

  runUp(ms: number, done: () => void): void {
    const s = this.scene;
    s.tweens.add({
      targets: this.bowler, y: RELEASE_Y - 8, x: this.bowlerBase.x, duration: ms, ease: 'Sine.easeIn',
      onUpdate: () => this.bowler.setScale(0.5 * persp(this.bowler.y)).setDepth(this.bowler.y),
      onComplete: () => {
        s.tweens.add({ targets: this.bowler, scaleY: this.bowler.scaleY * 0.9, duration: 70, yoyo: true });
        done();
      },
    });
  }

  /** Start the ball flight. `delayMs` lets the batter's view show the bowler's run-up first. */
  launch(d: Delivery, flightMs: number, delayMs = 0): void {
    this.delivery = d;
    this.flightMs = flightMs;
    this.startAt = this.scene.time.now + delayMs;
    this.phase = 'flight';
    this.arrived = false;
    this.trail = [];
    this.ballAlpha = 1;
    this.wideLine = d.acc < 0.14;
    this.ringOn = true;
  }

  get hasBall(): boolean {
    return this.phase !== 'none';
  }

  /** Where the arrival moment is (scene.time.now), or 0 if no ball is in flight. */
  get arrivalAt(): number {
    return this.phase === 'none' ? 0 : this.startAt + this.flightMs;
  }

  private flightPos(t: number): { x: number; y: number; z: number } {
    const d = this.delivery!;
    const tb = TB[d.kind];
    const lineX = LINE_X[d.line] * (this.wideLine ? 3.2 : 1);
    const x0 = 640 + (d.line === 'off' ? 5 : d.line === 'leg' ? -5 : 0);
    let x = x0 + (640 + lineX - x0) * t;
    if (d.kind === 'spin' && t > tb) x += (d.line === 'off' ? -26 : 26) * ((t - tb) / (1 - tb));
    if (d.kind === 'fast') x += Math.sin(Math.PI * t) * 9 * (d.line === 'leg' ? -1 : 1);
    const y = RELEASE_Y + (CONTACT.y - RELEASE_Y) * Math.pow(t, 1.12);
    let z: number;
    const zr = 78;
    const zc = d.kind === 'yorker' ? 5 : d.kind === 'spin' ? 30 : 26;
    if (t < tb) {
      const u = t / tb;
      z = zr * (1 - u * u) + (d.kind === 'spin' ? 46 * Math.sin(Math.PI * u) : 0);
    } else {
      z = zc * Math.pow((t - tb) / (1 - tb), 0.7);
    }
    return { x, y, z };
  }

  // -------------------------------------------------------------------- shots

  /** Animates the bat and ball for a resolved delivery. Returns when the ball has finished (ms). */
  playOutcome(o: BallOutcome, input: { style: ShotStyle; dir: ShotDir }): number {
    const s = this.scene;
    const c = { x: this.ballPos.x, y: this.ballPos.y, z: this.ballPos.z };
    this.phase = 'post';
    this.ringOn = false;
    this.segs = [];
    this.segIdx = 0;
    this.segStart = s.time.now;
    const swung = input.style !== 'none' && !o.wide;
    if (swung) this.swing(input.style, input.dir);

    const add = (sg: Seg): void => void this.segs.push(sg);
    const from = (): { x: number; y: number; z: number } => {
      const last = this.segs[this.segs.length - 1];
      return last ? { x: last.x1, y: last.y1, z: last.z1 } : c;
    };

    if (o.wide || (!o.wicket && o.runs === 0 && !swung)) {
      const sign = this.ballPos.x >= 640 ? 1 : -1;
      add({ x0: c.x, y0: c.y, z0: c.z, x1: c.x + sign * 40, y1: 760, z1: 20, dur: 420, arc: 0 });
      return 900;
    }
    if (o.wicket && (o.how === 'bowled' || o.how === 'lbw')) {
      if (o.how === 'bowled') {
        add({ x0: c.x, y0: c.y, z0: c.z, x1: 640, y1: NEAR_Y, z1: 20, dur: 150, arc: 0, onEnd: () => this.stumpsDown() });
        const f = from();
        add({ x0: f.x, y0: f.y, z0: f.z, x1: 660, y1: 780, z1: 30, dur: 380, arc: 16 });
      } else {
        add({ x0: c.x, y0: c.y, z0: c.z, x1: c.x, y1: c.y + 14, z1: 8, dur: 200, arc: 0 });
        this.scene.time.delayedCall(260, () => this.celebrate('wicket'));
      }
      return 1100;
    }
    if (o.wicket && o.how === 'caught') {
      const fi = this.pickFielder(input.dir);
      const f = this.fielders[fi];
      add({ x0: c.x, y0: c.y, z0: c.z, x1: f.hx, y1: f.hy, z1: 18, dur: 1050, arc: 230 });
      this.chase(fi, f.hx, f.hy, 1000);
      s.time.delayedCall(1050, () => {
        f.jump = 10;
        s.tweens.add({ targets: f, jump: 0, duration: 260, ease: 'Bounce.easeOut', onUpdate: () => this.layoutFielders() });
        this.celebrate('wicket');
        this.phase = 'none';
      });
      return 1500;
    }
    // runs
    const r = o.runs;
    if (r === 0) {
      const dx = input.dir === 'off' ? 60 : input.dir === 'leg' ? -60 : 0;
      add({ x0: c.x, y0: c.y, z0: c.z, x1: c.x + dx, y1: c.y - 34, z1: 0, dur: 320, arc: 6 });
      return 800;
    }
    const tbl = TARGETS[r] ?? TARGETS[1];
    const [tx, ty] = tbl[input.dir];
    const dur = r === 6 ? 1300 : r === 4 ? 900 : 500 + r * 150;
    const arc = r === 6 ? 210 : o.air ? 70 : r >= 2 ? 10 : 4;
    add({ x0: c.x, y0: c.y, z0: c.z, x1: tx, y1: ty, z1: 0, dur, arc, onEnd: () => (r >= 4 ? this.celebrate(r === 6 ? 'six' : 'four') : undefined) });
    if (r < 6) {
      const fi = this.nearestFielder(tx, ty);
      this.chase(fi, tx, ty, dur * 0.9);
    }
    return dur + 700;
  }

  private swing(style: ShotStyle, dir: ShotDir): void {
    const s = this.scene;
    const base = dir === 'off' ? 1.5 : dir === 'leg' ? -1.5 : 0.1;
    const end = style === 'defend' ? base * 0.15 : style === 'drive' ? base : base * 1.1;
    s.tweens.add({ targets: this.bat, angle: { from: dir === 'leg' ? 70 : -70, to: Phaser.Math.RadToDeg(end) }, duration: 130, ease: 'Cubic.easeOut' });
    s.tweens.add({ targets: this.batter, angle: style === 'loft' ? -4 : 4, duration: 130, yoyo: true, hold: 120 });
    s.time.delayedCall(60, () => this.scene.events.emit('cricket:swing'));
  }

  private stumpsDown(): void {
    const s = this.scene;
    this.stumps.forEach((st, i) => {
      s.tweens.add({
        targets: st, x: st.x + (i - 1) * 60 + Phaser.Math.Between(-25, 25), y: st.y + 14, angle: (i - 1) * 55 + Phaser.Math.Between(-30, 30),
        duration: 420, ease: 'Cubic.easeOut',
      });
    });
    this.bails.forEach((b, i) => {
      s.tweens.add({ targets: b, x: b.x + (i ? 80 : -80), y: b.y - 60, angle: i ? 360 : -360, alpha: 0, duration: 650, ease: 'Cubic.easeOut' });
    });
    this.celebrate('wicket');
  }

  private pickFielder(dir: ShotDir): number {
    const want = dir === 'off' ? [1, 8, 0] : dir === 'leg' ? [4, 5, 9] : [6, 7, 2, 3];
    return want[Math.floor(Math.random() * want.length)];
  }

  private nearestFielder(x: number, y: number): number {
    let best = 0;
    let bd = Infinity;
    this.fielders.forEach((f, i) => {
      const d = Math.hypot(f.hx - x, (f.hy - y) * 1.6);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    return best;
  }

  private chase(i: number, x: number, y: number, ms: number): void {
    const f = this.fielders[i];
    this.scene.tweens.add({ targets: f, x, y, duration: ms, ease: 'Sine.easeOut', onUpdate: () => this.layoutFielders() });
  }

  // ------------------------------------------------------------ celebrations

  celebrate(kind: 'four' | 'six' | 'wicket'): void {
    const n = kind === 'six' ? 90 : kind === 'four' ? 60 : 50;
    const palette = kind === 'wicket' ? [0xff4d4d, 0xffffff, 0xffd166] : [0xffd166, 0x39ff14, 0x35d6ff, 0xff7a3c, 0xffffff, 0xd06bff];
    for (let i = 0; i < n; i++) {
      this.confetti.push({
        x: -viewPad() + Math.random() * SCREEN_W, y: 108 + Math.random() * 120, vx: (Math.random() - 0.5) * 120, vy: -40 - Math.random() * 160,
        life: 1.4 + Math.random() * 1.2, color: palette[Math.floor(Math.random() * palette.length)], s: 2 + Math.random() * 3,
      });
    }
    for (let i = 0; i < 14; i++) this.flashes.push({ x: -viewPad() + 30 + Math.random() * (SCREEN_W - 60), y: 112 + Math.random() * 130, life: 0.15 + Math.random() * 0.5 });
    if (kind !== 'wicket') this.scene.cameras.main.shake(180, 0.004);
  }

  // ----------------------------------------------------------------- per frame

  update(dt: number): void {
    const now = this.scene.time.now;
    const g = this.fx;
    g.clear();

    // idle fielder bob
    const t = now * 0.002;
    for (const f of this.fielders) f.img.y = f.y - f.jump + Math.sin(t + f.hx) * 0.8;

    if (this.phase === 'flight') {
      if (now >= this.startAt) {
        const tt = Math.min(1, (now - this.startAt) / this.flightMs);
        const p = this.flightPos(tt);
        this.ballPos = p;
        this.trail.push({ x: p.x, y: p.y - p.z * persp(p.y) });
        if (this.trail.length > 7) this.trail.shift();
        if (tt >= 1) {
          this.phase = 'hold';
          this.arrived = true;
        }
      } else {
        this.ballPos = { x: 640, y: RELEASE_Y, z: 70 };
      }
    } else if (this.phase === 'post') {
      this.advanceSegs(now);
    }

    // timing ring (batter only; scene toggles ringOn)
    if (this.ringOn && this.delivery) {
      const tt = Phaser.Math.Clamp((now - this.startAt) / this.flightMs, 0, 1.1);
      const r = 30 + 150 * (1 - Math.min(1, tt));
      const good = Math.abs(1 - tt) < 0.14;
      g.lineStyle(good ? 5 : 3, good ? 0x39ff14 : 0xffffff, good ? 1 : 0.55).strokeCircle(CONTACT.x, CONTACT.y - 18, r);
      g.lineStyle(2, 0x39ff14, 0.9).strokeCircle(CONTACT.x, CONTACT.y - 18, 30);
    }

    if (this.phase !== 'none' && (this.phase !== 'flight' || now >= this.startAt)) this.drawBall(g);

    // confetti + camera flashes
    for (let i = this.confetti.length - 1; i >= 0; i--) {
      const c = this.confetti[i];
      c.life -= dt;
      if (c.life <= 0) {
        this.confetti.splice(i, 1);
        continue;
      }
      c.vy += 220 * dt;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      g.fillStyle(c.color, Math.min(1, c.life)).fillRect(c.x, c.y, c.s, c.s * 1.6);
    }
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.life -= dt;
      if (f.life <= 0) {
        this.flashes.splice(i, 1);
        continue;
      }
      g.fillStyle(0xffffff, Math.min(1, f.life * 4)).fillCircle(f.x, f.y, 3 + f.life * 6);
    }
  }

  private advanceSegs(now: number): void {
    const sg = this.segs[this.segIdx];
    if (!sg) return;
    const u = Math.min(1, (now - this.segStart) / sg.dur);
    const e = 1 - Math.pow(1 - u, 1.6);
    this.ballPos = {
      x: sg.x0 + (sg.x1 - sg.x0) * (sg.arc > 100 ? u : e),
      y: sg.y0 + (sg.y1 - sg.y0) * (sg.arc > 100 ? u : e),
      z: sg.z0 + (sg.z1 - sg.z0) * u + sg.arc * Math.sin(Math.PI * u),
    };
    this.trail.push({ x: this.ballPos.x, y: this.ballPos.y - this.ballPos.z * persp(this.ballPos.y) });
    if (this.trail.length > 8) this.trail.shift();
    if (u >= 1) {
      sg.onEnd?.();
      this.segIdx++;
      this.segStart = now;
      if (this.segIdx >= this.segs.length) {
        const last = sg;
        if (last.y1 > 700 || last.arc > 100) this.phase = 'none';
        else this.ballAlpha = 0.9;
      }
    }
  }

  private drawBall(g: Phaser.GameObjects.Graphics): void {
    const { x, y, z } = this.ballPos;
    const s = persp(y);
    const r = 2.5 + 7 * s;
    const sy = y - z * s;
    const a = this.ballAlpha;
    // trail
    for (let i = 0; i < this.trail.length; i++) {
      const tr = this.trail[i];
      g.fillStyle(0xff5a4a, (i / this.trail.length) * 0.35 * a).fillCircle(tr.x, tr.y, r * (0.4 + i / this.trail.length * 0.5));
    }
    g.fillStyle(0x000000, 0.32 * a).fillEllipse(x, y, r * 2.6, r * 1.0);
    g.fillStyle(0xd62828, a).fillCircle(x, sy, r);
    g.fillStyle(0xffffff, 0.8 * a).fillCircle(x - r * 0.3, sy - r * 0.35, r * 0.28);
    g.lineStyle(Math.max(1, r * 0.18), 0xffffff, 0.7 * a).beginPath().arc(x, sy, r * 0.7, -1.0, 1.0).strokePath();
  }

  destroy(): void {
    this.fx.destroy();
  }
}
