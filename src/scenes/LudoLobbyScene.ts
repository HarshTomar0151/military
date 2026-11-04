import Phaser from 'phaser';
import { LUDO_COLORS, LUDO_COLOR_NAMES, LUDO_SEAT_OPTIONS, seatColors, type LudoSeat, type LudoStartPayload } from '../../shared/ludo';
import type { RoomDetail, RoomInfo } from '../../shared/protocol';
import { COLORS, GAME_H, GAME_W, hex } from '../config';
import { promptText } from '../systems/DomPrompt';
import { net, type NetStatus } from '../systems/MultiplayerManager';
import { store } from '../systems/Storage';
import { roomCodeCard } from '../ui/RoomCode';
import { button, createBackdrop, display, fadeTo, panel, screenTitle, selector, ui } from '../ui/theme';
import type { LudoSceneData } from './LudoScene';

const GOLD = 0xffd166;

export class LudoLobbyScene extends Phaser.Scene {
  private view?: Phaser.GameObjects.Container;
  private status!: Phaser.GameObjects.Text;
  private dot!: Phaser.GameObjects.Arc;
  private rooms: RoomInfo[] = [];
  private pollTimer?: Phaser.Time.TimerEvent;
  private seats = 4;
  private roomName = '';
  private error = '';
  private starting = false;
  private joinCode = '';

  constructor() {
    super('LudoLobby');
  }

  init(data: { join?: string }): void {
    this.joinCode = data?.join ?? '';
  }

