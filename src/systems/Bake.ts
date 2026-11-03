import Phaser from 'phaser';

const BAKE_SCALE = 2;

/**
 * Renders procedural drawing (in local coordinates, region rx,ry,w,h) into a cached texture at 2x.
 * Images made from baked parts batch together, unlike many small Graphics objects.
 */
export function bakeTexture(
  scene: Phaser.Scene, key: string, rx: number, ry: number, w: number, h: number,
  draw: (g: Phaser.GameObjects.Graphics) => void,
): void {
  if (scene.textures.exists(key)) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.scaleCanvas(BAKE_SCALE, BAKE_SCALE);
  g.translateCanvas(-rx, -ry);
  draw(g);
  g.generateTexture(key, Math.ceil(w * BAKE_SCALE), Math.ceil(h * BAKE_SCALE));
  g.destroy();
}

/** Image whose local (0,0) maps to (x,y), matching the coordinates the texture was drawn in. */
export function partImage(
  scene: Phaser.Scene, key: string, rx: number, ry: number, w: number, h: number, x = 0, y = 0,
): Phaser.GameObjects.Image {
  return scene.add.image(x, y, key).setOrigin(-rx / w, -ry / h).setScale(1 / BAKE_SCALE);
}
