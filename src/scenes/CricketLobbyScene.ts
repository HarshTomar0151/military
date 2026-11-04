import Phaser from 'phaser';
import { DEFAULT_CRICKET, OVER_OPTIONS, WICKET_OPTIONS, type CricketConfig } from '../../shared/cricket';
import type { CricketStartPayload } from '../../shared/cricket';
import type { RoomDetail, RoomInfo } from '../../shared/protocol';
import { COLORS, GAME_H, GAME_W, hex } from '../config';
import { promptText } from '../systems/DomPrompt';
import { net, type NetStatus } from '../systems/MultiplayerManager';
import { store } from '../systems/Storage';
import { TEAM_COLORS } from '../cricket/CricketView';
import { roomCodeCard } from '../ui/RoomCode';
import { button, createBackdrop, display, fadeTo, panel, screenTitle, selector, ui } from '../ui/theme';
import type { CricketSceneData } from './CricketScene';

const GOLD = 0xffd166;

export class CricketLobbyScene extends Phaser.Scene {
  private view?: Phaser.GameObjects.Container;
  private status!: Phaser.GameObjects.Text;
  private dot!: Phaser.GameObjects.Arc;
  private rooms: RoomInfo[] = [];
  private pollTimer?: Phaser.Time.TimerEvent;
  private cfg: CricketConfig = { ...DEFAULT_CRICKET };
  private roomName = '';
  private error = '';
  private starting = false;

  private joinCode = '';

  constructor() {
    super('CricketLobby');
  }

  init(data: { join?: string }): void {
    this.joinCode = data?.join ?? '';
  }

