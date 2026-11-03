import Phaser from 'phaser';
import type { Appearance } from '../../shared/protocol';
import { COLORS, DEPTH, FONT_UI, hex } from '../config';
import {
  ARMOR_COLORS,
  HELMET_COLORS,
  SKIN_COLORS,
  TEAM_ARMOR,
  TEAM_HELMET,
  TEAM_VISOR,
  VISOR_COLORS,
} from '../data/palettes';
import type { WeaponId } from '../data/weapons';
import { bakeTexture, partImage } from '../systems/Bake';
import { drawWeapon, weaponMuzzle } from './WeaponArt';

export interface ViewState {
  x: number;
  y: number;
  aim: number;
  vx: number;
  grounded: boolean;
  jetting: boolean;
  alive: boolean;
  hp: number;
  armor: number;
  protectedFx: boolean;
}

type Img = Phaser.GameObjects.Image;

/**
 * Pure rendering of an operator: procedurally drawn body parts (baked once per colour set into
 * textures), walk cycle, aim arm, jetpack flame, name tag and mini health bar. No gameplay logic.
 */
export class PlayerView {
  readonly container: Phaser.GameObjects.Container;
  private arm: Phaser.GameObjects.Container;
  private weaponImg: Img;
  private muzzleImg: Img;
  private flame: Img;
  private frontLeg: Img;
  private backLeg: Img;
  private overlay: Img;
  private label?: Phaser.GameObjects.Text;
  private bars?: { bg: Img; hp: Img; armor: Img };
  private phase = 0;
  private facing = 1;
  private kick = 0;
  private muzzleUntil = 0;
  private flashUntil = 0;
  private weapon: WeaponId = 'pistol';
  private barColor = COLORS.neon;

