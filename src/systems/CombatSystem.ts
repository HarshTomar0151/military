import Phaser from 'phaser';
import { DEPTH } from '../config';
import { Bullet, type ProjectileHost } from '../entities/Bullet';
import { Grenade } from '../entities/Grenade';
import type { Player } from '../entities/Player';
import { GRENADE, NADES, type NadeKind, type WeaponDef } from '../data/weapons';
import { lineOfSight, type Rect } from './Collision';
import type { Effects } from './Effects';

export interface ExplosionSpec {
  radius: number;
  damage: number;
  knock: number;
}

export interface GasCloud {
  x: number;
  y: number;
  kind: Exclude<NadeKind, 'frag'>;
  age: number;
  life: number;
  tick: number;
  ownerId: string;
  ownerTeam: number;
  dealsDamage: boolean;
}

export interface CombatCallbacks {
  now(): number;
  players(): Player[];
  friendly(ownerId: string, ownerTeam: number, target: Player): boolean;
  playerHit(b: Bullet, victim: Player, x: number, y: number, head: boolean): void;
  explode(ownerId: string, ownerTeam: number, x: number, y: number, spec: ExplosionSpec, weaponId: string, dealsDamage: boolean): void;
  cloudStart(c: GasCloud): void;
  cloudTick(c: GasCloud, p: Player): void;
}

/** Cloud radius grows quickly after the canister pops. */
export function cloudRadius(c: GasCloud): number {
  const full = NADES[c.kind].cloud!.radius;
  return full * Math.min(1, 0.3 + c.age / 0.9);
}

/** Owns every live bullet / rocket / grenade / gas cloud: simulation, collision hand-off and rendering. */
export class CombatSystem implements ProjectileHost {
  readonly bullets: Bullet[] = [];
  readonly grenades: Grenade[] = [];
  readonly clouds: GasCloud[] = [];
  private g: Phaser.GameObjects.Graphics;
  private cloudG: Phaser.GameObjects.Graphics;

  constructor(
    scene: Phaser.Scene,
    readonly solids: Rect[],
    private fx: Effects,
    private cb: CombatCallbacks,
  ) {
    this.cloudG = scene.add.graphics().setDepth(DEPTH.projectiles - 1);
    this.g = scene.add.graphics().setDepth(DEPTH.projectiles);
  }

  // ProjectileHost ---------------------------------------------------------
  players(): Player[] {
    return this.cb.players();
  }
  now(): number {
    return this.cb.now();
  }
  friendly(ownerId: string, ownerTeam: number, target: Player): boolean {
    return this.cb.friendly(ownerId, ownerTeam, target);
  }
  bulletHitPlayer(b: Bullet, victim: Player, x: number, y: number, head: boolean): void {
    if (b.def.explosive) this.detonateBullet(b, x, y);
    else this.cb.playerHit(b, victim, x, y, head);
  }
  bulletHitWall(b: Bullet, x: number, y: number, nx: number, ny: number): void {
    if (b.def.explosive) this.detonateBullet(b, x + nx * 4, y + ny * 4);
    else this.fx.impact(x, y, nx, ny, b.def.color);
  }
  bulletExpired(b: Bullet): void {
    if (b.def.explosive) this.detonateBullet(b, b.x, b.y);
  }

  private detonateBullet(b: Bullet, x: number, y: number): void {
    this.cb.explode(b.ownerId, b.ownerTeam, x, y, b.def.explosive!, b.def.id, b.dealsDamage);
  }

  // spawning -----------------------------------------------------------------
  spawnBullet(owner: Player, def: WeaponDef, sx: number, sy: number, angle: number, muzzleDist: number, dealsDamage: boolean): void {
    const b = new Bullet(def, sx, sy, angle, owner.id, owner.team, dealsDamage);
    b.step(0, this, muzzleDist); // resolve the barrel segment so we can't shoot through walls
    if (b.alive) this.bullets.push(b);
  }

  spawnGrenade(owner: Player, kind: NadeKind, x: number, y: number, vx: number, vy: number, dealsDamage: boolean): void {
    this.grenades.push(new Grenade(x, y, vx, vy, owner.id, owner.team, dealsDamage, kind));
  }

  clear(): void {
    this.bullets.length = 0;
    this.grenades.length = 0;
    this.clouds.length = 0;
  }

