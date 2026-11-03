import Phaser from 'phaser';
import { COLORS, FONT_DISPLAY, FONT_UI, GAME_H, GAME_W, SCREEN_W, hex, viewPad } from '../config';
import { canFullscreen, isStandalone, isTouchDevice } from '../systems/Fullscreen';
import { audio } from '../systems/AudioManager';

export function ui(
  scene: Phaser.Scene, x: number, y: number, text: string, size = 20, color = COLORS.text,
  opts: { bold?: boolean; origin?: [number, number]; align?: string; width?: number } = {},
): Phaser.GameObjects.Text {
  const t = scene.add.text(x, y, text, {
    fontFamily: FONT_UI, fontSize: `${size}px`, fontStyle: opts.bold === false ? '500' : '700', color,
    align: opts.align ?? 'left', wordWrap: opts.width ? { width: opts.width } : undefined,
  });
  t.setOrigin(...(opts.origin ?? [0, 0]));
  return t;
}

export function display(
  scene: Phaser.Scene, x: number, y: number, text: string, size = 28, color: string = hex(COLORS.neon),
  origin: [number, number] = [0, 0],
): Phaser.GameObjects.Text {
  const t = scene.add.text(x, y, text, { fontFamily: FONT_DISPLAY, fontSize: `${size}px`, fontStyle: '700', color });
  t.setOrigin(...origin);
  return t;
}

/** Chamfered-corner polygon points. */
export function chamfer(x: number, y: number, w: number, h: number, c: number): Phaser.Math.Vector2[] {
  return [
    new Phaser.Math.Vector2(x + c, y), new Phaser.Math.Vector2(x + w - c, y), new Phaser.Math.Vector2(x + w, y + c),
    new Phaser.Math.Vector2(x + w, y + h - c), new Phaser.Math.Vector2(x + w - c, y + h), new Phaser.Math.Vector2(x + c, y + h),
    new Phaser.Math.Vector2(x, y + h - c), new Phaser.Math.Vector2(x, y + c),
  ];
}

export function panel(
  scene: Phaser.Scene, x: number, y: number, w: number, h: number,
  opts: { fill?: number; alpha?: number; stroke?: number; cut?: number; title?: string } = {},
): Phaser.GameObjects.Container {
  const g = scene.add.graphics();
  const cut = opts.cut ?? 14;
  const pts = chamfer(0, 0, w, h, cut);
  g.fillStyle(opts.fill ?? COLORS.panel, opts.alpha ?? 0.92).fillPoints(pts, true);
  g.lineStyle(1.5, opts.stroke ?? COLORS.line, 1).strokePoints(pts, true);
  g.lineStyle(2, COLORS.neon, 0.9);
  g.beginPath().moveTo(0, 26).lineTo(0, cut).lineTo(cut, 0).lineTo(30, 0).strokePath();
  g.beginPath().moveTo(w, h - 26).lineTo(w, h - cut).lineTo(w - cut, h).lineTo(w - 30, h).strokePath();
  const c = scene.add.container(x, y, [g]);
  if (opts.title) {
    c.add(display(scene, 18, 12, opts.title, 15, hex(COLORS.neon)).setAlpha(0.95));
    const line = scene.add.graphics();
    line.lineStyle(1, COLORS.line, 1).lineBetween(18, 38, w - 18, 38);
    c.add(line);
  }
  return c;
}

export interface ButtonOpts {
  primary?: boolean;
  fontSize?: number;
  disabled?: boolean;
  danger?: boolean;
}

export class Button extends Phaser.GameObjects.Container {
  private bg: Phaser.GameObjects.Graphics;
  private label: Phaser.GameObjects.Text;
  private hit: Phaser.GameObjects.Rectangle;
  private hover = false;
  private down = false;
  private disabled: boolean;

