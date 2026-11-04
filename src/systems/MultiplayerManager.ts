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
import type { BatInput, CricketConfig, Delivery } from '../../shared/cricket';
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

  // ------------------------------------------------------------ connection

  private warming = false;
  private ready = false;
  private warmStart = 0;
  private watchdog: ReturnType<typeof setInterval> | null = null;

  constructor() {
    super();
    // coming back to the tab / app: reconnect right away if the link dropped while we were away
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.socket && this.status !== 'online') this.socket.connect();
    });
  }

  /** True while we are still waiting for a sleeping (free-tier) server to wake up. */
  get waking(): boolean {
    return this.warming && !this.ready;
  }

  get wakeSeconds(): number {
    return this.warming ? Math.round((Date.now() - this.warmStart) / 1000) : 0;
  }

  private sameOrigin(): boolean {
    try {
      return new URL(this.serverUrl(), window.location.href).origin === window.location.origin;
    } catch {
      return false;
    }
  }

  /** Make sure we are (or soon will be) connected. Safe to call repeatedly. */
  ensureConnected(): void {
    if (this.status === 'online') return;
    if (this.sameOrigin() || this.ready) this.connect();
    else this.warmUp();
  }

  /**
   * Free hosting (e.g. Render) puts the server to sleep when idle and needs up to a minute to wake.
   * Ping it until it answers, then connect — so players never have to refresh the page.
   */
  warmUp(): void {
    if (this.warming) return;
    this.warming = true;
    this.ready = false;
    this.warmStart = Date.now();
    if (this.status !== 'online') this.setStatus('connecting');
    if (this.sameOrigin()) {
      this.warming = false;
      this.ready = true;
      this.connect();
      return;
    }
    const url = this.serverUrl().replace(/\/+$/, '');
    const attempt = async (): Promise<void> => {
      try {
        const ctrl = new AbortController();
        const to = window.setTimeout(() => ctrl.abort(), 9000);
        const r = await fetch(`${url}/?w=${Date.now()}`, { cache: 'no-store', signal: ctrl.signal });
        window.clearTimeout(to);
        const j = (await r.json().catch(() => null)) as { game?: string } | null;
        if (r.ok && j?.game === 'jetfront') {
          this.ready = true;
          this.warming = false;
          this.emit('warm');
          if (this.status !== 'online') this.connect(true);
          return;
        }
      } catch {
        /* still asleep or offline: keep trying */
      }
      if (Date.now() - this.warmStart > 150000) {
        this.warming = false;
        this.setStatus('offline');
        return;
      }
      window.setTimeout(() => void attempt(), 2500);
    };
    void attempt();
  }

  /** Manual retry from the lobby. */
  retry(): void {
    this.ready = false;
    this.warming = false;
    this.socket?.removeAllListeners();
    this.socket?.disconnect();
    this.socket = null;
    this.warmUp();
  }

  /** (Re)connect using the currently configured server URL. */
  connect(force = false): void {
    if (this.socket && !force) return;
    this.socket?.removeAllListeners();
    this.socket?.disconnect();
    this.setStatus('connecting');
    const s: Sock = io(this.serverUrl(), {
      // long-polling first (works through proxies and cold starts), then upgrade to websocket
      transports: ['polling', 'websocket'],
      tryAllTransports: true,
      reconnection: true,
      reconnectionDelay: 700,
      reconnectionDelayMax: 2500,
      timeout: 10000,
    });
    this.socket = s;
    s.on('connect', () => this.setStatus('online'));
    s.on('disconnect', () => {
      this.room = null;
      this.setStatus('offline');
      this.emit('disconnected');
    });
    s.on('connect_error', () => this.setStatus('offline'));
    // belt and braces: if Socket.IO ever gives up retrying, kick it again
    if (this.watchdog) clearInterval(this.watchdog);
    this.watchdog = setInterval(() => {
      if (this.status !== 'online' && this.socket && !this.socket.active) this.socket.connect();
    }, 4000);

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
    s.on('cricket:start', (p) => this.emit('cstart', p));
    s.on('cricket:phase', (p) => this.emit('cphase', p));
    s.on('cricket:ball', (p) => this.emit('cball', p));
    s.on('cricket:result', (p) => this.emit('cresult', p));
    s.on('cricket:end', (p) => this.emit('cend', p));
    s.on('ludo:start', (p) => this.emit('lstart', p));
    s.on('ludo:event', (p) => this.emit('levent', p));
  }

  private setStatus(s: NetStatus): void {
    if (this.status === s) return;
    this.status = s;
    this.emit('status', s);
  }

  private ack<T>(fn: (cb: (res: T) => void) => void, fallback: T, ms = 9000): Promise<T> {
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

  createCricketRoom(name: string, cricket: CricketConfig, player: PlayerProfile): Promise<Ack<RoomDetail>> {
    return this.createRoom({ game: 'cricket', cricket, name, mode: 'deathmatch', mapId: 'military', player });
  }

  createLudoRoom(name: string, seats: number, player: PlayerProfile): Promise<Ack<RoomDetail>> {
    return this.createRoom({ game: 'ludo', ludo: { seats }, name, mode: 'deathmatch', mapId: 'military', player });
  }

  ludoRoll(): void {
    this.socket?.emit('ludo:roll');
  }

  ludoMove(token: number): void {
    this.socket?.emit('ludo:move', token);
  }

  cricketBowl(d: Delivery): void {
    this.socket?.emit('cricket:bowl', d);
  }

  cricketBat(i: BatInput): void {
    this.socket?.emit('cricket:bat', i);
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
