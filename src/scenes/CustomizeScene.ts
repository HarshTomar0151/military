import Phaser from 'phaser';
import { COLORS, GAME_H, GAME_W, hex } from '../config';
import { PlayerView } from '../entities/PlayerView';
import { drawWeapon } from '../entities/WeaponArt';
import { ARMOR_COLORS, ARMOR_NAMES, HELMET_COLORS, SKIN_COLORS, VISOR_COLORS, VISOR_NAMES } from '../data/palettes';
import { WEAPON_ORDER, WEAPONS, type WeaponId } from '../data/weapons';
import { audio } from '../systems/AudioManager';
import { promptText } from '../systems/DomPrompt';
import { store } from '../systems/Storage';
import { button, createBackdrop, display, fadeTo, panel, screenTitle, ui, type Button } from '../ui/theme';

type Tab = 'operator' | 'loadout';

export class CustomizeScene extends Phaser.Scene {
  private tab: Tab = 'operator';
  private backTo = 'Menu';
  private body?: Phaser.GameObjects.Container;
  private view?: PlayerView;
  private t = 0;
  private tabBtns: Button[] = [];

  constructor() {
    super('Customize');
  }

  init(data: { tab?: Tab; back?: string }): void {
    this.tab = data?.tab ?? 'operator';
    this.backTo = data?.back ?? 'Menu';
  }

  create(): void {
    this.cameras.main.fadeIn(250, 0, 0, 0);
    createBackdrop(this);
    screenTitle(this, 'CUSTOMIZE', 'Operator appearance and weapon loadout');
    button(this, 120, GAME_H - 52, 168, 46, '◀  BACK', () => fadeTo(this, this.backTo), { fontSize: 15 });
    this.tabBtns = [
      button(this, 790, 66, 190, 44, 'OPERATOR', () => this.show('operator'), { fontSize: 14 }),
      button(this, 996, 66, 190, 44, 'LOADOUT', () => this.show('loadout'), { fontSize: 14 }),
    ];
    this.show(this.tab);
  }

  update(_t: number, delta: number): void {
    this.t += delta / 1000;
    if (this.view) {
      this.view.update(
        { x: 330, y: 360, aim: Math.sin(this.t * 0.8) * 0.45, vx: 0, grounded: true, jetting: false, alive: true, hp: 100, armor: 50, protectedFx: false },
        delta / 1000,
      );
    }
  }

  private show(tab: Tab): void {
    this.tab = tab;
    this.body?.destroy();
    this.view?.destroy();
    this.view = undefined;
    this.body = this.add.container(0, 0);
    this.tabBtns[0].setText(tab === 'operator' ? '▣ OPERATOR' : 'OPERATOR');
    this.tabBtns[1].setText(tab === 'loadout' ? '▣ LOADOUT' : 'LOADOUT');
    if (tab === 'operator') this.buildOperator();
    else this.buildLoadout();
  }

  // ------------------------------------------------------------- operator

  private buildOperator(): void {
    const body = this.body!;
    const app = store.data.appearance;
    body.add(panel(this, 56, 140, 560, 500, { title: 'PREVIEW' }));
    this.view = new PlayerView(this, app, -1, null, 4.6);
    this.view.container.setPosition(330, 360).setDepth(5);
    this.view.setWeapon(store.data.primary as WeaponId);
    const floor = this.add.graphics();
    floor.fillStyle(COLORS.neon, 0.1).fillEllipse(330, 500, 240, 32);
    floor.lineStyle(1.5, COLORS.neon, 0.5).strokeEllipse(330, 500, 240, 32);
    body.add(floor);
    const nameT = display(this, 330, 560, store.data.name.toUpperCase(), 26, '#d8ffe0', [0.5, 0]);
    body.add(nameT);
    body.add(
      button(this, 330, 610, 200, 34, 'CHANGE CALLSIGN', async () => {
        const v = await promptText('ENTER CALLSIGN', store.data.name, 14);
        if (v) {
          store.data.name = v.slice(0, 14);
          store.save();
          nameT.setText(store.data.name.toUpperCase());
        }
      }, { fontSize: 12 }),
    );

    body.add(panel(this, 650, 140, 574, 500, { title: 'ARMOR & GEAR' }));
    const rows: { label: string; key: 'armor' | 'helmet' | 'skin' | 'visor'; colors: number[]; names?: string[] }[] = [
      { label: 'ARMOR', key: 'armor', colors: ARMOR_COLORS, names: ARMOR_NAMES },
      { label: 'HELMET', key: 'helmet', colors: HELMET_COLORS },
      { label: 'SKIN TONE', key: 'skin', colors: SKIN_COLORS },
      { label: 'VISOR', key: 'visor', colors: VISOR_COLORS, names: VISOR_NAMES },
    ];
    let y = 206;
    for (const row of rows) {
      body.add(ui(this, 684, y, row.label, 15, COLORS.textDim));
      const ring = this.add.graphics();
      body.add(ring);
      const swatches: Phaser.GameObjects.Rectangle[] = [];
      const draw = (): void => {
        ring.clear();
        const i = app[row.key];
        const sw = swatches[i];
        ring.lineStyle(3, COLORS.neon, 1).strokeRect(sw.x - 24, sw.y - 24, 48, 48);
        ring.fillStyle(COLORS.neon, 0.15).fillRect(sw.x - 24, sw.y - 24, 48, 48);
      };
      row.colors.forEach((c, i) => {
        const sw = this.add.rectangle(700 + (i % 8) * 62, y + 56, 38, 38, c).setStrokeStyle(2, 0x000000, 0.6).setInteractive({ useHandCursor: true });
        sw.on('pointerdown', () => {
          app[row.key] = i;
          store.save();
          audio.play('ui');
          draw();
          this.rebuildView();
        });
        swatches.push(sw);
        body.add(sw);
      });
      draw();
      y += 106;
    }
  }

