import Phaser from 'phaser';
import {
  RESPAWN_MS,
  SPAWN_PROTECT_MS,
  MATCH_TIME_MS,
  type DamagePayload,
  type DeathPayload,
  type EndPayload,
  type GameModeId,
  type MapId,
  type StartPayload,
} from '../../shared/protocol';
import { CAMERA_ZOOM, FONT_UI, PHYS } from '../config';
import { ARMOR_COLORS, DEFAULT_APPEARANCE } from '../data/palettes';
import { MAPS, type MapDef } from '../data/maps';
import { WEAPONS, isWeaponId, type WeaponId } from '../data/weapons';
import { BOT_NAMES, EnemyBot } from '../entities/EnemyBot';
import { emptyControls, Player, type PlayerContext, type PlayerKind } from '../entities/Player';
import type { Bullet } from '../entities/Bullet';
import { audio } from '../systems/AudioManager';
import { distToRect, lineOfSight } from '../systems/Collision';
import { CombatSystem, type ExplosionSpec } from '../systems/CombatSystem';
import { Effects } from '../systems/Effects';
import { InputManager } from '../systems/InputManager';
import { MapRenderer } from '../systems/MapRenderer';
import { MatchState } from '../systems/MatchState';
import { net } from '../systems/MultiplayerManager';
import { PickupSystem } from '../systems/PickupSystem';
import { store, type Difficulty } from '../systems/Storage';

export interface GameConfig {
  online: boolean;
  mode: GameModeId;
  mapId: MapId;
  bots: number;
  difficulty: Difficulty;
  start?: StartPayload;
}

export interface ResultsData {
  mode: GameModeId;
  mapId: MapId;
  teamPlay: boolean;
  online: boolean;
  rows: { id: string; name: string; team: number; kills: number; deaths: number; headshots: number; isLocal: boolean }[];
  teamScores: [number, number];
  winnerTeam: number;
  won: boolean;
  xpGained: number;
  levelBefore: number;
  levelAfter: number;
  config: GameConfig;
}

const FREEZE_MS = 3000;

export class GameScene extends Phaser.Scene {
  cfg!: GameConfig;
  map!: MapDef;
  match!: MatchState;
  local!: Player;
  players: Player[] = [];
  paused = false;
  ended = false;

  private gt = 0; // game clock (ms); stops while paused
  private goAt = 0;
  private fx!: Effects;
  private combat!: CombatSystem;
  private pickups!: PickupSystem;
  private inputMgr!: InputManager;
  private respawnQueue: { p: Player; at: number }[] = [];
  private camOff = new Phaser.Math.Vector2();
  private netTimer = 0;
  private fireSentFor = -1;
  private lastCountdown = -1;
  private matchCheckT = 0;
  private teamPlay = false;
  private myId = 'local';
  private lastDeathBy = '';
  private fpsText?: Phaser.GameObjects.Text;
  private offHandlers: (() => void)[] = [];

  constructor() {
    super('Game');
  }

  init(data: GameConfig): void {
    this.cfg = data;
  }

  // ------------------------------------------------------------------ create

