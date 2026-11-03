import Phaser from 'phaser';
import { io, type Socket } from 'socket.io-client';
import type {
  Ack,
  ClientToServerEvents,
  CreateRoomRequest,
  HitRequest,
  NetState,
  PlayerProfile,
  RoomDetail,
  RoomInfo,
  ServerToClientEvents,
} from '../../shared/protocol';
import { store } from './Storage';

export type NetStatus = 'idle' | 'connecting' | 'online' | 'offline';
type Sock = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * Thin Socket.IO wrapper shared by the lobby and the match. Re-emits every server
 * event on a Phaser EventEmitter so scenes can subscribe / unsubscribe freely.
 */
export class MultiplayerManager extends Phaser.Events.EventEmitter {
  private socket: Sock | null = null;
  status: NetStatus = 'idle';
  room: RoomDetail | null = null;
  lastStart: import('../../shared/protocol').StartPayload | null = null;

  get selfId(): string {
    return this.socket?.id ?? '';
  }

  get connected(): boolean {
    return this.status === 'online';
  }

  serverUrl(): string {
    const custom = store.settings.serverUrl.trim();
    if (custom) return custom;
    const env = import.meta.env.VITE_SERVER_URL as string | undefined;
    return env || window.location.origin;
  }

  /** (Re)connect using the currently configured server URL. */
  connect(force = false): void {
    if (this.socket && !force) return;
    this.socket?.removeAllListeners();
    this.socket?.disconnect();
    this.setStatus('connecting');
    const s: Sock = io(this.serverUrl(), {
      transports: ['websocket', 'polling'],
      reconnectionDelay: 800,
      reconnectionDelayMax: 3000,
      timeout: 5000,
    });
    this.socket = s;
    s.on('connect', () => this.setStatus('online'));
    s.on('disconnect', () => {
      this.room = null;
      this.setStatus('offline');
      this.emit('disconnected');
    });
    s.on('connect_error', () => this.setStatus('offline'));

    s.on('room:update', (r) => {
      this.room = r;
      this.emit('room', r);
    });
    s.on('game:start', (p) => {
      this.lastStart = p;
      this.emit('start', p);
    });
    s.on('game:state', (p) => this.emit('state', p));
    s.on('game:fire', (p) => this.emit('fire', p));
    s.on('game:grenade', (p) => this.emit('grenade', p));
    s.on('game:damage', (p) => this.emit('damage', p));
    s.on('game:death', (p) => this.emit('death', p));
    s.on('game:respawn', (p) => this.emit('respawn', p));
    s.on('game:vitals', (p) => this.emit('vitals', p));
    s.on('game:pickupTaken', (p) => this.emit('pickupTaken', p));
    s.on('game:left', (p) => this.emit('left', p));
    s.on('game:end', (p) => this.emit('end', p));
  }

  private setStatus(s: NetStatus): void {
    if (this.status === s) return;
    this.status = s;
    this.emit('status', s);
  }

  private ack<T>(fn: (cb: (res: T) => void) => void, fallback: T, ms = 4000): Promise<T> {
    return new Promise((resolve) => {
      const t = setTimeout(() => resolve(fallback), ms);
      fn((res) => {
        clearTimeout(t);
        resolve(res);
      });
    });
  }

  listRooms(): Promise<RoomInfo[]> {
    if (!this.socket?.connected) return Promise.resolve([]);
    return this.ack<RoomInfo[]>((cb) => this.socket!.emit('lobby:list', cb), []);
  }

  createRoom(req: CreateRoomRequest): Promise<Ack<RoomDetail>> {
    return this.ack<Ack<RoomDetail>>(
      (cb) => this.socket!.emit('room:create', req, cb),
      { ok: false, error: 'Server did not respond' },
    ).then((r) => this.adopt(r));
  }

  joinRoom(roomId: string, player: PlayerProfile): Promise<Ack<RoomDetail>> {
    return this.ack<Ack<RoomDetail>>(
      (cb) => this.socket!.emit('room:join', { roomId, player }, cb),
      { ok: false, error: 'Server did not respond' },
    ).then((r) => this.adopt(r));
  }

  private adopt(r: Ack<RoomDetail>): Ack<RoomDetail> {
    if (r.ok) this.room = r.data;
    return r;
  }

  startMatch(): Promise<Ack<null>> {
    return this.ack<Ack<null>>((cb) => this.socket!.emit('room:start', cb), { ok: false, error: 'Server did not respond' });
  }

  leaveRoom(): void {
    this.socket?.emit('room:leave');
    this.room = null;
  }

  sendState(s: NetState): void {
    this.socket?.volatile.emit('game:state', s);
  }
  sendFire(f: { w: string; x: number; y: number; a: number }): void {
    this.socket?.emit('game:fire', f);
  }
  sendGrenade(g: { x: number; y: number; vx: number; vy: number; k?: string }): void {
    this.socket?.emit('game:grenade', g);
  }
  sendHit(h: HitRequest): void {
    this.socket?.emit('game:hit', h);
  }
  sendPickup(idx: number, kind: 'health' | 'armor' | 'ammo'): void {
    this.socket?.emit('game:pickup', { idx, kind });
  }
}

export const net = new MultiplayerManager();
