import Phaser from 'phaser';
import { DEPTH, GAME_H, GAME_W } from '../config';
import type { MapDef, MapTheme } from '../data/maps';
import type { Rect } from './Collision';

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const shade = (c: number, amt: number): number =>
  amt >= 0 ? Phaser.Display.Color.ValueToColor(c).lighten(amt).color : Phaser.Display.Color.ValueToColor(c).darken(-amt).color;

type G = Phaser.GameObjects.Graphics;

const PARALLAX = { x: -400, y: 100, w: 3100, h: 1100, base: 780 };

/**
 * Draws the sky, parallax backdrop and detailed platforms of a map. The heavy static layers are
 * baked into textures once (and cached per map), so rendering them costs one quad each per frame.
 */
export class MapRenderer {
  constructor(private scene: Phaser.Scene, private map: MapDef) {
    this.sky();
    this.parallax();
    this.platforms();
  }

  private gfx(depth: number, sx = 1, sy = 1): G {
    return this.scene.add.graphics().setDepth(depth).setScrollFactor(sx, sy);
  }

  /** Renders `draw` into a texture covering world region (x, y, w, h) at the given scale. */
  private bake(key: string, x: number, y: number, w: number, h: number, scale: number, draw: (g: G) => void): void {
    if (this.scene.textures.exists(key)) return;
    const g = this.scene.make.graphics({ x: 0, y: 0 }, false);
    g.scaleCanvas(scale, scale);
    g.translateCanvas(-x, -y);
    draw(g);
    g.generateTexture(key, Math.ceil(w * scale), Math.ceil(h * scale));
    g.destroy();
  }

  private sky(): void {
    const t = this.map.theme;
    const g = this.gfx(-100, 0, 0);
    g.fillGradientStyle(t.skyTop, t.skyTop, t.skyBottom, t.skyBottom, 1);
    g.fillRect(-GAME_W * 0.25, -GAME_H * 0.25, GAME_W * 1.5, GAME_H * 1.5);
    const rand = rng(11);
    // bright daytime sky: sun + soft clouds
    const sun = this.map.style === 'desert' ? { x: 880, y: 330, r: 66 } : { x: 1040, y: 150, r: 44 };
    g.fillStyle(0xfff6c8, 0.2).fillCircle(sun.x, sun.y, sun.r * 2.6);
    g.fillStyle(0xfff3b0, 0.45).fillCircle(sun.x, sun.y, sun.r * 1.6);
    g.fillStyle(0xfffbe8, 1).fillCircle(sun.x, sun.y, sun.r);
    for (let i = 0; i < 9; i++) {
      const cx = rand() * GAME_W * 1.3 - 100;
      const cy = 40 + rand() * 260;
      const w = 90 + rand() * 120;
      g.fillStyle(0xffffff, 0.55);
      g.fillEllipse(cx, cy, w, w * 0.32).fillEllipse(cx - w * 0.28, cy + w * 0.05, w * 0.6, w * 0.26).fillEllipse(cx + w * 0.3, cy + w * 0.06, w * 0.55, w * 0.24);
    }
  }

  private parallax(): void {
    const t = this.map.theme;
    const id = this.map.id;
    const P = PARALLAX;
    this.bake(`${id}:far`, P.x, P.y, P.w, P.h, 0.5, (g) => this.drawFar(g, t));
    this.bake(`${id}:mid`, P.x, P.y, P.w, P.h, 0.5, (g) => this.drawMid(g, t));
    this.scene.add.image(P.x, P.y, `${id}:far`).setOrigin(0, 0).setScale(2).setScrollFactor(0.1, 0.06).setDepth(-90);
    this.scene.add.image(P.x, P.y, `${id}:mid`).setOrigin(0, 0).setScale(2).setScrollFactor(0.26, 0.12).setDepth(-80);
    const fog = this.gfx(-70, 0.3, 0.14);
    fog.fillGradientStyle(t.fog, t.fog, t.fog, t.fog, 0, 0, 0.25, 0.25);
    fog.fillRect(-400, P.base - 40, 3000, 260);
  }

