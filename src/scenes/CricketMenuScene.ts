import Phaser from 'phaser';
import { DEFAULT_CRICKET, OVER_OPTIONS, WICKET_OPTIONS } from '../../shared/cricket';
import { COLORS, FONT_DISPLAY, GAME_H, GAME_W, hex } from '../config';
import { store, type Difficulty } from '../systems/Storage';
import { addInstallHint, button, createBackdrop, display, fadeTo, panel, selector, ui } from '../ui/theme';
import type { CricketSceneData } from './CricketScene';

const GOLD = 0xffd166;

const HOW_TO: [string, string][] = [
  ['BATTING', 'Pick a SHOT (defend / drive / loft) and a DIRECTION (leg · straight · off). When the ball is bowled, press HIT as the shrinking ring closes on the ball. Perfect timing + the right side = boundaries!'],
  ['BOWLING', 'Choose a DELIVERY (fast, medium, spin, yorker) and a LINE (leg · middle · off), press BOWL, then tap again when the marker is in the green. Centre = accurate; too far off and it is a WIDE.'],
  ['SCORING', 'Defend is safe. Drive scores 1–4. Loft can hit SIX but risks getting caught. Bowled, caught and LBW are wickets. The team batting second chases the target.'],
  ['KEYS', 'Space = HIT / BOWL · 1-4 = delivery or shot · ← ↑ → = leg / straight / off · or tap the buttons and the field.'],
];

export class CricketMenuScene extends Phaser.Scene {
  private cfg = { ...DEFAULT_CRICKET };
  private diff: Difficulty = 'normal';
  private howto?: Phaser.GameObjects.Container;

  constructor() {
    super('CricketMenu');
  }

  create(): void {
    this.cameras.main.fadeIn(300, 0, 0, 0);
    createBackdrop(this);

    const title = this.add
      .text(64, 70, 'CRICKET', { fontFamily: FONT_DISPLAY, fontSize: '82px', fontStyle: '900', color: hex(GOLD) })
      .setStroke('#3a2a00', 8)
      .setShadow(0, 0, hex(GOLD), 22, true, true);
    this.tweens.add({ targets: title, alpha: 0.9, duration: 1600, yoyo: true, repeat: -1 });
    ui(this, 68, 168, 'BAT · BOWL · WIN', 20, COLORS.textDim);
    const bar = this.add.graphics();
    bar.fillStyle(GOLD, 1).fillRect(68, 200, 64, 3);
    bar.fillStyle(0x8a6a1c, 1).fillRect(136, 200, 220, 1);

    const items: { label: string; fn: () => void; primary?: boolean }[] = [
      { label: 'PLAY vs COMPUTER', primary: true, fn: () => this.startAI() },
      { label: 'MULTIPLAYER', fn: () => fadeTo(this, 'CricketLobby') },
      { label: 'HOW TO PLAY', fn: () => this.showHowTo(true) },
      { label: '◀  SWITCH GAME', fn: () => fadeTo(this, 'GameSelect') },
    ];
    items.forEach((it, i) => {
      const b = button(this, 68 + 170, 262 + i * 70, 340, 58, it.label, it.fn, { primary: it.primary, fontSize: 18 });
      b.setAlpha(0);
      b.x -= 30;
      this.tweens.add({ targets: b, alpha: 1, x: b.x + 30, delay: 120 + i * 70, duration: 350, ease: 'Cubic.easeOut' });
    });

    // ---- match setup panel
    const px = 790;
    const py = 96;
    panel(this, px, py, 440, 520, { title: 'MATCH SETUP' });
    selector<number>(this, px + 30, py + 100, 380, 'OVERS', OVER_OPTIONS.map((n) => ({ value: n, text: String(n) })), this.cfg.overs, (v) => (this.cfg.overs = v));
    selector<number>(this, px + 30, py + 160, 380, 'WICKETS', WICKET_OPTIONS.map((n) => ({ value: n, text: String(n) })), this.cfg.wickets, (v) => (this.cfg.wickets = v));
    selector<Difficulty>(this, px + 30, py + 220, 380, 'COMPUTER', [
      { value: 'easy', text: 'EASY' }, { value: 'normal', text: 'NORMAL' }, { value: 'hard', text: 'HARD' },
    ], this.diff, (v) => (this.diff = v));

    // little scoreboard preview
    const g = this.add.graphics();
    g.fillStyle(0x0a110c, 1).fillRect(px + 30, py + 280, 380, 120);
    g.lineStyle(1, COLORS.line, 1).strokeRect(px + 30, py + 280, 380, 120);
    g.fillStyle(0x35a7ff, 1).fillRect(px + 30, py + 280, 5, 56).fillStyle(0xff7a3c, 1).fillRect(px + 30, py + 344, 5, 56);
    ui(this, px + 48, py + 296, store.data.name.toUpperCase(), 22, '#d8ffe0');
    ui(this, px + 48, py + 360, 'COMPUTER', 22, '#d8ffe0');
    ui(this, px + 400, py + 290, 'TOSS DECIDES WHO BATS FIRST', 12, COLORS.textDim, { origin: [1, 0] });
    display(this, px + 400, py + 306, '—', 26, hex(GOLD), [1, 0]);
    ui(this, px + 30, py + 420, 'Short games: 1–2 overs · Full innings: 5–10 overs', 15, COLORS.textDim, { width: 380 });
    button(this, px + 220, py + 480, 360, 56, 'START MATCH', () => this.startAI(), { primary: true, fontSize: 18 });
    addInstallHint(this);
  }

  private startAI(): void {
    const data: CricketSceneData = {
      online: false,
      cfg: { ...this.cfg },
      names: [store.data.name, 'Computer'],
      myIdx: 0,
      difficulty: this.diff,
    };
    fadeTo(this, 'Cricket', data);
  }

  private showHowTo(open: boolean): void {
    this.howto?.destroy();
    this.howto = undefined;
    if (!open) return;
    const c = this.add.container(0, 0).setDepth(100);
    const dim = this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x000000, 0.78).setInteractive();
    const pn = panel(this, 170, 90, 940, 540, { title: 'HOW TO PLAY CRICKET' });
    c.add([dim, pn]);
    HOW_TO.forEach(([h, t], i) => {
      const y = 160 + i * 106;
      c.add(display(this, 204, y, h, 17, hex(GOLD)));
      c.add(ui(this, 204, y + 28, t, 17, '#d8ffe0', { width: 860 }));
    });
    c.add(button(this, GAME_W / 2, 590, 240, 46, 'GOT IT', () => this.showHowTo(false), { primary: true, fontSize: 15 }));
    this.howto = c;
  }
}
