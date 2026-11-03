import Phaser from 'phaser';
import { emptyControls, type Controls } from '../entities/Player';
import { store } from './Storage';

/** Written by the on-screen TouchControls (HUD scene), read by InputManager every frame. */
export const touchState = {
  active: false,
  moveX: 0,
  moveY: 0,
  aimActive: false,
  aimAngle: 0,
  aimMag: 0,
  shoot: false,
  jump: false,
  jet: false,
  switchWeapon: false,
  reload: false,
  grenade: false,
};

/** Merges keyboard, mouse and touch into one Controls object for the local player. */
export class InputManager {
  private keys: Record<string, Phaser.Input.Keyboard.Key> = {};
  private pending = { reload: false, switchWeapon: false, grenade: false };
  private lastAim = 0;
  private touch: boolean;
  /** Where the crosshair should be drawn on the screen (game coords). */
  crosshair = { x: 640, y: 360 };

  constructor(private scene: Phaser.Scene) {
    this.touch = store.touchEnabled();
    const kb = scene.input.keyboard;
    if (kb) {
      const k = Phaser.Input.Keyboard.KeyCodes;
      this.keys = kb.addKeys({
        left: k.A, right: k.D, left2: k.LEFT, right2: k.RIGHT, up: k.W, up2: k.UP,
        jump: k.SPACE, jet: k.SHIFT, reload: k.R, switchW: k.Q, grenade: k.G, s1: k.ONE, s2: k.TWO,
      }) as Record<string, Phaser.Input.Keyboard.Key>;
      kb.addCapture('SPACE,UP,DOWN,LEFT,RIGHT,TAB');
      this.keys.reload.on('down', () => (this.pending.reload = true));
      this.keys.switchW.on('down', () => (this.pending.switchWeapon = true));
      this.keys.grenade.on('down', () => (this.pending.grenade = true));
    }
    scene.input.mouse?.disableContextMenu();
    scene.input.addPointer(3);
    scene.input.on('wheel', () => (this.pending.switchWeapon = true));
    scene.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (!this.touch && p.rightButtonDown()) this.pending.grenade = true;
    });
  }

  get usingTouch(): boolean {
    return this.touch;
  }

  poll(shoulderX: number, shoulderY: number): Controls {
    const c = emptyControls();
    const cam = this.scene.cameras.main;

    if (this.touch) {
      const t = touchState;
      c.moveX = t.moveX;
      c.jump = t.jump;
      c.jet = t.jet || t.moveY < -0.7;
      c.shoot = t.shoot || (store.settings.autoFire && t.aimActive && t.aimMag > 0.82);
      if (t.aimActive) this.lastAim = t.aimAngle;
      c.aim = this.lastAim;
      c.reload = this.pending.reload || t.reload;
      c.switchWeapon = this.pending.switchWeapon || t.switchWeapon;
      c.grenade = this.pending.grenade || t.grenade;
      t.reload = t.switchWeapon = t.grenade = false;
      const sx = (shoulderX - cam.worldView.x) * cam.zoom;
      const sy = (shoulderY - cam.worldView.y) * cam.zoom;
      this.crosshair = { x: sx + Math.cos(c.aim) * 170, y: sy + Math.sin(c.aim) * 170 };
    } else {
      const k = this.keys;
      const left = k.left?.isDown || k.left2?.isDown;
      const right = k.right?.isDown || k.right2?.isDown;
      c.moveX = (right ? 1 : 0) - (left ? 1 : 0);
      c.jump = !!(k.jump?.isDown || k.up?.isDown || k.up2?.isDown);
      c.jet = !!k.jet?.isDown;
      const p = this.scene.input.activePointer;
      c.shoot = p.leftButtonDown();
      const wp = cam.getWorldPoint(p.x, p.y);
      c.aim = Math.atan2(wp.y - shoulderY, wp.x - shoulderX);
      c.reload = this.pending.reload;
      c.switchWeapon = this.pending.switchWeapon;
      c.grenade = this.pending.grenade;
      this.crosshair = { x: p.x, y: p.y };
    }
    this.pending.reload = this.pending.switchWeapon = this.pending.grenade = false;
    return c;
  }

  destroy(): void {
    const kb = this.scene.input.keyboard;
    if (kb) {
      kb.removeCapture('SPACE,UP,DOWN,LEFT,RIGHT,TAB');
      Object.values(this.keys).forEach((k) => kb.removeKey(k, true));
    }
    this.scene.input.off('wheel');
    this.scene.input.off('pointerdown');
  }
}
