import Phaser from 'phaser';
import { MAX_ARMOR, MAX_HP, SPAWN_PROTECT_MS, applyDamage, type Appearance, type NetState } from '../../shared/protocol';
import { PHYS } from '../config';
import { GRENADE, WEAPONS, isWeaponId, type WeaponDef, type WeaponId } from '../data/weapons';
import type { Rect } from '../systems/Collision';
import { PlayerView } from './PlayerView';
import { Weapon } from './Weapon';

export type PlayerKind = 'local' | 'bot' | 'remote';

export interface Controls {
  moveX: number; // -1..1
  jump: boolean; // held
  jet: boolean; // held
  shoot: boolean; // held
  reload: boolean; // one-shot, consumed by the player
  switchWeapon: boolean; // one-shot
  grenade: boolean; // one-shot
  aim: number; // radians
}

export const emptyControls = (): Controls => ({
  moveX: 0, jump: false, jet: false, shoot: false, reload: false, switchWeapon: false, grenade: false, aim: 0,
});

/** Services the player needs from the scene; keeps entity code free of scene internals. */
export interface PlayerContext {
  fire(p: Player, def: WeaponDef, sx: number, sy: number, aim: number, muzzleDist: number): void;
  throwGrenade(p: Player, x: number, y: number, vx: number, vy: number): void;
  now(): number;
  sfx(name: string, x: number, y: number, vol?: number): void;
  jetFx(x: number, y: number): void;
  puff(x: number, y: number): void;
  shellEject(x: number, y: number, dir: number): void;
  muzzleFx(x: number, y: number, aim: number, color: number): void;
  shake(intensity: number): void;
}

export interface PlayerOptions {
  id: string;
  name: string;
  team: number;
  kind: PlayerKind;
  appearance: Appearance;
  primary: string;
  secondary: string;
  x: number;
  y: number;
}

const approach = (v: number, target: number, step: number): number =>
  v < target ? Math.min(target, v + step) : Math.max(target, v - step);

export class Player {
  readonly id: string;
  name: string;
  team: number;
  readonly kind: PlayerKind;
  readonly sprite: Phaser.Physics.Arcade.Sprite;
  readonly view: PlayerView;
  readonly appearance: Appearance;
  controls: Controls = emptyControls();

  hp = MAX_HP;
  armor = MAX_ARMOR;
  alive = true;
  fuel = PHYS.jetFuelMax;
  grenades = GRENADE.count;
  protectedUntil = 0;
  aim = 0;
  jetting = false;
  grounded = false;

  readonly weapons: [Weapon, Weapon];
  slot = 0;

  private airJumps = 1;
  private coyote = 0;
  private prevJump = false;
  private prevShoot = false;
  private jetLocked = false;
  private regenDelay = 0;
  private switchLock = 0;
  private grenadeReady = 0;
  private lastGrounded = false;
  private net: NetState | null = null;
  private netVx = 0;

  constructor(
    protected scene: Phaser.Scene,
    protected ctx: PlayerContext,
    opts: PlayerOptions,
  ) {
    this.id = opts.id;
    this.name = opts.name;
    this.team = opts.team;
    this.kind = opts.kind;
    this.appearance = opts.appearance;

    const a = isWeaponId(opts.primary) ? opts.primary : 'assault';
    const b = isWeaponId(opts.secondary) ? opts.secondary : 'pistol';
    this.weapons = [new Weapon(WEAPONS[a]), new Weapon(WEAPONS[b])];

    this.sprite = scene.physics.add.sprite(opts.x, opts.y, 'hitbox');
    this.sprite.setVisible(false);
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    body.setMaxVelocity(900, PHYS.maxFall);
    if (opts.kind === 'remote') body.enable = false;

    this.view = new PlayerView(scene, opts.appearance, opts.team, opts.kind === 'local' ? null : opts.name);
    this.view.setWeapon(this.weapon.def.id);
    this.aim = 0;
  }