  create(): void {
    this.cameras.main.fadeIn(250, 0, 0, 0);
    createBackdrop(this);
    screenTitle(this, 'LUDO ONLINE', 'Create a room, share the code, and play with friends — 2 to 4 players');
    this.starting = false;
    this.error = '';
    this.roomName = `${store.data.name}'s Ludo`;
    this.seats = 4;

    button(this, 120, GAME_H - 52, 168, 46, '◀  BACK', () => {
      if (net.room) net.leaveRoom();
      fadeTo(this, 'LudoMenu');
    }, { fontSize: 15 });

    this.dot = this.add.circle(GAME_W - 220, 64, 6, 0xff3b3b);
    this.status = ui(this, GAME_W - 206, 64, '', 16, '#d8ffe0', { origin: [0, 0.5] });

    net.ensureConnected();
    net.on('status', this.onStatus, this);
    net.on('room', this.onRoom, this);
    net.on('lstart', this.onStart, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      net.off('status', this.onStatus, this);
      net.off('room', this.onRoom, this);
      net.off('lstart', this.onStart, this);
      this.pollTimer?.remove();
    });
    this.pollTimer = this.time.addEvent({ delay: 2500, loop: true, callback: () => void this.refresh() });
    this.onStatus(net.status);
    void this.refresh();
  }

  private onStatus = (s: NetStatus): void => {
    const map: Record<NetStatus, [string, number]> = {
      idle: ['IDLE', 0x7fa889], connecting: [net.waking ? 'WAKING UP SERVER…' : 'CONNECTING…', COLORS.amber], online: ['ONLINE', COLORS.neon], offline: ['SERVER OFFLINE', 0xff3b3b],
    };
    const [text, color] = map[s];
    this.status.setText(text).setColor(hex(color));
    this.dot.setFillStyle(color);
    if (s === 'online') {
      void this.refresh();
      void this.autoJoin();
    }
    this.render();
  };

  private async autoJoin(): Promise<void> {
    if (!this.joinCode || net.room) return;
    const code = this.joinCode;
    this.joinCode = '';
    await this.join(code);
  }

  private async joinByCode(): Promise<void> {
    const v = await promptText('ENTER ROOM CODE', '', 6);
    if (v) await this.join(v.trim().toUpperCase());
  }

  private onRoom = (): void => this.render();

  private onStart = (p: LudoStartPayload): void => {
    if (this.starting) return;
    this.starting = true;
    const seats: LudoSeat[] = p.state.seats;
    const data: LudoSceneData = { online: true, seats, mySeats: [Math.max(0, p.ids.indexOf(net.selfId))], ids: p.ids, startState: p.state };
    fadeTo(this, 'Ludo', data);
  };

  private async refresh(): Promise<void> {
    if (net.room) return;
    this.rooms = (await net.listRooms()).filter((r) => r.game === 'ludo');
    if (!net.room && this.sys?.isActive()) this.render();
  }

  private render(): void {
    if (!this.sys?.isActive()) return;
    this.view?.destroy();
    this.view = this.add.container(0, 0);
    if (net.room) this.renderRoom(net.room);
    else this.renderBrowser();
  }

  private add_(...o: Phaser.GameObjects.GameObject[]): void {
    this.view!.add(o);
  }

  private profile() {
    const d = store.data;
    return { name: d.name, appearance: d.appearance, primary: d.primary, secondary: d.secondary };
  }

  private renderBrowser(): void {
    const online = net.status === 'online';
    this.add_(panel(this, 56, 140, 720, 500, { title: 'OPEN LUDO ROOMS' }));
    this.add_(button(this, 672, 160, 170, 32, 'JOIN BY CODE', () => void this.joinByCode(), { fontSize: 12, disabled: !online }));
    if (!online) {
      const waking = net.waking || net.status === 'connecting';
      this.add_(
        display(this, 416, 320, waking ? 'WAKING UP THE SERVER…' : 'SERVER OFFLINE', 22, waking ? '#ffd166' : '#ff8a8a', [0.5, 0.5]),
        ui(this, 416, 366, waking ? `Free hosting sleeps when idle — this can take up to a minute (${net.wakeSeconds}s).\nIt connects by itself, no need to refresh.` : `Could not reach ${net.serverUrl()}`, 15, COLORS.textDim, { origin: [0.5, 0], align: 'center', width: 560 }),
        button(this, 416, 470, 220, 46, 'RETRY NOW', () => net.retry(), { fontSize: 14 }),
      );
    } else if (this.rooms.length === 0) {
      this.add_(
        display(this, 416, 350, 'NO ROOMS YET', 20, '#7fa889', [0.5, 0.5]),
        ui(this, 416, 386, 'Create one on the right and share the code with your friends.', 16, COLORS.textDim, { origin: [0.5, 0] }),
      );
    } else {
      this.rooms.slice(0, 7).forEach((r, i) => {
        const y = 200 + i * 62;
        const g = this.add.graphics();
        g.fillStyle(0x0a110c, 0.9).fillRect(80, y, 672, 54);
        g.lineStyle(1, COLORS.line, 1).strokeRect(80, y, 672, 54);
        this.add_(g,
          display(this, 98, y + 8, r.name, 16, '#d8ffe0'),
          ui(this, 98, y + 30, `${r.ludo?.seats ?? 4} SEATS · CODE ${r.id}`, 14, COLORS.textDim),
          display(this, 560, y + 27, `${r.players}/${r.maxPlayers}`, 16, hex(GOLD), [0.5, 0.5]),
          button(this, 686, y + 27, 110, 38, r.playing ? 'IN GAME' : 'JOIN', () => void this.join(r.id), { fontSize: 13, disabled: r.playing || r.players >= r.maxPlayers }),
        );
      });
    }

    this.add_(panel(this, 806, 140, 418, 500, { title: 'CREATE ROOM' }));
    this.add_(
      ui(this, 836, 206, 'ROOM NAME', 14, COLORS.textDim),
      button(this, 1015, 246, 360, 42, this.roomName, async () => {
        const v = await promptText('ROOM NAME', this.roomName, 20);
        if (v) {
          this.roomName = v;
          this.render();
        }
      }, { fontSize: 14 }),
      selector<number>(this, 836, 320, 360, 'PLAYERS', LUDO_SEAT_OPTIONS.map((n) => ({ value: n, text: String(n) })), this.seats, (v) => (this.seats = v)),
      ui(this, 836, 358, 'Empty seats are played by the computer.', 14, COLORS.textDim),
      button(this, 1015, 450, 340, 56, 'CREATE ROOM', () => void this.createRoom(), { primary: true, fontSize: 18, disabled: !online }),
      button(this, 1015, 520, 340, 40, '⟳  REFRESH', () => void this.refresh(), { fontSize: 13, disabled: !online }),
    );
    if (this.error) this.add_(ui(this, 1015, 584, this.error, 15, '#ff8a8a', { origin: [0.5, 0], width: 360, align: 'center' }));
  }

  private async createRoom(): Promise<void> {
    const res = await net.createLudoRoom(this.roomName, this.seats, this.profile());
    this.error = res.ok ? '' : res.error;
    this.render();
  }

  private async join(id: string): Promise<void> {
    const res = await net.joinRoom(id, this.profile(), 'ludo');
    this.error = res.ok ? '' : res.error;
    if (!res.ok) await this.refresh();
    this.render();
  }

  private renderRoom(room: RoomDetail): void {
    const isHost = room.hostId === net.selfId;
    const seatCount = room.ludo?.seats ?? 4;
    const colors = seatColors(seatCount);
    this.add_(panel(this, 56, 140, 720, 500, { title: `ROOM  ·  ${room.name.toUpperCase()}` }));
    this.add_(ui(this, 90, 196, `${seatCount} SEATS   ·   ROOM CODE ${room.id}`, 16, hex(GOLD)));

    for (let i = 0; i < seatCount; i++) {
      const m = room.members[i];
      const y = 232 + i * 94;
      const col = LUDO_COLORS[colors[i]];
      const g = this.add.graphics();
      g.fillStyle(0x0a110c, 0.9).fillRect(80, y, 672, 82);
      g.fillStyle(col, m ? 1 : 0.35).fillRect(80, y, 8, 82);
      g.lineStyle(1.5, m ? col : COLORS.line, m ? 0.9 : 0.6).strokeRect(80, y, 672, 82);
      g.fillStyle(col, m ? 1 : 0.35).fillCircle(130, y + 41, 22);
      g.lineStyle(3, 0xffffff, m ? 0.9 : 0.3).strokeCircle(130, y + 41, 22);
      this.add_(g);
      if (m) {
        this.add_(
          display(this, 170, y + 18, m.name.toUpperCase() + (m.id === net.selfId ? '  (YOU)' : ''), 20, '#d8ffe0'),
          ui(this, 170, y + 48, m.host ? '★ HOST' : 'READY', 16, m.host ? hex(GOLD) : hex(COLORS.neonDim)),
        );
      } else {
        this.add_(
          display(this, 170, y + 18, 'COMPUTER', 18, '#6f8577'),
          ui(this, 170, y + 48, 'Plays this seat unless a friend joins', 14, COLORS.textDim),
        );
      }
      this.add_(ui(this, 730, y + 30, LUDO_COLOR_NAMES[colors[i]], 14, hex(col), { origin: [1, 0] }));
    }

    this.add_(panel(this, 806, 140, 418, 500, { title: 'INVITE & START' }));
    this.add_(roomCodeCard(this, 826, 190, 378, room.id, 'ludo', GOLD));
    const ready = room.members.length >= 2;
    this.add_(
      ui(this, 836, 356, isHost ? (ready ? 'Everyone is here — press START MATCH!' : 'Send the code or link to your friends…') : `Only the host (${room.members.find((m) => m.host)?.name ?? 'host'}) can start the match. Waiting…`, 15, '#d8ffe0', { width: 360 }),
      ui(this, 836, 398, 'At least 2 human players needed. Empty seats become computer players.', 13, COLORS.textDim, { width: 360 }),
      button(this, 1015, 496, 340, 56, 'START MATCH', () => void this.startMatch(), { primary: true, fontSize: 20, disabled: !isHost || !ready }),
      button(this, 1015, 562, 340, 40, 'LEAVE ROOM', () => {
        net.leaveRoom();
        this.render();
        void this.refresh();
      }, { danger: true, fontSize: 14 }),
    );
    if (this.error) this.add_(ui(this, 1015, 612, this.error, 15, '#ff8a8a', { origin: [0.5, 0], width: 360 }));
  }

  private async startMatch(): Promise<void> {
    this.error = '';
    const res = await net.startMatch();
    if (!res.ok) {
      this.error = res.error;
      this.render();
      return;
    }
    // the server said OK but no match arrived: it is most likely running an old version
    this.time.delayedCall(5000, () => {
      if (!this.starting && net.room && this.sys?.isActive()) {
        this.error = 'The server did not start a Ludo match. It is probably out of date — redeploy the server with the latest code.';
        this.render();
      }
    });
  }
}