  constructor(
    scene: Phaser.Scene, x: number, y: number, private bw: number, private bh: number, text: string,
    onClick: () => void, private opts: ButtonOpts = {},
  ) {
    super(scene, x, y);
    this.disabled = !!opts.disabled;
    this.bg = scene.add.graphics();
    this.label = scene.add
      .text(0, 0, text, { fontFamily: FONT_DISPLAY, fontSize: `${opts.fontSize ?? 18}px`, fontStyle: '700', color: '#d8ffe0' })
      .setOrigin(0.5);
    this.hit = scene.add.rectangle(0, 0, bw, bh, 0xffffff, 0.001).setInteractive({ useHandCursor: true });
    this.add([this.bg, this.label, this.hit]);
    this.setSize(bw, bh);
    this.draw();
    scene.add.existing(this);

    this.hit.on('pointerover', () => {
      if (this.disabled) return;
      this.hover = true;
      audio.play('hover');
      scene.tweens.add({ targets: this, scale: 1.04, duration: 110, ease: 'Sine.easeOut' });
      this.draw();
    });
    this.hit.on('pointerout', () => {
      this.hover = false;
      this.down = false;
      scene.tweens.add({ targets: this, scale: 1, duration: 110, ease: 'Sine.easeOut' });
      this.draw();
    });
    this.hit.on('pointerdown', () => {
      if (this.disabled) return;
      this.down = true;
      this.setScale(0.97);
      this.draw();
    });
    this.hit.on('pointerup', () => {
      if (this.disabled || !this.down) return;
      this.down = false;
      this.setScale(1.04);
      audio.play(opts.danger ? 'back' : 'ui');
      onClick();
    });
  }

  setText(t: string): this {
    this.label.setText(t);
    return this;
  }

  setDisabled(d: boolean): this {
    this.disabled = d;
    this.draw();
    return this;
  }

  private draw(): void {
    const { bw: w, bh: h } = this;
    const g = this.bg;
    g.clear();
    const accent = this.opts.danger ? COLORS.danger : COLORS.neon;
    const pts = chamfer(-w / 2, -h / 2, w, h, 10);
    if (this.disabled) {
      g.fillStyle(0x0d1410, 0.8).fillPoints(pts, true);
      g.lineStyle(1.5, 0x24352a, 1).strokePoints(pts, true);
      this.label.setColor('#4d6655');
      return;
    }
    if (this.opts.primary) {
      g.fillStyle(accent, this.hover ? 1 : 0.92).fillPoints(pts, true);
      g.lineStyle(2, 0xffffff, this.hover ? 0.5 : 0.15).strokePoints(pts, true);
      this.label.setColor('#041006');
    } else {
      g.fillStyle(this.hover ? 0x18321e : COLORS.panel, 0.95).fillPoints(pts, true);
      g.lineStyle(this.hover ? 2.5 : 1.5, this.hover ? accent : COLORS.neonDim, 1).strokePoints(pts, true);
      if (this.hover) {
        g.fillStyle(accent, 0.12).fillRect(-w / 2 + 4, -h / 2 + 4, w - 8, 3);
        g.lineStyle(6, accent, 0.12).strokePoints(pts, true);
      }
      this.label.setColor(this.opts.danger ? '#ff8a8a' : '#d8ffe0');
    }
  }
}

export function button(
  scene: Phaser.Scene, x: number, y: number, w: number, h: number, text: string, onClick: () => void, opts: ButtonOpts = {},
): Button {
  return new Button(scene, x, y, w, h, text, onClick, opts);
}

/** Cycling selector: ◀ value ▶ */
export function selector<T>(
  scene: Phaser.Scene, x: number, y: number, w: number, label: string, options: { value: T; text: string }[],
  initial: T, onChange: (v: T) => void,
): Phaser.GameObjects.Container {
  const c = scene.add.container(x, y);
  let i = Math.max(0, options.findIndex((o) => o.value === initial));
  const lab = ui(scene, 0, 0, label, 15, COLORS.textDim, { origin: [0, 0.5] });
  const val = display(scene, w - 80, 0, options[i].text, 17, '#d8ffe0', [0.5, 0.5]);
  const step = (d: number): void => {
    i = (i + d + options.length) % options.length;
    val.setText(options[i].text);
    audio.play('ui');
    onChange(options[i].value);
  };
  const mk = (dx: number, s: string, d: number): Phaser.GameObjects.Text => {
    const t = display(scene, dx, 0, s, 18, hex(COLORS.neon), [0.5, 0.5]).setInteractive({ useHandCursor: true });
    t.on('pointerdown', () => step(d));
    t.on('pointerover', () => t.setScale(1.25));
    t.on('pointerout', () => t.setScale(1));
    return t;
  };
  const left = mk(w - 80 - Math.max(70, val.width / 2 + 24), '◀', -1);
  const right = mk(w - 80 + Math.max(70, val.width / 2 + 24), '▶', 1);
  c.add([lab, val, left, right]);
  return c;
}