  get body(): Phaser.Physics.Arcade.Body {
    return this.sprite.body as Phaser.Physics.Arcade.Body;
  }
  get x(): number {
    return this.sprite.x;
  }
  get y(): number {
    return this.sprite.y;
  }
  get vx(): number {
    return this.kind === 'remote' ? this.netVx : this.body.velocity.x;
  }
  get vy(): number {
    return this.kind === 'remote' ? (this.net?.vy ?? 0) : this.body.velocity.y;
  }
  get weapon(): Weapon {
    return this.weapons[this.slot];
  }
  get simulated(): boolean {
    return this.kind !== 'remote';
  }
  get hitRect(): Rect {
    return { x: this.x - PHYS.bodyW / 2, y: this.y - PHYS.bodyH / 2, w: PHYS.bodyW, h: PHYS.bodyH };
  }
  get headBottom(): number {
    return this.y - PHYS.bodyH / 2 + 15;
  }
  canBeHit(now: number): boolean {
    return this.alive && now >= this.protectedUntil;
  }
  isProtected(now: number): boolean {
    return this.alive && now < this.protectedUntil;
  }

  // ---------------------------------------------------------------- lifecycle

  respawn(x: number, y: number, protectMs = SPAWN_PROTECT_MS): void {
    this.alive = true;
    this.hp = MAX_HP;
    this.armor = MAX_ARMOR;
    this.fuel = PHYS.jetFuelMax;
    this.grenades = GRENADE.count;
    this.jetLocked = false;
    this.weapons[0].refill();
    this.weapons[1].refill();
    this.slot = 0;
    this.view.setWeapon(this.weapon.def.id);
    this.protectedUntil = this.ctx.now() + protectMs;
    this.sprite.setPosition(x, y);
    if (this.kind === 'remote') {
      this.net = null;
    } else {
      this.body.enable = true;
      this.body.reset(x, y);
    }
    this.view.setVisible(true);
  }

  die(): void {
    this.alive = false;
    this.view.setVisible(false);
    this.jetting = false;
    if (this.kind !== 'remote') {
      this.body.setVelocity(0, 0);
      this.body.enable = false;
    }
  }

  /** Offline damage path. Returns true if this hit killed the player. */
  takeDamage(dmg: number, now: number): boolean {
    if (!this.canBeHit(now)) return false;
    const r = applyDamage(this.hp, this.armor, dmg);
    this.hp = r.hp;
    this.armor = r.armor;
    this.view.flashHit();
    return this.hp <= 0.01;
  }

  /** Online path: the server is authoritative for health. */
  setVitals(hp: number, armor: number): void {
    this.hp = hp;
    this.armor = armor;
  }

  heal(amount: number): void {
    this.hp = Math.min(MAX_HP, this.hp + amount);
  }
  addArmor(amount: number): void {
    this.armor = Math.min(MAX_ARMOR, this.armor + amount);
  }
  restock(): void {
    this.weapons.forEach((w) => w.addReserve(1));
    this.grenades = Math.min(GRENADE.count + 2, this.grenades + 2);
    this.fuel = PHYS.jetFuelMax;
  }

  equip(id: string): void {
    const idx = this.weapons.findIndex((w) => w.def.id === id);
    if (idx >= 0 && idx !== this.slot) this.switchTo(idx);
  }

  switchTo(idx: number): void {
    if (idx === this.slot) return;
    this.weapon.cancelReload();
    this.slot = idx;
    this.switchLock = this.ctx.now() + 280;
    this.view.setWeapon(this.weapon.def.id);
    this.ctx.sfx('switch', this.x, this.y, 0.6);
  }

  // ------------------------------------------------------------------- update

