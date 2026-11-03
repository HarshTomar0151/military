import Phaser from 'phaser';
import { DEPTH } from '../config';
import { store } from './Storage';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: number;
  grav: number;
  drag: number;
  add: boolean;
  grow: number; // size change factor over life (negative shrinks)
  alpha: number;
}

interface Ring {
  x: number;
  y: number;
  r: number;
  max: number;
  life: number;
  total: number;
  color: number;
}

const MAX_PARTICLES = 900;

/** Lightweight custom particle system drawn with two Graphics layers (normal + additive). */
export class Effects {
  private normal: Phaser.GameObjects.Graphics;
  private glow: Phaser.GameObjects.Graphics;
  private parts: Particle[] = [];
  private rings: Ring[] = [];

  constructor(private scene: Phaser.Scene) {
    this.normal = scene.add.graphics().setDepth(DEPTH.fx);
    this.glow = scene.add.graphics().setDepth(DEPTH.fx + 1).setBlendMode(Phaser.BlendModes.ADD);
  }

  private get density(): number {
    return store.settings.particles === 'high' ? 1 : 0.45;
  }

  private emit(p: Partial<Particle> & { x: number; y: number }): void {
    if (this.parts.length >= MAX_PARTICLES) this.parts.shift();
    this.parts.push({
      vx: 0, vy: 0, life: 0.5, max: 0.5, size: 3, color: 0xffffff, grav: 0, drag: 0, add: false, grow: -1, alpha: 1,
      ...p,
    });
    const q = this.parts[this.parts.length - 1];
    q.max = q.life;
  }

  burst(
    x: number, y: number, count: number, speed: number, color: number,
    opts: { life?: number; grav?: number; size?: number; add?: boolean; angle?: number; spread?: number; drag?: number } = {},
  ): void {
    const n = Math.max(1, Math.round(count * this.density));
    for (let i = 0; i < n; i++) {
      const a = (opts.angle ?? 0) + (Math.random() - 0.5) * (opts.spread ?? Math.PI * 2);
      const s = speed * (0.3 + Math.random() * 0.7);
      this.emit({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: (opts.life ?? 0.5) * (0.6 + Math.random() * 0.6),
        size: (opts.size ?? 3) * (0.6 + Math.random() * 0.7),
        color, grav: opts.grav ?? 0, add: opts.add ?? false, drag: opts.drag ?? 0,
      });
    }
  }

  muzzle(x: number, y: number, angle: number, color: number): void {
    this.burst(x, y, 4, 260, color, { life: 0.12, add: true, angle, spread: 0.7, size: 2.5 });
    this.emit({ x, y, life: 0.06, size: 9, color: 0xfff2b0, add: true, grow: -1 });
  }

  impact(x: number, y: number, nx: number, ny: number, color: number): void {
    const a = Math.atan2(ny, nx);
    this.burst(x, y, 7, 300, color, { life: 0.3, grav: 700, angle: a, spread: 1.5, add: true, size: 2.2 });
    this.burst(x, y, 3, 60, 0x888888, { life: 0.5, angle: a, spread: 1.2, size: 3 });
  }

  hurt(x: number, y: number, dirAngle: number): void {
    this.burst(x, y, 9, 280, 0xff3b3b, { life: 0.45, grav: 900, angle: dirAngle, spread: 1.6, size: 2.8 });
  }

  debris(x: number, y: number, color: number): void {
    this.burst(x, y, 26, 480, color, { life: 0.9, grav: 1100, size: 4 });
    this.burst(x, y, 14, 380, 0xff3b3b, { life: 0.7, grav: 900, size: 3 });
    this.burst(x, y, 10, 300, 0xffffff, { life: 0.3, add: true, size: 3 });
  }

  smoke(x: number, y: number, size = 5): void {
    this.emit({ x, y, vx: (Math.random() - 0.5) * 30, vy: -20 - Math.random() * 20, life: 0.6, size, color: 0x6a6f70, grow: 1.4, alpha: 0.5 });
  }

  jetFlame(x: number, y: number): void {
    this.emit({
      x: x + (Math.random() - 0.5) * 4, y, vx: (Math.random() - 0.5) * 50, vy: 140 + Math.random() * 100,
      life: 0.28, size: 4 + Math.random() * 2, color: Math.random() < 0.5 ? 0xff9a2a : 0xffe08a, add: true,
    });
    if (Math.random() < 0.25 * this.density) this.smoke(x, y + 6, 4);
  }

  puff(x: number, y: number): void {
    this.burst(x, y, 6, 110, 0xc8c0a8, { life: 0.4, size: 4, angle: -Math.PI / 2, spread: Math.PI, grav: -40 });
  }

  shell(x: number, y: number, dir: number): void {
    this.emit({
      x, y, vx: dir * (70 + Math.random() * 60), vy: -140 - Math.random() * 80, life: 0.7, size: 2.4,
      color: 0xd8b24a, grav: 1200,
    });
  }

  explosion(x: number, y: number, radius: number): void {
    this.rings.push({ x, y, r: 10, max: radius * 1.05, life: 0.35, total: 0.35, color: 0xffd080 });
    this.rings.push({ x, y, r: 5, max: radius * 0.7, life: 0.25, total: 0.25, color: 0xffffff });
    this.burst(x, y, 40, radius * 4, 0xff8a2a, { life: 0.55, add: true, size: 7, drag: 2.5 });
    this.burst(x, y, 26, radius * 3, 0xffd36a, { life: 0.4, add: true, size: 5, drag: 2 });
    this.burst(x, y, 24, radius * 2.2, 0x4a4d4e, { life: 1.1, size: 12, grav: -60, drag: 1.5 });
    this.burst(x, y, 16, radius * 3.5, 0x3a3a3a, { life: 0.9, grav: 900, size: 3 });
  }

  update(dt: number): void {
    const n = this.normal;
    const g = this.glow;
    n.clear();
    g.clear();
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.parts.splice(i, 1);
        continue;
      }
      if (p.drag) {
        const k = Math.exp(-p.drag * dt);
        p.vx *= k;
        p.vy *= k;
      }
      p.vy += p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const t = p.life / p.max;
      const size = p.size * (p.grow < 0 ? t : 1 + (1 - t) * p.grow);
      const layer = p.add ? g : n;
      layer.fillStyle(p.color, p.alpha * Math.min(1, t * 1.6));
      layer.fillCircle(p.x, p.y, Math.max(0.6, size));
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life -= dt;
      if (r.life <= 0) {
        this.rings.splice(i, 1);
        continue;
      }
      const t = 1 - r.life / r.total;
      const rad = r.r + (r.max - r.r) * Math.sin(t * Math.PI * 0.5);
      g.lineStyle(6 * (1 - t) + 1, r.color, 1 - t);
      g.strokeCircle(r.x, r.y, rad);
      g.fillStyle(r.color, 0.25 * (1 - t));
      g.fillCircle(r.x, r.y, rad * 0.8);
    }
  }
}
