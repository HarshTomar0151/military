import Phaser from 'phaser';
import { COLORS, FONT_DISPLAY, FONT_UI, GAME_H, SAFE, SCREEN_W, hex } from '../config';
import { NADES, NADE_ORDER, WEAPONS } from '../data/weapons';
import { drawWeapon } from '../entities/WeaponArt';
import type { GameScene, HudState } from '../scenes/GameScene';
import { button, display, hudPanel, panel, ui } from './theme';
import { TouchControls } from './TouchControls';
import { canFullscreen, isTouchDevice, toggleFullscreen } from '../systems/Fullscreen';
import { store } from '../systems/Storage';

interface FeedEntry {
  c: Phaser.GameObjects.Container;
  born: number;
}

const teamHex = (t: number): string => (t === 0 ? '#5ab8ff' : t === 1 ? '#ff7a5a' : '#d8ffe0');

/** In-match overlay. Reads GameScene.hudState() every frame; holds no gameplay logic. */
export class HUD {
  private touch?: TouchControls;
  private bars: Phaser.GameObjects.Graphics;
  private timer: Phaser.GameObjects.Text;
  private scoreL: Phaser.GameObjects.Text;
  private scoreR: Phaser.GameObjects.Text;
  private scoreSub: Phaser.GameObjects.Text;
  private hpText: Phaser.GameObjects.Text;
  private ammoText: Phaser.GameObjects.Text;
  private reserveText: Phaser.GameObjects.Text;
  private wpnName: Phaser.GameObjects.Text;
  private nadeTexts: Phaser.GameObjects.Text[] = [];
  private wbars: Phaser.GameObjects.Graphics;
  private k = 1;
  private kdText: Phaser.GameObjects.Text;
  private reloadText: Phaser.GameObjects.Text;
  private wpnGfx: Phaser.GameObjects.Graphics;
  private altGfx: Phaser.GameObjects.Graphics;
  private cross: Phaser.GameObjects.Graphics;
  private fx: Phaser.GameObjects.Graphics;
  private mapStatic: Phaser.GameObjects.Graphics;
  private mapDots: Phaser.GameObjects.Graphics;
  private feed: FeedEntry[] = [];
  private msgs: Record<string, Phaser.GameObjects.Text> = {};
  private msgTween: Record<string, Phaser.Tweens.Tween | undefined> = {};
  private deathText: Phaser.GameObjects.Text;
  private deathSub: Phaser.GameObjects.Text;
  private deathUntil = 0;
  private hint: Phaser.GameObjects.Container;
  private hurts: { a: number; life: number }[] = [];
  private flash = 0;
  private hitmark = { life: 0, head: false };
  private pauseUi?: Phaser.GameObjects.Container;
  private lastWeapon = '';
  private lastAlt = '';
  private cache = { timer: '', ammo: '', reserve: '', nade: '', kd: '', hp: '', sl: '', sr: '', sub: '' };

