import Phaser from 'phaser';
import { COLORS, FONT_DISPLAY, GAME_H, GAME_W, hex } from '../config';
import { PlayerView } from '../entities/PlayerView';
import type { WeaponId } from '../data/weapons';
import { LUDO_COLORS } from '../../shared/ludo';
import { audio } from '../systems/AudioManager';
import { store } from '../systems/Storage';
import { addInstallHint, chamfer, createBackdrop, display, fadeTo, ui } from '../ui/theme';

interface CardDef {
  x: number;
  title: string;
  tag: string;
  lines: string[];
  accent: number;
  to: string;
  art: 'shooter' | 'cricket' | 'ludo';
}

const CARD_W = 380;
const CARD_H = 520;
const CARD_Y = 150;

/** First screen: pick the shooter, cricket or ludo. */
export class GameSelectScene extends Phaser.Scene {
  private view?: PlayerView;
  private shooterCard?: Phaser.GameObjects.Container;
  private t = 0;

  constructor() {
    super('GameSelect');
  }

  create(): void {
    this.cameras.main.fadeIn(350, 0, 0, 0);
    createBackdrop(this);
    this.t = 0;
    this.view = undefined;

    const title = this.add
      .text(GAME_W / 2, 66, 'CHOOSE YOUR GAME', { fontFamily: FONT_DISPLAY, fontSize: '40px', fontStyle: '900', color: '#ffffff' })
      .setOrigin(0.5)
      .setShadow(0, 0, hex(COLORS.neon), 18, true, true);
    this.tweens.add({ targets: title, alpha: 0.9, duration: 1600, yoyo: true, repeat: -1 });
    ui(this, GAME_W / 2, 108, 'Three games · one profile · play solo or with friends online', 18, COLORS.textDim, { origin: [0.5, 0] });

    const cards: CardDef[] = [
      {
        x: 40, title: 'JETFRONT', tag: 'JETPACK SHOOTER', accent: COLORS.neon, to: 'Menu', art: 'shooter',
        lines: ['Fly, shoot, blow things up', '11 weapons · gas & poison bombs', 'Bots, deathmatch & team rooms'],
      },
      {
        x: 450, title: 'CRICKET', tag: 'BAT · BOWL · WIN', accent: 0xffd166, to: 'CricketMenu', art: 'cricket',
        lines: ['Time your shots, aim deliveries', 'Play the computer or a friend', 'Online rooms in seconds'],
      },
      {
        x: 860, title: 'LUDO', tag: 'ROLL · RACE · CAPTURE', accent: 0xff6b5a, to: 'LudoMenu', art: 'ludo',
        lines: ['Classic board game for 2–4', 'Computer or friends on one phone', 'Online rooms with a room code'],
      },
    ];
    cards.forEach((c, i) => this.card(c, i));

    ui(this, GAME_W / 2, GAME_H - 22, 'You can switch games any time from the menu', 14, '#456a52', { origin: [0.5, 0.5] });
    addInstallHint(this);
  }