  update(now: number, dt: number): void {
    if (!this.alive) return;
    if (this.kind === 'remote') {
      this.updateRemote(dt);
    } else {
      this.updateSimulated(now, dt);
    }
    this.view.update(
      {
        x: this.x,
        y: this.y,
        aim: this.aim,
        vx: this.vx,
        grounded: this.grounded,
        jetting: this.jetting,
        alive: true,
        hp: this.hp,
        armor: this.armor,
        protectedFx: this.isProtected(now),
      },
      dt,
    );
    if (this.jetting) this.ctx.jetFx(this.x + (this.view.container.scaleX < 0 ? 13 : -13), this.y + 9);
  }

  private updateSimulated(now: number, dt: number): void {
    const c = this.controls;
    const body = this.body;
    const w = this.weapon;
    let vx = body.velocity.x;
    let vy = body.velocity.y;
    this.grounded = body.blocked.down || body.touching.down;

    if (this.grounded) {
      this.coyote = PHYS.coyote;
      this.airJumps = 1;
      if (!this.lastGrounded && vy >= 0) this.ctx.puff(this.x, this.y + 24);
    } else {
      this.coyote -= dt;
    }
    this.lastGrounded = this.grounded;

    // horizontal movement (recoil / blast velocity decays via friction instead of being clamped)
    const target = c.moveX * PHYS.runSpeed * w.def.moveMult;
    const accel = this.grounded ? PHYS.groundAccel : PHYS.airAccel;
    const fric = this.grounded ? PHYS.groundFriction : PHYS.airFriction;
    if (Math.abs(c.moveX) > 0.1) {
      if (Math.abs(vx) > Math.abs(target) && Math.sign(vx) === Math.sign(target)) vx = approach(vx, target, fric * dt);
      else vx = approach(vx, target, accel * dt);
    } else {
      vx = approach(vx, 0, fric * dt);
    }

    // jump / double jump
    if (c.jump && !this.prevJump) {
      if (this.coyote > 0) {
        vy = PHYS.jumpVel;
        this.coyote = 0;
        this.ctx.sfx('jump', this.x, this.y, 0.5);
        this.ctx.puff(this.x, this.y + 24);
      } else if (this.airJumps > 0) {
        vy = PHYS.doubleJumpVel;
        this.airJumps--;
        this.ctx.sfx('jump', this.x, this.y, 0.5);
        this.ctx.puff(this.x, this.y + 24);
      }
    }
    this.prevJump = c.jump;

    // jetpack
    if (this.fuel <= 0.01) this.jetLocked = true;
    if (this.jetLocked && this.fuel > 20) this.jetLocked = false;
    this.jetting = c.jet && !this.jetLocked && this.fuel > 0;
    if (this.jetting) {
      vy = Math.max(vy - PHYS.jetAccel * dt, PHYS.jetMaxRise);
      this.fuel = Math.max(0, this.fuel - PHYS.jetDrain * dt);
      this.regenDelay = PHYS.jetRegenDelay;
    } else {
      this.regenDelay -= dt;
      if (this.regenDelay <= 0) {
        this.fuel = Math.min(PHYS.jetFuelMax, this.fuel + (this.grounded ? PHYS.jetRegenGround : PHYS.jetRegenAir) * dt);
      }
    }

    // aim
    this.aim = c.aim;

    // weapons
    w.update(now, dt);
    if (c.switchWeapon) {
      c.switchWeapon = false;
      this.switchTo(1 - this.slot);
    }
    if (c.reload) {
      c.reload = false;
      if (w.startReload(now)) this.ctx.sfx('reload', this.x, this.y, 0.7);
    }
    const want = w.def.auto ? c.shoot : c.shoot && !this.prevShoot;
    if (want && now >= this.switchLock) {
      if (w.canFire(now)) {
        const spread = w.fire(now);
        vx -= Math.cos(this.aim) * w.def.recoil;
        vy -= Math.sin(this.aim) * w.def.recoil * 0.55;
        this.shoot(w.def, spread);
      } else if (w.ammo <= 0 && !w.reloading && !this.prevShoot) {
        if (!w.startReload(now)) this.ctx.sfx('empty', this.x, this.y, 0.6);
        else this.ctx.sfx('reload', this.x, this.y, 0.7);
      }
    }
    if (w.ammo <= 0 && !w.reloading && w.reserve > 0) {
      w.startReload(now);
      this.ctx.sfx('reload', this.x, this.y, 0.7);
    }
    this.prevShoot = c.shoot;

    // grenade
    if (c.grenade) {
      c.grenade = false;
      if (this.grenades > 0 && now >= this.grenadeReady) {
        this.grenades--;
        this.grenadeReady = now + GRENADE.cooldownMs;
        const dx = Math.cos(this.aim);
        const dy = Math.sin(this.aim);
        this.ctx.throwGrenade(
          this,
          this.x + dx * 14,
          this.y - 3 + dy * 14,
          dx * GRENADE.throwSpeed + vx * 0.5,
          dy * GRENADE.throwSpeed + vy * 0.4 - 60,
        );
        this.ctx.sfx('throw', this.x, this.y, 0.7);
      }
    }

    body.setVelocity(vx, vy);
  }

