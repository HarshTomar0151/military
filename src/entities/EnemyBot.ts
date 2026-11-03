import Phaser from 'phaser';
import type { PickupSpawn, PickupKind } from '../data/maps';
import type { WeaponId } from '../data/weapons';
import type { Difficulty } from '../systems/Storage';
import { lineOfSight, type Rect } from '../systems/Collision';
import { Player, type PlayerContext, type PlayerOptions } from './Player';

export interface BotWorld {
  solids: Rect[];
  enemiesOf(bot: Player): Player[];
  nearestPickup(kind: PickupKind, x: number, y: number): PickupSpawn | null;
}

interface Skill {
  react: number; // seconds before opening fire on a newly seen target
  aimErr: number; // radians of aim noise
  turn: number; // rad/s aim speed
  fire: number; // trigger discipline 0..1
  grenade: number;
  dodge: number;
}

const SKILL: Record<Difficulty, Skill> = {
  easy: { react: 0.65, aimErr: 0.17, turn: 3.2, fire: 0.55, grenade: 0.15, dodge: 0.25 },
  normal: { react: 0.35, aimErr: 0.085, turn: 5.5, fire: 0.8, grenade: 0.35, dodge: 0.5 },
  hard: { react: 0.15, aimErr: 0.04, turn: 9, fire: 1, grenade: 0.6, dodge: 0.8 },
};

const OPTIMAL: Record<WeaponId, number> = {
  shotgun: 240, pistol: 380, assault: 520, mg: 500, rocket: 520, sniper: 900,
  magnum: 560, smg: 320, dmr: 800, plasma: 520, railgun: 1000,
};

export const BOT_NAMES = ['VIPER', 'GHOST', 'RAZOR', 'NOVA', 'HAVOC', 'TALON', 'ONYX', 'REAPER', 'BLAZE', 'FROST', 'COBRA', 'DRIFT'];

/** AI-controlled operator. Produces the same Controls a human would, then runs normal Player physics. */
export class EnemyBot extends Player {
  private skill: Skill;
  private target: Player | null = null;
  private visible = false;
  private seeTime = 0;
  private thinkT = 0;
  private aimAngle = 0;
  private errOffset = 0;
  private errT = 0;
  private strafeDir = Math.random() < 0.5 ? -1 : 1;
  private strafeT = 0;
  private burstT = 0;
  private burstOn = true;
  private toggle = false;
  private grenadeCd = 4 + Math.random() * 6;
  private stuckT = 0;
  private stuckX = 0;
  private escapeT = 0;
  private escapeDir = 1;
  private dodgeT = 0;
  private lastHp = 100;
  private noJetT = 0;
  private hopT = 0;
  private goal: PickupSpawn | null = null;
  frozen = false;

  constructor(scene: Phaser.Scene, ctx: PlayerContext, opts: PlayerOptions, private world: BotWorld, difficulty: Difficulty) {
    super(scene, ctx, opts);
    this.skill = SKILL[difficulty];
    this.thinkT = Math.random() * 0.3;
  }

  override respawn(x: number, y: number, protectMs?: number): void {
    super.respawn(x, y, protectMs);
    this.target = null;
    this.lastHp = this.hp;
    this.escapeT = 0;
  }

  override update(now: number, dt: number): void {
    if (this.alive && !this.frozen) this.think(now, dt);
    super.update(now, dt);
  }

  private shoulder(): { x: number; y: number } {
    return { x: this.x, y: this.y - 3 };
  }

  private retarget(): void {
    const sh = this.shoulder();
    let best: Player | null = null;
    let bestScore = Infinity;
    let bestVis = false;
    for (const f of this.world.enemiesOf(this)) {
      const d = Math.hypot(f.x - sh.x, f.y - sh.y);
      const vis = d < 1500 && lineOfSight(sh.x, sh.y, f.x, f.y, this.world.solids);
      const score = d * (vis ? 1 : 3);
      if (score < bestScore) {
        bestScore = score;
        best = f;
        bestVis = vis;
      }
    }
    if (best !== this.target) this.seeTime = 0;
    this.target = best;
    this.visible = bestVis;

    // goals: heal when hurt, restock when dry
    this.goal = null;
    if (this.hp < 45) this.goal = this.world.nearestPickup('health', this.x, this.y);
    else if (this.armor < 8 && Math.random() < 0.5) this.goal = this.world.nearestPickup('armor', this.x, this.y);
    else if (this.weapon.ammo + this.weapon.reserve === 0 && this.weapons[1 - this.slot].reserve === 0) {
      this.goal = this.world.nearestPickup('ammo', this.x, this.y);
    }
    if (this.goal && this.visible && this.hp > 25) this.goal = null; // fight on if the enemy is right there
  }

