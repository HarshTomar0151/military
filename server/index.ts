import { createServer } from 'node:http';
import { Server } from 'socket.io';
import {
  MAX_ROOM_PLAYERS,
  type ClientToServerEvents,
  type PlayerProfile,
  type ServerToClientEvents,
} from '../shared/protocol';
import { DEFAULT_CRICKET, OVER_OPTIONS, WICKET_OPTIONS } from '../shared/cricket';
import { CricketRoom } from './CricketRoom';
import { Room, type Sock } from './Room';

type AnyRoom = Room | CricketRoom;

const PORT = Number(process.env.PORT ?? 3001);
const rooms = new Map<string, AnyRoom>();
const roomOf = new Map<string, string>(); // socket id -> room id

const httpServer = createServer((_req, res) => {
  res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
  res.end(JSON.stringify({ game: 'jetfront', ok: true, rooms: rooms.size }));
});

const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: '*' },
  pingInterval: 8000,
  pingTimeout: 12000,
});

const MODES = ['deathmatch', 'team'];
const MAPS = ['military', 'desert', 'jungle'];

function cleanProfile(p: PlayerProfile | undefined): PlayerProfile {
  const a = p?.appearance;
  return {
    name: String(p?.name ?? 'Operator').slice(0, 14) || 'Operator',
    appearance: {
      armor: Number(a?.armor) | 0,
      helmet: Number(a?.helmet) | 0,
      skin: Number(a?.skin) | 0,
      visor: Number(a?.visor) | 0,
    },
    primary: String(p?.primary ?? 'assault').slice(0, 16),
    secondary: String(p?.secondary ?? 'pistol').slice(0, 16),
  };
}

function newRoomId(): string {
  for (;;) {
    const id = Math.random().toString(36).slice(2, 6).toUpperCase();
    if (!rooms.has(id)) return id;
  }
}

function leave(sock: Sock): void {
  const rid = roomOf.get(sock.id);
  if (!rid) return;
  roomOf.delete(sock.id);
  const room = rooms.get(rid);
  if (!room) return;
  room.remove(sock.id, sock);
  if (room.size === 0) rooms.delete(rid);
}

io.on('connection', (sock: Sock) => {
  const room = (): AnyRoom | undefined => rooms.get(roomOf.get(sock.id) ?? '');
  const shooter = (): Room | undefined => {
    const r = room();
    return r instanceof Room ? r : undefined;
  };
  const cricket = (): CricketRoom | undefined => {
    const r = room();
    return r instanceof CricketRoom ? r : undefined;
  };

  sock.on('lobby:list', (ack) => {
    if (typeof ack === 'function') ack([...rooms.values()].map((r) => r.info()));
  });

  sock.on('room:create', (req, ack) => {
    if (typeof ack !== 'function') return;
    leave(sock);
    const id = newRoomId();
    const name = String(req?.name ?? 'Room').slice(0, 20) || 'Room';
    let r: AnyRoom;
    if (req?.game === 'cricket') {
      const overs = OVER_OPTIONS.includes(Number(req.cricket?.overs)) ? Number(req.cricket?.overs) : DEFAULT_CRICKET.overs;
      const wickets = WICKET_OPTIONS.includes(Number(req.cricket?.wickets)) ? Number(req.cricket?.wickets) : DEFAULT_CRICKET.wickets;
      r = new CricketRoom(io, id, name, { overs, wickets });
    } else {
      const mode = MODES.includes(req?.mode) ? req.mode : 'deathmatch';
      const mapId = MAPS.includes(req?.mapId) ? req.mapId : 'military';
      r = new Room(io, id, name, mode, mapId);
    }
    rooms.set(id, r);
    r.add(sock, cleanProfile(req?.player));
    roomOf.set(sock.id, id);
    ack({ ok: true, data: r.detail() });
  });

  sock.on('room:join', (req, ack) => {
    if (typeof ack !== 'function') return;
    const r = rooms.get(String(req?.roomId));
    if (!r) return ack({ ok: false, error: 'Room no longer exists' });
    if (r.playing) return ack({ ok: false, error: 'Match already in progress' });
    const max = r instanceof CricketRoom ? r.maxPlayers : MAX_ROOM_PLAYERS;
    if (r.size >= max) return ack({ ok: false, error: 'Room is full' });
    leave(sock);
    r.add(sock, cleanProfile(req.player));
    roomOf.set(sock.id, r.id);
    ack({ ok: true, data: r.detail() });
  });

  sock.on('room:leave', () => leave(sock));

  sock.on('room:start', (ack) => {
    const r = room();
    if (typeof ack !== 'function') return;
    if (!r) return ack({ ok: false, error: 'Not in a room' });
    if (r.hostId !== sock.id) return ack({ ok: false, error: 'Only the host can start' });
    if (r instanceof CricketRoom) {
      const err = r.start();
      return err ? ack({ ok: false, error: err }) : ack({ ok: true, data: null });
    }
    r.start();
    ack({ ok: true, data: null });
  });

  // ---- shooter
  sock.on('game:state', (s) => shooter()?.relayState(sock.id, s, sock));
  sock.on('game:fire', (f) => {
    if (shooter()?.playing) sock.to(roomOf.get(sock.id)!).emit('game:fire', { id: sock.id, ...f });
  });
  sock.on('game:grenade', (g) => {
    if (shooter()?.playing) sock.to(roomOf.get(sock.id)!).emit('game:grenade', { id: sock.id, ...g });
  });
  sock.on('game:hit', (h) => shooter()?.hit(sock.id, h));
  sock.on('game:pickup', (p) => shooter()?.pickup(sock.id, p.idx, p.kind));

  // ---- cricket
  sock.on('cricket:bowl', (d) => cricket()?.bowl(sock.id, d));
  sock.on('cricket:bat', (i) => cricket()?.bat(sock.id, i));

  sock.on('disconnect', () => leave(sock));
});

httpServer.listen(PORT, () => {
  console.log(`[jetfront] server listening on :${PORT}`);
});