export function toggle(
  scene: Phaser.Scene, x: number, y: number, label: string, initial: boolean, onChange: (v: boolean) => void,
  width = 420,
): Phaser.GameObjects.Container {
  const c = scene.add.container(x, y);
  let on = initial;
  const lab = ui(scene, 0, 0, label, 17, '#d8ffe0', { origin: [0, 0.5] });
  const g = scene.add.graphics();
  const draw = (): void => {
    g.clear();
    g.fillStyle(on ? COLORS.neonDim : 0x1a241d, 1).fillRoundedRect(width - 64, -13, 64, 26, 13);
    g.lineStyle(1.5, on ? COLORS.neon : COLORS.line, 1).strokeRoundedRect(width - 64, -13, 64, 26, 13);
    g.fillStyle(on ? COLORS.neon : 0x5f7a67, 1).fillCircle(on ? width - 17 : width - 47, 0, 9);
  };
  draw();
  const hit = scene.add.rectangle(width / 2, 0, width, 32, 0xffffff, 0.001).setInteractive({ useHandCursor: true });
  hit.on('pointerdown', () => {
    on = !on;
    audio.play('ui');
    draw();
    onChange(on);
  });
  c.add([lab, g, hit]);
  return c;
}

export function slider(
  scene: Phaser.Scene, x: number, y: number, label: string, min: number, max: number, initial: number,
  onChange: (v: number) => void, width = 420, fmt: (v: number) => string = (v) => `${Math.round(v * 100)}%`,
): Phaser.GameObjects.Container {
  const c = scene.add.container(x, y);
  const lab = ui(scene, 0, 0, label, 17, '#d8ffe0', { origin: [0, 0.5] });
  const trackX = width - 220;
  const trackW = 170;
  const g = scene.add.graphics();
  const val = ui(scene, width, 0, fmt(initial), 16, hex(COLORS.neon), { origin: [1, 0.5] });
  let v = initial;
  const draw = (): void => {
    g.clear();
    const t = (v - min) / (max - min);
    g.fillStyle(0x1a241d, 1).fillRoundedRect(trackX, -4, trackW, 8, 4);
    g.fillStyle(COLORS.neon, 1).fillRoundedRect(trackX, -4, trackW * t, 8, 4);
    g.fillStyle(0xffffff, 1).fillCircle(trackX + trackW * t, 0, 10);
    g.lineStyle(2, COLORS.neon, 1).strokeCircle(trackX + trackW * t, 0, 10);
    val.setText(fmt(v));
  };
  draw();
  const hit = scene.add.rectangle(trackX + trackW / 2, 0, trackW + 30, 34, 0xffffff, 0.001).setInteractive({ useHandCursor: true, draggable: false });
  let dragging = false;
  const set = (px: number): void => {
    const local = px - (c.x + trackX);
    v = min + Phaser.Math.Clamp(local / trackW, 0, 1) * (max - min);
    draw();
    onChange(v);
  };
  hit.on('pointerdown', (p: Phaser.Input.Pointer) => {
    dragging = true;
    set(p.worldX);
  });
  scene.input.on('pointermove', (p: Phaser.Input.Pointer) => {
    if (dragging && p.isDown) set(p.worldX);
  });
  scene.input.on('pointerup', () => {
    if (dragging) audio.play('hover');
    dragging = false;
  });
  c.add([lab, g, val, hit]);
  return c;
}

