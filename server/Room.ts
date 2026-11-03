import type { Server, Socket } from 'socket.io';
import {
  MATCH_TIME_MS,
  MAX_ARMOR,
  MAX_HP,
  MAX_ROOM_PLAYERS,
  PICKUP_RESPAWN_MS,
  RESPAWN_MS,
  SCORE_LIMIT,
  SPAWN_PROTECT_MS,
  applyDamage,
  type ClientToServerEvents,
  type DeathPayload,
  type EndPayload,
  type GameModeId,
  type HitRequest,
  type MapId,
  type PlayerProfile,
  type PlayerSummary,
  type RoomDetail,
  type RoomInfo,
  type ScoreEntry,
  type ServerToClientEvents,
} from '../shared/protocol';

export type IO = Server<ClientToServerEvents, ServerToClientEvents>;
export type Sock = Socket<ClientToServerEvents, ServerToClientEvents>;

const SPAWN_SLOTS = 8;

interface ServerPlayer {
  id: string;
  profile: PlayerProfile;
  team: number;
  hp: number;
  armor: number;
  alive: boolean;
  protectedUntil: number;
  kills: number;
  deaths: number;
  spawn: number;
}

export class Room {
  readonly players = new Map<string, ServerPlayer>();
  hostId = '';
  playing = false;
  private endsAt = 0;
  private endTimer: NodeJS.Timeout | null = null;
  private respawnTimers = new Set<NodeJS.Timeout>();
  private pickupReadyAt = new Map<number, number>();
  private teamScores: [number, number] = [0, 0];

  constructor(
    private io: IO,
    readonly id: string,
    public name: string,
    public mode: GameModeId,
    public mapId: MapId,
  ) {}

  get size(): number {
    return this.players.size;
  }

  info(): RoomInfo {
    return {
      id: this.id,
      name: this.name,
      mode: this.mode,
      mapId: this.mapId,
      players: this.players.size,
      maxPlayers: MAX_ROOM_PLAYERS,
      playing: this.playing,
    };
  }

  detail(): RoomDetail {
    return { ...this.info(), hostId: this.hostId, members: [...this.players.values()].map((p) => this.summary(p)) };
  }

  private summary(p: ServerPlayer): PlayerSummary {
    return {
      id: p.id,
      name: p.profile.name,
      team: p.team,
      host: p.id === this.hostId,
      appearance: p.profile.appearance,
      primary: p.profile.primary,
      secondary: p.profile.secondary,
      spawn: p.spawn,
    };
  }

  private teamCounts(): [number, number] {
    const c: [number, number] = [0, 0];
    for (const p of this.players.values()) if (p.team === 0 || p.team === 1) c[p.team]++;
    return c;
  }

  add(sock: Sock, profile: PlayerProfile): void {
    const counts = this.teamCounts();
    const team = this.mode === 'team' ? (counts[0] <= counts[1] ? 0 : 1) : -1;
    this.players.set(sock.id, {
      id: sock.id,
      profile,
      team,
      hp: MAX_HP,
      armor: MAX_ARMOR,
      alive: true,
      protectedUntil: 0,
      kills: 0,
      deaths: 0,
      spawn: this.players.size % SPAWN_SLOTS,
    });
    if (!this.hostId) this.hostId = sock.id;
    sock.join(this.id);
    this.broadcastRoom();
  }

  remove(id: string, sock?: Sock): void {
    if (!this.players.delete(id)) return;
    sock?.leave(this.id);
    if (this.hostId === id) this.hostId = this.players.keys().next().value ?? '';
    if (this.playing) this.io.to(this.id).emit('game:left', { id });
    this.broadcastRoom();
    if (this.players.size === 0) this.dispose();
  }

  dispose(): void {
    if (this.endTimer) clearTimeout(this.endTimer);
    this.respawnTimers.forEach((t) => clearTimeout(t));
    this.respawnTimers.clear();
  }

  broadcastRoom(): void {
    this.io.to(this.id).emit('room:update', this.detail());
  }

  start(): void {
    if (this.playing) return;
    this.playing = true;
    this.teamScores = [0, 0];
    this.pickupReadyAt.clear();
    // Re-balance teams and hand out distinct spawn slots.
    const list = [...this.players.values()];
    const slots = Array.from({ length: SPAWN_SLOTS }, (_, i) => i).sort(() => Math.random() - 0.5);
    list.sort(() => Math.random() - 0.5);
    list.forEach((p, i) => {
      p.team = this.mode === 'team' ? i % 2 : -1;
      p.hp = MAX_HP;
      p.armor = MAX_ARMOR;
      p.alive = true;
      p.kills = 0;
      p.deaths = 0;
      p.protectedUntil = Date.now() + SPAWN_PROTECT_MS + 2500;
      p.spawn = slots[i % slots.length];
    });
    this.endsAt = Date.now() + MATCH_TIME_MS;
    this.io.to(this.id).emit('game:start', {
      mapId: this.mapId,
      mode: this.mode,
      players: list.map((p) => this.summary(p)),
      durationMs: MATCH_TIME_MS,
      scoreLimit: SCORE_LIMIT[this.mode],
    });
    this.endTimer = setTimeout(() => this.end(), MATCH_TIME_MS);
    this.broadcastRoom();
  }