  // update / draw -------------------------------------------------------------
  update(dt: number): void {
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.step(dt, this);
      if (b.alive && b.def.explosive) {
        this.fx.smoke(b.x - Math.cos(b.angle) * 14, b.y - Math.sin(b.angle) * 14, 5);
        this.fx.burst(b.x - Math.cos(b.angle) * 12, b.y - Math.sin(b.angle) * 12, 1, 60, 0xffa030, { life: 0.2, add: true, size: 3 });
      }
      if (!b.alive) this.bullets.splice(i, 1);
    }
    for (let i = this.grenades.length - 1; i >= 0; i--) {
      const gr = this.grenades[i];
      if (gr.update(dt, this.solids)) {
        this.grenades.splice(i, 1);
        if (gr.kind === 'frag') {
          this.cb.explode(gr.ownerId, gr.ownerTeam, gr.x, gr.y - 2, GRENADE, 'grenade', gr.dealsDamage);
        } else {
          const c: GasCloud = {
            x: gr.x, y: gr.y - 4, kind: gr.kind, age: 0, life: NADES[gr.kind].cloud!.lifeS, tick: 0.15,
            ownerId: gr.ownerId, ownerTeam: gr.ownerTeam, dealsDamage: gr.dealsDamage,
          };
          this.clouds.push(c);
          this.cb.cloudStart(c);
        }
      }
    }
    this.updateClouds(dt);
    this.draw();
  }

  private updateClouds(dt: number): void {
    const now = this.cb.now();
    for (let i = this.clouds.length - 1; i >= 0; i--) {
      const c = this.clouds[i];
      c.age += dt;
      c.life -= dt;
      if (c.life <= 0) {
        this.clouds.splice(i, 1);
        continue;
      }
      const def = NADES[c.kind];
      const r = cloudRadius(c);
      this.fx.gasPuff(c.x, c.y, r, def.color);
      c.tick -= dt;
      if (c.tick > 0) continue;
      c.tick += def.cloud!.tickS;
      for (const p of this.cb.players()) {
        if (!p.alive || p.isProtected(now)) continue;
        const dx = p.x - c.x;
        const dy = p.y - c.y;
        if (dx * dx + dy * dy > (r + 14) * (r + 14)) continue;
        if (!lineOfSight(c.x, c.y, p.x, p.y, this.solids)) continue;
        this.cb.cloudTick(c, p);
      }
    }
  }

  private draw(): void {
    const cg = this.cloudG;
    cg.clear();
    for (const c of this.clouds) {
      const def = NADES[c.kind];
      const r = cloudRadius(c);
      const fade = Math.min(1, c.life / 1.2);
      cg.fillStyle(def.color, 0.07 * fade).fillCircle(c.x, c.y, r);
      cg.lineStyle(2, def.color, 0.25 * fade).strokeCircle(c.x, c.y, r);
    }

    const g = this.g;
    g.clear();
    for (const b of this.bullets) {
      const a = b.angle;
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      if (b.def.explosive) {
        // rocket body
        const px = -dy;
        const py = dx;
        g.fillStyle(0xb8c0c4, 1);
        g.fillPoints(
          [
            new Phaser.Math.Vector2(b.x + dx * 11, b.y + dy * 11),
            new Phaser.Math.Vector2(b.x - dx * 8 + px * 4, b.y - dy * 8 + py * 4),
            new Phaser.Math.Vector2(b.x - dx * 8 - px * 4, b.y - dy * 8 - py * 4),
          ],
          true,
        );
        g.fillStyle(0xff4a2a, 1).fillCircle(b.x + dx * 8, b.y + dy * 8, 2.5);
        g.fillStyle(0xffb040, 0.9).fillTriangle(
          b.x - dx * 8 + px * 3, b.y - dy * 8 + py * 3,
          b.x - dx * 8 - px * 3, b.y - dy * 8 - py * 3,
          b.x - dx * (16 + Math.random() * 10), b.y - dy * (16 + Math.random() * 10),
        );
        continue;
      }
      const len = b.def.tracer;
      const tx = b.x - dx * len;
      const ty = b.y - dy * len;
      g.lineStyle(b.def.size * 2.6, b.def.color, 0.22).lineBetween(tx, ty, b.x, b.y);
      g.lineStyle(b.def.size, b.def.color, 0.95).lineBetween(tx, ty, b.x, b.y);
      g.lineStyle(b.def.size * 0.45, 0xffffff, 1).lineBetween(b.x - dx * len * 0.35, b.y - dy * len * 0.35, b.x, b.y);
    }
    for (const gr of this.grenades) {
      const def = NADES[gr.kind];
      g.fillStyle(0x000000, 0.3).fillCircle(gr.x + 1, gr.y + 2, 7);
      g.fillStyle(def.color, 1).fillCircle(gr.x, gr.y, 6.5);
      g.fillStyle(0xffffff, 0.35).fillCircle(gr.x - 2, gr.y - 2, 2.5);
      g.fillStyle(0x202820, 1).fillRect(gr.x - 2.5, gr.y - 9, 5, 4);
      if (gr.kind !== 'frag') g.lineStyle(2, 0x101010, 0.7).strokeCircle(gr.x, gr.y, 3.5);
      const blink = Math.floor(gr.fuse * (gr.fuse < 0.8 ? 14 : 6)) % 2 === 0;
      if (blink) g.fillStyle(gr.kind === 'frag' ? 0xff3b3b : 0xffffff, 1).fillCircle(gr.x + 2, gr.y + 1, 2);
    }
  }
}
