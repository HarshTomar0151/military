import {
  CRICKET_ROOM_PLAYERS,
  type PlayerProfile,
  type PlayerSummary,
  type RoomDetail,
  type RoomInfo,
} from '../shared/protocol';
import { CricketEngine, type CricketConfig } from '../shared/cricket';
import type { IO, Sock } from './Room';

interface Member {
  id: string;
  profile: PlayerProfile;
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** One online cricket match (2 players). The CricketEngine decides every ball, so results are server-authoritative. */
export class CricketRoom {
  readonly maxPlayers = CRICKET_ROOM_PLAYERS;
  readonly members = new Map<string, Member>();
  hostId = '';
  playing = false;
  private engine: CricketEngine | null = null;
  private order: string[] = [];

  constructor(
    private io: IO,
    readonly id: string,
    public name: string,
    public cfg: CricketConfig,
  ) {}

  get size(): number {
    return this.members.size;
  }

  info(): RoomInfo {
    return {
      id: this.id,
      game: 'cricket',
      cricket: this.cfg,
      name: this.name,
      mode: 'deathmatch',
      mapId: 'military',
      players: this.members.size,
      maxPlayers: this.maxPlayers,
      playing: this.playing,
    };
  }

  detail(): RoomDetail {
    const list: PlayerSummary[] = [...this.members.values()].map((m) => ({
      id: m.id,
      name: m.profile.name,
      team: -1,
      host: m.id === this.hostId,
      appearance: m.profile.appearance,
      primary: m.profile.primary,
      secondary: m.profile.secondary,
      spawn: 0,
    }));
    return { ...this.info(), hostId: this.hostId, members: list };
  }

  add(sock: Sock, profile: PlayerProfile): void {
    this.members.set(sock.id, { id: sock.id, profile });
    if (!this.hostId) this.hostId = sock.id;
    sock.join(this.id);
    this.broadcastRoom();
  }

  remove(id: string, sock?: Sock): void {
    if (!this.members.delete(id)) return;
    sock?.leave(this.id);
    if (this.playing && this.engine) {
      const idx = this.order.indexOf(id);
      if (idx >= 0) this.engine.forfeit(idx);
    }
    if (this.hostId === id) this.hostId = this.members.keys().next().value ?? '';
    this.broadcastRoom();
    if (this.members.size === 0) this.dispose();
  }

  dispose(): void {
    this.engine?.dispose();
    this.engine = null;
  }

  broadcastRoom(): void {
    this.io.to(this.id).emit('room:update', this.detail());
  }

  /** Returns an error message, or null on success. */
  start(): string | null {
    if (this.playing) return 'Match already running';
    if (this.members.size < 2) return 'Waiting for an opponent to join';
    const ids = [...this.members.keys()];
    if (Math.random() < 0.5) ids.reverse();
    this.order = ids;
    const names: [string, string] = [this.members.get(ids[0])!.profile.name, this.members.get(ids[1])!.profile.name];
    const first: 0 | 1 = Math.random() < 0.5 ? 0 : 1;
    const room = this.id;
    this.playing = true;
    this.engine = new CricketEngine(this.cfg, names, first, {
      phase: (p) => this.io.to(room).emit('cricket:phase', clone(p)),
      ball: (p) => this.io.to(room).emit('cricket:ball', p),
      result: (p) => this.io.to(room).emit('cricket:result', clone(p)),
      end: (p) => {
        this.io.to(room).emit('cricket:end', clone(p));
        this.playing = false;
        this.engine?.dispose();
        this.engine = null;
        this.broadcastRoom();
      },
      schedule: (ms, fn) => {
        const t = setTimeout(fn, ms);
        return () => clearTimeout(t);
      },
      rnd: Math.random,
    });
    this.io.to(room).emit('cricket:start', {
      cfg: this.cfg,
      players: ids.map((id) => ({ id, name: this.members.get(id)!.profile.name })),
      state: clone(this.engine.state),
    });
    this.broadcastRoom();
    this.engine.begin();
    return null;
  }

  bowl(id: string, d: Parameters<CricketEngine['bowl']>[1]): void {
    const i = this.order.indexOf(id);
    if (i >= 0) this.engine?.bowl(i, d);
  }

  bat(id: string, input: Parameters<CricketEngine['bat']>[1]): void {
    const i = this.order.indexOf(id);
    if (i >= 0) this.engine?.bat(i, input);
  }
}
