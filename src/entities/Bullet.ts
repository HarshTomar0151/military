import type { WeaponDef } from '../data/weapons';
import { raycast, segRect, type Rect } from '../systems/Collision';
import type { Player } from './Player';

/** What the projectile system needs from the world. Implemented by CombatSystem. */
export interface ProjectileHost {
  solids: Rect[];
  players(): Player[];
  now(): number;
  friendly(ownerId: string, ownerTeam: number, target: Player): boolean;
  bulletHitPlayer(b: Bullet, victim: Player, x: number, y: number, head: boolean): void;
  bulletHitWall(b: Bullet, x: number, y: number, nx: number, ny: number): void;
  bulletExpired(b: Bullet): void;
}

export class Bullet {
  alive = true;
  traveled = 0;
  trail: { x: number; y: number }[] = [];

  constructor(
    readonly def: WeaponDef,
    public x: number,
    public y: number,
    angle: number,
    readonly ownerId: string,
    readonly ownerTeam: number,
    /** false for bullets fired by remote players: they only render and stop on contact. */
    readonly dealsDamage: boolean,
    public vx = Math.cos(angle) * def.speed,
    public vy = Math.sin(angle) * def.speed,
  ) {}

  get angle(): number {
    return Math.atan2(this.vy, this.vx);
  }

  /** Move `dt` seconds (or exactly `dist` px when given), resolving walls and players. */
  step(dt: number, host: ProjectileHost, dist?: number): void {
    if (!this.alive) return;
    let dx: number;
    let dy: number;
    if (dist !== undefined) {
      const sp = Math.hypot(this.vx, this.vy) || 1;
      dx = (this.vx / sp) * dist;
      dy = (this.vy / sp) * dist;
    } else {
      this.vy += this.def.gravity * dt;
      dx = this.vx * dt;
      dy = this.vy * dt;
    }
    const x2 = this.x + dx;
    const y2 = this.y + dy;

    const wall = raycast(this.x, this.y, x2, y2, host.solids);
    let bestT = wall ? wall.t : 2;
    let victim: Player | null = null;
    const now = host.now();
    for (const p of host.players()) {
      if (p.id === this.ownerId || !p.canBeHit(now) || host.friendly(this.ownerId, this.ownerTeam, p)) continue;
      const h = segRect(this.x, this.y, x2, y2, p.hitRect);
      if (h && h.t < bestT) {
        bestT = h.t;
        victim = p;
      }
    }

    if (victim) {
      const hx = this.x + dx * bestT;
      const hy = this.y + dy * bestT;
      this.alive = false;
      host.bulletHitPlayer(this, victim, hx, hy, hy < victim.headBottom);
      return;
    }
    if (wall) {
      this.x += dx * wall.t;
      this.y += dy * wall.t;
      this.alive = false;
      host.bulletHitWall(this, this.x, this.y, wall.nx, wall.ny);
      return;
    }

    this.x = x2;
    this.y = y2;
    this.traveled += Math.hypot(dx, dy);
    if (dist === undefined) {
      this.trail.push({ x: this.x, y: this.y });
      if (this.trail.length > 5) this.trail.shift();
    }
    if (this.traveled > this.def.range) {
      this.alive = false;
      host.bulletExpired(this);
    }
  }
}
