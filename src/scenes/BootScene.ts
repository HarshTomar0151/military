import Phaser from 'phaser';
import { PHYS } from '../config';
import { invite } from '../systems/Invite';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    // invisible physics hitbox shared by every operator
    const g = this.add.graphics();
    g.fillStyle(0xffffff, 0.01).fillRect(0, 0, PHYS.bodyW, PHYS.bodyH);
    g.generateTexture('hitbox', PHYS.bodyW, PHYS.bodyH);
    g.destroy();
    const p = this.add.graphics();
    p.fillStyle(0xffffff, 1).fillRect(0, 0, 1, 1);
    p.generateTexture('pv:pixel', 1, 1);
    p.destroy();

    const fonts = ['700 20px Orbitron', '500 18px Rajdhani', '700 18px Rajdhani'];
    const ready = Promise.all(fonts.map((f) => document.fonts.load(f).catch(() => undefined)));
    const timeout = new Promise((r) => setTimeout(r, 2500));
    void Promise.race([ready, timeout]).then(() => {
      document.getElementById('boot')?.classList.add('hide');
      if (invite.room) {
        const code = invite.room;
        invite.room = '';
        this.scene.start(invite.game === 'cricket' ? 'CricketLobby' : invite.game === 'ludo' ? 'LudoLobby' : 'Lobby', { join: code });
      } else {
        this.scene.start('GameSelect');
      }
    });
  }
}