  private rebuildView(): void {
    this.view?.destroy();
    this.view = new PlayerView(this, store.data.appearance, -1, null, 4.6);
    this.view.container.setPosition(330, 360).setDepth(5);
    this.view.setWeapon(store.data.primary as WeaponId);
  }

  // -------------------------------------------------------------- loadout

  private buildLoadout(): void {
    const body = this.body!;
    body.add(panel(this, 56, 140, 700, 500, { title: 'SELECT WEAPONS' }));
    const detail = this.add.container(0, 0);
    body.add(panel(this, 780, 140, 444, 500, { title: 'WEAPON DATA' }));
    body.add(detail);

    const showDetail = (id: WeaponId): void => {
      detail.removeAll(true);
      const w = WEAPONS[id];
      const g = this.add.graphics();
      drawWeapon(g, id, 900, 236, 2.4);
      detail.add(g);
      detail.add(display(this, 804, 288, w.name, 18, hex(COLORS.neon)));
      detail.add(ui(this, 804, 318, w.blurb, 15, '#d8ffe0', { width: 396 }));
      const stats: [string, number][] = [
        ['POWER', w.stats.power], ['FIRE RATE', w.stats.rate], ['RANGE', w.stats.range], ['MOBILITY', w.stats.mobility],
      ];
      stats.forEach(([label, v], i) => {
        const y = 392 + i * 36;
        detail.add(ui(this, 804, y - 9, label, 14, COLORS.textDim));
        const bg = this.add.graphics();
        bg.fillStyle(0x0a110c, 1).fillRect(930, y - 6, 270, 12);
        bg.fillStyle(COLORS.neon, 1).fillRect(931, y - 5, 268 * v, 10);
        detail.add(bg);
      });
      const mag = w.infinite ? `${w.mag} / ∞` : `${w.mag} / ${Math.round(w.mag * w.reserveMags)}`;
      detail.add(ui(this, 804, 548, `MAGAZINE  ${mag}`, 16, '#d8ffe0'));
      detail.add(ui(this, 804, 574, `RELOAD  ${(w.reloadMs / 1000).toFixed(1)}s     DMG  ${w.damage}${w.pellets > 1 ? ` ×${w.pellets}` : ''}${w.explosive ? ' + AoE' : ''}`, 16, '#d8ffe0'));
      detail.add(ui(this, 804, 600, w.auto ? 'FULL-AUTO' : 'SEMI-AUTO', 14, COLORS.textDim));
    };

    const slot = (label: string, y: number, key: 'primary' | 'secondary', other: 'primary' | 'secondary'): void => {
      body.add(ui(this, 90, y, label, 16, COLORS.textDim));
      const ring = this.add.graphics();
      body.add(ring);
      const cards: { id: WeaponId; x: number; y: number }[] = [];
      const draw = (): void => {
        ring.clear();
        const c = cards.find((k) => k.id === store.data[key]);
        if (c) {
          ring.lineStyle(3, COLORS.neon, 1).strokeRect(c.x - 52, c.y - 2, 104, 66);
          ring.fillStyle(COLORS.neon, 0.1).fillRect(c.x - 52, c.y - 2, 104, 66);
        }
      };
      // 6 cards per row, as many rows as needed
      WEAPON_ORDER.forEach((id, i) => cards.push({ id, x: 120 + (i % 6) * 110, y: y + 24 + Math.floor(i / 6) * 72 }));
      cards.forEach((c) => {
        const g = this.add.graphics();
        g.fillStyle(0x0a110c, 1).fillRect(c.x - 50, c.y, 100, 62);
        g.lineStyle(1, COLORS.line, 1).strokeRect(c.x - 50, c.y, 100, 62);
        drawWeapon(g, c.id, c.x - 22, c.y + 24, 0.62);
        body.add(g);
        body.add(ui(this, c.x, c.y + 50, WEAPONS[c.id].name.split(' ')[0], 12, '#d8ffe0', { origin: [0.5, 0.5] }));
        const hit = this.add.rectangle(c.x, c.y + 31, 100, 62, 0xffffff, 0.001).setInteractive({ useHandCursor: true });
        hit.on('pointerover', () => showDetail(c.id));
        hit.on('pointerdown', () => {
          if (store.data[other] === c.id) store.data[other] = key === 'primary' ? 'pistol' : 'assault';
          if (store.data.primary === store.data.secondary) store.data.secondary = store.data.primary === 'pistol' ? 'assault' : 'pistol';
          store.data[key] = c.id;
          store.save();
          audio.play('ui');
          showDetail(c.id);
          this.show('loadout');
        });
        body.add(hit);
      });
      draw();
    };
    slot('PRIMARY WEAPON', 192, 'primary', 'secondary');
    slot('SECONDARY WEAPON', 368, 'secondary', 'primary');
    ui(this, 90, 556, 'Hover a weapon to inspect it · click to equip · [Q] swaps primary/secondary in match · [G] grenade · [E] grenade type', 14, COLORS.textDim, { width: 640 });
    showDetail(store.data.primary as WeaponId);
  }
}
