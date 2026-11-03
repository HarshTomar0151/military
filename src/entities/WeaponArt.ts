import Phaser from 'phaser';
import type { WeaponId } from '../data/weapons';

type Part = [x: number, y: number, w: number, h: number, color: number];

interface Art {
  parts: Part[];
  muzzle: number; // distance from the hand to the barrel tip
}

// Weapons are drawn pointing along +x with the grip at the origin.
const ART: Record<WeaponId, Art> = {
  pistol: {
    muzzle: 19,
    parts: [
      [0, -4, 16, 5, 0x3a4147], [14, -3, 5, 3, 0x1c2024], [1, 0, 5, 9, 0x23282c], [4, 1, 9, 2, 0x16191c],
    ],
  },
  assault: {
    muzzle: 43,
    parts: [
      [-13, -3, 11, 6, 0x4a3b2c], [-3, -4, 28, 8, 0x2c3136], [24, -3, 13, 5, 0x1e2226], [36, -2, 8, 3, 0x15181b],
      [10, 3, 6, 11, 0x1b1e21], [6, -7, 9, 3, 0x15181b], [-1, 3, 5, 8, 0x23282c],
    ],
  },
  mg: {
    muzzle: 50,
    parts: [
      [-13, -4, 10, 8, 0x3f3f3f], [-3, -5, 32, 10, 0x30353a], [29, -3, 21, 4, 0x15181b], [10, 5, 15, 12, 0x4d5d3d],
      [38, 1, 3, 8, 0x1c1f22], [-1, 5, 5, 8, 0x23282c], [6, -8, 12, 3, 0x1c1f22],
    ],
  },
  shotgun: {
    muzzle: 45,
    parts: [
      [-14, -3, 12, 7, 0x7a5430], [-2, -4, 20, 7, 0x2b2f33], [18, -3, 27, 4, 0x1a1d20], [22, 1, 14, 4, 0x7a5430],
      [-1, 3, 5, 8, 0x23282c],
    ],
  },
  sniper: {
    muzzle: 62,
    parts: [
      [-15, -3, 13, 7, 0x34402d], [-2, -4, 28, 7, 0x2b3136], [26, -2, 36, 3, 0x15181b], [8, -10, 16, 5, 0x111417],
      [22, -9, 2, 3, 0x35d6ff], [10, 3, 5, 7, 0x1b1e21], [-1, 3, 5, 8, 0x23282c], [44, 1, 8, 7, 0x1c1f22],
    ],
  },
  rocket: {
    muzzle: 54,
    parts: [
      [-12, -7, 52, 14, 0x4d5d3d], [40, -9, 7, 18, 0x2a3326], [46, -5, 9, 10, 0xff7a2a], [4, -11, 8, 4, 0x1c1f22],
      [3, 7, 5, 9, 0x23282c], [-14, -9, 4, 18, 0x2a3326], [18, -9, 3, 18, 0x38452e],
    ],
  },
  magnum: {
    muzzle: 31,
    parts: [
      [-1, -4, 14, 6, 0x3a4147], [12, -3, 19, 4, 0x2a2f33], [4, -6, 8, 9, 0x59616a], [-1, 1, 5, 10, 0x4a3320], [30, -4, 2, 2, 0xffd27a],
    ],
  },
  smg: {
    muzzle: 27,
    parts: [
      [-11, -3, 9, 3, 0x2a2f33], [-3, -4, 21, 8, 0x2c3136], [18, -2, 9, 3, 0x15181b], [7, 3, 5, 14, 0x1b1e21], [-1, 3, 5, 8, 0x23282c], [4, -7, 9, 3, 0x15181b],
    ],
  },
  dmr: {
    muzzle: 54,
    parts: [
      [-14, -3, 12, 7, 0x34402d], [-2, -4, 27, 7, 0x2b3136], [25, -2, 29, 3, 0x15181b], [6, -9, 13, 5, 0x111417], [17, -8, 2, 3, 0x7fff7f],
      [10, 3, 5, 9, 0x1b1e21], [-1, 3, 5, 8, 0x23282c], [42, 1, 6, 5, 0x1c1f22],
    ],
  },
  plasma: {
    muzzle: 45,
    parts: [
      [-5, -5, 27, 10, 0x23304a], [6, -3, 14, 6, 0x35d6ff], [22, -3, 16, 6, 0x1b2438], [37, -5, 7, 10, 0x35d6ff],
      [-1, 5, 5, 9, 0x15181b], [-12, -3, 8, 6, 0x1b2438], [10, -8, 10, 3, 0x2e3f63],
    ],
  },
  railgun: {
    muzzle: 64,
    parts: [
      [-13, -4, 42, 8, 0x2a2438], [28, -7, 36, 3, 0x7a3fa0], [28, 4, 36, 3, 0x7a3fa0], [14, -2, 18, 4, 0xd06bff],
      [-1, 4, 5, 9, 0x15181b], [-16, -3, 4, 6, 0x15181b], [6, -9, 10, 4, 0x111417],
    ],
  },
};

export function weaponMuzzle(id: WeaponId): number {
  return ART[id].muzzle;
}

export function drawWeapon(g: Phaser.GameObjects.Graphics, id: WeaponId, ox = 0, oy = 0, scale = 1): void {
  for (const [x, y, w, h, c] of ART[id].parts) {
    g.fillStyle(c, 1);
    g.fillRect(ox + x * scale, oy + y * scale, w * scale, h * scale);
  }
  // subtle highlight on top edge
  g.fillStyle(0xffffff, 0.08);
  const top = ART[id].parts[1];
  g.fillRect(ox + top[0] * scale, oy + top[1] * scale, top[2] * scale, Math.max(1, scale));
}