  constructor(private scene: Phaser.Scene, app: Appearance, team: number, name: string | null, scale = 1) {
    const armor = team >= 0 ? TEAM_ARMOR[team] : ARMOR_COLORS[app.armor % ARMOR_COLORS.length];
    const helmet = team >= 0 ? TEAM_HELMET[team] : HELMET_COLORS[app.helmet % HELMET_COLORS.length];
    const visor = team >= 0 ? TEAM_VISOR[team] : VISOR_COLORS[app.visor % VISOR_COLORS.length];
    const skin = SKIN_COLORS[app.skin % SKIN_COLORS.length];
    const dark = Phaser.Display.Color.ValueToColor(armor).darken(35).color;
    const light = Phaser.Display.Color.ValueToColor(armor).lighten(18).color;
    this.barColor = team >= 0 ? (team === 0 ? COLORS.team0 : COLORS.team1) : 0xff5a4a;

    const k = (part: string, ...c: number[]): string => `pv:${part}:${c.map((n) => n.toString(16)).join('-')}`;

    // jetpack (behind the body)
    const packKey = k('pack', visor);
    bakeTexture(scene, packKey, -19, -13, 12, 23, (g) => {
      g.fillStyle(0x262b2f, 1).fillRoundedRect(-18, -12, 10, 19, 2);
      g.lineStyle(1.4, 0x0b0f12, 0.95).strokeRoundedRect(-18, -12, 10, 19, 2);
      g.fillStyle(0x15181b, 1).fillRect(-17, 6, 8, 3);
      g.fillStyle(visor, 0.9).fillRect(-16, -8, 2, 10);
    });
    const pack = partImage(scene, packKey, -19, -13, 12, 23);

    bakeTexture(scene, 'pv:flame', -4.5, 0, 9, 23, (g) => {
      g.fillStyle(0xff9a2a, 0.95).fillTriangle(-4, 0, 4, 0, 0, 22);
      g.fillStyle(0xfff2a0, 1).fillTriangle(-2, 0, 2, 0, 0, 12);
    });
    this.flame = partImage(scene, 'pv:flame', -4.5, 0, 9, 23, -13, 9).setVisible(false);

    const legKey = (c: number): string => k('leg', c);
    for (const c of [dark, armor]) {
      bakeTexture(scene, legKey(c), -4, -1, 11, 20, (g) => {
        g.fillStyle(c, 1).fillRoundedRect(-3, 0, 6, 18, 2);
        g.lineStyle(1.4, 0x0b0f12, 0.95).strokeRoundedRect(-3, 0, 6, 18, 2);
        g.fillStyle(0x16191c, 1).fillRoundedRect(-3, 13, 9, 5, 2);
      });
    }
    this.backLeg = partImage(scene, legKey(dark), -4, -1, 11, 20, -3, 8);

    const torsoKey = k('torso', armor, visor);
    bakeTexture(scene, torsoKey, -10, -11, 20, 21, (g) => {
      g.fillStyle(armor, 1).fillRoundedRect(-9, -10, 18, 19, 3);
      g.lineStyle(1.4, 0x0b0f12, 0.95).strokeRoundedRect(-9, -10, 18, 19, 3);
      g.fillStyle(light, 1).fillRect(-6, -8, 12, 4);
      g.fillStyle(dark, 1).fillRect(-9, 5, 18, 3);
      g.fillStyle(visor, 0.9).fillRect(2, -2, 5, 2);
    });
    const torso = partImage(scene, torsoKey, -10, -11, 20, 21);

    this.frontLeg = partImage(scene, legKey(armor), -4, -1, 11, 20, 3, 8);

    const headKey = k('head', helmet, skin, visor);
    bakeTexture(scene, headKey, -10.5, -28.5, 22, 21, (g) => {
      g.fillStyle(helmet, 1).fillCircle(0, -18, 9.5);
      g.fillStyle(skin, 1).fillEllipse(3.5, -15, 11, 10);
      g.fillStyle(helmet, 1).fillRect(-9, -19, 19, 4);
      g.fillStyle(visor, 0.95).fillRoundedRect(1, -19, 9, 4, 1.5);
      g.fillStyle(0xffffff, 0.35).fillRect(3, -19, 4, 1);
      g.lineStyle(1.4, 0x0b0f12, 0.95).strokeCircle(0, -18, 9.5);
    });
    const head = partImage(scene, headKey, -10.5, -28.5, 22, 21);

    // aiming arm + weapon
    const armKey = k('arm', armor, skin);
    bakeTexture(scene, armKey, -1, -4, 17, 8, (g) => {
      g.fillStyle(armor, 1).fillRoundedRect(0, -3, 12, 6, 2);
      g.lineStyle(1.4, 0x0b0f12, 0.95).strokeRoundedRect(0, -3, 12, 6, 2);
      g.fillStyle(skin, 1).fillCircle(12, 0, 3.2);
    });
    const armImg = partImage(scene, armKey, -1, -4, 17, 8);
    this.weaponImg = scene.add.image(0, 0, 'pv:pixel').setOrigin(0, 0);
    this.muzzleImg = scene.add.image(0, 0, 'pv:pixel').setOrigin(0, 0).setVisible(false);
    this.arm = scene.add.container(1, -3, [armImg, this.weaponImg, this.muzzleImg]);

    bakeTexture(scene, 'pv:flash', -13, -28, 26, 54, (g) => {
      g.fillStyle(0xffffff, 0.6).fillRoundedRect(-13, -28, 26, 54, 6);
    });
    this.overlay = partImage(scene, 'pv:flash', -13, -28, 26, 54).setVisible(false);

    this.container = scene.add.container(0, 0, [
      pack, this.flame, this.backLeg, torso, this.frontLeg, head, this.arm, this.overlay,
    ]);
    this.container.setDepth(DEPTH.players).setScale(scale);

    if (name !== null) {
      this.label = scene.add
        .text(0, 0, name, { fontFamily: FONT_UI, fontSize: '15px', fontStyle: '700', color: hex(this.barColor) })
        .setOrigin(0.5, 1)
        .setDepth(DEPTH.names)
        .setStroke('#000000', 3);
      const px = (c: number, d: number): Img => scene.add.image(0, 0, 'pv:pixel').setOrigin(0, 0).setTint(c).setDepth(d);
      this.bars = { bg: px(0x000000, DEPTH.names).setAlpha(0.6), hp: px(this.barColor, DEPTH.names + 1), armor: px(COLORS.ice, DEPTH.names + 1) };
    }
    this.setWeapon('pistol');
  }

