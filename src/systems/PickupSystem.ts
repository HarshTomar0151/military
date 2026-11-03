import Phaser from 'phaser';
import { DEPTH, hex } from '../config';
import type { PickupKind, PickupSpawn } from '../data/maps';
import type { Player } from '../entities/Player';
import { PICKUP_RESPAWN_MS } from '../../shared/protocol';
import { bakeTexture, partImage } from './Bake';

interface Item {
  idx: number;
  spawn: PickupSpawn;
  view: Phaser.GameObjects.Container;
  ready: boolean;
  readyAt: number;
  pendingUntil: number;
}

const KIND_COLOR: Record<PickupKind, number> = { health: 0x39ff14, armor: 0x35d6ff, ammo: 0xffb020 };

export class PickupSystem {
  private items: Item[] = [];

  constructor(private scene: Phaser.Scene, spawns: PickupSpawn[]) {
    for (const kind of Object.keys(KIND_COLOR) as PickupKind[]) this.bake(kind);
    spawns.forEach((s, idx) => {
      const glow = partImage(scene, `pk:glow:${s.kind}`, -40, -40, 80, 80).setBlendMode(Phaser.BlendModes.ADD);
      const box = partImage(scene, `pk:box:${s.kind}`, -16, -16, 32, 32);
      const view = scene.add.container(s.x, s.y, [glow, box]).setDepth(DEPTH.pickups);
      scene.tweens.add({ targets: box, y: -4, duration: 900 + (idx % 3) * 120, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      this.items.push({ idx, spawn: s, view, ready: true, readyAt: 0, pendingUntil: 0 });
    });
  }

  private bake(kind: PickupKind): void {
    const color = KIND_COLOR[kind];
    bakeTexture(this.scene, `pk:glow:${kind}`, -40, -40, 80, 80, (g) => {
      g.fillStyle(color, 0.1).fillCircle(0, 0, 36);
      g.fillStyle(color, 0.18).fillCircle(0, 0, 26);
    });
    bakeTexture(this.scene, `pk:box:${kind}`, -16, -16, 32, 32, (g) => {
      g.fillStyle(0x0d1610, 1).fillRoundedRect(-14, -14, 28, 28, 5);
      g.lineStyle(2, color, 1).strokeRoundedRect(-14, -14, 28, 28, 5);
      g.fillStyle(color, 1);
      if (kind === 'health') {
        g.fillRect(-3.5, -9, 7, 18).fillRect(-9, -3.5, 18, 7);
      } else if (kind === 'armor') {
        g.fillPoints(
          [
            new Phaser.Math.Vector2(-9, -9), new Phaser.Math.Vector2(9, -9), new Phaser.Math.Vector2(9, 2),
            new Phaser.Math.Vector2(0, 10), new Phaser.Math.Vector2(-9, 2),
          ],
          true,
        );
      } else {
        g.fillRect(-8, -2, 4, 11).fillRect(-2, -5, 4, 14).fillRect(4, -2, 4, 11);
        g.fillStyle(0x0d1610, 1).fillRect(-9, 6, 18, 2);
      }
    });
  }

  get spawns(): PickupSpawn[] {
    return this.items.map((i) => i.spawn);
  }

  update(now: number): void {
    for (const it of this.items) {
      if (!it.ready && now >= it.readyAt) this.setReady(it, true);
    }
  }

  private setReady(it: Item, ready: boolean): void {
    it.ready = ready;
    it.view.setVisible(ready);
  }

  /** Returns the first collectable item this player is touching. */
  find(p: Player, now: number): Item | null {
    for (const it of this.items) {
      if (!it.ready || now < it.pendingUntil) continue;
      if (Math.abs(it.spawn.x - p.x) > 30 || Math.abs(it.spawn.y - p.y) > 40) continue;
      if (it.spawn.kind === 'health' && p.hp >= 100) continue;
      if (it.spawn.kind === 'armor' && p.armor >= 50) continue;
      return it;
    }
    return null;
  }

  /** Nearest ready item of a kind (used by bots). */
  nearest(kind: PickupKind, x: number, y: number): PickupSpawn | null {
    let best: PickupSpawn | null = null;
    let bd = Infinity;
    for (const it of this.items) {
      if (!it.ready || it.spawn.kind !== kind) continue;
      const d = Math.hypot(it.spawn.x - x, (it.spawn.y - y) * 1.5);
      if (d < bd) {
        bd = d;
        best = it.spawn;
      }
    }
    return best;
  }

  take(idx: number, now: number): void {
    const it = this.items[idx];
    if (!it) return;
    it.readyAt = now + PICKUP_RESPAWN_MS;
    this.setReady(it, false);
  }

  /** Online: mark as awaiting server confirmation so we don't spam requests. */
  markPending(idx: number, now: number): void {
    this.items[idx].pendingUntil = now + 800;
  }

  static colorOf(kind: PickupKind): string {
    return hex(KIND_COLOR[kind]);
  }
}
