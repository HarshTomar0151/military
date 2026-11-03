import Phaser from 'phaser';
import { HUD } from '../ui/HUD';
import type { GameScene } from './GameScene';

/** Parallel scene drawn on top of GameScene so the HUD ignores camera zoom/scroll. */
export class HUDScene extends Phaser.Scene {
  private hud?: HUD;

  constructor() {
    super('HUD');
  }

  create(data: { game: GameScene }): void {
    this.hud = new HUD(this, data.game);
  }

  update(_t: number, delta: number): void {
    this.hud?.update(delta / 1000);
  }
}
