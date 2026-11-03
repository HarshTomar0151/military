import Phaser from 'phaser';
import { COLORS, FONT_DISPLAY, GAME_H, GAME_W, hex } from '../config';
import { PlayerView } from '../entities/PlayerView';
import { isWeaponId, type WeaponId } from '../data/weapons';
import { audio } from '../systems/AudioManager';
import { canFullscreen, isFullscreen, isStandalone, isTouchDevice, toggleFullscreen } from '../systems/Fullscreen';
import { store } from '../systems/Storage';
import { button, createBackdrop, display, fadeTo, panel, ui } from '../ui/theme';
import type { GameConfig } from './GameScene';

export class MenuScene extends Phaser.Scene {
  private view?: PlayerView;
  private t = 0;

  constructor() {
    super('Menu');
  }

  create(): void {
    this.cameras.main.fadeIn(300, 0, 0, 0);
    createBackdrop(this);
    this.t = 0;

    // ---- title
    const title = this.add
      .text(64, 70, 'JETFRONT', { fontFamily: FONT_DISPLAY, fontSize: '82px', fontStyle: '900', color: hex(COLORS.neon) })
      .setStroke('#0b3a06', 8)
      .setShadow(0, 0, hex(COLORS.neon), 22, true, true);
    this.tweens.add({ targets: title, alpha: 0.88, duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    ui(this, 68, 168, 'TACTICAL JETPACK WARFARE', 20, COLORS.textDim);
    const bar = this.add.graphics();
    bar.fillStyle(COLORS.neon, 1).fillRect(68, 200, 64, 3);
    bar.fillStyle(COLORS.neonDim, 1).fillRect(136, 200, 220, 1);

    // ---- buttons
    const items: { label: string; fn: () => void; primary?: boolean }[] = [
      { label: 'PLAY', primary: true, fn: () => this.quickPlay() },
      { label: 'PRACTICE', fn: () => fadeTo(this, 'Practice') },
      { label: 'MULTIPLAYER', fn: () => fadeTo(this, 'Lobby') },
      { label: 'CUSTOMIZE', fn: () => fadeTo(this, 'Customize') },
      { label: 'HOW TO PLAY', fn: () => fadeTo(this, 'HowTo') },
      { label: 'SETTINGS', fn: () => fadeTo(this, 'Settings') },
    ];
    items.forEach((it, i) => {
      const b = button(this, 68 + 170, 252 + i * 64, 340, 54, it.label, it.fn, { primary: it.primary, fontSize: 20 });
      b.setAlpha(0);
      b.x -= 30;
      this.tweens.add({ targets: b, alpha: 1, x: b.x + 30, delay: 120 + i * 70, duration: 350, ease: 'Cubic.easeOut' });
    });

    // ---- operator card
    const px = 790;
    const py = 96;
    panel(this, px, py, 440, 520, { title: 'OPERATOR PROFILE' });
    const d = store.data;
    this.view = new PlayerView(this, d.appearance, -1, null, 3.6);
    this.view.container.setPosition(px + 220, py + 215).setDepth(5);
    this.view.setWeapon(isWeaponId(d.primary) ? (d.primary as WeaponId) : 'assault');
    const floor = this.add.graphics();
    floor.fillStyle(COLORS.neon, 0.1).fillEllipse(px + 220, py + 330, 190, 26);
    floor.lineStyle(1.5, COLORS.neon, 0.5).strokeEllipse(px + 220, py + 330, 190, 26);

    display(this, px + 220, py + 352, d.name.toUpperCase(), 24, '#d8ffe0', [0.5, 0]);
    const lv = store.levelInfo();
    ui(this, px + 220, py + 386, `LEVEL ${lv.level}`, 18, hex(COLORS.neon), { origin: [0.5, 0] });
    const xp = this.add.graphics();
    xp.fillStyle(0x0a110c, 1).fillRect(px + 60, py + 414, 320, 10);
    xp.fillStyle(COLORS.neon, 1).fillRect(px + 61, py + 415, 318 * (lv.into / lv.need), 8);
    ui(this, px + 220, py + 428, `${lv.into} / ${lv.need} XP`, 13, COLORS.textDim, { origin: [0.5, 0] });
    const s = d.stats;
    const kd = s.deaths ? (s.kills / s.deaths).toFixed(2) : s.kills.toFixed(2);
    const stat = (x: number, label: string, value: string): void => {
      display(this, px + x, py + 456, value, 20, '#d8ffe0', [0.5, 0]);
      ui(this, px + x, py + 484, label, 12, COLORS.textDim, { origin: [0.5, 0] });
    };
    stat(80, 'KILLS', String(s.kills));
    stat(180, 'K/D', kd);
    stat(280, 'MATCHES', String(s.matches));
    stat(380, 'WINS', String(s.wins));

    ui(this, GAME_W - 20, GAME_H - 26, 'v0.1.0  ·  Phaser 3 · Socket.IO', 12, '#456a52', { origin: [1, 0.5] });

    // fullscreen toggle
    const fs = ui(this, 68, GAME_H - 30, '⛶ FULLSCREEN', 14, COLORS.textDim, { origin: [0, 0.5] }).setInteractive({ useHandCursor: true });
    fs.on('pointerover', () => fs.setColor('#39ff14'));
    fs.on('pointerout', () => fs.setColor(COLORS.textDim));
    fs.on('pointerdown', () => {
      audio.play('ui');
      void toggleFullscreen();
    });

    // prominent fullscreen button for phones / tablets
    if (isTouchDevice() && !isStandalone()) {
      if (canFullscreen()) {
        const fsBtn = button(this, GAME_W - 150, 46, 230, 46, '', () => void toggleFullscreen(), { primary: !isFullscreen(), fontSize: 14 });
        const sync = (): void => {
          fsBtn.setText(isFullscreen() ? '⛶ EXIT FULLSCREEN' : '⛶ GO FULLSCREEN');
        };
        sync();
        document.addEventListener('fullscreenchange', sync);
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => document.removeEventListener('fullscreenchange', sync));
      } else {
        // iPhone Safari has no fullscreen API
        ui(this, GAME_W - 30, 36, 'Full screen: Share ▸ Add to Home Screen', 15, '#ffb020', { origin: [1, 0.5] });
      }
    }
  }

  update(_t: number, delta: number): void {
    this.t += delta / 1000;
    const aim = Math.sin(this.t * 0.7) * 0.5 + (Math.sin(this.t * 0.3) > 0 ? 0 : 0);
    this.view?.update(
      { x: 790 + 220, y: 96 + 215, aim, vx: 0, grounded: true, jetting: false, alive: true, hp: 100, armor: 50, protectedFx: false },
      delta / 1000,
    );
  }

  private quickPlay(): void {
    const p = store.data.practice;
    const cfg: GameConfig = { online: false, mode: p.mode, mapId: p.mapId, bots: p.bots, difficulty: p.difficulty };
    if (!store.data.seenIntro) fadeTo(this, 'HowTo', { next: 'Game', nextData: cfg });
    else fadeTo(this, 'Game', cfg);
  }
}
