import Phaser from 'phaser';
import type { GameModeId, MapId, RoomDetail, RoomInfo, StartPayload } from '../../shared/protocol';
import { COLORS, GAME_H, GAME_W, hex } from '../config';
import { MAP_ORDER, MAPS } from '../data/maps';
import { net, type NetStatus } from '../systems/MultiplayerManager';
import { store } from '../systems/Storage';
import { roomCodeCard } from '../ui/RoomCode';
import { backButton, button, createBackdrop, display, fadeTo, panel, screenTitle, selector, ui } from '../ui/theme';
import type { GameConfig } from './GameScene';

const MODE_TEXT: Record<GameModeId, string> = { deathmatch: 'DEATHMATCH', team: 'TEAM DM' };

export class LobbyScene extends Phaser.Scene {
  private view?: Phaser.GameObjects.Container;
  private status!: Phaser.GameObjects.Text;
  private dot!: Phaser.GameObjects.Arc;
  private rooms: RoomInfo[] = [];
  private pollTimer?: Phaser.Time.TimerEvent;
  private create_ = { name: '', mode: 'deathmatch' as GameModeId, mapId: 'military' as MapId };
  private error = '';
  private starting = false;

  private joinCode = '';

  constructor() {
    super('Lobby');
  }

  init(data: { join?: string }): void {
    this.joinCode = data?.join ?? '';
  }

  create(): void {
    this.cameras.main.fadeIn(250, 0, 0, 0);
    createBackdrop(this);
    screenTitle(this, 'MULTIPLAYER', 'Create or join a room — up to 8 operators');
    this.starting = false;
    this.error = '';
    this.create_.name = `${store.data.name}'s Room`;
    backButton(this).on('pointerdown', () => undefined);

    this.dot = this.add.circle(GAME_W - 220, 64, 6, 0xff3b3b);
    this.status = ui(this, GAME_W - 206, 64, '', 16, '#d8ffe0', { origin: [0, 0.5] });

    net.ensureConnected();
    net.on('status', this.onStatus, this);
    net.on('room', this.onRoom, this);
    net.on('start', this.onStart, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      net.off('status', this.onStatus, this);
      net.off('room', this.onRoom, this);
      net.off('start', this.onStart, this);
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
    const { promptText } = await import('../systems/DomPrompt');
    const v = await promptText('ENTER ROOM CODE', '', 6);
    if (v) await this.join(v.trim().toUpperCase());
  }

  private onRoom = (): void => this.render();

  private onStart = (p: StartPayload): void => {
    if (this.starting) return;
    this.starting = true;
    const cfg: GameConfig = { online: true, mode: p.mode, mapId: p.mapId, bots: 0, difficulty: 'normal', start: p };
    fadeTo(this, 'Game', cfg);
  };

  private async refresh(): Promise<void> {
    if (net.room) return;
    this.rooms = (await net.listRooms()).filter((r) => r.game === 'shooter');
    if (!net.room && this.scene.isActive()) this.render();
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

  // ---------------------------------------------------------------- browser

  private renderBrowser(): void {
    const online = net.status === 'online';
    this.add_(panel(this, 56, 140, 720, 500, { title: 'OPEN ROOMS' }));
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
        ui(this, 416, 386, 'Create one on the right and invite friends.', 16, COLORS.textDim, { origin: [0.5, 0] }),
      );
    } else {
      this.rooms.slice(0, 7).forEach((r, i) => {
        const y = 200 + i * 62;
        const g = this.add.graphics();
        g.fillStyle(0x0a110c, 0.9).fillRect(80, y, 672, 54);
        g.lineStyle(1, COLORS.line, 1).strokeRect(80, y, 672, 54);
        this.add_(g,
          display(this, 98, y + 8, r.name, 16, '#d8ffe0'),
          ui(this, 98, y + 30, `${MODE_TEXT[r.mode]}  ·  ${MAPS[r.mapId].name}`, 14, COLORS.textDim),
          display(this, 560, y + 27, `${r.players}/${r.maxPlayers}`, 16, hex(COLORS.neon), [0.5, 0.5]),
          button(this, 686, y + 27, 110, 38, r.playing ? 'IN GAME' : 'JOIN', () => void this.join(r.id), { fontSize: 13, disabled: r.playing || r.players >= r.maxPlayers }),
        );
      });
    }

    this.add_(panel(this, 806, 140, 418, 500, { title: 'CREATE ROOM' }));
    this.add_(
      ui(this, 836, 206, 'ROOM NAME', 14, COLORS.textDim),
      button(this, 1015, 246, 360, 42, this.create_.name, async () => {
        const { promptText } = await import('../systems/DomPrompt');
        const v = await promptText('ROOM NAME', this.create_.name, 20);
        if (v) {
          this.create_.name = v;
          this.render();
        }
      }, { fontSize: 14 }),
    );
    this.add_(
      selector<GameModeId>(this, 836, 312, 360, 'MODE', [{ value: 'deathmatch', text: 'DEATHMATCH' }, { value: 'team', text: 'TEAM DM' }], this.create_.mode, (v) => (this.create_.mode = v)),
      selector<MapId>(this, 836, 368, 360, 'MAP', MAP_ORDER.map((id) => ({ value: id, text: MAPS[id].name.split(' ')[0] })), this.create_.mapId, (v) => (this.create_.mapId = v)),
      button(this, 1015, 450, 340, 56, 'CREATE ROOM', () => void this.createRoom(), { primary: true, fontSize: 18, disabled: !online }),
      button(this, 1015, 520, 340, 40, '⟳  REFRESH', () => void this.refresh(), { fontSize: 13, disabled: !online }),
    );
    if (this.error) this.add_(ui(this, 1015, 584, this.error, 15, '#ff8a8a', { origin: [0.5, 0], width: 360, align: 'center' }));
  }