  create(): void {
    this.cameras.main.fadeIn(250, 0, 0, 0);
    createBackdrop(this);
    screenTitle(this, 'CRICKET ONLINE', 'Create a room and share it with a friend — 1 v 1');
    this.starting = false;
    this.error = '';
    this.roomName = `${store.data.name}'s Match`;
    this.cfg = { ...DEFAULT_CRICKET };

    button(this, 120, GAME_H - 52, 168, 46, '◀  BACK', () => {
      if (net.room) net.leaveRoom();
      fadeTo(this, 'CricketMenu');
    }, { fontSize: 15 });

    this.dot = this.add.circle(GAME_W - 220, 64, 6, 0xff3b3b);
    this.status = ui(this, GAME_W - 206, 64, '', 16, '#d8ffe0', { origin: [0, 0.5] });

    net.ensureConnected();
    net.on('status', this.onStatus, this);
    net.on('room', this.onRoom, this);
    net.on('cstart', this.onStart, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      net.off('status', this.onStatus, this);
      net.off('room', this.onRoom, this);
      net.off('cstart', this.onStart, this);
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

  /** Opened from a shared invite link: join that room as soon as we are connected. */
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

  private onStart = (p: CricketStartPayload): void => {
    if (this.starting) return;
    this.starting = true;
    const myIdx = Math.max(0, p.players.findIndex((pl) => pl.id === net.selfId)) as 0 | 1;
    const data: CricketSceneData = {
      online: true,
      cfg: p.cfg,
      names: [p.players[0].name, p.players[1].name],
      myIdx,
      firstBat: p.state.batting,
      startState: p.state,
    };
    fadeTo(this, 'Cricket', data);
  };

  private async refresh(): Promise<void> {
    if (net.room) return;
    this.rooms = (await net.listRooms()).filter((r) => r.game === 'cricket');
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

  // ---------------------------------------------------------------- browser

  private renderBrowser(): void {
    const online = net.status === 'online';
    this.add_(panel(this, 56, 140, 720, 500, { title: 'OPEN CRICKET ROOMS' }));
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
        ui(this, 416, 386, 'Create one on the right and send the friend your room name.', 16, COLORS.textDim, { origin: [0.5, 0] }),
      );
    } else {
      this.rooms.slice(0, 7).forEach((r, i) => {
        const y = 200 + i * 62;
        const g = this.add.graphics();
        g.fillStyle(0x0a110c, 0.9).fillRect(80, y, 672, 54);
        g.lineStyle(1, COLORS.line, 1).strokeRect(80, y, 672, 54);
        const c = r.cricket ?? DEFAULT_CRICKET;
        this.add_(g,
          display(this, 98, y + 8, r.name, 16, '#d8ffe0'),
          ui(this, 98, y + 30, `${c.overs} OVERS · ${c.wickets} WICKETS`, 14, COLORS.textDim),
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
      selector<number>(this, 836, 312, 360, 'OVERS', OVER_OPTIONS.map((n) => ({ value: n, text: String(n) })), this.cfg.overs, (v) => (this.cfg.overs = v)),
      selector<number>(this, 836, 368, 360, 'WICKETS', WICKET_OPTIONS.map((n) => ({ value: n, text: String(n) })), this.cfg.wickets, (v) => (this.cfg.wickets = v)),
      button(this, 1015, 450, 340, 56, 'CREATE ROOM', () => void this.createRoom(), { primary: true, fontSize: 18, disabled: !online }),
      button(this, 1015, 520, 340, 40, '⟳  REFRESH', () => void this.refresh(), { fontSize: 13, disabled: !online }),
    );
    if (this.error) this.add_(ui(this, 1015, 584, this.error, 15, '#ff8a8a', { origin: [0.5, 0], width: 360, align: 'center' }));
  }

  private async createRoom(): Promise<void> {
    const res = await net.createCricketRoom(this.roomName, { ...this.cfg }, this.profile());
    this.error = res.ok ? '' : res.error;
    this.render();
  }

  private async join(id: string): Promise<void> {
    const res = await net.joinRoom(id, this.profile(), 'cricket');
    this.error = res.ok ? '' : res.error;
    if (!res.ok) await this.refresh();
    this.render();
  }

  // ------------------------------------------------------------------- room

  private renderRoom(room: RoomDetail): void {
    const isHost = room.hostId === net.selfId;
    const c = room.cricket ?? DEFAULT_CRICKET;
    this.add_(panel(this, 56, 140, 720, 500, { title: `ROOM  ·  ${room.name.toUpperCase()}` }));
    this.add_(ui(this, 90, 196, `${c.overs} OVERS   ·   ${c.wickets} WICKETS   ·   ROOM CODE ${room.id}`, 16, hex(GOLD)));

    for (let i = 0; i < 2; i++) {
      const m = room.members[i];
      const y = 250 + i * 150;
      const g = this.add.graphics();
      const col = TEAM_COLORS[i];
      g.fillStyle(0x0a110c, 0.9).fillRect(80, y, 672, 120);
      g.fillStyle(col, m ? 1 : 0.3).fillRect(80, y, 6, 120);
      g.lineStyle(1.5, m ? col : COLORS.line, m ? 0.9 : 0.6).strokeRect(80, y, 672, 120);
      this.add_(g);
      if (m) {
        this.add_(
          display(this, 112, y + 24, m.name.toUpperCase() + (m.id === net.selfId ? '  (YOU)' : ''), 24, '#d8ffe0'),
          ui(this, 112, y + 66, m.host ? '★ HOST' : 'READY', 18, m.host ? hex(GOLD) : hex(COLORS.neonDim)),
          ui(this, 730, y + 40, `PLAYER ${i + 1}`, 14, COLORS.textDim, { origin: [1, 0] }),
        );
      } else {
        this.add_(display(this, 112, y + 44, 'WAITING FOR OPPONENT…', 18, '#4d6655'));
        const dots = ui(this, 112, y + 78, 'Share the room name — they can find it in the room list', 14, COLORS.textDim);
        this.add_(dots);
      }
    }

    this.add_(panel(this, 806, 140, 418, 500, { title: 'INVITE & START' }));
    this.add_(roomCodeCard(this, 826, 190, 378, room.id, 'cricket', GOLD));
    const ready = room.members.length >= 2;
    this.add_(
      ui(this, 836, 356, isHost ? (ready ? 'Opponent joined — press START MATCH!' : 'Send the code or link to your friend…') : `Only the host (${room.members.find((m) => m.host)?.name ?? 'host'}) can start the match. Waiting…`, 15, '#d8ffe0', { width: 360 }),
      ui(this, 836, 398, 'Toss decides who bats first. Every ball is decided by the server — fair for both.', 13, COLORS.textDim, { width: 360 }),
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
    this.time.delayedCall(5000, () => {
      if (!this.starting && net.room && this.sys?.isActive()) {
        this.error = 'The server did not start the match. It is probably out of date — redeploy the server with the latest code.';
        this.render();
      }
    });
  }
}
