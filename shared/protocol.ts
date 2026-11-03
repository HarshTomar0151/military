// Types and constants shared by the browser client and the Node server.
import type { BatInput, CricketBallPayload, CricketConfig, CricketEndPayload, CricketPhasePayload, CricketResultPayload, CricketStartPayload, Delivery } from './cricket';

export type GameKind = 'shooter' | 'cricket';

export type GameModeId = 'deathmatch' | 'team';
export type MapId = 'military' | 'desert' | 'jungle';

export const MAX_HP = 100;
export const MAX_ARMOR = 50;
export const ARMOR_ABSORB = 0.6;
export const RESPAWN_MS = 3000;
export const SPAWN_PROTECT_MS = 2200;
export const MATCH_TIME_MS = 5 * 60 * 1000;
export const SCORE_LIMIT: Record<GameModeId, number> = { deathmatch: 20, team: 30 };
export const PICKUP_RESPAWN_MS = 20000;
export const MAX_ROOM_PLAYERS = 8;
export const CRICKET_ROOM_PLAYERS = 2;
export const STATE_RATE_HZ = 20;

export interface Appearance {
  armor: number;
  helmet: number;
  skin: number;
  visor: number;
}

/** Armor soaks up to 60% of each hit until it is depleted. */
export function applyDamage(hp: number, armor: number, dmg: number): { hp: number; armor: number } {
  const absorbed = Math.min(armor, dmg * ARMOR_ABSORB);
  return { hp: Math.max(0, hp - (dmg - absorbed)), armor: armor - absorbed };
}

export interface PlayerSummary {
  id: string;
  name: string;
  team: number; // 0 / 1 in team mode, -1 otherwise
  host: boolean;
  appearance: Appearance;
  primary: string;
  secondary: string;
  spawn: number;
}

export interface RoomInfo {
  id: string;
  game: GameKind;
  cricket?: CricketConfig;
  name: string;
  mode: GameModeId;
  mapId: MapId;
  players: number;
  maxPlayers: number;
  playing: boolean;
}

export interface RoomDetail extends RoomInfo {
  hostId: string;
  members: PlayerSummary[];
}

export interface CreateRoomRequest {
  game?: GameKind;
  cricket?: CricketConfig;
  name: string;
  mode: GameModeId;
  mapId: MapId;
  player: PlayerProfile;
}

export interface PlayerProfile {
  name: string;
  appearance: Appearance;
  primary: string;
  secondary: string;
}

export interface JoinRoomRequest {
  roomId: string;
  player: PlayerProfile;
}

export type Ack<T> = { ok: true; data: T } | { ok: false; error: string };

export interface NetState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  aim: number;
  w: string; // current weapon id
  jet: boolean;
  gr: boolean; // grounded
}

export interface StartPayload {
  mapId: MapId;
  mode: GameModeId;
  players: PlayerSummary[];
  durationMs: number;
  scoreLimit: number;
}

export interface ScoreEntry {
  id: string;
  name: string;
  team: number;
  kills: number;
  deaths: number;
}

export interface DamagePayload {
  t: string; // target
  a: string; // attacker
  hp: number;
  armor: number;
  d: number;
  w: string;
  hs: boolean;
  ox: number;
  oy: number;
}

export interface DeathPayload {
  v: string;
  k: string;
  w: string;
  hs: boolean;
  scores: ScoreEntry[];
  teamScores: [number, number];
}

export interface EndPayload {
  results: ScoreEntry[];
  teamScores: [number, number];
  mode: GameModeId;
  winnerTeam: number; // -1 = none / ffa
}

export interface HitRequest {
  t: string;
  d: number;
  w: string;
  hs: boolean;
  ox: number;
  oy: number;
}

export interface ClientToServerEvents {
  'lobby:list': (ack: (rooms: RoomInfo[]) => void) => void;
  'room:create': (req: CreateRoomRequest, ack: (res: Ack<RoomDetail>) => void) => void;
  'room:join': (req: JoinRoomRequest, ack: (res: Ack<RoomDetail>) => void) => void;
  'room:leave': () => void;
  'room:start': (ack: (res: Ack<null>) => void) => void;
  'game:state': (s: NetState) => void;
  'game:fire': (f: { w: string; x: number; y: number; a: number }) => void;
  'game:grenade': (g: { x: number; y: number; vx: number; vy: number; k?: string }) => void;
  'game:hit': (h: HitRequest) => void;
  'game:pickup': (p: { idx: number; kind: 'health' | 'armor' | 'ammo' }) => void;
  'cricket:bowl': (d: Delivery) => void;
  'cricket:bat': (i: BatInput) => void;
}

export interface ServerToClientEvents {
  'room:update': (room: RoomDetail) => void;
  'game:start': (p: StartPayload) => void;
  'game:state': (s: NetState & { id: string }) => void;
  'game:fire': (f: { id: string; w: string; x: number; y: number; a: number }) => void;
  'game:grenade': (g: { id: string; x: number; y: number; vx: number; vy: number; k?: string }) => void;
  'game:damage': (d: DamagePayload) => void;
  'game:death': (d: DeathPayload) => void;
  'game:respawn': (r: { id: string; hp: number; armor: number }) => void;
  'game:vitals': (v: { id: string; hp: number; armor: number }) => void;
  'game:pickupTaken': (p: { idx: number; by: string }) => void;
  'game:left': (p: { id: string }) => void;
  'game:end': (e: EndPayload) => void;
  'cricket:start': (p: CricketStartPayload) => void;
  'cricket:phase': (p: CricketPhasePayload) => void;
  'cricket:ball': (p: CricketBallPayload) => void;
  'cricket:result': (p: CricketResultPayload) => void;
  'cricket:end': (p: CricketEndPayload) => void;
}