  private card(c: CardDef, i: number): void {
    const w = CARD_W;
    const h = CARD_H;
    const cont = this.add.container(c.x + w / 2, CARD_Y + h / 2);
    const g = this.add.graphics();
    const draw = (hover: boolean): void => {
      g.clear();
      const pts = chamfer(-w / 2, -h / 2, w, h, 20);
      g.fillStyle(hover ? 0x14261b : 0x0d1610, 0.95).fillPoints(pts, true);
      g.lineStyle(hover ? 4 : 2, c.accent, hover ? 1 : 0.7).strokePoints(pts, true);
      if (hover) g.lineStyle(14, c.accent, 0.12).strokePoints(pts, true);
      g.fillStyle(c.accent, 0.12).fillRect(-w / 2 + 14, -h / 2 + 14, w - 28, 230);
    };
    draw(false);
    cont.add(g);

    const art = this.add.graphics();
    const cy = -h / 2 + 124;
    if (c.art === 'shooter') {
      art.fillStyle(COLORS.neon, 0.1).fillEllipse(0, -h / 2 + 224, 200, 24);
      art.lineStyle(1.5, COLORS.neon, 0.5).strokeEllipse(0, -h / 2 + 224, 200, 24);
      this.view = new PlayerView(this, store.data.appearance, -1, null, 3);
      this.view.setWeapon(store.data.primary as WeaponId);
      cont.add(art);
    } else if (c.art === 'cricket') {
      art.fillStyle(0x2f7d32, 1).fillEllipse(0, cy + 50, 320, 150);
      art.fillStyle(0xc98c58, 1).fillPoints([{ x: -34, y: cy - 20 }, { x: 34, y: cy - 20 }, { x: 62, y: cy + 118 }, { x: -62, y: cy + 118 }] as never, true);
      for (let k = -1; k <= 1; k++) art.fillStyle(0xf1e3b8, 1).fillRoundedRect(k * 12 - 3, cy + 56, 6, 52, 2);
      cont.add(art);
      const bat = this.add.graphics();
      bat.fillStyle(0x2a2a2a, 1).fillRoundedRect(-3, -56, 6, 34, 2);
      bat.fillStyle(0xe8c98a, 1).fillRoundedRect(-10, -24, 20, 92, 5);
      bat.setPosition(-84, cy - 6).setRotation(-0.5);
      const ball = this.add.graphics();
      ball.fillStyle(0xd62828, 1).fillCircle(0, 0, 15);
      ball.lineStyle(2, 0xffffff, 0.8).beginPath().arc(0, 0, 10, -1, 1).strokePath();
      ball.setPosition(84, cy - 36);
      cont.add([bat, ball]);
      this.tweens.add({ targets: ball, y: cy + 20, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      this.tweens.add({ targets: bat, rotation: 0.3, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    } else {
      // mini ludo board + bouncing dice
      const q = 62;
      const o = 76;
      const corners: [number, number][] = [[-o, cy - o], [o - q, cy - o], [o - q, cy + o - q], [-o, cy + o - q]];
      art.fillStyle(0xfffbf0, 1).fillRoundedRect(-o - 6, cy - o - 6, o * 2 + 12, o * 2 + 12, 10);
      corners.forEach(([x, y], k) => {
        art.fillStyle(LUDO_COLORS[k], 1).fillRect(x, y, q, q);
        art.fillStyle(0xffffff, 1).fillRoundedRect(x + 10, y + 10, q - 20, q - 20, 6);
        for (const [dx, dy] of [[19, 19], [q - 19, 19], [19, q - 19], [q - 19, q - 19]]) art.fillStyle(LUDO_COLORS[k], 1).fillCircle(x + dx, y + dy, 5);
      });
      for (let k = 0; k < 3; k++) {
        for (let m = 0; m < 6; m++) {
          art.lineStyle(1, 0x888888, 1).strokeRect(-o + q + k * ((o * 2 - q * 2) / 3), cy - o + m * (q / 6 + 0), (o * 2 - q * 2) / 3, q / 6);
        }
      }
      art.fillStyle(0xfffbf0, 1).fillRect(-o + q, cy - o + q, o * 2 - q * 2, o * 2 - q * 2);
      art.fillStyle(LUDO_COLORS[0], 1).fillTriangle(-o + q, cy - o + q, -o + q, cy + o - q, 0, cy);
      art.fillStyle(LUDO_COLORS[1], 1).fillTriangle(-o + q, cy - o + q, o - q, cy - o + q, 0, cy);
      art.fillStyle(LUDO_COLORS[2], 1).fillTriangle(o - q, cy - o + q, o - q, cy + o - q, 0, cy);
      art.fillStyle(LUDO_COLORS[3], 1).fillTriangle(-o + q, cy + o - q, o - q, cy + o - q, 0, cy);
      cont.add(art);
      const dice = this.add.graphics();
      dice.fillStyle(0x000000, 0.25).fillRoundedRect(-24, -20, 52, 52, 10);
      dice.fillStyle(0xffffff, 1).fillRoundedRect(-26, -26, 52, 52, 10).lineStyle(3, 0xff6b5a, 1).strokeRoundedRect(-26, -26, 52, 52, 10);
      for (const [dx, dy] of [[-12, -12], [12, -12], [0, 0], [-12, 12], [12, 12]]) dice.fillStyle(0x1b1b2a, 1).fillCircle(dx, dy, 4.5);
      dice.setPosition(96, cy - 52);
      cont.add(dice);
      this.tweens.add({ targets: dice, y: cy - 24, rotation: 0.5, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }

    cont.add(display(this, 0, -h / 2 + 268, c.title, 38, hex(c.accent), [0.5, 0]));
    cont.add(ui(this, 0, -h / 2 + 318, c.tag, 15, COLORS.textDim, { origin: [0.5, 0] }));
    c.lines.forEach((l, k) => cont.add(ui(this, 0, -h / 2 + 350 + k * 26, `▸ ${l}`, 16, '#d8ffe0', { origin: [0.5, 0] })));

    const btn = this.add.graphics();
    btn.fillStyle(c.accent, 1).fillPoints(chamfer(-100, h / 2 - 66, 200, 46, 10), true);
    cont.add(btn);
    cont.add(display(this, 0, h / 2 - 43, 'PLAY', 20, '#041006', [0.5, 0.5]));

    const hit = this.add.rectangle(0, 0, w, h, 0xffffff, 0.001).setInteractive({ useHandCursor: true });
    cont.add(hit);
    hit.on('pointerover', () => {
      draw(true);
      audio.play('hover');
      this.tweens.add({ targets: cont, scale: 1.02, duration: 140 });
    });
    hit.on('pointerout', () => {
      draw(false);
      this.tweens.add({ targets: cont, scale: 1, duration: 140 });
    });
    hit.on('pointerdown', () => {
      audio.play('ui');
      fadeTo(this, c.to);
    });

    cont.setAlpha(0).y += 30;
    this.tweens.add({ targets: cont, alpha: 1, y: cont.y - 30, delay: 150 + i * 120, duration: 420, ease: 'Cubic.easeOut' });
    if (c.art === 'shooter') this.shooterCard = cont;
  }

  update(_t: number, delta: number): void {
    this.t += delta / 1000;
    const c = this.shooterCard;
    if (this.view && c) {
      this.view.container.setAlpha(c.alpha).setDepth(5);
      this.view.update(
        { x: 40 + CARD_W / 2, y: 288, aim: Math.sin(this.t * 0.8) * 0.45, vx: 0, grounded: true, jetting: false, alive: true, hp: 100, armor: 50, protectedFx: false },
        delta / 1000,
      );
    }
  }
}