  create(): void {
    this.gt = 0;
    this.goAt = FREEZE_MS;
    this.paused = false;
    this.ended = false;
    this.players = [];
    this.respawnQueue = [];
    this.lastCountdown = -1;
    this.offHandlers = [];
    this.map = MAPS[this.cfg.mapId];
    this.teamPlay = this.cfg.mode === 'team';
    this.myId = this.cfg.online ? net.selfId : 'local';

    this.physics.world.setBounds(-200, -400, this.map.w + 400, this.map.h + 400);
    this.cameras.main.setBackgroundColor('#000000');
    this.input.mouse?.disableContextMenu();

    new MapRenderer(this, this.map);
    this.fx = new Effects(this);

    const solidGroup = this.physics.add.staticGroup();
    for (const r of this.map.solids) {
      const z = this.add.zone(r.x + r.w / 2, r.y + r.h / 2, r.w, r.h);
      this.physics.add.existing(z, true);
      solidGroup.add(z);
    }
    this.solidGroup = solidGroup;

    this.combat = new CombatSystem(this, this.map.solids, this.fx, {
      now: () => this.gt,
      players: () => this.players,
      friendly: (oid, ot, target) => this.teamPlay && ot >= 0 && ot === target.team && target.id !== oid,
      playerHit: (b, v, x, y, head) => this.onBulletHit(b, v, x, y, head),
      explode: (...a) => this.onExplode(...a),
    });
    this.pickups = new PickupSystem(this, this.map.pickups);
    this.inputMgr = new InputManager(this);

    this.match = new MatchState(this.cfg.mode, this.teamPlay, this.goAt, this.cfg.start?.durationMs ?? MATCH_TIME_MS, this.cfg.start?.scoreLimit);
    this.spawnAllPlayers();

    const cam = this.cameras.main;
    cam.setBounds(0, 0, this.map.w, this.map.h);
    cam.setZoom(CAMERA_ZOOM);
    cam.startFollow(this.local.sprite, true, 0.12, 0.12);
    cam.fadeIn(400, 0, 0, 0);

    if (store.settings.fps) {
      this.fpsText = this.add.text(8, 8, '', { fontFamily: FONT_UI, fontSize: '14px', color: '#39ff14' }).setScrollFactor(0).setDepth(200);
    }

    if (this.cfg.online) this.bindNetwork();

    this.scene.launch('HUD', { game: this });
    this.input.keyboard?.on('keydown-ESC', () => this.setPaused(!this.paused));
    this.input.keyboard?.on('keydown-P', () => this.setPaused(!this.paused));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup());
  }

  private solidGroup!: Phaser.Physics.Arcade.StaticGroup;

  private ctx: PlayerContext = {
    now: () => this.gt,
    fire: (p, def, sx, sy, aim, md) => {
      this.combat.spawnBullet(p, def, sx, sy, aim, md, p.kind !== 'remote');
      if (p.kind === 'local' && this.cfg.online && this.fireSentFor !== p.weapon.nextFireAt) {
        this.fireSentFor = p.weapon.nextFireAt;
        net.sendFire({ w: def.id, x: sx, y: sy, a: aim });
      }
    },
    throwGrenade: (p, x, y, vx, vy) => {
      this.combat.spawnGrenade(p, x, y, vx, vy, p.kind !== 'remote');
      if (p.kind === 'local' && this.cfg.online) net.sendGrenade({ x, y, vx, vy });
    },
    sfx: (name, x, y, vol = 1) => {
      const c = this.cameras.main;
      const d = Math.hypot(x - c.midPoint.x, y - c.midPoint.y);
      audio.play(name, vol * Phaser.Math.Clamp(1.1 - d / 1900, 0, 1));
    },
    jetFx: (x, y) => this.fx.jetFlame(x, y),
    puff: (x, y) => this.fx.puff(x, y),
    shellEject: (x, y, dir) => this.fx.shell(x, y, dir),
    muzzleFx: (x, y, a, color) => this.fx.muzzle(x, y, a, color),
    shake: (i) => {
      if (store.settings.shake) this.cameras.main.shake(90, i);
    },
  };

  private addPlayer(
    id: string, name: string, team: number, kind: PlayerKind, primary: string, secondary: string,
    spawn: { x: number; y: number }, appearance = DEFAULT_APPEARANCE, difficulty: Difficulty = 'normal',
  ): Player {
    const opts = { id, name, team, kind, appearance, primary, secondary, x: spawn.x, y: spawn.y };
    const p =
      kind === 'bot'
        ? new EnemyBot(this, this.ctx, opts, {
            solids: this.map.solids,
            enemiesOf: (b) => this.players.filter((o) => o !== b && o.alive && !(this.teamPlay && o.team === b.team)),
            nearestPickup: (k, x, y) => this.pickups.nearest(k, x, y),
          }, difficulty)
        : new Player(this, this.ctx, opts);
    if (kind !== 'remote') this.physics.add.collider(p.sprite, this.solidGroup);
    p.protectedUntil = this.goAt + SPAWN_PROTECT_MS;
    this.players.push(p);
    this.match.addPlayer(id, name, team, kind === 'local');
    return p;
  }

  private spawnAllPlayers(): void {
    const spawns = this.map.spawns;
    if (this.cfg.online && this.cfg.start) {
      for (const s of this.cfg.start.players) {
        const isMe = s.id === this.myId;
        const sp = spawns[s.spawn % spawns.length];
        const p = this.addPlayer(s.id, s.name, s.team, isMe ? 'local' : 'remote', s.primary, s.secondary, sp, s.appearance);
        if (isMe) this.local = p;
      }
      return;
    }
    const d = store.data;
    const first = this.teamPlay ? 0 : -1;
    const sp0 = this.pickSpawn(first, []);
    this.local = this.addPlayer('local', d.name, first, 'local', d.primary, d.secondary, sp0, d.appearance);
    const names = [...BOT_NAMES].sort(() => Math.random() - 0.5);
    const mains: WeaponId[] = ['assault', 'mg', 'shotgun', 'sniper', 'rocket', 'plasma', 'smg', 'dmr', 'railgun', 'magnum'];
    for (let i = 0; i < this.cfg.bots; i++) {
      const team = this.teamPlay ? (i % 2 === 0 ? 1 : 0) : -1;
      const sp = this.pickSpawn(team, this.players);
      const app = { armor: Math.floor(Math.random() * ARMOR_COLORS.length), helmet: Math.floor(Math.random() * 8), skin: Math.floor(Math.random() * 5), visor: Math.floor(Math.random() * 6) };
      const bot = this.addPlayer(`bot${i}`, names[i % names.length], team, 'bot', mains[Math.floor(Math.random() * mains.length)], 'pistol', sp, app, this.cfg.difficulty) as EnemyBot;
      bot.frozen = true;
    }
  }

  /** Picks a spawn far from living enemies (team mode: on the team's own half). */
  private pickSpawn(team: number, others: Player[]): { x: number; y: number } {
    const all = this.map.spawns;
    const half = all.length / 2;
    let pool = all;
    if (this.teamPlay && team >= 0) pool = team === 0 ? all.slice(0, half) : all.slice(half);
    const foes = others.filter((o) => o.alive && !(this.teamPlay && o.team === team));
    const scored = pool
      .map((s) => ({ s, score: foes.length ? Math.min(...foes.map((f) => Math.hypot(f.x - s.x, f.y - s.y))) : Math.random() * 100 }))
      .sort((a, b) => b.score - a.score);
    const pick = scored[Math.floor(Math.random() * Math.min(2, scored.length))];
    return pick.s;
  }

  // ------------------------------------------------------------------- update

  update(_time: number, delta: number): void {
    const dt = Math.min(delta / 1000, 0.05);
    this.fpsText?.setText(`${Math.round(this.game.loop.actualFps)} FPS`);
    if (this.paused && !this.cfg.online) return;
    this.gt += dt * 1000;

    const frozen = this.gt < this.goAt;
    this.updateCountdown();

    if (this.local.alive && !frozen && !this.ended) {
      const c = this.inputMgr.poll(this.local.x, this.local.y - 3);
      // keep one-shot flags the player has not consumed yet
      this.local.controls = c;
    } else {
      this.local.controls = emptyControls();
      this.local.controls.aim = this.local.aim;
      this.inputMgr.poll(this.local.x, this.local.y - 3); // keeps crosshair updated / flags cleared
    }

    for (const p of this.players) {
      if (p instanceof EnemyBot) p.frozen = frozen || this.ended;
      p.update(this.gt, dt);
    }
    this.combat.update(dt);
    this.fx.update(dt);
    this.pickups.update(this.gt);
    this.collectPickups();
    audio.jet(this.local.alive && this.local.jetting);

    // offline respawns
    if (!this.cfg.online) {
      for (let i = this.respawnQueue.length - 1; i >= 0; i--) {
        const r = this.respawnQueue[i];
        if (this.gt >= r.at && !this.ended) {
          const sp = this.pickSpawn(r.p.team, this.players);
          r.p.respawn(sp.x, sp.y);
          this.respawnQueue.splice(i, 1);
        }
      }
      this.matchCheckT -= dt;
      if (this.matchCheckT <= 0 && !frozen) {
        this.matchCheckT = 0.5;
        if (this.match.checkEnd(this.gt)) this.finish();
      }
    } else {
      this.netTimer -= dt;
      if (this.netTimer <= 0 && this.local.alive) {
        this.netTimer = 0.05;
        net.sendState(this.local.snapshot());
      }
    }

    // camera: look toward the aim direction
    const look = this.local.weapon.def.id === 'sniper' ? 230 : 120;
    const tx = -Math.cos(this.local.aim) * look;
    const ty = -Math.sin(this.local.aim) * look * 0.6;
    this.camOff.x += (tx - this.camOff.x) * Math.min(1, dt * 4);
    this.camOff.y += (ty - this.camOff.y) * Math.min(1, dt * 4);
    this.cameras.main.setFollowOffset(this.camOff.x, this.camOff.y);
  }

  private updateCountdown(): void {
    const left = this.goAt - this.gt;
    if (left > 0) {
      const n = Math.ceil(left / 1000);
      if (n !== this.lastCountdown) {
        this.lastCountdown = n;
        this.events.emit('message', String(n), '#ffb020', 800, 'big');
        audio.play('beep');
      }
    } else if (this.lastCountdown !== 0) {
      this.lastCountdown = 0;
      this.events.emit('message', 'FIGHT!', '#39ff14', 1000, 'big');
      audio.play('go');
    }
  }

  private collectPickups(): void {
    for (const p of this.players) {
      if (!p.alive || p.kind === 'remote') continue;
      if (this.cfg.online && p.kind !== 'local') continue;
      const it = this.pickups.find(p, this.gt);
      if (!it) continue;
      const kind = it.spawn.kind;
      if (this.cfg.online) {
        this.pickups.markPending(it.idx, this.gt);
        net.sendPickup(it.idx, kind);
        if (kind === 'ammo') p.restock();
      } else {
        this.pickups.take(it.idx, this.gt);
        if (kind === 'health') p.heal(50);
        else if (kind === 'armor') p.addArmor(40);
        else p.restock();
      }
      if (p.kind === 'local') {
        audio.play('pickup');
        this.events.emit('message', kind === 'health' ? '+ HEALTH' : kind === 'armor' ? '+ ARMOR' : '+ AMMO', '#39ff14', 800, 'small');
      }
    }
  }

  // ------------------------------------------------------------- combat events

  private byId(id: string): Player | undefined {
    return this.players.find((p) => p.id === id);
  }

  private onBulletHit(b: Bullet, victim: Player, x: number, y: number, head: boolean): void {
    this.fx.hurt(x, y, b.angle);
    if (!b.dealsDamage) return;
    let dmg = b.def.damage * (head ? b.def.headshot : 1);
    if (b.def.id === 'shotgun') dmg *= Math.max(0.35, 1 - b.traveled / b.def.range);
    this.dealDamage(this.byId(b.ownerId), victim, dmg, b.def.id, head);
  }

  private onExplode(ownerId: string, ownerTeam: number, x: number, y: number, spec: ExplosionSpec, weaponId: string, dealsDamage: boolean): void {
    this.fx.explosion(x, y, spec.radius);
    const cam = this.cameras.main;
    const camDist = Math.hypot(x - cam.midPoint.x, y - cam.midPoint.y);
    this.ctx.sfx('explosion', x, y, 1);
    if (store.settings.shake) cam.shake(220, 0.012 * Phaser.Math.Clamp(1.2 - camDist / 1400, 0, 1));
    const attacker = this.byId(ownerId);
    for (const p of this.players) {
      if (!p.alive) continue;
      const dist = distToRect(x, y, p.hitRect);
      if (dist > spec.radius) continue;
      if (!lineOfSight(x, y, p.x, p.y, this.map.solids)) continue;
      const f = 1 - 0.75 * (dist / spec.radius);
      if (p.simulated && p.body.enable) {
        const dx = p.x - x;
        const dy = p.y - y - 14;
        const len = Math.hypot(dx, dy) || 1;
        p.body.velocity.x += (dx / len) * spec.knock * f;
        p.body.velocity.y += (dy / len) * spec.knock * f * 1.1;
      }
      if (!dealsDamage) continue;
      if (p.id !== ownerId && this.teamPlay && ownerTeam >= 0 && p.team === ownerTeam) continue;
      if (!p.canBeHit(this.gt)) continue;
      const dmg = spec.damage * f * (p.id === ownerId ? 0.5 : 1);
      this.dealDamage(attacker, p, dmg, weaponId, false);
    }
  }

  /** Single entry point for "attacker hurt victim". Online sends it to the server, offline applies it. */
  private dealDamage(attacker: Player | undefined, victim: Player, rawDmg: number, weaponId: string, head: boolean): void {
    const dmg = Math.max(1, Math.round(rawDmg));
    if (!victim.canBeHit(this.gt) || this.ended) return;
    const ox = attacker?.x ?? victim.x;
    const oy = attacker?.y ?? victim.y;
    if (this.cfg.online) {
      if (attacker?.kind === 'local') {
        net.sendHit({ t: victim.id, d: dmg, w: weaponId, hs: head, ox, oy });
        if (victim.id !== attacker.id) this.hitFeedback(head);
      }
      return;
    }
    const died = victim.takeDamage(dmg, this.gt);
    this.damageFeedback(attacker, victim, dmg, head, ox, oy);
    if (attacker?.kind === 'local' && victim !== attacker) this.hitFeedback(head);
    if (died) this.killPlayer(attacker?.id ?? victim.id, victim, weaponId, head);
  }

  private hitFeedback(head: boolean): void {
    this.events.emit('hitmarker', head);
    audio.play(head ? 'headshot' : 'hit', 0.9);
  }

  private damageFeedback(attacker: Player | undefined, victim: Player, dmg: number, head: boolean, ox: number, oy: number): void {
    victim.view.flashHit();
    this.fx.hurt(victim.x, victim.y - 6, Math.atan2(victim.y - oy, victim.x - ox));
    if (store.settings.dmgNumbers && (attacker?.kind === 'local' || victim.kind === 'local')) {
      const mine = victim.kind === 'local';
      const t = this.add
        .text(victim.x + Phaser.Math.Between(-10, 10), victim.y - 36, String(dmg), {
          fontFamily: FONT_UI, fontSize: head ? '26px' : '20px', fontStyle: '700',
          color: mine ? '#ff5a4a' : head ? '#ffe04a' : '#ffffff',
        })
        .setOrigin(0.5)
        .setStroke('#000000', 4)
        .setDepth(70);
      this.tweens.add({ targets: t, y: t.y - 46, alpha: 0, duration: 750, ease: 'Cubic.easeOut', onComplete: () => t.destroy() });
    }
    if (victim.kind === 'local') {
      this.events.emit('hurt', Math.atan2(oy - victim.y, ox - victim.x), dmg);
      this.ctx.sfx('hurt', victim.x, victim.y, 0.8);
      if (store.settings.shake) this.cameras.main.shake(120, Math.min(0.012, 0.002 + dmg * 0.0001));
    }
  }

  private killPlayer(killerId: string, victim: Player, weaponId: string, head: boolean): void {
    this.match.registerKill(killerId, victim.id, head);
    this.deathVisuals(killerId, victim, weaponId, head);
    if (!this.cfg.online) {
      this.respawnQueue.push({ p: victim, at: this.gt + RESPAWN_MS });
      if (this.match.checkEnd(this.gt)) this.finish();
    }
  }

  private deathVisuals(killerId: string, victim: Player, weaponId: string, head: boolean): void {
    const killer = this.byId(killerId);
    const color = victim.team >= 0 ? (victim.team === 0 ? 0x35a7ff : 0xff5a3c) : ARMOR_COLORS[victim.appearance.armor % ARMOR_COLORS.length];
    this.fx.debris(victim.x, victim.y, color);
    this.ctx.sfx('death', victim.x, victim.y, 1);
    victim.die();
    this.events.emit('killfeed', {
      killer: killer?.name ?? '?',
      victim: victim.name,
      weapon: weaponId,
      head,
      suicide: killerId === victim.id,
      killerTeam: killer?.team ?? -1,
      victimTeam: victim.team,
      mine: killer?.kind === 'local' || victim.kind === 'local',
    });
    if (victim.kind === 'local') {
      this.lastDeathBy = killerId === victim.id ? 'YOURSELF' : (killer?.name ?? '?');
      this.events.emit('died', this.lastDeathBy, RESPAWN_MS);
      this.cameras.main.shake(250, 0.01);
    } else if (killer?.kind === 'local' && victim !== killer) {
      audio.play('kill');
      const st = this.match.stats.get('local') ?? this.match.stats.get(this.myId);
      const streak = st?.streak ?? 0;
      const label = streak >= 5 ? 'RAMPAGE!' : streak === 4 ? 'DOMINATING!' : streak === 3 ? 'TRIPLE KILL!' : streak === 2 ? 'DOUBLE KILL!' : head ? 'HEADSHOT!' : 'ELIMINATED';
      this.events.emit('message', `${label}  ${victim.name}`, head ? '#ffe04a' : '#ff5a4a', 1400, 'medium');
    }
  }

  // ------------------------------------------------------------------ network

  private bindNetwork(): void {
    const on = <T>(evt: string, fn: (p: T) => void): void => {
      net.on(evt, fn);
      this.offHandlers.push(() => net.off(evt, fn));
    };
    on<{ id: string; x: number; y: number; vx: number; vy: number; aim: number; w: string; jet: boolean; gr: boolean }>('state', (s) => {
      const p = this.byId(s.id);
      if (p && p.kind === 'remote' && p.alive) p.applyNet(s);
    });
    on<{ id: string; w: string; x: number; y: number; a: number }>('fire', (f) => {
      const p = this.byId(f.id);
      if (p && p.alive && isWeaponId(f.w)) p.remoteShot(WEAPONS[f.w], f.x, f.y, f.a);
    });
    on<{ id: string; x: number; y: number; vx: number; vy: number }>('grenade', (g) => {
      const p = this.byId(g.id);
      if (p) this.combat.spawnGrenade(p, g.x, g.y, g.vx, g.vy, false);
    });
    on<DamagePayload>('damage', (d) => {
      const v = this.byId(d.t);
      if (!v || !v.alive) return;
      v.setVitals(d.hp, d.armor);
      this.damageFeedback(this.byId(d.a), v, d.d, d.hs, d.ox, d.oy);
    });
    on<{ id: string; hp: number; armor: number }>('vitals', (d) => this.byId(d.id)?.setVitals(d.hp, d.armor));
    on<DeathPayload>('death', (d) => {
      this.match.syncFromServer(d.scores, d.teamScores);
      const v = this.byId(d.v);
      if (v && v.alive) {
        v.setVitals(0, 0);
        this.deathVisuals(d.k, v, d.w, d.hs);
      }
    });
    on<{ id: string; hp: number; armor: number }>('respawn', (r) => {
      const p = this.byId(r.id);
      if (!p) return;
      if (p.kind === 'local') {
        const sp = this.pickSpawn(p.team, this.players);
        p.respawn(sp.x, sp.y);
      } else {
        p.respawn(p.x, p.y);
      }
      p.setVitals(r.hp, r.armor);
    });
    on<{ idx: number; by: string }>('pickupTaken', (e) => this.pickups.take(e.idx, this.gt));
    on<{ id: string }>('left', (e) => {
      const p = this.byId(e.id);
      if (!p) return;
      this.events.emit('message', `${p.name} LEFT`, '#7fa889', 1500, 'small');
      p.destroy();
      this.players = this.players.filter((o) => o !== p);
      this.match.removePlayer(p.id);
    });
    on<EndPayload>('end', (e) => this.finishOnline(e));
    on<unknown>('disconnected', () => {
      if (this.ended) return;
      this.ended = true;
      this.events.emit('message', 'CONNECTION LOST', '#ff3b3b', 2500, 'big');
      this.time.delayedCall(1800, () => this.quit());
    });
  }

  // -------------------------------------------------------------------- flow

  setPaused(p: boolean): void {
    if (this.ended) return;
    this.paused = p;
    if (!this.cfg.online) {
      if (p) this.physics.pause();
      else this.physics.resume();
    }
    this.events.emit('paused', p);
  }

  hudState(): HudState {
    const l = this.local;
    const w = l.weapon;
    const other = l.weapons[1 - l.slot];
    const st = this.match.stats.get(l.id);
    return {
      hp: l.hp, armor: l.armor, fuel: l.fuel, alive: l.alive,
      weaponId: w.def.id, weaponName: w.def.name, ammo: w.ammo, reserve: w.reserve,
      reload: w.reloadProgress(this.gt), otherId: other.def.id, grenades: l.grenades,
      kills: st?.kills ?? 0, deaths: st?.deaths ?? 0,
      timeLeft: this.match.remaining(this.gt),
      teamScores: this.match.teamScores, scoreLimit: this.match.scoreLimit, teamPlay: this.teamPlay, myTeam: l.team,
      leader: this.match.leaderboard()[0]?.kills ?? 0,
      crosshair: this.inputMgr.crosshair, touch: this.inputMgr.usingTouch,
      frozen: this.gt < this.goAt,
      dots: this.players.filter((p) => p.alive).map((p) => ({ x: p.x, y: p.y, team: p.team, me: p === l })),
    };
  }

  private buildResults(rows: ResultsData['rows'], teamScores: [number, number], winnerTeam: number): ResultsData {
    const me = rows.find((r) => r.isLocal);
    const sorted = [...rows].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
    const won = this.teamPlay ? winnerTeam >= 0 && winnerTeam === this.local.team : sorted[0]?.isLocal === true && (sorted[1]?.kills ?? -1) < sorted[0].kills;
    const before = store.levelInfo().level;
    const s = store.data.stats;
    const kills = me?.kills ?? 0;
    const xp = 20 + kills * 10 + (me?.headshots ?? 0) * 5 + (won ? 50 : 0);
    s.kills += kills;
    s.deaths += me?.deaths ?? 0;
    s.headshots += me?.headshots ?? 0;
    s.matches++;
    if (won) s.wins++;
    s.bestKills = Math.max(s.bestKills, kills);
    s.xp += xp;
    store.save();
    return {
      mode: this.cfg.mode, mapId: this.cfg.mapId, teamPlay: this.teamPlay, online: this.cfg.online,
      rows, teamScores, winnerTeam, won, xpGained: xp, levelBefore: before, levelAfter: store.levelInfo().level, config: this.cfg,
    };
  }

  private finish(): void {
    if (this.ended) return;
    this.ended = true;
    const rows = [...this.match.stats.values()].map((s) => ({ ...s }));
    const data = this.buildResults(rows, this.match.teamScores, this.match.winnerTeam);
    this.endSequence(data);
  }

  private finishOnline(e: EndPayload): void {
    if (this.ended) return;
    this.ended = true;
    this.match.syncFromServer(e.results, e.teamScores);
    const rows = e.results.map((r) => ({
      id: r.id, name: r.name, team: r.team, kills: r.kills, deaths: r.deaths,
      headshots: this.match.stats.get(r.id)?.headshots ?? 0, isLocal: r.id === this.myId,
    }));
    const data = this.buildResults(rows, e.teamScores, e.winnerTeam);
    this.endSequence(data);
  }

  private endSequence(data: ResultsData): void {
    this.events.emit('message', 'MATCH OVER', '#39ff14', 2000, 'big');
    audio.play(data.won ? 'win' : 'back');
    this.time.delayedCall(2200, () => {
      this.cameras.main.fadeOut(350, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Results', data));
    });
  }

  quit(): void {
    if (this.cfg.online) net.leaveRoom();
    this.scene.start('Menu');
  }

  private cleanup(): void {
    this.offHandlers.forEach((f) => f());
    this.offHandlers = [];
    this.inputMgr.destroy();
    audio.jet(false);
    this.scene.stop('HUD');
    this.input.keyboard?.off('keydown-ESC');
    this.input.keyboard?.off('keydown-P');
  }
}

export interface HudState {
  hp: number; armor: number; fuel: number; alive: boolean;
  weaponId: WeaponId; weaponName: string; ammo: number; reserve: number; reload: number; otherId: WeaponId; grenades: number;
  kills: number; deaths: number; timeLeft: number;
  teamScores: [number, number]; scoreLimit: number; teamPlay: boolean; myTeam: number; leader: number;
  crosshair: { x: number; y: number }; touch: boolean; frozen: boolean;
  dots: { x: number; y: number; team: number; me: boolean }[];
}

