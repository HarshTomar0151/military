// Weapon tuning table. Gameplay (Weapon/Bullet) and art (PlayerView/UI) both read from here.

export type WeaponId = 'pistol' | 'assault' | 'shotgun' | 'sniper' | 'rocket' | 'mg' | 'magnum' | 'smg' | 'dmr' | 'plasma' | 'railgun';

export interface WeaponDef {
  id: WeaponId;
  name: string;
  blurb: string;
  damage: number;
  pellets: number;
  spreadDeg: number; // base spread
  bloomDeg: number; // spread added per shot while firing
  maxBloomDeg: number;
  fireDelay: number; // ms between shots
  auto: boolean;
  mag: number;
  reserveMags: number; // reserve = mag * reserveMags (pistol is infinite)
  infinite?: boolean;
  reloadMs: number;
  speed: number; // projectile speed px/s
  range: number; // px before despawn
  gravity: number; // projectile drop px/s^2
  recoil: number; // impulse pushed into shooter, px/s
  kick: number; // visual weapon kick
  moveMult: number;
  explosive?: { radius: number; damage: number; knock: number };
  headshot: number; // multiplier
  size: number; // projectile thickness
  tracer: number; // tracer length
  color: number;
  shake: number; // camera shake intensity
  // card stats (0..1) for the loadout UI
  stats: { power: number; rate: number; range: number; mobility: number };
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  pistol: {
    id: 'pistol', name: 'VX-9 PISTOL', blurb: 'Reliable sidearm. Infinite reserve ammo.',
    damage: 20, pellets: 1, spreadDeg: 1, bloomDeg: 0.9, maxBloomDeg: 4, fireDelay: 230, auto: false,
    mag: 12, reserveMags: 0, infinite: true, reloadMs: 950, speed: 1500, range: 1000, gravity: 0,
    recoil: 40, kick: 4, moveMult: 1, headshot: 1.6, size: 2.4, tracer: 26, color: 0xffe28a, shake: 0.0015,
    stats: { power: 0.3, rate: 0.45, range: 0.45, mobility: 1 },
  },
  assault: {
    id: 'assault', name: 'AR-47 ASSAULT RIFLE', blurb: 'Balanced automatic. Controllable at mid range.',
    damage: 14, pellets: 1, spreadDeg: 1.2, bloomDeg: 0.55, maxBloomDeg: 5, fireDelay: 105, auto: true,
    mag: 30, reserveMags: 3, reloadMs: 1700, speed: 1700, range: 1300, gravity: 0,
    recoil: 55, kick: 5, moveMult: 0.96, headshot: 1.5, size: 2.6, tracer: 34, color: 0xfff0a0, shake: 0.002,
    stats: { power: 0.45, rate: 0.7, range: 0.7, mobility: 0.8 },
  },
  mg: {
    id: 'mg', name: 'M-HAWK MACHINE GUN', blurb: 'Huge magazine, heavy recoil. Slows you down.',
    damage: 11, pellets: 1, spreadDeg: 2, bloomDeg: 0.45, maxBloomDeg: 7, fireDelay: 68, auto: true,
    mag: 90, reserveMags: 1.5, reloadMs: 3100, speed: 1600, range: 1200, gravity: 0,
    recoil: 85, kick: 6, moveMult: 0.82, headshot: 1.4, size: 3, tracer: 38, color: 0xffd070, shake: 0.0028,
    stats: { power: 0.4, rate: 1, range: 0.6, mobility: 0.5 },
  },
  shotgun: {
    id: 'shotgun', name: 'BREACH-12 SHOTGUN', blurb: 'Devastating up close. Falls off fast.',
    damage: 10, pellets: 9, spreadDeg: 7, bloomDeg: 0, maxBloomDeg: 7, fireDelay: 780, auto: false,
    mag: 6, reserveMags: 3, reloadMs: 2300, speed: 1400, range: 520, gravity: 120,
    recoil: 330, kick: 11, moveMult: 0.95, headshot: 1.25, size: 2.2, tracer: 18, color: 0xffb36b, shake: 0.006,
    stats: { power: 0.95, rate: 0.2, range: 0.25, mobility: 0.85 },
  },
  sniper: {
    id: 'sniper', name: 'LONGBOW SNIPER', blurb: 'One-two-shot kills across the whole map.',
    damage: 78, pellets: 1, spreadDeg: 0, bloomDeg: 0, maxBloomDeg: 0, fireDelay: 1150, auto: false,
    mag: 5, reserveMags: 3, reloadMs: 2600, speed: 3600, range: 3600, gravity: 0,
    recoil: 210, kick: 12, moveMult: 0.9, headshot: 2, size: 3.2, tracer: 120, color: 0x9fffff, shake: 0.005,
    stats: { power: 1, rate: 0.12, range: 1, mobility: 0.7 },
  },
  rocket: {
    id: 'rocket', name: 'HELLFIRE LAUNCHER', blurb: 'Explosive splash damage. Rocket-jump with it.',
    damage: 55, pellets: 1, spreadDeg: 0.5, bloomDeg: 0, maxBloomDeg: 1, fireDelay: 1250, auto: false,
    mag: 2, reserveMags: 3, reloadMs: 2900, speed: 820, range: 2200, gravity: 40,
    recoil: 260, kick: 14, moveMult: 0.85, headshot: 1, size: 5, tracer: 22, color: 0xff7a2a, shake: 0.006,
    explosive: { radius: 135, damage: 95, knock: 700 },
    stats: { power: 0.9, rate: 0.2, range: 0.55, mobility: 0.55 },
  },
  magnum: {
    id: 'magnum', name: 'DESERT-50 MAGNUM', blurb: 'Hand cannon. Two body shots and a prayer, one to the head.',
    damage: 58, pellets: 1, spreadDeg: 0.6, bloomDeg: 0, maxBloomDeg: 1, fireDelay: 480, auto: false,
    mag: 6, reserveMags: 4, reloadMs: 1700, speed: 2400, range: 1500, gravity: 0,
    recoil: 230, kick: 10, moveMult: 1, headshot: 1.8, size: 3.4, tracer: 48, color: 0xffd27a, shake: 0.004,
    stats: { power: 0.78, rate: 0.35, range: 0.6, mobility: 0.95 },
  },
  smg: {
    id: 'smg', name: 'VORTEX SMG', blurb: 'Blazing fire rate and great mobility for close fights.',
    damage: 13, pellets: 1, spreadDeg: 2.2, bloomDeg: 0.5, maxBloomDeg: 6, fireDelay: 58, auto: true,
    mag: 40, reserveMags: 3, reloadMs: 1400, speed: 1500, range: 850, gravity: 0,
    recoil: 42, kick: 3, moveMult: 1.08, headshot: 1.4, size: 2.2, tracer: 28, color: 0xfff0a0, shake: 0.0015,
    stats: { power: 0.4, rate: 0.95, range: 0.4, mobility: 1 },
  },
  dmr: {
    id: 'dmr', name: 'MARKSMAN DMR', blurb: 'Accurate semi-auto. Hard-hitting at any range.',
    damage: 46, pellets: 1, spreadDeg: 0.2, bloomDeg: 0.5, maxBloomDeg: 2, fireDelay: 360, auto: false,
    mag: 10, reserveMags: 3, reloadMs: 2000, speed: 3200, range: 2600, gravity: 0,
    recoil: 120, kick: 8, moveMult: 0.95, headshot: 2, size: 3, tracer: 84, color: 0xb8ffb0, shake: 0.003,
    stats: { power: 0.72, rate: 0.45, range: 0.85, mobility: 0.8 },
  },
  plasma: {
    id: 'plasma', name: 'PLASMA-X RIFLE', blurb: 'Experimental energy rifle. Best damage output of any automatic.',
    damage: 22, pellets: 1, spreadDeg: 1, bloomDeg: 0.4, maxBloomDeg: 4, fireDelay: 120, auto: true,
    mag: 36, reserveMags: 3, reloadMs: 1900, speed: 1600, range: 1400, gravity: 0,
    recoil: 40, kick: 4, moveMult: 0.93, headshot: 1.5, size: 4.2, tracer: 42, color: 0x35d6ff, shake: 0.002,
    stats: { power: 0.7, rate: 0.75, range: 0.7, mobility: 0.75 },
  },
  railgun: {
    id: 'railgun', name: 'RAIL-9 RAILGUN', blurb: 'Instant-hit beam. 100 damage — 160 to the head.',
    damage: 100, pellets: 1, spreadDeg: 0, bloomDeg: 0, maxBloomDeg: 0, fireDelay: 1700, auto: false,
    mag: 3, reserveMags: 3, reloadMs: 3000, speed: 6000, range: 4000, gravity: 0,
    recoil: 320, kick: 14, moveMult: 0.85, headshot: 1.6, size: 5, tracer: 260, color: 0xd06bff, shake: 0.008,
    stats: { power: 1, rate: 0.1, range: 1, mobility: 0.5 },
  },
};

export const WEAPON_ORDER: WeaponId[] = ['assault', 'plasma', 'smg', 'mg', 'shotgun', 'sniper', 'dmr', 'railgun', 'rocket', 'magnum', 'pistol'];

export const GRENADE = {
  count: 3,
  fuseMs: 2200,
  radius: 150,
  damage: 105,
  knock: 650,
  throwSpeed: 640,
  cooldownMs: 800,
};

export function isWeaponId(id: string): id is WeaponId {
  return id in WEAPONS;
}