  private scores(): ScoreEntry[] {
    return [...this.players.values()].map((p) => ({
      id: p.id,
      name: p.profile.name,
      team: p.team,
      kills: p.kills,
      deaths: p.deaths,
    }));
  }

  end(): void {
    if (!this.playing) return;
    this.playing = false;
    if (this.endTimer) clearTimeout(this.endTimer);
    this.endTimer = null;
    this.respawnTimers.forEach((t) => clearTimeout(t));
    this.respawnTimers.clear();
    const results = this.scores().sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
    let winnerTeam = -1;
    if (this.mode === 'team') {
      winnerTeam = this.teamScores[0] === this.teamScores[1] ? -1 : this.teamScores[0] > this.teamScores[1] ? 0 : 1;
    }
    const payload: EndPayload = { results, teamScores: this.teamScores, mode: this.mode, winnerTeam };
    this.io.to(this.id).emit('game:end', payload);
    this.broadcastRoom();
  }

  relayState(id: string, s: Parameters<ClientToServerEvents['game:state']>[0], sock: Sock): void {
    if (!this.playing) return;
    sock.volatile.to(this.id).emit('game:state', { id, ...s });
  }

  hit(attackerId: string, h: HitRequest): void {
    if (!this.playing) return;
    const attacker = this.players.get(attackerId);
    const target = this.players.get(h.t);
    if (!attacker || !target || !attacker.alive || !target.alive) return;
    const now = Date.now();
    if (target.protectedUntil > now) return;
    const self = attacker.id === target.id;
    if (!self && this.mode === 'team' && attacker.team === target.team) return;
    const dmg = Math.min(150, Math.max(1, Math.round(h.d)));
    const res = applyDamage(target.hp, target.armor, dmg);
    target.hp = res.hp;
    target.armor = res.armor;
    this.io.to(this.id).emit('game:damage', {
      t: target.id,
      a: attacker.id,
      hp: Math.round(target.hp),
      armor: Math.round(target.armor),
      d: dmg,
      w: h.w,
      hs: !!h.hs,
      ox: h.ox,
      oy: h.oy,
    });
    if (target.hp <= 0.01) this.kill(attacker, target, h);
  }

  private kill(attacker: ServerPlayer, target: ServerPlayer, h: HitRequest): void {
    target.alive = false;
    target.deaths++;
    if (attacker.id !== target.id) {
      attacker.kills++;
      if (this.mode === 'team' && attacker.team >= 0) this.teamScores[attacker.team]++;
    } else if (this.mode === 'team' && target.team >= 0) {
      this.teamScores[target.team] = Math.max(0, this.teamScores[target.team] - 1);
    }
    const payload: DeathPayload = {
      v: target.id,
      k: attacker.id,
      w: h.w,
      hs: !!h.hs,
      scores: this.scores(),
      teamScores: this.teamScores,
    };
    this.io.to(this.id).emit('game:death', payload);

    const limit = SCORE_LIMIT[this.mode];
    const lead = this.mode === 'team' ? Math.max(...this.teamScores) : Math.max(...[...this.players.values()].map((p) => p.kills));
    if (lead >= limit) {
      setTimeout(() => this.end(), 1200);
      return;
    }
    const t = setTimeout(() => {
      this.respawnTimers.delete(t);
      if (!this.playing || !this.players.has(target.id)) return;
      target.hp = MAX_HP;
      target.armor = MAX_ARMOR;
      target.alive = true;
      target.protectedUntil = Date.now() + SPAWN_PROTECT_MS;
      this.io.to(this.id).emit('game:respawn', { id: target.id, hp: target.hp, armor: target.armor });
    }, RESPAWN_MS);
    this.respawnTimers.add(t);
  }

  pickup(id: string, idx: number, kind: 'health' | 'armor' | 'ammo'): void {
    if (!this.playing) return;
    const p = this.players.get(id);
    if (!p || !p.alive) return;
    const now = Date.now();
    if ((this.pickupReadyAt.get(idx) ?? 0) > now) return;
    this.pickupReadyAt.set(idx, now + PICKUP_RESPAWN_MS);
    if (kind === 'health') p.hp = Math.min(MAX_HP, p.hp + 50);
    if (kind === 'armor') p.armor = Math.min(MAX_ARMOR, p.armor + 40);
    this.io.to(this.id).emit('game:pickupTaken', { idx, by: id });
    this.io.to(this.id).emit('game:vitals', { id, hp: Math.round(p.hp), armor: Math.round(p.armor) });
  }
}
