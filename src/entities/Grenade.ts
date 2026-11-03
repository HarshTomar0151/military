import { NADES, type NadeKind } from '../data/weapons';
import { overlaps, type Rect } from '../systems/Collision';

const HALF = 6;
const GRAVITY = 1250;

export class Grenade {
  alive = true;
  fuse: number;
  spin = 0;

  constructor(
    public x: number,
    public y: number,
    public vx: number,
    public vy: number,
    readonly ownerId: string,
    readonly ownerTeam: number,
    readonly dealsDamage: boolean,
    readonly kind: NadeKind = 'frag',
  ) {
    this.fuse = NADES[kind].fuseMs / 1000;
  }

  /** Returns true when the fuse runs out this frame. */
  update(dt: number, solids: Rect[]): boolean {
    this.fuse -= dt;
    this.vy += GRAVITY * dt;
    this.spin += this.vx * dt * 0.05;

    // axis-separated movement with bounce
    this.x += this.vx * dt;
    let hit = this.collide(solids);
    if (hit) {
      this.x = hit.pushX;
      this.vx *= -0.5;
    }
    this.y += this.vy * dt;
    hit = this.collide(solids);
    if (hit) {
      this.y = hit.pushY;
      if (Math.abs(this.vy) > 120) this.vy *= -0.4;
      else this.vy = 0;
      this.vx *= 0.82;
    }
    return this.fuse <= 0;
  }

  private collide(solids: Rect[]): { pushX: number; pushY: number } | null {
    const box: Rect = { x: this.x - HALF, y: this.y - HALF, w: HALF * 2, h: HALF * 2 };
    for (const r of solids) {
      if (!overlaps(box, r)) continue;
      const pushX = this.vx > 0 ? r.x - HALF - 0.01 : r.x + r.w + HALF + 0.01;
      const pushY = this.vy > 0 ? r.y - HALF - 0.01 : r.y + r.h + HALF + 0.01;
      return { pushX, pushY };
    }
    return null;
  }
}