  private drawFar(far: G, t: MapTheme): void {
    const rand = rng(this.map.style.length * 97);
    const base = PARALLAX.base;
    if (this.map.style === 'military') {
      for (let x = -300; x < 2300; ) {
        const w = 60 + rand() * 90;
        const h = 120 + rand() * 280;
        far.fillStyle(t.far, 1).fillRect(x, base - h, w, h + 300);
        for (let i = 0; i < 6; i++) {
          if (rand() < 0.4) far.fillStyle(0xffd070, 0.35).fillRect(x + 6 + rand() * (w - 14), base - h + 10 + rand() * (h - 20), 4, 5);
        }
        x += w + rand() * 12;
      }
    } else if (this.map.style === 'desert') {
      far.fillStyle(t.far, 1);
      far.beginPath();
      far.moveTo(-400, base + 300);
      for (let x = -400; x <= 2600; x += 40) far.lineTo(x, base - 80 - Math.sin(x * 0.004) * 60 - Math.sin(x * 0.011 + 1) * 30);
      far.lineTo(2600, base + 300);
      far.closePath();
      far.fillPath();
    } else {
      for (let x = -300; x < 2400; x += 70 + rand() * 60) {
        const h = 200 + rand() * 260;
        far.fillStyle(t.far, 1).fillRect(x, base - h, 14, h + 300);
        far.fillCircle(x + 7, base - h, 50 + rand() * 40);
        far.fillCircle(x - 30, base - h + 25, 36).fillCircle(x + 44, base - h + 20, 40);
      }
    }
  }

  private drawMid(mid: G, t: MapTheme): void {
    const rand = rng(this.map.style.length * 193);
    const base = PARALLAX.base;
    if (this.map.style === 'military') {
      for (let x = -200; x < 2400; ) {
        const kind = rand();
        if (kind < 0.4) {
          const w = 200 + rand() * 120;
          mid.fillStyle(t.mid, 1).fillRoundedRect(x, base - 100, w, 360, { tl: 70, tr: 70, bl: 0, br: 0 });
          mid.fillStyle(shade(t.mid, -8), 1).fillRect(x + w * 0.3, base - 60, w * 0.4, 260);
          x += w + 80 + rand() * 120;
        } else if (kind < 0.75) {
          mid.fillStyle(t.mid, 1).fillRect(x, base - 280, 26, 560);
          mid.fillRect(x - 24, base - 300, 74, 40);
          mid.fillStyle(0xff3030, 0.9).fillCircle(x + 13, base - 312, 4);
          mid.fillStyle(0xfff0a0, 0.06).fillTriangle(x + 13, base - 290, x - 220, base + 60, x + 250, base + 60);
          x += 140 + rand() * 120;
        } else {
          mid.fillStyle(t.mid, 1).fillRect(x + 20, base - 90, 14, 200);
          mid.fillEllipse(x + 27, base - 100, 100, 34);
          x += 160 + rand() * 100;
        }
      }
    } else if (this.map.style === 'desert') {
      for (let x = -300; x < 2500; ) {
        const w = 160 + rand() * 220;
        const h = 150 + rand() * 230;
        mid.fillStyle(t.mid, 1);
        mid.fillPoints(
          [
            new Phaser.Math.Vector2(x, base + 120), new Phaser.Math.Vector2(x + w * 0.12, base - h),
            new Phaser.Math.Vector2(x + w * 0.88, base - h), new Phaser.Math.Vector2(x + w, base + 120),
          ],
          true,
        );
        mid.fillStyle(shade(t.mid, -12), 1).fillRect(x + w * 0.08, base - h + 40, w * 0.84, 4);
        mid.fillRect(x + w * 0.05, base - h + 90, w * 0.9, 4);
        x += w + 120 + rand() * 260;
      }
    } else {
      for (let x = -250; x < 2400; x += 230 + rand() * 160) {
        const w = 50 + rand() * 40;
        mid.fillStyle(t.mid, 1).fillRect(x, base - 520, w, 900);
        mid.fillStyle(shade(t.mid, -8), 1).fillRect(x + w * 0.65, base - 520, w * 0.35, 900);
        mid.fillStyle(t.mid, 1).fillCircle(x + w / 2, base - 520, 120).fillCircle(x - 70, base - 470, 80).fillCircle(x + w + 70, base - 470, 90);
        for (let v = 0; v < 3; v++) {
          const vx = x + rand() * w;
          mid.lineStyle(3, shade(t.mid, 10), 0.8).lineBetween(vx, base - 400, vx + (rand() - 0.5) * 20, base - 400 + 100 + rand() * 160);
        }
      }
    }
  }

  private platforms(): void {
    const key = `${this.map.id}:platforms`;
    this.bake(key, 0, 0, this.map.w, this.map.h, 1, (g) => {
      const rand = rng(1234);
      this.map.solids.forEach((r, i) => {
        if (i >= 1 && i <= 3) return; // outer walls / ceiling are never on screen
        this.drawSolid(g, r, i === 0, rand);
      });
    });
    this.scene.add.image(0, 0, key).setOrigin(0, 0).setDepth(DEPTH.platforms);
  }

