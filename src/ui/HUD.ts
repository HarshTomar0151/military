import Phaser from 'phaser';
import { COLORS, FONT_DISPLAY, FONT_UI, GAME_H, GAME_W, hex } from '../config';
import { NADES, NADE_ORDER, WEAPONS } from '../data/weapons';
import { drawWeapon } from '../entities/WeaponArt';
import type { GameScene, HudState } from '../scenes/GameScene';
import { button, display, panel, ui } from './theme';
import { TouchControls } from './TouchControls';
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
    // phones get a bigger HUD (like Mini Militia); the thumbs own the bottom corners
    const K = touch ? 1.22 : 1;
    const KM = touch ? 1.35 : 1;
    this.k = K;

    // ---- top-center scoreboard
    const sb = scene.add.container(GAME_W / 2, 12).setDepth(10).setScale(K);
    this.timer = ui(scene, 0, 12, '5:00', 34, '#d8ffe0', { origin: [0.5, 0] });
    this.scoreL = ui(scene, -98, 10, '0', 38, '#d8ffe0', { origin: [0.5, 0] });
    this.scoreR = ui(scene, 98, 10, '0', 38, '#d8ffe0', { origin: [0.5, 0] });
    this.scoreSub = ui(scene, 0, 66, '', 15, COLORS.textDim, { origin: [0.5, 0] });
    sb.add([panel(scene, -150, 0, 300, 58, { alpha: 0.7, cut: 10 }), this.timer, this.scoreL, this.scoreR, this.scoreSub]);

    // ---- minimap
    const mmW = 210;
    const mmH = 105;
    const mini = scene.add.container(14, 14).setDepth(10).setScale(KM);
    this.mapStatic = scene.add.graphics();
    this.mapDots = scene.add.graphics();
    const sx = mmW / game.map.w;
    const sy = mmH / game.map.h;
    this.mapStatic.fillStyle(COLORS.neonDim, 0.9);
    for (const r of game.map.solids.slice(4)) this.mapStatic.fillRect(6 + r.x * sx, 6 + r.y * sy, Math.max(1, r.w * sx), Math.max(1.4, r.h * sy));
    this.mapStatic.fillRect(6, 6 + (game.map.h - 100) * sy, mmW, 100 * sy);
    mini.add([panel(scene, 0, 0, mmW + 12, mmH + 12, { alpha: 0.6, cut: 8 }), this.mapStatic, this.mapDots]);

    // ---- vitals
    const vit = scene.add.container(14, touch ? 14 + (mmH + 12) * KM + 10 : GAME_H - 130).setDepth(10).setScale(K);
    this.bars = scene.add.graphics();
    this.hpText = ui(scene, 12, 4, '100', 34, '#d8ffe0');
    vit.add([
      panel(scene, 0, 0, 320, 98, { alpha: 0.7, cut: 10 }), this.bars, this.hpText,
      ui(scene, 76, 17, 'HEALTH', 13, COLORS.textDim),
      ui(scene, 12, 56, 'ARMOR', 11, COLORS.textDim),
      ui(scene, 12, 74, 'JETPACK  ∞', 11, hex(COLORS.amber)),
    ]);

    // ---- weapon panel
    const KW = touch ? 1.1 : 1; // weapon panel sits between the thumb clusters, so it scales a little less
    const wp = scene.add.container(touch ? (GAME_W - 320 * KW) / 2 : GAME_W - 24 - 310, touch ? GAME_H - 98 * KW - 10 : GAME_H - 130).setDepth(10).setScale(KW);
    this.wpnGfx = scene.add.graphics();
    this.altGfx = scene.add.graphics();
    this.wbars = scene.add.graphics();
    this.wpnName = ui(scene, 16, 6, '', 14, COLORS.textDim);
    this.ammoText = ui(scene, 220, 6, '0', 56, '#d8ffe0', { origin: [1, 0] });
    this.reserveText = ui(scene, 224, 30, '/ 0', 26, hex(COLORS.neonDim));
    this.reloadText = display(scene, 16, 40, '', 15, hex(COLORS.amber));
    this.nadeTexts = [16, 98, 160].map((x) => ui(scene, x, 70, '', 14, '#d8ffe0'));
    wp.add([
      panel(scene, 0, 0, 320, 98, { alpha: 0.7, cut: 10 }), this.wpnGfx, this.altGfx, this.wbars,
      this.wpnName, this.ammoText, this.reserveText, this.reloadText, ...this.nadeTexts,
      ui(scene, 270, 72, '[E]', 12, COLORS.textDim),
    ]);

    this.kdText = ui(scene, GAME_W - 24, 24, '', touch ? 20 : 16, '#d8ffe0', { origin: [1, 0] }).setDepth(11);

    // ---- overlays
    this.fx = scene.add.graphics().setDepth(40);
    this.cross = scene.add.graphics().setDepth(41);
    const mk = (y: number, size: number, key: string): void => {
      this.msgs[key] = scene.add
        .text(GAME_W / 2, y, '', { fontFamily: FONT_DISPLAY, fontSize: `${size}px`, fontStyle: '700', color: '#ffffff' })
        .setOrigin(0.5)
        .setDepth(50)
        .setStroke('#000000', 6)
        .setAlpha(0);
    };
    mk(260, 84, 'big');
    mk(190, 32, 'medium');
    mk(228, 22, 'small');
    this.deathText = scene.add.text(GAME_W / 2, 280, '', { fontFamily: FONT_DISPLAY, fontSize: '34px', fontStyle: '700', color: '#ff5a4a' }).setOrigin(0.5).setDepth(50).setStroke('#000', 6);
    this.deathSub = scene.add.text(GAME_W / 2, 330, '', { fontFamily: FONT_UI, fontSize: '26px', fontStyle: '700', color: '#d8ffe0' }).setOrigin(0.5).setDepth(50).setStroke('#000', 5);

    const hintText = touch
      ? "LEFT STICK move  ·  JET fly  ·  JUMP  ·  RIGHT STICK aim (edge = auto-fire)  ·  FIRE"
      : "A / D MOVE   ·   SPACE JUMP   ·   SHIFT JETPACK   ·   MOUSE AIM   ·   CLICK SHOOT   ·   R RELOAD   ·   Q SWAP   ·   G GRENADE";
    const ht = ui(scene, GAME_W / 2, GAME_H / 2 + 120, hintText, 18, "#d8ffe0", { origin: [0.5, 0.5], align: "center", width: 1000 }).setStroke("#000", 4);
    const hbg = scene.add.rectangle(GAME_W / 2, GAME_H / 2 + 120, Math.min(1060, ht.width + 40), ht.height + 22, 0x000000, 0.6);
    this.hint = scene.add.container(0, 0, [hbg, ht]).setDepth(48);

    // pause button
    const pause = scene.add.text(GAME_W - 24, touch ? 56 : 62, '❚❚ PAUSE', { fontFamily: FONT_DISPLAY, fontSize: touch ? '20px' : '13px', fontStyle: '700', color: '#7fa889' }).setOrigin(1, 0).setDepth(12).setInteractive({ useHandCursor: true });
    pause.on('pointerdown', () => game.setPaused(!game.paused));
    pause.on('pointerover', () => pause.setColor('#39ff14'));
    pause.on('pointerout', () => pause.setColor('#7fa889'));

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
    const c = s.add.container(GAME_W - 24, 0, [bg, ...parts]).setDepth(12);
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
    const dim = s.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x000000, 0.65).setInteractive();
    const pn = panel(s, GAME_W / 2 - 200, GAME_H / 2 - 150, 400, 300, { title: this.game.cfg.online ? 'MATCH MENU' : 'PAUSED' });
    const resume = button(s, GAME_W / 2, GAME_H / 2 - 40, 280, 54, 'RESUME', () => this.game.setPaused(false), { primary: true });
    const quit = button(s, GAME_W / 2, GAME_H / 2 + 40, 280, 54, this.game.cfg.online ? 'LEAVE MATCH' : 'QUIT TO MENU', () => this.game.quit(), { danger: true });
    const hint = ui(s, GAME_W / 2, GAME_H / 2 + 100, this.game.cfg.online ? 'Match continues while this menu is open' : 'ESC to resume', 14, COLORS.textDim, { origin: [0.5, 0] });
    this.pauseUi = s.add.container(0, 0, [dim, pn, resume, quit, hint]).setDepth(200);
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
    const sub = s.teamPlay ? `TEAM DEATHMATCH · FIRST TO ${s.scoreLimit}` : `YOU  ·  LEADER   ·   FIRST TO ${s.scoreLimit}`;
    if (sub !== this.cache.sub) { this.cache.sub = sub; this.scoreSub.setText(sub); }
    const kd = `K ${s.kills}   D ${s.deaths}`;
    if (kd !== this.cache.kd) { this.cache.kd = kd; this.kdText.setText(kd); }

    // vitals
    const b = this.bars;
    b.clear();
    const bx = 12;
    const by = 40;
    const hpFrac = Phaser.Math.Clamp(s.hp / 100, 0, 1);
    const hpCol = hpFrac > 0.5 ? COLORS.neon : hpFrac > 0.25 ? COLORS.amber : COLORS.danger;
    b.fillStyle(0x0a110c, 1).fillRect(bx, by, 290, 14);
    b.fillStyle(hpCol, 1).fillRect(bx + 1, by + 1, 288 * hpFrac, 12);
    b.fillStyle(0xffffff, 0.15).fillRect(bx + 1, by + 1, 288 * hpFrac, 4);
    b.fillStyle(0x0a110c, 1).fillRect(bx + 56, by + 20, 234, 8);
    b.fillStyle(COLORS.ice, 1).fillRect(bx + 57, by + 21, 232 * Phaser.Math.Clamp(s.armor / 50, 0, 1), 6);
    b.fillStyle(0x0a110c, 1).fillRect(bx + 56, by + 38, 234, 8);
    b.fillStyle(COLORS.amber, 1).fillRect(bx + 57, by + 39, 232, 6); // jetpack fuel is unlimited
    const hp = String(Math.ceil(s.hp));
    if (hp !== this.cache.hp) { this.cache.hp = hp; this.hpText.setText(hp); }

    // weapon panel
    if (s.weaponId !== this.lastWeapon) {
      this.lastWeapon = s.weaponId;
      this.wpnGfx.clear();
      drawWeapon(this.wpnGfx, s.weaponId, 46, 36, 1.3);
      this.wpnName.setText(s.weaponName);
    }
    if (s.otherId !== this.lastAlt) {
      this.lastAlt = s.otherId;
      this.altGfx.clear();
      drawWeapon(this.altGfx, s.otherId, 226, 84, 0.5);
    }
    const ammo = String(s.ammo);
    if (ammo !== this.cache.ammo) { this.cache.ammo = ammo; this.ammoText.setText(ammo).setColor(s.ammo === 0 ? '#ff5a4a' : '#d8ffe0'); }
    const res = s.reserve === Infinity ? '/ ∞' : `/ ${s.reserve}`;
    if (res !== this.cache.reserve) { this.cache.reserve = res; this.reserveText.setText(res); }
    const nadeKey = NADE_ORDER.map((k2) => s.nades[k2]).join(',') + s.nadeSel;
    if (nadeKey !== this.cache.nade) {
      this.cache.nade = nadeKey;
      NADE_ORDER.forEach((k2, i) => {
        const sel = k2 === s.nadeSel;
        this.nadeTexts[i]
          .setText(`${sel ? '▸ ' : ''}${NADES[k2].name} ${s.nades[k2]}`)
          .setColor(s.nades[k2] <= 0 ? '#4d6655' : sel ? hex(NADES[k2].color) : '#9fbfa8')
          .setFontStyle(sel ? '700' : '500');
      });
    }
    const wb = this.wbars;
    wb.clear();
    if (s.reload > 0) {
      this.reloadText.setText('RELOADING');
      wb.fillStyle(0x0a110c, 1).fillRect(16, 62, 200, 6);
      wb.fillStyle(COLORS.amber, 1).fillRect(16, 62, 200 * s.reload, 6);
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
    let y = this.k > 1 ? 130 : 108;
    for (let i = this.feed.length - 1; i >= 0; i--) {
      const f = this.feed[i];
      if (now - f.born > 6000) {
        f.c.destroy();
        this.feed.splice(i, 1);
      }
    }
    for (const f of this.feed) {
      const age = now - f.born;
      f.c.setPosition(GAME_W - 24, y).setAlpha(age > 5000 ? 1 - (age - 5000) / 1000 : 1);
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
      fx.fillGradientStyle(0xff0000, 0xff0000, 0xff0000, 0xff0000, va, va, 0, 0).fillRect(0, 0, GAME_W, 130);
      fx.fillGradientStyle(0xff0000, 0xff0000, 0xff0000, 0xff0000, 0, 0, va, va).fillRect(0, GAME_H - 130, GAME_W, 130);
    }
    for (let i = this.hurts.length - 1; i >= 0; i--) {
      const h = this.hurts[i];
      h.life -= dt;
      if (h.life <= 0) { this.hurts.splice(i, 1); continue; }
      const a = Math.min(1, h.life * 1.4);
      const r = 190;
      const cx = GAME_W / 2 + Math.cos(h.a) * r;
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