  private profile() {
    const d = store.data;
    return { name: d.name, appearance: d.appearance, primary: d.primary, secondary: d.secondary };
  }

  private async createRoom(): Promise<void> {
    const res = await net.createRoom({ name: this.create_.name, mode: this.create_.mode, mapId: this.create_.mapId, player: this.profile() });
    this.error = res.ok ? '' : res.error;
    this.render();
  }

  private async join(id: string): Promise<void> {
    const res = await net.joinRoom(id, this.profile());
    this.error = res.ok ? '' : res.error;
    if (!res.ok) await this.refresh();
    this.render();
  }

  // ------------------------------------------------------------------- room

  private renderRoom(room: RoomDetail): void {
    const isHost = room.hostId === net.selfId;
    this.add_(panel(this, 56, 140, 720, 500, { title: `ROOM  ·  ${room.name.toUpperCase()}` }));
    this.add_(
      ui(this, 90, 196, `${MODE_TEXT[room.mode]}   ·   ${MAPS[room.mapId].name}   ·   CODE ${room.id}`, 16, hex(COLORS.neon)),
    );
    room.members.forEach((m, i) => {
      const y = 232 + i * 46;
      const g = this.add.graphics();
      g.fillStyle(0x0a110c, 0.9).fillRect(80, y, 672, 40);
      const tc = m.team === 0 ? COLORS.team0 : m.team === 1 ? COLORS.team1 : COLORS.neonDim;
      g.fillStyle(tc, 1).fillRect(80, y, 5, 40);
      if (m.id === net.selfId) g.lineStyle(1.5, COLORS.neon, 0.9).strokeRect(80, y, 672, 40);
      this.add_(g,
        ui(this, 100, y + 9, `${m.name}${m.id === net.selfId ? '  (you)' : ''}`, 18, '#d8ffe0'),
        ui(this, 560, y + 10, m.host ? '★ HOST' : 'READY', 15, m.host ? hex(COLORS.amber) : hex(COLORS.neonDim)),
        ui(this, 730, y + 10, room.mode === 'team' ? (m.team === 0 ? 'BLUE' : 'RED') : '', 15, m.team === 0 ? '#5ab8ff' : '#ff7a5a', { origin: [1, 0] }),
      );
    });

    this.add_(panel(this, 806, 140, 418, 500, { title: 'INVITE & START' }));
    this.add_(roomCodeCard(this, 826, 190, 378, room.id, 'shooter'));
    this.add_(
      ui(this, 836, 356, isHost ? 'You are the host. Start when everyone has joined.' : 'Waiting for the host to start…', 15, '#d8ffe0', { width: 360 }),
      ui(this, 836, 398, 'Teams are balanced automatically. First to 20 kills (30 in teams) or 5 minutes.', 13, COLORS.textDim, { width: 360 }),
      button(this, 1015, 496, 340, 56, 'START MATCH', () => void this.startMatch(), { primary: true, fontSize: 20, disabled: !isHost }),
      button(this, 1015, 562, 340, 40, 'LEAVE ROOM', () => {
        net.leaveRoom();
        this.render();
        void this.refresh();
      }, { danger: true, fontSize: 14 }),
    );
    if (this.error) this.add_(ui(this, 1015, 612, this.error, 15, '#ff8a8a', { origin: [0.5, 0], width: 360 }));
  }

  private async startMatch(): Promise<void> {
    const res = await net.startMatch();
    if (!res.ok) {
      this.error = res.error;
      this.render();
    }
  }
}

