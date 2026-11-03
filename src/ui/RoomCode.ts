import Phaser from 'phaser';
import type { GameKind } from '../../shared/protocol';
import { COLORS, FONT_DISPLAY, hex } from '../config';
import { copyText, shareRoom } from '../systems/Invite';
import { button, ui } from './theme';

/**
 * Big room-code card with COPY / SHARE buttons so the host can send the room to a friend
 * (WhatsApp share sheet on phones, clipboard on desktop).
 */
export function roomCodeCard(scene: Phaser.Scene, x: number, y: number, w: number, id: string, game: GameKind, accent: number = COLORS.neon): Phaser.GameObjects.Container {
  const c = scene.add.container(x, y);
  const g = scene.add.graphics();
  g.fillStyle(0x0a110c, 1).fillRect(0, 0, w, 150);
  g.lineStyle(2, accent, 0.9).strokeRect(0, 0, w, 150);
  c.add(g);
  c.add(ui(scene, w / 2, 12, 'ROOM CODE — SHARE WITH YOUR FRIEND', 13, '#7fa889', { origin: [0.5, 0] }));

  const chars = id.split('');
  const boxW = 58;
  const gap = 10;
  const total = chars.length * boxW + (chars.length - 1) * gap;
  chars.forEach((ch, i) => {
    const bx = (w - total) / 2 + i * (boxW + gap);
    const b = scene.add.graphics();
    b.fillStyle(accent, 0.15).fillRoundedRect(bx, 36, boxW, 64, 8);
    b.lineStyle(2, accent, 1).strokeRoundedRect(bx, 36, boxW, 64, 8);
    c.add(b);
    c.add(scene.add.text(bx + boxW / 2, 68, ch, { fontFamily: FONT_DISPLAY, fontSize: '40px', fontStyle: '900', color: hex(accent) }).setOrigin(0.5));
  });

  const toast = ui(scene, w / 2, 106, '', 14, '#ffffff', { origin: [0.5, 0] });
  c.add(toast);
  const say = (t: string): void => {
    toast.setText(t);
    scene.time.delayedCall(2200, () => toast.active && toast.setText(''));
  };
  c.add(button(scene, w / 2 - w * 0.24, 128, w * 0.44, 34, 'COPY CODE', async () => say((await copyText(id)) ? 'Code copied!' : 'Could not copy'), { fontSize: 12 }));
  c.add(button(scene, w / 2 + w * 0.24, 128, w * 0.44, 34, 'SHARE LINK', async () => {
    const r = await shareRoom(id, game);
    if (r === 'copied') say('Invite link copied — paste it to your friend');
    else if (r === 'failed') say('Could not share');
  }, { fontSize: 12, primary: true }));
  return c;
}
