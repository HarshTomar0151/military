import Phaser from 'phaser';
import { COLORS, FONT_DISPLAY, GAME_H, GAME_W, hex } from '../config';
import { MAPS } from '../data/maps';
import { audio } from '../systems/AudioManager';
import { net } from '../systems/MultiplayerManager';
import { store } from '../systems/Storage';
import { button, createBackdrop, display, fadeTo, panel, ui } from '../ui/theme';
import type { ResultsData } from './GameScene';

export class ResultsScene extends Phaser.Scene {
  private data_!: ResultsData;

  constructor() {
    super('Results');
  }

  init(data: ResultsData): void {
    this.data_ = data;
  }

  create(): void {
    const d = this.data_;
    this.cameras.main.fadeIn(400, 0, 0, 0);
    createBackdrop(this);

    const draw = !d.teamPlay && d.rows.length > 1 && d.rows[0] && [...d.rows].sort((a, b) => b.kills - a.kills)[0].kills === 0;
    const verdict = d.won ? 'VICTORY' : d.teamPlay && d.winnerTeam === -1 ? 'DRAW' : draw ? 'DRAW' : 'DEFEAT';
    const color = d.won ? COLORS.neon : verdict === 'DRAW' ? COLORS.amber : COLORS.danger;
    const t = this.add
      .text(GAME_W / 2, 74, verdict, { fontFamily: FONT_DISPLAY, fontSize: '72px', fontStyle: '900', color: hex(color) })
      .setOrigin(0.5)
      .setStroke('#000', 8)
      .setShadow(0, 0, hex(color), 24, true, true)
      .setScale(1.4)
      .setAlpha(0);
    this.tweens.add({ targets: t, scale: 1, alpha: 1, duration: 450, ease: 'Back.easeOut' });
    ui(this, GAME_W / 2, 124, `${d.teamPlay ? 'TEAM DEATHMATCH' : 'DEATHMATCH'}  ·  ${MAPS[d.mapId].name}`, 18, COLORS.textDim, { origin: [0.5, 0] });
    if (d.teamPlay) {
      display(this, GAME_W / 2 - 80, 156, String(d.teamScores[0]), 34, '#5ab8ff', [0.5, 0]);
      display(this, GAME_W / 2 + 80, 156, String(d.teamScores[1]), 34, '#ff7a5a', [0.5, 0]);
      display(this, GAME_W / 2, 164, 'VS', 18, '#7fa889', [0.5, 0]);
    }

    // ---- scoreboard
    const py = d.teamPlay ? 206 : 166;
    const rows = [...d.rows].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths).slice(0, 8);
    const ph = 62 + rows.length * 40 + 12;
    panel(this, 190, py, 900, ph, { title: 'SCOREBOARD' });
    const cols = { rank: 220, name: 270, k: 760, d: 850, kd: 940, hs: 1030 };
    const hy = py + 48;
    for (const [x, label] of [[cols.k, 'KILLS'], [cols.d, 'DEATHS'], [cols.kd, 'K/D'], [cols.hs, 'HS']] as [number, string][]) {
      ui(this, x, hy, label, 13, COLORS.textDim, { origin: [0.5, 0] });
    }
    rows.forEach((r, i) => {
      const y = hy + 24 + i * 40;
      const g = this.add.graphics();
      g.fillStyle(r.isLocal ? 0x14301a : 0x0a110c, 0.9).fillRect(210, y, 860, 34);
      if (r.isLocal) g.lineStyle(1.5, COLORS.neon, 0.9).strokeRect(210, y, 860, 34);
      if (d.teamPlay) g.fillStyle(r.team === 0 ? COLORS.team0 : COLORS.team1, 1).fillRect(210, y, 5, 34);
      const col = r.isLocal ? hex(COLORS.neon) : '#d8ffe0';
      display(this, cols.rank, y + 6, `#${i + 1}`, 15, i === 0 ? hex(COLORS.amber) : '#7fa889');
      ui(this, cols.name, y + 5, r.name, 20, col);
      ui(this, cols.k, y + 5, String(r.kills), 20, col, { origin: [0.5, 0] });
      ui(this, cols.d, y + 5, String(r.deaths), 20, col, { origin: [0.5, 0] });
      ui(this, cols.kd, y + 5, (r.deaths ? r.kills / r.deaths : r.kills).toFixed(2), 20, col, { origin: [0.5, 0] });
      ui(this, cols.hs, y + 5, String(r.headshots), 20, col, { origin: [0.5, 0] });
    });

    // ---- xp
    const xy = py + ph + 18;
    const lv = store.levelInfo();
    ui(this, 190, xy, `+${d.xpGained} XP`, 20, hex(COLORS.neon));
    if (d.levelAfter > d.levelBefore) display(this, 340, xy + 1, `LEVEL UP!  ${d.levelBefore} → ${d.levelAfter}`, 16, hex(COLORS.amber));
    else ui(this, 340, xy + 2, `LEVEL ${lv.level}`, 16, COLORS.textDim);
    const bar = this.add.graphics();
    bar.fillStyle(0x0a110c, 1).fillRect(190, xy + 32, 900, 8);
    bar.fillStyle(COLORS.neon, 1).fillRect(191, xy + 33, 898 * (lv.into / lv.need), 6);

    // ---- buttons
    const by = GAME_H - 60;
    button(this, GAME_W / 2 - 170, by, 300, 54, d.online ? 'BACK TO LOBBY' : 'PLAY AGAIN', () => {
      if (d.online) fadeTo(this, 'Lobby');
      else fadeTo(this, 'Game', d.config);
    }, { primary: true, fontSize: 17 });
    button(this, GAME_W / 2 + 170, by, 300, 54, 'MAIN MENU', () => {
      if (d.online) net.leaveRoom();
      fadeTo(this, 'Menu');
    }, { fontSize: 17 });

    audio.play(d.won ? 'win' : 'back');
  }
}