  constructor(private scene: Phaser.Scene, private game: GameScene) {
    const s0 = game.hudState();
    const touch = s0.touch;
    if (touch) this.touch = new TouchControls(scene);
    // Mini-Militia-style HUD: slim bars top-left, weapon + grenades top-right, thumbs own the bottom
    const K = touch ? 1.15 : 1;
    const KM = touch ? 0.95 : 0.85;
    this.k = K;
    const L = 12 + SAFE.l;

    // ---- top-center scoreboard
    const sb = scene.add.container(SCREEN_W / 2, 8).setDepth(10).setScale(touch ? 1 : 0.92);
    this.timer = ui(scene, 0, 4, '5:00', 30, '#ffffff', { origin: [0.5, 0] });
    this.scoreL = ui(scene, -96, 6, '0', 30, '#ffffff', { origin: [0.5, 0] });
    this.scoreR = ui(scene, 96, 6, '0', 30, '#ffffff', { origin: [0.5, 0] });
    this.scoreSub = ui(scene, 0, 44, '', 13, '#d8e6dc', { origin: [0.5, 0] });
    sb.add([hudPanel(scene, -150, 0, 300, 64), this.timer, this.scoreL, this.scoreR, this.scoreSub]);

    // ---- vitals (top-left): health, armor, unlimited jetpack
    const vit = scene.add.container(L, 10).setDepth(10).setScale(K);
    this.bars = scene.add.graphics();
    this.hpText = ui(scene, 10, 4, '100', 30, '#ffffff');
    vit.add([
      hudPanel(scene, 0, 0, 238, 60), this.bars, this.hpText,
      ui(scene, 62, 3, 'HP', 10, '#f3b7e0'),
      ui(scene, 62, 21, 'ARMOR', 9, '#9fe8ff'),
      ui(scene, 62, 36, 'JET ∞', 9, '#a5d0ff'),
    ]);

    // ---- minimap (under the vitals, see-through)
    const mmW = 210;
    const mmH = 105;
    const mini = scene.add.container(L, 10 + 60 * K + 8).setDepth(10).setScale(KM);
    this.mapStatic = scene.add.graphics();
    this.mapDots = scene.add.graphics();
    const sx = mmW / game.map.w;
    const sy = mmH / game.map.h;
    this.mapStatic.fillStyle(0xffffff, 0.6);
    for (const r of game.map.solids.slice(4)) this.mapStatic.fillRect(6 + r.x * sx, 6 + r.y * sy, Math.max(1, r.w * sx), Math.max(1.4, r.h * sy));
    this.mapStatic.fillRect(6, 6 + (game.map.h - 100) * sy, mmW, 100 * sy);
    mini.add([hudPanel(scene, 0, 0, mmW + 12, mmH + 12, 0.3), this.mapStatic, this.mapDots]);

    // ---- weapon + grenades (top-right, left of the menu button)
    const wpW = 282;
    const wpH = 72;
    const wp = scene.add.container(SCREEN_W - 12 - SAFE.r - 52 * K - 8 - wpW * K, 10).setDepth(10).setScale(K);
    this.wpnGfx = scene.add.graphics();
    this.altGfx = scene.add.graphics();
    this.wbars = scene.add.graphics();
    this.wpnName = ui(scene, 12, 3, '', 11, '#cfe0d4');
    this.ammoText = ui(scene, 232, 0, '0', 40, '#ffffff', { origin: [1, 0] });
    this.reserveText = ui(scene, 236, 20, '/ 0', 17, '#cfe0d4');
    this.reloadText = display(scene, 12, 38, '', 12, hex(COLORS.amber));
    this.nadeTexts = [12, 92, 164].map((x) => ui(scene, x, 52, '', 12, '#ffffff'));
    wp.add([
      hudPanel(scene, 0, 0, wpW, wpH), this.wpnGfx, this.altGfx, this.wbars,
      this.wpnName, this.ammoText, this.reserveText, this.reloadText, ...this.nadeTexts,
      ui(scene, 262, 54, '[E]', 10, '#9fb5a6'),
    ]);

    this.kdText = ui(scene, SCREEN_W - 24 - SAFE.r, 24, '', 16, '#d8ffe0', { origin: [1, 0] }).setVisible(false);

    // ---- overlays
    this.fx = scene.add.graphics().setDepth(40);
    this.cross = scene.add.graphics().setDepth(41);
    const mk = (y: number, size: number, key: string): void => {
      this.msgs[key] = scene.add
        .text(SCREEN_W / 2, y, '', { fontFamily: FONT_DISPLAY, fontSize: `${size}px`, fontStyle: '700', color: '#ffffff' })
        .setOrigin(0.5)
        .setDepth(50)
        .setStroke('#000000', 6)
        .setAlpha(0);
    };
    mk(260, 84, 'big');
    mk(190, 32, 'medium');
    mk(228, 22, 'small');
    this.deathText = scene.add.text(SCREEN_W / 2, 280, '', { fontFamily: FONT_DISPLAY, fontSize: '34px', fontStyle: '700', color: '#ff5a4a' }).setOrigin(0.5).setDepth(50).setStroke('#000', 6);
    this.deathSub = scene.add.text(SCREEN_W / 2, 330, '', { fontFamily: FONT_UI, fontSize: '26px', fontStyle: '700', color: '#d8ffe0' }).setOrigin(0.5).setDepth(50).setStroke('#000', 5);

    const hintText = touch
      ? "LEFT STICK move  ·  JET fly  ·  JUMP  ·  RIGHT STICK aim (edge = auto-fire)  ·  FIRE"
      : "A / D MOVE   ·   SPACE JUMP   ·   SHIFT JETPACK   ·   MOUSE AIM   ·   CLICK SHOOT   ·   R RELOAD   ·   Q SWAP   ·   G GRENADE";
    const ht = ui(scene, SCREEN_W / 2, GAME_H / 2 + 120, hintText, 18, "#d8ffe0", { origin: [0.5, 0.5], align: "center", width: 1000 }).setStroke("#000", 4);
    const hbg = scene.add.rectangle(SCREEN_W / 2, GAME_H / 2 + 120, Math.min(1060, ht.width + 40), ht.height + 22, 0x000000, 0.6);
    this.hint = scene.add.container(0, 0, [hbg, ht]).setDepth(48);

    // menu / pause button (round, top-right like Mini Militia)
    const pr = 22 * K;
    const pcx = SCREEN_W - 12 - SAFE.r - pr;
    const pcy = 10 + pr;
    const pg = scene.add.graphics().setDepth(12);
    pg.fillStyle(0x000000, 0.42).fillCircle(0, 0, pr).lineStyle(2, 0xffffff, 0.75).strokeCircle(0, 0, pr);
    pg.fillStyle(0xffffff, 0.9).fillRoundedRect(-pr * 0.42, -pr * 0.36, pr * 0.84, pr * 0.14, 2).fillRoundedRect(-pr * 0.42, -pr * 0.07, pr * 0.84, pr * 0.14, 2).fillRoundedRect(-pr * 0.42, pr * 0.22, pr * 0.84, pr * 0.14, 2);
    pg.setPosition(pcx, pcy);
    const pause = scene.add.circle(pcx, pcy, pr * 1.3, 0xffffff, 0.001).setDepth(13).setInteractive({ useHandCursor: true });
    pause.on('pointerdown', () => game.setPaused(!game.paused));

    // game events
    const ev = game.events;
    ev.on('killfeed', this.onKill, this);
    ev.on('message', this.onMessage, this);
    ev.on('hurt', this.onHurt, this);
    ev.on('hitmarker', this.onHitmarker, this);
    ev.on('died', this.onDied, this);
    ev.on('paused', this.onPaused, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      ev.off('killfeed', this.onKill, this);
      ev.off('message', this.onMessage, this);
      ev.off('hurt', this.onHurt, this);
      ev.off('hitmarker', this.onHitmarker, this);
      ev.off('died', this.onDied, this);
      ev.off('paused', this.onPaused, this);
    });
  }

  // ---------------------------------------------------------------- events

  private onKill = (e: { killer: string; victim: string; weapon: string; head: boolean; suicide: boolean; killerTeam: number; victimTeam: number; mine: boolean }): void => {
    const s = this.scene;
    const wname = e.weapon === 'grenade' ? 'GRENADE' : (WEAPONS[e.weapon as keyof typeof WEAPONS]?.name.split(' ')[0] ?? e.weapon.toUpperCase());
    const parts: Phaser.GameObjects.Text[] = [];
    const mk = (t: string, color: string): Phaser.GameObjects.Text => {
      const tx = ui(s, 0, 0, t, 16, color, { origin: [1, 0.5] });
      parts.push(tx);
      return tx;
    };
    const victim = mk(e.victim, teamHex(e.victimTeam));
    const mid = mk(`  ${e.head ? '◎' : e.suicide ? '✖' : '▸'} ${wname}  `, e.head ? '#ffe04a' : '#7fa889');
    const killer = e.suicide ? null : mk(e.killer, teamHex(e.killerTeam));
    let x = 0;
    victim.x = x; x -= victim.width;
    mid.x = x; x -= mid.width;
    if (killer) { killer.x = x; x -= killer.width; }
    const bg = s.add.graphics();
    bg.fillStyle(0x000000, 0.55).fillRect(x - 8, -14, -x + 12, 28);
    if (e.mine) bg.lineStyle(1.5, COLORS.neon, 1).strokeRect(x - 8, -14, -x + 12, 28);
    const c = s.add.container(SCREEN_W - 24 - SAFE.r, 0, [bg, ...parts]).setDepth(12);
    this.feed.unshift({ c, born: s.time.now });
    if (this.feed.length > 6) this.feed.pop()!.c.destroy();
  };

  private onMessage = (text: string, color: string, ms: number, size: 'big' | 'medium' | 'small'): void => {
    const t = this.msgs[size];
    this.msgTween[size]?.stop();
    t.setText(text).setColor(color).setAlpha(1).setScale(size === 'big' ? 1.5 : 1.2);
    this.msgTween[size] = this.scene.tweens.add({
      targets: t, scale: 1, duration: 180, ease: 'Back.easeOut',
      onComplete: () => {
        this.msgTween[size] = this.scene.tweens.add({ targets: t, alpha: 0, delay: Math.max(100, ms - 300), duration: 300 });
      },
    });
  };

  private onHurt = (angle: number, dmg: number): void => {
    this.hurts.push({ a: angle, life: 1.3 });
    this.flash = Math.min(0.6, this.flash + 0.15 + dmg * 0.004);
  };

  private onHitmarker = (head: boolean): void => {
    this.hitmark = { life: 0.22, head };
  };

  private onDied = (by: string, ms: number): void => {
    this.deathUntil = this.scene.time.now + ms;
    this.deathText.setText(`ELIMINATED BY ${by}`);
  };

  private onPaused = (p: boolean): void => {
    this.pauseUi?.destroy();
    this.pauseUi = undefined;
    if (!p) return;
    const s = this.scene;
    const dim = s.add.rectangle(SCREEN_W / 2, GAME_H / 2, SCREEN_W, GAME_H, 0x000000, 0.65).setInteractive();
    const pn = panel(s, SCREEN_W / 2 - 200, GAME_H / 2 - 150, 400, 300, { title: this.game.cfg.online ? 'MATCH MENU' : 'PAUSED' });
    const resume = button(s, SCREEN_W / 2, GAME_H / 2 - 40, 280, 54, 'RESUME', () => this.game.setPaused(false), { primary: true });
    const quit = button(s, SCREEN_W / 2, GAME_H / 2 + 40, 280, 54, this.game.cfg.online ? 'LEAVE MATCH' : 'QUIT TO MENU', () => this.game.quit(), { danger: true });
    const hint = ui(s, SCREEN_W / 2, GAME_H / 2 + 100, this.game.cfg.online ? 'Match continues while this menu is open' : 'ESC to resume', 14, COLORS.textDim, { origin: [0.5, 0] });
    const items: Phaser.GameObjects.GameObject[] = [dim, pn, resume, quit, hint];
    if (isTouchDevice() && canFullscreen()) {
      items.push(button(s, SCREEN_W / 2, GAME_H / 2 + 138, 280, 40, '⛶ TOGGLE FULLSCREEN', () => void toggleFullscreen(), { fontSize: 12 }));
    }
    this.pauseUi = s.add.container(0, 0, items).setDepth(200);
  };

  // ---------------------------------------------------------------- frame

  update(dt: number): void {
    const s: HudState = this.game.hudState();
    this.touch?.update(dt);
    const now = this.scene.time.now;

    // timer + scores
    const sec = Math.ceil(s.timeLeft / 1000);
    const tstr = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
    if (tstr !== this.cache.timer) {
      this.cache.timer = tstr;
      this.timer.setText(tstr).setColor(sec <= 30 ? '#ff5a4a' : '#d8ffe0');
    }
    const left = s.teamPlay ? String(s.teamScores[s.myTeam >= 0 ? s.myTeam : 0]) : String(s.kills);
    const right = s.teamPlay ? String(s.teamScores[s.myTeam === 0 ? 1 : 0]) : String(s.leader);
    if (left !== this.cache.sl) { this.cache.sl = left; this.scoreL.setText(left).setColor(s.teamPlay ? teamHex(s.myTeam) : '#39ff14'); }
    if (right !== this.cache.sr) { this.cache.sr = right; this.scoreR.setText(right).setColor(s.teamPlay ? teamHex(s.myTeam === 0 ? 1 : 0) : '#d8ffe0'); }
    const sub = `K ${s.kills}  D ${s.deaths}   ·   ` + (s.teamPlay ? `TEAM DM · FIRST TO ${s.scoreLimit}` : `FIRST TO ${s.scoreLimit}`);
    if (sub !== this.cache.sub) { this.cache.sub = sub; this.scoreSub.setText(sub); }
    const kd = `K ${s.kills}   D ${s.deaths}`;
    if (kd !== this.cache.kd) { this.cache.kd = kd; this.kdText.setText(kd); }

    // vitals
    const b = this.bars;
    b.clear();
    const hpFrac = Phaser.Math.Clamp(s.hp / 100, 0, 1);
    const bx = 92;
    b.fillStyle(0x000000, 0.5).fillRoundedRect(bx, 6, 136, 12, 6);
    b.fillStyle(hpFrac > 0.3 ? 0xd45be0 : 0xff4d4d, 1).fillRoundedRect(bx + 1, 7, Math.max(0.01, 134 * hpFrac), 10, 5);
    b.fillStyle(0xffffff, 0.25).fillRoundedRect(bx + 3, 8, Math.max(0.01, 130 * hpFrac), 3, 2);
    b.fillStyle(0x000000, 0.5).fillRoundedRect(bx, 24, 136, 7, 3);
    b.fillStyle(0x4fd8ff, 1).fillRoundedRect(bx + 1, 25, Math.max(0.01, 134 * Phaser.Math.Clamp(s.armor / 50, 0, 1)), 5, 2);
    b.fillStyle(0x000000, 0.5).fillRoundedRect(bx, 38, 136, 7, 3);
    b.fillStyle(0x4aa3ff, 1).fillRoundedRect(bx + 1, 39, 134, 5, 2); // jetpack fuel is unlimited
    const hp = String(Math.ceil(s.hp));
    if (hp !== this.cache.hp) { this.cache.hp = hp; this.hpText.setText(hp); }

    // weapon panel
    if (s.weaponId !== this.lastWeapon) {
      this.lastWeapon = s.weaponId;
      this.wpnGfx.clear();
      drawWeapon(this.wpnGfx, s.weaponId, 24, 36, 0.85);
      this.wpnName.setText(s.weaponName);
    }
    if (s.otherId !== this.lastAlt) {
      this.lastAlt = s.otherId;
      this.altGfx.clear();
      drawWeapon(this.altGfx, s.otherId, 222, 62, 0.3);
    }
    const ammo = String(s.ammo);
    if (ammo !== this.cache.ammo) { this.cache.ammo = ammo; this.ammoText.setText(ammo).setColor(s.ammo === 0 ? '#ff6a5a' : '#ffffff'); }
    const res = s.reserve === Infinity ? '/ ∞' : `/ ${s.reserve}`;
    if (res !== this.cache.reserve) { this.cache.reserve = res; this.reserveText.setText(res); }
    const nadeKey = NADE_ORDER.map((k2) => s.nades[k2]).join(',') + s.nadeSel;
    if (nadeKey !== this.cache.nade) {
      this.cache.nade = nadeKey;
      NADE_ORDER.forEach((k2, i) => {
        const sel = k2 === s.nadeSel;
        this.nadeTexts[i]
          .setText(`${sel ? '▸ ' : ''}${NADES[k2].name} ${s.nades[k2]}`)
          .setColor(s.nades[k2] <= 0 ? '#6f8577' : sel ? hex(NADES[k2].color) : '#d5e3d9')
          .setFontStyle(sel ? '700' : '500');
      });
    }
    const wb = this.wbars;
    wb.clear();
    if (s.reload > 0) {
      this.reloadText.setText('RELOADING');
      wb.fillStyle(0x000000, 0.5).fillRect(12, 66, 200, 4);
      wb.fillStyle(COLORS.amber, 1).fillRect(12, 66, 200 * s.reload, 4);
    } else {
      this.reloadText.setText('');
    }

    // minimap dots
    const md = this.mapDots;
    md.clear();
    const sx = 210 / this.game.map.w;
    const sy = 105 / this.game.map.h;
    for (const d of s.dots) {
      const col = d.me ? 0xffffff : d.team >= 0 ? (d.team === s.myTeam ? COLORS.team0 : COLORS.team1) : COLORS.danger;
      md.fillStyle(col, 1).fillCircle(6 + d.x * sx, 6 + d.y * sy, d.me ? 3.5 : 2.5);
    }

    // kill feed
    let y = 10 + 72 * this.k + 28;
    for (let i = this.feed.length - 1; i >= 0; i--) {
      const f = this.feed[i];
      if (now - f.born > 6000) {
        f.c.destroy();
        this.feed.splice(i, 1);
      }
    }
    for (const f of this.feed) {
      const age = now - f.born;
      f.c.setPosition(SCREEN_W - 24 - SAFE.r, y).setAlpha(age > 5000 ? 1 - (age - 5000) / 1000 : 1);
      y += 32;
    }

    // crosshair
    const cg = this.cross;
    cg.clear();
    if (s.alive && !this.game.paused) {
      const { x, y: cy } = s.crosshair;
      const col = s.reload > 0 ? COLORS.amber : COLORS.neon;
      cg.lineStyle(2, col, 0.95);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) cg.lineBetween(x + dx * 7, cy + dy * 7, x + dx * 16, cy + dy * 16);
      cg.fillStyle(col, 1).fillCircle(x, cy, 1.8);
      if (s.reload > 0) cg.lineStyle(2, COLORS.amber, 0.9).beginPath().arc(x, cy, 24, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * s.reload).strokePath();
      if (this.hitmark.life > 0) {
        this.hitmark.life -= dt;
        const hc = this.hitmark.head ? 0xffe04a : 0xffffff;
        cg.lineStyle(3, hc, 1);
        for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) cg.lineBetween(x + dx * 8, cy + dy * 8, x + dx * 16, cy + dy * 16);
      }
    }

    // damage indicators + vignette
    const fx = this.fx;
    fx.clear();
    this.flash = Math.max(0, this.flash - dt * 1.4);
    const low = s.alive && s.hp < 30 ? 0.18 + 0.12 * Math.sin(now * 0.008) : 0;
    const va = Math.max(this.flash, low);
    if (va > 0.01) {
      fx.fillGradientStyle(0xff0000, 0xff0000, 0xff0000, 0xff0000, va, va, 0, 0).fillRect(0, 0, SCREEN_W, 130);
      fx.fillGradientStyle(0xff0000, 0xff0000, 0xff0000, 0xff0000, 0, 0, va, va).fillRect(0, GAME_H - 130, SCREEN_W, 130);
    }
    for (let i = this.hurts.length - 1; i >= 0; i--) {
      const h = this.hurts[i];
      h.life -= dt;
      if (h.life <= 0) { this.hurts.splice(i, 1); continue; }
      const a = Math.min(1, h.life * 1.4);
      const r = 190;
      const cx = SCREEN_W / 2 + Math.cos(h.a) * r;
      const cy = GAME_H / 2 + Math.sin(h.a) * r;
      const tx = Math.cos(h.a);
      const ty = Math.sin(h.a);
      fx.fillStyle(0xff2a2a, a * 0.9).fillTriangle(
        cx + tx * 26, cy + ty * 26, cx - ty * 18 - tx * 6, cy + tx * 18 - ty * 6, cx + ty * 18 - tx * 6, cy - tx * 18 - ty * 6,
      );
    }

    // death overlay
    if (!s.alive && this.deathUntil > 0) {
      const left2 = Math.max(0, Math.ceil((this.deathUntil - now) / 1000));
      this.deathText.setVisible(true);
      this.deathSub.setVisible(true).setText(`RESPAWNING IN ${left2}`);
    } else {
      this.deathText.setVisible(false);
      this.deathSub.setVisible(false);
    }
    this.hint.setVisible(s.frozen);
    if (s.frozen) this.deathUntil = 0;
    void store;
  }
}
