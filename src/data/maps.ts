import type { MapId } from '../../shared/protocol';
import type { Rect } from '../systems/Collision';

export type PickupKind = 'health' | 'armor' | 'ammo';
export type MapStyle = 'military' | 'desert' | 'jungle';

export interface SpawnPoint {
  x: number;
  y: number; // body center
}

export interface PickupSpawn {
  x: number;
  y: number;
  kind: PickupKind;
}

export interface MapTheme {
  skyTop: number;
  skyBottom: number;
  far: number;
  mid: number;
  fog: number;
  ground: number;
  groundTop: number;
  platform: number;
  platformTop: number;
  edge: number;
  accent: number;
}

export interface MapDef {
  id: MapId;
  name: string;
  tagline: string;
  style: MapStyle;
  w: number;
  h: number;
  theme: MapTheme;
  solids: Rect[]; // all collidable rects including world boundaries
  spawns: SpawnPoint[]; // first half = left side, second half = right side
  pickups: PickupSpawn[];
}

export const WORLD_W = 3200;
export const WORLD_H = 1600;
const FLOOR = 1500;
const BODY_HALF = 26;

const r = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h });
const mirrorRect = (q: Rect): Rect => ({ x: WORLD_W - q.x - q.w, y: q.y, w: q.w, h: q.h });

interface Layout {
  half: Rect[]; // mirrored across the vertical center line
  center: Rect[]; // already symmetric
  spawnHalf: [number, number][]; // [x, platformTop]
  pickHalf: [number, number, PickupKind][];
  pickCenter: [number, number, PickupKind][];
}

function build(
  id: MapId,
  name: string,
  tagline: string,
  style: MapStyle,
  theme: MapTheme,
  l: Layout,
): MapDef {
  const boundary: Rect[] = [
    r(0, FLOOR, WORLD_W, WORLD_H - FLOOR), // floor
    r(-200, -400, 200, WORLD_H + 400), // left wall
    r(WORLD_W, -400, 200, WORLD_H + 400), // right wall
    r(-200, -400, WORLD_W + 400, 400), // ceiling
  ];
  const solids = [...boundary, ...l.half, ...l.half.map(mirrorRect), ...l.center];
  const left = l.spawnHalf.map(([x, top]): SpawnPoint => ({ x, y: top - BODY_HALF }));
  const right = l.spawnHalf.map(([x, top]): SpawnPoint => ({ x: WORLD_W - x, y: top - BODY_HALF }));
  const pickups: PickupSpawn[] = [
    ...l.pickHalf.map(([x, y, kind]): PickupSpawn => ({ x, y: y - 16, kind })),
    ...l.pickHalf.map(([x, y, kind]): PickupSpawn => ({ x: WORLD_W - x, y: y - 16, kind })),
    ...l.pickCenter.map(([x, y, kind]): PickupSpawn => ({ x, y: y - 16, kind })),
  ];
  return { id, name, tagline, style, w: WORLD_W, h: WORLD_H, theme, solids, spawns: [...left, ...right], pickups };
}

const military = build(
  'military',
  'MILITARY BASE',
  'Concrete bunkers and steel catwalks under a searchlight sky.',
  'military',
  {
    skyTop: 0x4f8fd0, skyBottom: 0xcfe6f6, far: 0x8aa0b0, mid: 0x6d8798, fog: 0xeaf4fb,
    ground: 0x5c6b58, groundTop: 0x8fb07a, platform: 0x6e7c72, platformTop: 0xaec0b0, edge: 0x23302a, accent: 0xffc020,
  },
  {
    half: [
      r(200, 1390, 280, 110), r(760, 1400, 100, 100), r(1040, 1380, 120, 120), r(1240, 1300, 40, 200),
      r(100, 1230, 300, 24), r(520, 1290, 240, 24), r(880, 1210, 260, 24),
      r(300, 1050, 260, 24), r(700, 1090, 240, 24), r(1100, 1030, 240, 24),
      r(686, 1114, 24, 176), r(120, 880, 260, 24), r(520, 860, 260, 24), r(900, 880, 240, 24),
      r(300, 700, 300, 24), r(760, 680, 260, 24), r(1120, 720, 200, 24),
    ],
    center: [
      r(1450, 1400, 300, 100), r(1300, 1250, 600, 24), r(1584, 1274, 32, 126),
      r(1420, 1060, 360, 24), r(1500, 880, 200, 24), r(1350, 700, 500, 24),
    ],
    spawnHalf: [[250, 1390], [640, 1290], [420, 1050], [230, 880]],
    pickHalf: [[1000, 1210, 'health'], [1000, 880, 'armor'], [450, 700, 'ammo']],
    pickCenter: [[1600, 1250, 'health'], [1600, 700, 'armor'], [1600, 880, 'ammo']],
  },
);