  setWeapon(id: WeaponId): void {
    this.weapon = id;
    const wk = `pv:weapon:${id}`;
    bakeTexture(this.scene, wk, -8, -12, 80, 32, (g) => drawWeapon(g, id, 8, 0));
    this.weaponImg.setTexture(wk).setOrigin(8 / 80, 12 / 32).setScale(0.5);
    const m = weaponMuzzle(id) + 8;
    const mk = `pv:muzzle:${id}`;
    bakeTexture(this.scene, mk, m - 1, -7, 31, 14, (g) => {
      g.fillStyle(0xfff0a0, 1).fillTriangle(m, -6, m, 6, m + 18, 0);
      g.fillStyle(0xff9a2a, 0.9).fillTriangle(m, -3.5, m, 3.5, m + 28, 0);
    });
    this.muzzleImg.setTexture(mk).setOrigin(-(m - 1) / 31, 7 / 14).setScale(0.5);
    this.weaponImg.setPosition(0, 0);
    this.muzzleImg.setPosition(0, 0);
  }

  flashMuzzle(kick: number): void {
    this.muzzleUntil = this.scene.time.now + 55;
    this.kick = Math.max(this.kick, kick);
  }

  flashHit(): void {
    this.flashUntil = this.scene.time.now + 90;
  }

  setVisible(v: boolean): void {
    this.container.setVisible(v);
    this.label?.setVisible(v);
    if (this.bars) Object.values(this.bars).forEach((b) => b.setVisible(v));
  }

  update(s: ViewState, dt: number): void {
    const now = this.scene.time.now;
    const c = this.container;
    if (!s.alive) return;
    const cos = Math.cos(s.aim);
    if (Math.abs(cos) > 0.04) this.facing = cos >= 0 ? 1 : -1;
    c.setPosition(s.x, s.y);
    c.scaleX = Math.abs(c.scaleX) * this.facing;
    this.arm.rotation = this.facing > 0 ? s.aim : Math.PI - s.aim;
    this.kick *= Math.exp(-22 * dt);
    this.arm.x = 1 - this.kick;

    // legs
    const speed = Math.abs(s.vx);
    let fl = 0;
    let bl = 0;
    if (!s.grounded) {
      fl = s.jetting ? 0.18 : 0.55;
      bl = s.jetting ? -0.1 : -0.35;
    } else if (speed > 25) {
      this.phase += speed * dt * 0.055;
      fl = Math.sin(this.phase) * 0.85;
      bl = -fl;
    }
    this.frontLeg.rotation += (fl - this.frontLeg.rotation) * Math.min(1, dt * 18);
    this.backLeg.rotation += (bl - this.backLeg.rotation) * Math.min(1, dt * 18);

    this.flame.setVisible(s.jetting);
    if (s.jetting) this.flame.scaleY = (0.7 + Math.random() * 0.7) / 2;
    this.muzzleImg.setVisible(now < this.muzzleUntil);
    this.overlay.setVisible(now < this.flashUntil);
    c.alpha = s.protectedFx ? 0.45 + 0.35 * Math.sin(now * 0.03) : 1;

    if (this.label && this.bars) {
      this.label.setPosition(s.x, s.y - 50).setAlpha(c.alpha);
      const { bg, hp, armor } = this.bars;
      bg.setPosition(s.x - 18, s.y - 48).setDisplaySize(36, 5);
      hp.setPosition(s.x - 17, s.y - 47).setDisplaySize(Math.max(0.01, 34 * Phaser.Math.Clamp(s.hp / 100, 0, 1)), 3);
      armor.setPosition(s.x - 17, s.y - 45).setDisplaySize(Math.max(0.01, 34 * Phaser.Math.Clamp(s.armor / 50, 0, 1)), 1).setVisible(s.armor > 0);
    }
  }

  /** World position of the shoulder pivot and barrel tip for the given aim. */
  muzzlePoint(x: number, y: number, aim: number): { sx: number; sy: number; mx: number; my: number } {
    const sx = x;
    const sy = y - 3;
    const len = 8 + weaponMuzzle(this.weapon);
    return { sx, sy, mx: sx + Math.cos(aim) * len, my: sy + Math.sin(aim) * len };
  }

  destroy(): void {
    this.container.destroy();
    this.label?.destroy();
    if (this.bars) Object.values(this.bars).forEach((b) => b.destroy());
  }
}
