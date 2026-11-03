// Swept-segment / AABB helpers used by bullets, grenades, bots and explosions.

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RayHit {
  t: number; // 0..1 along the segment
  nx: number;
  ny: number;
}

export function segRect(x1: number, y1: number, x2: number, y2: number, r: Rect): RayHit | null {
  const dx = x2 - x1;
  const dy = y2 - y1;
  let tmin = 0;
  let tmax = 1;
  let nx = 0;
  let ny = 0;

  if (Math.abs(dx) < 1e-9) {
    if (x1 < r.x || x1 > r.x + r.w) return null;
  } else {
    let t1 = (r.x - x1) / dx;
    let t2 = (r.x + r.w - x1) / dx;
    let n = -1;
    if (t1 > t2) {
      [t1, t2] = [t2, t1];
      n = 1;
    }
    if (t1 > tmin) {
      tmin = t1;
      nx = n;
      ny = 0;
    }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }

  if (Math.abs(dy) < 1e-9) {
    if (y1 < r.y || y1 > r.y + r.h) return null;
  } else {
    let t1 = (r.y - y1) / dy;
    let t2 = (r.y + r.h - y1) / dy;
    let n = -1;
    if (t1 > t2) {
      [t1, t2] = [t2, t1];
      n = 1;
    }
    if (t1 > tmin) {
      tmin = t1;
      ny = n;
      nx = 0;
    }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  return { t: tmin, nx, ny };
}

export function raycast(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  rects: Rect[],
): (RayHit & { rect: Rect }) | null {
  let best: (RayHit & { rect: Rect }) | null = null;
  for (const r of rects) {
    const h = segRect(x1, y1, x2, y2, r);
    if (h && (!best || h.t < best.t)) best = { ...h, rect: r };
  }
  return best;
}

export function lineOfSight(x1: number, y1: number, x2: number, y2: number, rects: Rect[]): boolean {
  for (const r of rects) if (segRect(x1, y1, x2, y2, r)) return false;
  return true;
}

export function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** Shortest distance from a point to a rect (0 if inside). */
export function distToRect(px: number, py: number, r: Rect): number {
  const dx = Math.max(r.x - px, 0, px - (r.x + r.w));
  const dy = Math.max(r.y - py, 0, py - (r.y + r.h));
  return Math.hypot(dx, dy);
}