export function fadeTo(scene: Phaser.Scene, key: string, data?: object): void {
  scene.cameras.main.fadeOut(220, 0, 0, 0);
  scene.cameras.main.once('camerafadeoutcomplete', () => scene.scene.start(key, data));
}

/**
 * Animated dark-military backdrop used by all menu scenes. It also centres the 1280-wide design area on
 * screens that are wider than 16:9, with the backdrop extending to the real screen edges.
 */
export function createBackdrop(scene: Phaser.Scene): void {
  const pad = viewPad();
  const x0 = -pad;
  const W = SCREEN_W;
  scene.cameras.main.setScroll(-pad, 0);

  const g = scene.add.graphics().setDepth(-10);
  g.fillGradientStyle(0x050a07, 0x050a07, 0x0b1a10, 0x0b1a10, 1);
  g.fillRect(x0 - 2, 0, W + 4, GAME_H);

  const grid = scene.add.graphics().setDepth(-9);
  const drawGrid = (off: number): void => {
    grid.clear();
    grid.lineStyle(1, COLORS.neon, 0.05);
    for (let x = x0 - 80 + (off % 80); x < x0 + W; x += 80) grid.lineBetween(x, 0, x, GAME_H);
    for (let y = -80 + ((off * 0.5) % 80); y < GAME_H; y += 80) grid.lineBetween(x0, y, x0 + W, y);
  };
  let off = 0;
  scene.events.on('update', (_t: number, d: number) => {
    off += d * 0.012;
    drawGrid(off);
  });

  const dust = scene.add.graphics().setDepth(-8);
  const motes = Array.from({ length: 46 }, () => ({
    x: x0 + Math.random() * W, y: Math.random() * GAME_H, s: 0.4 + Math.random() * 1.6, v: 6 + Math.random() * 22,
  }));
  scene.events.on('update', (_t: number, d: number) => {
    dust.clear();
    for (const m of motes) {
      m.y -= (m.v * d) / 1000;
      m.x += (m.v * 0.3 * d) / 1000;
      if (m.y < -4) {
        m.y = GAME_H + 4;
        m.x = x0 + Math.random() * W;
      }
      dust.fillStyle(COLORS.neon, 0.12 + m.s * 0.1).fillCircle(m.x, m.y, m.s);
    }
  });

  const vig = scene.add.graphics().setDepth(100);
  vig.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0.65, 0.65, 0, 0).fillRect(x0, 0, W, 140);
  vig.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0, 0, 0.7, 0.7).fillRect(x0, GAME_H - 160, W, 160);
  const scan = scene.add.graphics().setDepth(101).setAlpha(0.05);
  for (let y = 0; y < GAME_H; y += 3) scan.fillStyle(0x000000, 1).fillRect(x0, y, W, 1);
}

/** iPhone browsers have no fullscreen API: point people at "Add to Home Screen". */
export function addInstallHint(scene: Phaser.Scene): void {
  if (!isTouchDevice() || isStandalone() || canFullscreen()) return;
  ui(scene, GAME_W / 2, GAME_H - 44, 'FULL SCREEN on iPhone: tap Share ▸ Add to Home Screen, then open the game from your home screen', 15, '#ffb020', {
    origin: [0.5, 0.5], align: 'center', width: 980,
  });
}

export function screenTitle(scene: Phaser.Scene, title: string, sub?: string): void {
  display(scene, 56, 36, title, 34, hex(COLORS.neon));
  if (sub) ui(scene, 58, 82, sub, 18, COLORS.textDim);
  const g = scene.add.graphics();
  g.fillStyle(COLORS.neon, 1).fillRect(56, 112, 90, 3);
  g.fillStyle(COLORS.neonDim, 1).fillRect(150, 112, GAME_W - 206, 1);
}

export function backButton(scene: Phaser.Scene, to = 'Menu'): Button {
  return button(scene, 120, GAME_H - 52, 168, 46, '◀  BACK', () => fadeTo(scene, to), { fontSize: 15 });
}