  private shoot(def: WeaponDef, spread: number): void {
    const { sx, sy, mx, my } = this.view.muzzlePoint(this.x, this.y, this.aim);
    const dist = Math.hypot(mx - sx, my - sy);
    for (let i = 0; i < def.pellets; i++) {
      const a = this.aim + (Math.random() * 2 - 1) * spread;
      this.ctx.fire(this, def, sx, sy, a, dist);
    }
    this.view.flashMuzzle(def.kick);
    this.ctx.muzzleFx(mx, my, this.aim, def.color);
    this.ctx.sfx(`shoot_${def.id}`, this.x, this.y, 1);
    if (def.id !== 'rocket' && def.id !== 'plasma' && def.id !== 'railgun') this.ctx.shellEject(sx, sy, this.view.container.scaleX < 0 ? 1 : -1);
    if (this.kind === 'local') this.ctx.shake(def.shake);
  }

  // ------------------------------------------------------------------ network

  applyNet(s: NetState): void {
    if (!this.net) this.sprite.setPosition(s.x, s.y);
    this.net = s;
    this.netVx = s.vx;
    this.equip(s.w);
  }

  /** Visual-only shot fired by a remote player (damage is resolved by the shooter's client). */
  remoteShot(def: WeaponDef, sx: number, sy: number, aim: number): void {
    const spread = ((def.spreadDeg + def.bloomDeg) * Math.PI) / 180;
    const { mx, my } = this.view.muzzlePoint(sx, sy + 3, aim);
    const dist = Math.hypot(mx - sx, my - sy);
    for (let i = 0; i < def.pellets; i++) {
      this.ctx.fire(this, def, sx, sy, aim + (Math.random() * 2 - 1) * spread, dist);
    }
    this.view.flashMuzzle(def.kick);
    this.ctx.muzzleFx(mx, my, aim, def.color);
    this.ctx.sfx(`shoot_${def.id}`, this.x, this.y, 1);
  }

  private updateRemote(dt: number): void {
    const s = this.net;
    if (!s) return;
    const k = Math.min(1, dt * 14);
    this.sprite.x += (s.x - this.sprite.x) * k;
    this.sprite.y += (s.y - this.sprite.y) * k;
    this.aim = Phaser.Math.Angle.RotateTo(this.aim, s.aim, 14 * dt);
    this.jetting = s.jet;
    this.grounded = s.gr;
  }

  snapshot(): NetState {
    return {
      x: Math.round(this.x * 10) / 10,
      y: Math.round(this.y * 10) / 10,
      vx: Math.round(this.vx),
      vy: Math.round(this.vy),
      aim: Math.round(this.aim * 100) / 100,
      w: this.weapon.def.id as WeaponId,
      jet: this.jetting,
      gr: this.grounded,
    };
  }

  destroy(): void {
    this.view.destroy();
    this.sprite.destroy();
  }
}