  private drawSolid(g: G, r: Rect, floor: boolean, rand: () => number): void {
    const t = this.map.theme;
    const style = this.map.style;
    const body = floor ? t.ground : t.platform;
    const top = floor ? t.groundTop : t.platformTop;
    const thin = r.h <= 40;
    const trunk = style === 'jungle' && r.w <= 90 && r.h > 160;

    g.fillStyle(0x000000, 0.28).fillRect(r.x + 5, r.y + 6, r.w, r.h);
    g.fillStyle(trunk ? 0x3a2a18 : body, 1).fillRect(r.x, r.y, r.w, r.h);

    if (style === 'military') {
      if (!thin) {
        for (let x = r.x + 40; x < r.x + r.w - 10; x += 60) g.fillStyle(0x000000, 0.18).fillRect(x, r.y + 6, 2, r.h - 6);
        for (let y = r.y + 40; y < r.y + r.h - 10; y += 60) g.fillStyle(0x000000, 0.14).fillRect(r.x, y, r.w, 2);
        if (r.h > 80 && r.w > 90 && !floor) {
          g.fillStyle(t.accent, 0.85).fillRect(r.x + 12, r.y + 18, 38, 6);
          g.fillStyle(0x000000, 0.35).fillRect(r.x + 12, r.y + 30, 24, 4);
        }
      } else {
        for (let x = r.x; x < r.x + r.w - 12; x += 24) {
          g.fillStyle(t.accent, 0.9).fillTriangle(x, r.y + r.h, x + 12, r.y + r.h, x + 12, r.y + r.h - 6);
          g.fillStyle(0x101412, 0.9).fillTriangle(x + 12, r.y + r.h, x + 24, r.y + r.h, x + 24, r.y + r.h - 6);
        }
      }
      g.fillStyle(0xffffff, 0.14);
      for (let x = r.x + 8; x < r.x + r.w - 6; x += 38) g.fillRect(x, r.y + 9, 3, 3);
    } else if (style === 'desert') {
      for (let i = 0; i < Math.floor(r.h / 20); i++) {
        g.fillStyle(0x000000, 0.08 + rand() * 0.08).fillRect(r.x, r.y + 14 + i * 20 + rand() * 6, r.w, 3 + rand() * 4);
      }
      for (let i = 0; i < r.w / 90; i++) {
        const cx = r.x + rand() * r.w;
        g.lineStyle(1.5, 0x000000, 0.2).lineBetween(cx, r.y + 8, cx + (rand() - 0.5) * 18, r.y + Math.min(r.h, 44));
      }
      if (r.w > 140 && rand() < 0.7) {
        const cx = r.x + 20 + rand() * (r.w - 40);
        g.fillStyle(0x3f7a38, 1).fillRoundedRect(cx - 4, r.y - 30, 8, 30, 3).fillRoundedRect(cx - 14, r.y - 20, 6, 12, 3).fillRoundedRect(cx + 8, r.y - 24, 6, 14, 3);
      }
    } else if (trunk) {
      for (let x = r.x + 8; x < r.x + r.w - 4; x += 12) g.fillStyle(0x000000, 0.22).fillRect(x, r.y, 2, r.h);
      for (let i = 0; i < r.h / 160; i++) g.fillStyle(0x000000, 0.35).fillEllipse(r.x + 15 + rand() * (r.w - 30), r.y + 60 + i * 150, 12, 18);
    } else if (style === 'jungle') {
      for (let x = r.x + 10; x < r.x + r.w - 4; x += 16 + rand() * 12) g.fillStyle(0x000000, 0.2).fillRect(x, r.y + 5, 2, r.h - 5);
      for (let x = r.x + 10; x < r.x + r.w - 6; x += 22 + rand() * 34) {
        const len = 14 + rand() * 42;
        g.lineStyle(2, 0x2f7a2a, 0.9).lineBetween(x, r.y + r.h, x + (rand() - 0.5) * 6, r.y + r.h + len);
        g.fillStyle(0x4fa23a, 1).fillCircle(x, r.y + r.h + len, 3.5);
      }
    }

    const strip = Math.min(floor ? 10 : 7, r.h);
    if (style === 'jungle' && !trunk) {
      g.fillStyle(top, 1).fillRect(r.x - 3, r.y - 4, r.w + 6, strip + 4);
      for (let x = r.x; x < r.x + r.w; x += 9) g.fillStyle(shade(top, 8), 1).fillCircle(x + rand() * 6, r.y - 3, 4 + rand() * 2);
    } else if (!trunk) {
      g.fillStyle(top, 1).fillRect(r.x, r.y, r.w, strip);
      g.fillStyle(0xffffff, 0.22).fillRect(r.x, r.y, r.w, 1.5);
    } else {
      g.fillStyle(0x4fa23a, 1).fillRect(r.x - 3, r.y - 2, r.w + 6, 8);
    }
    g.lineStyle(2, t.edge, 1).strokeRect(r.x, r.y, r.w, r.h);
  }
}
