import Phaser from 'phaser';
import type { GameModeId, MapId } from '../../shared/protocol';
import { COLORS, GAME_H, GAME_W, hex } from '../config';
import { MAP_ORDER, MAPS, type MapDef } from '../data/maps';
import { WEAPONS, type WeaponId } from '../data/weapons';
import { store, type Difficulty } from '../systems/Storage';
import { backButton, button, createBackdrop, display, fadeTo, panel, screenTitle, selector, ui } from '../ui/theme';
import type { GameConfig } from './GameScene';

export class PracticeScene extends Phaser.Scene {
  private cfg = { ...store.data.practice };
  private preview!: Phaser.GameObjects.Graphics;
  private mapName!: Phaser.GameObjects.Text;
  private mapTag!: Phaser.GameObjects.Text;

  constructor() {
    super('Practice');
  }

  create(): void {
    this.cfg = { ...store.data.practice };
    this.cameras.main.fadeIn(250, 0, 0, 0);
    createBackdrop(this);
    screenTitle(this, 'PRACTICE', 'Fight AI bots — Deathmatch or Team Deathmatch');
    backButton(this);

    // ---- settings
    panel(this, 56, 140, 520, 330, { title: 'MATCH SETTINGS' });
    const x = 90;
    selector<GameModeId>(this, x, 214, 450, 'GAME MODE', [
      { value: 'deathmatch', text: 'DEATHMATCH' }, { value: 'team', text: 'TEAM DEATHMATCH' },
    ], this.cfg.mode, (v) => (this.cfg.mode = v));
    selector<MapId>(this, x, 270, 450, 'MAP', MAP_ORDER.map((id) => ({ value: id, text: MAPS[id].name.split(' ')[0] })), this.cfg.mapId, (v) => {
      this.cfg.mapId = v;
      this.drawPreview();
    });
    selector<number>(this, x, 326, 450, 'BOTS', [1, 2, 3, 4, 5, 6, 7].map((n) => ({ value: n, text: String(n) })), this.cfg.bots, (v) => (this.cfg.bots = v));
    selector<Difficulty>(this, x, 382, 450, 'DIFFICULTY', [
      { value: 'easy', text: 'EASY' }, { value: 'normal', text: 'NORMAL' }, { value: 'hard', text: 'HARD' },
    ], this.cfg.difficulty, (v) => (this.cfg.difficulty = v));
    ui(this, x, 424, 'Score limit 20 kills (30 in teams) or 5 minutes.', 14, COLORS.textDim);

    // ---- loadout summary
    panel(this, 56, 490, 520, 150, { title: 'LOADOUT' });
    const d = store.data;
    const pw = WEAPONS[d.primary as WeaponId];
    const sw = WEAPONS[d.secondary as WeaponId];
    ui(this, 90, 540, 'PRIMARY', 13, COLORS.textDim);
    display(this, 90, 560, pw?.name ?? '-', 16, '#d8ffe0');
    ui(this, 340, 540, 'SECONDARY', 13, COLORS.textDim);
    display(this, 340, 560, sw?.name ?? '-', 16, '#d8ffe0');
    button(this, 316, 612, 240, 36, 'EDIT LOADOUT', () => fadeTo(this, 'Customize', { tab: 'loadout', back: 'Practice' }), { fontSize: 13 });

    // ---- map preview
    panel(this, 610, 140, 614, 500, { title: 'BATTLEFIELD' });
    this.preview = this.add.graphics();
    this.mapName = display(this, 640, 440, '', 26, hex(COLORS.neon));
    this.mapTag = ui(this, 640, 482, '', 18, '#d8ffe0', { width: 550 });
    this.drawPreview();

    button(this, 916, 590, 360, 62, 'START MATCH', () => this.start(), { primary: true, fontSize: 22 });
  }

  private drawPreview(): void {
    const map: MapDef = MAPS[this.cfg.mapId];
    const g = this.preview;
    g.clear();
    const x = 640;
    const y = 190;
    const w = 554;
    const h = 230;
    g.fillGradientStyle(map.theme.skyTop, map.theme.skyTop, map.theme.skyBottom, map.theme.skyBottom, 1).fillRect(x, y, w, h);
    const sx = w / map.w;
    const sy = h / map.h;
    for (const r of map.solids.slice(4)) {
      g.fillStyle(map.theme.platform, 1).fillRect(x + r.x * sx, y + r.y * sy, Math.max(1.5, r.w * sx), Math.max(2, r.h * sy));
      g.fillStyle(map.theme.platformTop, 1).fillRect(x + r.x * sx, y + r.y * sy, Math.max(1.5, r.w * sx), 1.5);
    }
    g.fillStyle(map.theme.ground, 1).fillRect(x, y + (map.h - 100) * sy, w, 100 * sy);
    g.fillStyle(map.theme.groundTop, 1).fillRect(x, y + (map.h - 100) * sy, w, 2);
    for (const s of map.spawns) g.fillStyle(0xffffff, 0.8).fillCircle(x + s.x * sx, y + s.y * sy, 2.2);
    for (const p of map.pickups) {
      g.fillStyle(p.kind === 'health' ? COLORS.neon : p.kind === 'armor' ? COLORS.ice : COLORS.amber, 1).fillRect(x + p.x * sx - 2, y + p.y * sy - 2, 4, 4);
    }
    g.lineStyle(2, COLORS.neon, 0.8).strokeRect(x, y, w, h);
    this.mapName.setText(map.name);
    this.mapTag.setText(map.tagline);
  }

  private start(): void {
    store.data.practice = { ...this.cfg };
    store.save();
    const cfg: GameConfig = { online: false, mode: this.cfg.mode, mapId: this.cfg.mapId, bots: this.cfg.bots, difficulty: this.cfg.difficulty };
    if (!store.data.seenIntro) fadeTo(this, 'HowTo', { next: 'Game', nextData: cfg });
    else fadeTo(this, 'Game', cfg);
  }
}
