import Phaser from 'phaser';
import { LUDO_COLORS, LUDO_SEAT_OPTIONS, seatColors, type LudoSeat } from '../../shared/ludo';
import { COLORS, FONT_DISPLAY, GAME_H, GAME_W, hex } from '../config';
import { bakeBoard } from '../ludo/LudoView';
import { store } from '../systems/Storage';
import { addInstallHint, button, createBackdrop, fadeTo, panel, selector, ui } from '../ui/theme';
import type { LudoSceneData } from './LudoScene';

const HOW_TO: [string, string][] = [
  ['GOAL', 'Move all 4 of your tokens around the board and into the centre HOME before anyone else.'],
  ['ROLLING', 'Tap the dice. You need a 6 to bring a token out of your yard. Rolling a 6 gives you another turn (three 6s in a row lose the turn).'],
  ['MOVING', 'Tap a glowing token to move it. You must roll the exact number to enter HOME. Stars and coloured start squares are safe.'],
  ['CAPTURING', 'Land on an opponent token (outside a safe square) to send it back to its yard — and take an extra turn!'],
];

export class LudoMenuScene extends Phaser.Scene {
  private players = 4;
  private humans = 1;
  private setup?: Phaser.GameObjects.Container;
  private howto?: Phaser.GameObjects.Container;

  constructor() {
    super('LudoMenu');
  }

  create(): void {
    this.cameras.main.fadeIn(300, 0, 0, 0);
    createBackdrop(this);

    // multicoloured title
    'LUDO'.split('').forEach((ch, i) => {
      this.add
        .text(64 + i * 74, 70, ch, { fontFamily: FONT_DISPLAY, fontSize: '88px', fontStyle: '900', color: hex(LUDO_COLORS[i]) })
        .setStroke('#101018', 5)
        .setShadow(0, 0, hex(LUDO_COLORS[i]), 14, true, true);
    });
    ui(this, 68, 178, 'ROLL · RACE · CAPTURE', 20, COLORS.textDim);
    const bar = this.add.graphics();
    LUDO_COLORS.forEach((c, i) => bar.fillStyle(c, 1).fillRect(68 + i * 50, 208, 46, 4));

    const items: { label: string; fn: () => void; primary?: boolean }[] = [
      { label: 'START MATCH', primary: true, fn: () => this.start() },
      { label: 'ONLINE ROOMS', fn: () => fadeTo(this, 'LudoLobby') },
      { label: 'HOW TO PLAY', fn: () => this.showHowTo(true) },
      { label: '◀  SWITCH GAME', fn: () => fadeTo(this, 'GameSelect') },
    ];
    items.forEach((it, i) => {
      const b = button(this, 68 + 170, 268 + i * 70, 340, 58, it.label, it.fn, { primary: it.primary, fontSize: 18 });
      b.setAlpha(0);
      b.x -= 30;
      this.tweens.add({ targets: b, alpha: 1, x: b.x + 30, delay: 120 + i * 70, duration: 350, ease: 'Cubic.easeOut' });
    });

    const px = 790;
    const py = 96;
    panel(this, px, py, 440, 520, { title: 'MATCH SETUP' });
    const key = bakeBoard(this);
    this.add.image(px + 220, py + 168, key).setScale(0.17).setDepth(2);
    this.renderSetup();
    button(this, px + 220, py + 484, 360, 52, 'START MATCH', () => this.start(), { primary: true, fontSize: 18 });
    addInstallHint(this);
    void GAME_W;
    void GAME_H;
  }

  private renderSetup(): void {
    this.setup?.destroy();
    const px = 790 + 30;
    const py = 96;
    const c = this.add.container(0, 0);
    c.add(selector<number>(this, px, py + 330, 380, 'PLAYERS', LUDO_SEAT_OPTIONS.map((n) => ({ value: n, text: String(n) })), this.players, (v) => {
      this.players = v;
      this.humans = Math.min(this.humans, v);
      this.time.delayedCall(0, () => this.renderSetup());
    }));
    const opts = Array.from({ length: this.players }, (_, i) => ({ value: i + 1, text: i === 0 ? '1 (vs computer)' : `${i + 1} (pass the phone)` }));
    c.add(selector<number>(this, px, py + 392, 380, 'HUMANS HERE', opts, this.humans, (v) => (this.humans = v)));
    c.add(ui(this, px, py + 430, 'Empty seats are played by the computer.', 14, COLORS.textDim));
    this.setup = c;
  }

  private start(): void {
    const colors = seatColors(this.players);
    const seats: LudoSeat[] = colors.map((color, i) => ({
      color,
      name: i < this.humans ? (i === 0 ? store.data.name : `Player ${i + 1}`) : `Computer ${i - this.humans + 1}`,
      bot: i >= this.humans,
    }));
    const data: LudoSceneData = { online: false, seats, mySeats: Array.from({ length: this.humans }, (_, i) => i) };
    fadeTo(this, 'Ludo', data);
  }

  private showHowTo(open: boolean): void {
    this.howto?.destroy();
    this.howto = undefined;
    if (!open) return;
    const c = this.add.container(0, 0).setDepth(100);
    const dim = this.add.rectangle(GAME_W / 2, GAME_H / 2, 4000, GAME_H, 0x000000, 0.78).setInteractive();
    const pn = panel(this, 170, 90, 940, 540, { title: 'HOW TO PLAY LUDO' });
    c.add([dim, pn]);
    HOW_TO.forEach(([h, t], i) => {
      const y = 160 + i * 108;
      c.add(this.add.text(204, y, h, { fontFamily: FONT_DISPLAY, fontSize: '18px', fontStyle: '700', color: hex(LUDO_COLORS[i]) }));
      c.add(ui(this, 204, y + 28, t, 18, '#d8ffe0', { width: 860 }));
    });
    c.add(button(this, GAME_W / 2, 590, 240, 46, 'GOT IT', () => this.showHowTo(false), { primary: true, fontSize: 15 }));
    this.howto = c;
  }
}