  private think(now: number, dt: number): void {
    const c = this.controls;
    const sk = this.skill;
    const body = this.body;
    const sh = this.shoulder();

    this.thinkT -= dt;
    if (this.thinkT <= 0) {
      this.thinkT = 0.18 + Math.random() * 0.15;
      this.retarget();
    }
    if (this.visible) this.seeTime += dt;
    else this.seeTime = Math.max(0, this.seeTime - dt);

    if (this.hp < this.lastHp - 1 && Math.random() < sk.dodge) this.dodgeT = 0.45;
    this.lastHp = this.hp;
    this.dodgeT -= dt;
    this.noJetT -= dt;
    this.escapeT -= dt;
    this.strafeT -= dt;
    this.hopT -= dt;
    this.grenadeCd -= dt;
    this.errT -= dt;

    // ---- aiming
    const t = this.target;
    let desired = this.aimAngle;
    let dist = 0;
    if (t) {
      const speed = this.weapon.def.speed;
      dist = Math.hypot(t.x - sh.x, t.y - sh.y);
      const lead = this.weapon.def.id === 'sniper' ? 0.02 : dist / speed;
      const tx = t.x + t.vx * lead;
      const ty = t.y + t.vy * lead * 0.6 - 2 + (this.weapon.def.gravity > 0 ? -dist * 0.01 : 0);
      desired = Math.atan2(ty - sh.y, tx - sh.x);
    }
    if (this.errT <= 0) {
      this.errT = 0.4 + Math.random() * 0.3;
      this.errOffset = (Math.random() * 2 - 1) * sk.aimErr * (0.6 + dist / 900);
    }
    this.aimAngle = Phaser.Math.Angle.RotateTo(this.aimAngle, desired + this.errOffset, sk.turn * dt);
    c.aim = this.aimAngle;

    // ---- movement
    let dir = 0;
    let goalX = t ? t.x : this.x;
    let goalY = t ? t.y : this.y;
    if (this.goal) {
      goalX = this.goal.x;
      goalY = this.goal.y;
      dir = Math.abs(goalX - this.x) > 14 ? Math.sign(goalX - this.x) : 0;
    } else if (t) {
      const opt = OPTIMAL[this.weapon.def.id as WeaponId] ?? 450;
      const dx = t.x - this.x;
      if (!this.visible || dist > opt * 1.3) dir = Math.sign(dx);
      else if (dist < opt * 0.55) dir = -Math.sign(dx);
      else {
        if (this.strafeT <= 0) {
          this.strafeT = 0.7 + Math.random() * 1.6;
          this.strafeDir = Math.random() < 0.5 ? -1 : 1;
        }
        dir = this.strafeDir * 0.8;
      }
    } else {
      if (this.strafeT <= 0) {
        this.strafeT = 1.5 + Math.random() * 2;
        this.strafeDir = Math.random() < 0.5 ? -1 : 1;
      }
      dir = this.strafeDir;
    }

    const dy = goalY - this.y;
    let jet = false;
    let jump = false;
    const grounded = this.grounded;
    if (dy < -70 && this.noJetT <= 0) jet = this.fuel > 10;
    if (dy < -70 && this.fuel <= 10 && grounded) jump = true;
    if (dy > 160 && Math.abs(goalX - this.x) < 30) dir = dir || this.strafeDir; // step off the ledge

    // wall in the way
    if ((body.blocked.left && dir < 0) || (body.blocked.right && dir > 0)) {
      if (grounded) jump = true;
      else if (this.fuel > 10) jet = true;
    }
    // hit our head on a platform while trying to climb: slide sideways and keep climbing
    if (body.blocked.up && dy < -50 && this.escapeT <= 0) {
      this.escapeT = 0.6;
      this.escapeDir = Math.random() < 0.5 ? -1 : 1;
    }
    // generic stuck detection
    this.stuckT += dt;
    if (this.stuckT > 1.2) {
      if (Math.abs(this.x - this.stuckX) < 14 && Math.abs(dir) > 0.1 && !(this.visible && Math.abs(dir) < 0.9)) {
        this.escapeT = 0.5;
        this.escapeDir = Math.random() < 0.5 ? -1 : 1;
        jump = true;
      }
      this.stuckX = this.x;
      this.stuckT = 0;
    }
    if (this.escapeT > 0) {
      dir = this.escapeDir;
      jet = this.fuel > 8 && !body.blocked.up ? true : jet;
      if (body.blocked.up) jet = false;
    }
    // evasive hops
    if (this.dodgeT > 0 && this.fuel > 20) jet = Math.floor(this.dodgeT * 8) % 2 === 0;
    if (this.visible && this.hopT <= 0 && grounded && Math.random() < 0.02 * sk.dodge) {
      jump = true;
      this.hopT = 1.5;
    }
    if (body.blocked.up && jet) {
      jet = false;
      this.noJetT = 0.25;
    }

    c.moveX = dir;
    c.jet = jet;
    c.jump = jump;

    // ---- shooting
    const w = this.weapon;
    const def = w.def;
    const aimDiff = Math.abs(Phaser.Math.Angle.Wrap(this.aimAngle - desired));
    const inRange = t !== null && dist < Math.min(def.range * 0.9, 1500);
    const tol = 0.1 + Math.min(0.18, 60 / Math.max(60, dist));
    let wantFire = this.visible && inRange && this.seeTime > sk.react && aimDiff < tol && !w.reloading;
    if (this.burstT <= 0) {
      this.burstOn = !this.burstOn;
      this.burstT = this.burstOn ? 0.5 + Math.random() * 0.9 : (0.15 + Math.random() * 0.5) / sk.fire;
      if (Math.random() > sk.fire + 0.15) this.burstOn = false;
    }
    this.burstT -= dt;
    if (!this.burstOn) wantFire = false;
    if (def.auto) c.shoot = wantFire;
    else {
      this.toggle = !this.toggle;
      c.shoot = wantFire && this.toggle;
    }

    // ---- reload / switch / grenade
    if (!this.visible && w.ammo < def.mag * 0.4 && !w.reloading) c.reload = true;
    if (w.empty && !this.weapons[1 - this.slot].empty) c.switchWeapon = true;
    if (t && this.visible && this.grenades > 0 && this.grenadeCd <= 0 && dist > 220 && dist < 700) {
      this.grenadeCd = 6 + Math.random() * 6;
      if (Math.random() < sk.grenade) {
        const lob = desired + (Math.cos(desired) >= 0 ? -0.38 : 0.38);
        c.aim = lob;
        this.aimAngle = lob;
        c.grenade = true;
      }
    }
  }
}