const desert = build(
  'desert',
  'DESERT BATTLEFIELD',
  'Open dunes, towering mesas and a scorched sky.',
  'desert',
  {
    skyTop: 0x4f9be0, skyBottom: 0xfde6bd, far: 0xd9a066, mid: 0xc98750, fog: 0xfbe3b8,
    ground: 0xa6713f, groundTop: 0xe0b074, platform: 0x9b6a45, platformTop: 0xd9a76b, edge: 0x4a2c1a, accent: 0xff7a2a,
  },
  {
    half: [
      r(80, 1250, 380, 250), r(460, 1370, 220, 130), r(760, 1050, 150, 450), r(1000, 1300, 300, 200),
      r(250, 1050, 260, 24), r(560, 1180, 180, 24), r(1080, 1080, 220, 24),
      r(120, 860, 240, 24), r(450, 800, 240, 24), r(780, 860, 200, 24), r(1150, 880, 220, 24),
      r(300, 600, 300, 24), r(700, 620, 240, 24), r(1100, 560, 260, 24),
    ],
    center: [
      r(1300, 1400, 600, 100), r(1450, 1220, 300, 24), r(1350, 1000, 500, 24),
      r(1300, 800, 60, 200), r(1840, 800, 60, 200), r(1300, 780, 600, 26),
    ],
    spawnHalf: [[200, 1250], [560, 1370], [830, 1050], [350, 1050]],
    pickHalf: [[1150, 1300, 'health'], [1200, 1080, 'armor'], [600, 1180, 'ammo']],
    pickCenter: [[1600, 1400, 'health'], [1600, 1000, 'armor'], [1600, 780, 'ammo']],
  },
);

const jungle = build(
  'jungle',
  'JUNGLE ARENA',
  'Giant trunks, vine-draped branches and glowing fog.',
  'jungle',
  {
    skyTop: 0x4aa8e0, skyBottom: 0xdaf3d2, far: 0x3d9a5c, mid: 0x2c7d46, fog: 0xbff0c8,
    ground: 0x3a3220, groundTop: 0x5cb43c, platform: 0x6b4d2c, platformTop: 0x66bb4c, edge: 0x1a130b, accent: 0xa8ff5a,
  },
  {
    half: [
      r(300, 820, 56, 680), r(900, 1000, 56, 500),
      r(120, 1250, 240, 20), r(356, 1110, 300, 20), r(560, 1300, 260, 20), r(956, 1220, 260, 20),
      r(1050, 1060, 240, 20), r(60, 1000, 240, 20), r(356, 900, 220, 20), r(600, 820, 260, 20),
      r(980, 820, 220, 20), r(160, 700, 260, 20), r(500, 640, 260, 20), r(860, 660, 260, 20),
    ],
    center: [
      r(1560, 900, 80, 600), r(1360, 1300, 480, 20), r(1400, 1120, 400, 20),
      r(1300, 950, 260, 20), r(1640, 950, 260, 20), r(1400, 720, 400, 24), r(1450, 1420, 300, 80),
    ],
    spawnHalf: [[240, 1250], [700, 1300], [450, 1110], [200, 1000]],
    pickHalf: [[1100, 1060, 'health'], [700, 820, 'armor'], [1080, 1220, 'ammo']],
    pickCenter: [[1600, 1420, 'health'], [1600, 720, 'armor'], [1450, 1300, 'ammo']],
  },
);

export const MAPS: Record<MapId, MapDef> = { military, desert, jungle };
export const MAP_ORDER: MapId[] = ['military', 'desert', 'jungle'];
