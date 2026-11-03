import Phaser from 'phaser';
import { COLORS, FONT_DISPLAY, GAME_H, GAME_W, hex } from '../config';
import { PlayerView } from '../entities/PlayerView';
import type { WeaponId } from '../data/weapons';
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
}

/** First screen: pick the shooter or cricket. */
export class GameSelectScene extends Phaser.Scene {
  private view?: PlayerView;
  private t = 0;

  constructor() {
    super('GameSelect');
  }

  create(): void {
    this.cameras.main.fadeIn(350, 0, 0, 0);
    createBackdrop(this);
    this.t = 0;

    const title = this.add
      .text(GAME_W / 2, 66, 'CHOOSE YOUR GAME', { fontFamily: FONT_DISPLAY, fontSize: '40px', fontStyle: '900', color: '#ffffff' })
      .setOrigin(0.5)
      .setShadow(0, 0, hex(COLORS.neon), 18, true, true);
    this.tweens.add({ targets: title, alpha: 0.9, duration: 1600, yoyo: true, repeat: -1 });
    ui(this, GAME_W / 2, 108, 'Two games · one profile · play solo or with friends online', 18, COLORS.textDim, { origin: [0.5, 0] });

    const cards: CardDef[] = [
      {
        x: 70, title: 'JETFRONT', tag: 'JETPACK SHOOTER', accent: COLORS.neon, to: 'Menu',
        lines: ['Fly, shoot, blow things up', '11 weapons · gas & poison bombs', 'Bots, deathmatch & team rooms'],
      },
      {
        x: 670, title: 'CRICKET', tag: 'BAT · BOWL · WIN', accent: 0xffd166, to: 'CricketMenu',
        lines: ['Time your shots, aim your deliveries', 'Play the computer or a friend', 'Create an online room in seconds'],
      },
    ];
    cards.forEach((c, i) => this.card(c, i));

    ui(this, GAME_W / 2, GAME_H - 22, 'You can switch games any time from the menu', 14, '#456a52', { origin: [0.5, 0.5] });
    addInstallHint(this);
  }

  private card(c: CardDef, i: number): void {
    const w = 540;
    const h = 520;
    const y = 150;
    const cont = this.add.container(c.x + w / 2, y + h / 2);
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

    // ---- artwork
    const art = this.add.graphics();
    if (i === 0) {
      art.fillStyle(COLORS.neon, 0.1).fillEllipse(0, -h / 2 + 224, 230, 26);
      art.lineStyle(1.5, COLORS.neon, 0.5).strokeEllipse(0, -h / 2 + 224, 230, 26);
      this.view = new PlayerView(this, store.data.appearance, -1, null, 3.4);
      this.view.setWeapon(store.data.primary as WeaponId);
      cont.add(art);
    } else {
      // pitch + stumps + bat + ball
      const cy = -h / 2 + 124;
      art.fillStyle(0x2f7d32, 1).fillEllipse(0, cy + 50, 440, 150);
      art.fillStyle(0xcdb57d, 1).fillPoints([{ x: -42, y: cy - 20 }, { x: 42, y: cy - 20 }, { x: 78, y: cy + 118 }, { x: -78, y: cy + 118 }] as never, true);
      for (let k = -1; k <= 1; k++) art.fillStyle(0xf1e3b8, 1).fillRoundedRect(k * 14 - 3, cy + 56, 6, 56, 2);
      art.fillStyle(0xffe9a8, 1).fillRect(-12, cy + 54, 11, 3).fillRect(1, cy + 54, 11, 3);
      cont.add(art);
      const bat = this.add.graphics();
      bat.fillStyle(0x2a2a2a, 1).fillRoundedRect(-3, -60, 6, 36, 2);
      bat.fillStyle(0xe8c98a, 1).fillRoundedRect(-11, -26, 22, 100, 5);
      bat.fillStyle(0xffffff, 0.3).fillRect(-7, -22, 4, 90);
      bat.setPosition(-110, cy - 10).setRotation(-0.5);
      const ball = this.add.graphics();
      ball.fillStyle(0xd62828, 1).fillCircle(0, 0, 16);
      ball.lineStyle(2, 0xffffff, 0.8).beginPath().arc(0, 0, 11, -1, 1).strokePath();
      ball.fillStyle(0xffffff, 0.7).fillCircle(-5, -6, 4);
      ball.setPosition(110, cy - 40);
      cont.add([bat, ball]);
      this.tweens.add({ targets: ball, y: cy + 20, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      this.tweens.add({ targets: bat, rotation: 0.3, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }

    cont.add(display(this, 0, -h / 2 + 268, c.title, 44, hex(c.accent), [0.5, 0]));
    cont.add(ui(this, 0, -h / 2 + 322, c.tag, 16, COLORS.textDim, { origin: [0.5, 0] }));
    c.lines.forEach((l, k) => cont.add(ui(this, 0, -h / 2 + 354 + k * 26, `▸ ${l}`, 17, '#d8ffe0', { origin: [0.5, 0] })));

    const btn = this.add.graphics();
    btn.fillStyle(c.accent, 1).fillPoints(chamfer(-110, h / 2 - 66, 220, 46, 10), true);
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
    if (i === 0) this.shooterCard = cont;
  }

  private shooterCard?: Phaser.GameObjects.Container;

  update(_t: number, delta: number): void {
    this.t += delta / 1000;
    const c = this.shooterCard;
    if (this.view && c) {
      this.view.container.setAlpha(c.alpha);
      this.view.update(
        { x: 340, y: 285, aim: Math.sin(this.t * 0.8) * 0.45, vx: 0, grounded: true, jetting: false, alive: true, hp: 100, armor: 50, protectedFx: false },
        delta / 1000,
      );
      this.view.container.setDepth(5).setAlpha(c.alpha);
    }
  }
}
