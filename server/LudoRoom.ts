import { LudoEngine, seatColors, type LudoSeat } from '../shared/ludo';
import {
  type PlayerProfile,
  type PlayerSummary,
  type RoomDetail,
  type RoomInfo,
} from '../shared/protocol';
import type { IO, Sock } from './Room';

interface Member {
  id: string;
  profile: PlayerProfile;
}

/** One online Ludo match (2-4 seats). Empty seats are filled by computer players at start. */
export class LudoRoom {
  readonly members = new Map<string, Member>();
  hostId = '';
  playing = false;
  private engine: LudoEngine | null = null;
  private order: string[] = [];

  constructor(
    private io: IO,
    readonly id: string,
    public name: string,
    public seatCount: number,
  ) {}

  get maxPlayers(): number {
    return this.seatCount;
  }

  get size(): number {
    return this.members.size;
  }

  info(): RoomInfo {
    return {
      id: this.id,
      game: 'ludo',
      ludo: { seats: this.seatCount },
      name: this.name,
      mode: 'deathmatch',
      mapId: 'military',
      players: this.members.size,
      maxPlayers: this.seatCount,
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
      const seat = this.order.indexOf(id);
      if (seat >= 0) this.engine.setBot(seat); // the computer plays on for whoever left
      if (this.members.size === 0) this.dispose();
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

  start(): string | null {
    if (this.playing) return 'Match already running';
    if (this.members.size < 2) return 'Waiting for at least one more player';
    const humans = [...this.members.values()];
    const colors = seatColors(this.seatCount);
    const seats: LudoSeat[] = colors.map((color, i) => {
      const m = humans[i];
      return { color, name: m ? m.profile.name : `Computer ${i + 1}`, bot: !m };
    });
    this.order = colors.map((_, i) => humans[i]?.id ?? '');
    const room = this.id;
    this.playing = true;
    this.engine = new LudoEngine(seats, {
      event: (e) => {
        this.io.to(room).emit('ludo:event', e);
        if (e.type === 'over') {
          this.playing = false;
          this.engine?.dispose();
          this.engine = null;
          this.broadcastRoom();
        }
      },
      schedule: (ms, fn) => {
        const t = setTimeout(fn, ms);
        return () => clearTimeout(t);
      },
      rnd: Math.random,
    });
    this.io.to(room).emit('ludo:start', { seatCount: this.seatCount, ids: this.order, state: JSON.parse(JSON.stringify(this.engine.state)) });
    this.broadcastRoom();
    this.engine.begin();
    return null;
  }

  roll(id: string): void {
    const seat = this.order.indexOf(id);
    if (seat >= 0) this.engine?.roll(seat);
  }

  move(id: string, token: number): void {
    const seat = this.order.indexOf(id);
    if (seat >= 0 && Number.isInteger(token)) this.engine?.move(seat, token);
  }
}
