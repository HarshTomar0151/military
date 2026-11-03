import Phaser from 'phaser';
import { COLORS, FONT_DISPLAY, FONT_UI, GAME_H, GAME_W, SAFE, hex, viewPad } from '../config';
import { oversText, type CricketState, type DeliveryKind, type Line, type ShotDir, type ShotStyle } from '../../shared/cricket';
import { audio } from '../systems/AudioManager';
import { chamfer, panel, ui } from '../ui/theme';
import { TEAM_COLORS } from './CricketView';

const buzz = (ms: number): void => {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* unsupported */
  }
};

/** Selectable chip that reacts on pointer-down (feels instant on phones). */
export class Choice extends Phaser.GameObjects.Container {
  private bg: Phaser.GameObjects.Graphics;
  private label: Phaser.GameObjects.Text;
  private subText?: Phaser.GameObjects.Text;
  private selected = false;
  private enabled = true;

  constructor(scene: Phaser.Scene, x: number, y: number, private bw: number, private bh: number, text: string, sub: string, onPress: () => void, private accent = COLORS.neon) {
    super(scene, x, y);
    this.bg = scene.add.graphics();
    this.label = scene.add.text(0, sub ? -8 : 0, text, { fontFamily: FONT_DISPLAY, fontSize: '15px', fontStyle: '700', color: '#d8ffe0' }).setOrigin(0.5);
    this.add([this.bg, this.label]);
    if (sub) {
      this.subText = scene.add.text(0, 12, sub, { fontFamily: FONT_UI, fontSize: '12px', fontStyle: '700', color: '#7fa889' }).setOrigin(0.5);
      this.add(this.subText);
    }
    const hit = scene.add.rectangle(0, 0, bw, bh, 0xffffff, 0.001).setInteractive({ useHandCursor: true });
    this.add(hit);
    hit.on('pointerdown', () => {
      if (!this.enabled) return;
      buzz(10);
      audio.play('ui');
      scene.tweens.add({ targets: this, scale: 0.94, duration: 60, yoyo: true });
      onPress();
    });
    this.setSize(bw, bh);
    scene.add.existing(this);
    this.draw();
  }

  setSelected(v: boolean): this {
    this.selected = v;
    this.draw();
    return this;
  }

  setEnabled(v: boolean): this {
    this.enabled = v;
    this.setAlpha(v ? 1 : 0.4);
    return this;
  }

  private draw(): void {
    const g = this.bg;
    g.clear();
    const pts = chamfer(-this.bw / 2, -this.bh / 2, this.bw, this.bh, 8);
    g.fillStyle(this.selected ? this.accent : 0x0d1610, this.selected ? 0.9 : 0.88).fillPoints(pts, true);
    g.lineStyle(this.selected ? 3 : 1.5, this.selected ? 0xffffff : COLORS.neonDim, this.selected ? 0.5 : 1).strokePoints(pts, true);
    this.label.setColor(this.selected ? '#041006' : '#d8ffe0');
    this.subText?.setColor(this.selected ? '#0b3a14' : '#7fa889');
  }
}

/** Large round action button (BOWL / HIT). */
export class BigButton extends Phaser.GameObjects.Container {
  private g: Phaser.GameObjects.Graphics;
  private text: Phaser.GameObjects.Text;
  private pulse = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, private r: number, label: string, private color: number, onPress: () => void) {
    super(scene, x, y);
    this.g = scene.add.graphics();
    this.text = scene.add.text(0, 0, label, { fontFamily: FONT_DISPLAY, fontSize: `${Math.round(r * 0.36)}px`, fontStyle: '900', color: '#041006' }).setOrigin(0.5);
    const hit = scene.add.circle(0, 0, r * 1.15, 0xffffff, 0.001).setInteractive({ useHandCursor: true });
    this.add([this.g, this.text, hit]);
    hit.on('pointerdown', () => {
      buzz(16);
      scene.tweens.add({ targets: this, scale: 0.92, duration: 70, yoyo: true });
      onPress();
    });
    scene.add.existing(this);
    this.draw(0);
    scene.events.on('update', this.tick, this);
    this.once(Phaser.GameObjects.Events.DESTROY, () => scene.events.off('update', this.tick, this));
  }

  setLabel(t: string): this {
    this.text.setText(t);
    return this;
  }

  private tick(_t: number, d: number): void {
    this.pulse += d * 0.004;
    this.draw(0.5 + 0.5 * Math.sin(this.pulse));
  }

  private draw(p: number): void {
    const g = this.g;
    g.clear();
    g.fillStyle(this.color, 0.12 + 0.12 * p).fillCircle(0, 0, this.r + 10 + 4 * p);
    g.fillStyle(this.color, 0.95).fillCircle(0, 0, this.r);
    g.lineStyle(4, 0xffffff, 0.45).strokeCircle(0, 0, this.r - 3);
    g.fillStyle(0xffffff, 0.2).fillCircle(-this.r * 0.25, -this.r * 0.3, this.r * 0.4);
  }
}

// ------------------------------------------------------------------ scoreboard

const BALL_COLOR: Record<string, number> = { '0': 0x59666a, '1': 0xdfe6e9, '2': 0xdfe6e9, '3': 0xdfe6e9, '4': 0x35a7ff, '6': 0xd06bff, W: 0xff3b3b, Wd: 0xffd166 };

export class Scoreboard {
  private c: Phaser.GameObjects.Container;
  private names: [Phaser.GameObjects.Text, Phaser.GameObjects.Text];
  private scores: [Phaser.GameObjects.Text, Phaser.GameObjects.Text];
  private mid: Phaser.GameObjects.Text;
  private sub: Phaser.GameObjects.Text;
  private balls: Phaser.GameObjects.Graphics;
  private role: Phaser.GameObjects.Text;
  private hilite: Phaser.GameObjects.Graphics;
  private ballTexts: Phaser.GameObjects.Text[] = [];

  constructor(private scene: Phaser.Scene, private k = 1) {
    this.c = scene.add.container(GAME_W / 2, 10).setDepth(6000).setScale(k);
    this.hilite = scene.add.graphics();
    const mk = (x: number, y: number, size: number, color = '#d8ffe0', o: [number, number] = [0.5, 0]): Phaser.GameObjects.Text =>
      scene.add.text(x, y, '', { fontFamily: FONT_UI, fontSize: `${size}px`, fontStyle: '700', color }).setOrigin(...o);
    this.names = [mk(-250, 8, 17, hex(TEAM_COLORS[0])), mk(250, 8, 17, hex(TEAM_COLORS[1]))];
    this.scores = [mk(-250, 28, 44), mk(250, 28, 44)];
    this.mid = mk(0, 8, 24, '#ffffff');
    this.sub = mk(0, 40, 16, hex(COLORS.amber));
    this.balls = scene.add.graphics();
    this.role = mk(0, 0, 14, '#041006', [0.5, 0.5]);
    this.ballTexts = Array.from({ length: 8 }, () => mk(0, 74, 12, '#fff', [0.5, 0.5]));
    this.c.add([...this.ballTexts, panel(scene, -350, 0, 700, 90, { alpha: 0.78, cut: 12 }), this.hilite, ...this.names, ...this.scores, this.mid, this.sub, this.balls, this.role]);
  }

  update(s: CricketState, myIdx: number): void {
    const bat = s.batting;
    this.hilite.clear();
    this.hilite.fillStyle(TEAM_COLORS[bat], 0.18).fillRect(bat === 0 ? -346 : 150, 3, 196, 84);
    for (let i = 0; i < 2; i++) {
      const sc = s.score[i];
      const played = i === s.batting || s.innings === 2;
      this.names[i].setText(`${s.names[i]}${i === myIdx ? ' (YOU)' : ''}${i === bat ? '  ●' : ''}`);
      this.scores[i].setText(played ? `${sc.runs}/${sc.wickets}` : '—');
    }
    const sc = s.score[bat];
    const maxBalls = s.cfg.overs * 6;
    this.mid.setText(`${oversText(sc.balls)} / ${s.cfg.overs}`);
    if (s.innings === 2 && s.target !== null) {
      const need = s.target - sc.runs;
      this.sub.setText(need > 0 ? `NEED ${need} OFF ${maxBalls - sc.balls}` : 'TARGET REACHED').setColor(hex(COLORS.amber));
    } else {
      this.sub.setText(`1ST INNINGS · ${s.cfg.wickets} WKTS`).setColor('#7fa889');
    }
    // recent balls
    const g = this.balls;
    g.clear();
    const list = s.recent.slice(-8);
    const startX = -((list.length - 1) * 22) / 2;
    list.forEach((b, i) => {
      g.fillStyle(BALL_COLOR[b] ?? 0xdfe6e9, 1).fillCircle(startX + i * 22, 74, 8);
    });
    this.ballTexts.forEach((t, i) => {
      const b = list[i];
      t.setVisible(b !== undefined);
      if (b === undefined) return;
      t.setPosition(startX + i * 22, 74).setText(b === 'Wd' ? 'w' : b === '0' ? '•' : b).setColor(b === '1' || b === '2' || b === '3' || b === 'Wd' ? '#111111' : '#ffffff');
    });
    this.role.setText('');
  }
}

// ------------------------------------------------------------------- controls

export interface ControlHandlers {
  bowl(): void;
  hit(): void;
}

export class CricketControls {
  kind: DeliveryKind = 'medium';
  line: Line = 'middle';
  style: ShotStyle = 'drive';
  dir: ShotDir = 'straight';

  private bowlGroup: Phaser.GameObjects.Container;
  private batGroup: Phaser.GameObjects.Container;
  private kindBtns: Record<string, Choice> = {};
  private lineBtns: Record<string, Choice> = {};
  private styleBtns: Record<string, Choice> = {};
  private dirBtns: Record<string, Choice> = {};
  private bowlBtn: BigButton;
  private hitBtn: BigButton;
  private meter: Phaser.GameObjects.Graphics;
  private meterV = 0;
  private meterOn = false;

  constructor(private scene: Phaser.Scene, h: ControlHandlers, k = 1) {
    // controls hug the real screen edges even when the canvas is wider than the 1280 design area
    const padL = SAFE.l - viewPad();
    const padR = viewPad() - SAFE.r;
    const y1 = GAME_H - 118 * k;
    const y2 = GAME_H - 52 * k;
    const R = 66 * k;

    this.bowlGroup = scene.add.container(0, 0).setDepth(6000);
    const kinds: [DeliveryKind, string, string][] = [['fast', 'FAST', '1'], ['medium', 'MEDIUM', '2'], ['spin', 'SPIN', '3'], ['yorker', 'YORKER', '4']];
    kinds.forEach(([id, name, key], i) => {
      const b = new Choice(scene, 24 + padL + 50 * k + i * (100 * k + 6), y1, 98 * k, 54 * k, name, `[${key}]`, () => this.setKind(id));
      this.kindBtns[id] = b;
      this.bowlGroup.add(b);
    });
    const lines: [Line, string][] = [['leg', 'LEG'], ['middle', 'MIDDLE'], ['off', 'OFF']];
    lines.forEach(([id, name], i) => {
      const b = new Choice(scene, 24 + padL + 66 * k + i * (136 * k + 6), y2, 134 * k, 50 * k, name, '', () => this.setLine(id));
      this.lineBtns[id] = b;
      this.bowlGroup.add(b);
    });
    this.bowlBtn = new BigButton(scene, GAME_W - 24 + padR - R - 10, GAME_H - R - 22 * k, R, 'BOWL', COLORS.amber, h.bowl);
    this.bowlGroup.add(this.bowlBtn);

    this.batGroup = scene.add.container(0, 0).setDepth(6000);
    const styles: [ShotStyle, string, string][] = [['defend', 'DEFEND', '1'], ['drive', 'DRIVE', '2'], ['loft', 'LOFT', '3']];
    styles.forEach(([id, name, key], i) => {
      const b = new Choice(scene, 24 + padL + 66 * k + i * (136 * k + 6), y1, 134 * k, 54 * k, name, `[${key}]`, () => this.setStyle(id));
      this.styleBtns[id] = b;
      this.batGroup.add(b);
    });
    const dirs: [ShotDir, string, string][] = [['leg', 'LEG SIDE', '←'], ['straight', 'STRAIGHT', '↑'], ['off', 'OFF SIDE', '→']];
    dirs.forEach(([id, name, key], i) => {
      const b = new Choice(scene, 24 + padL + 66 * k + i * (136 * k + 6), y2, 134 * k, 50 * k, name, key, () => this.setDir(id), COLORS.ice);
      this.dirBtns[id] = b;
      this.batGroup.add(b);
    });
    this.hitBtn = new BigButton(scene, GAME_W - 24 + padR - R - 10, GAME_H - R - 22 * k, R, 'HIT', COLORS.neon, h.hit);
    this.batGroup.add(this.hitBtn);

    this.meter = scene.add.graphics().setDepth(6001);
    this.setKind(this.kind);
    this.setLine(this.line);
    this.setStyle(this.style);
    this.setDir(this.dir);
    this.show('none');
  }

  show(role: 'bat' | 'bowl' | 'none'): void {
    this.bowlGroup.setVisible(role === 'bowl');
    this.batGroup.setVisible(role === 'bat');
  }

  setBowlLabel(t: string): void {
    this.bowlBtn.setLabel(t);
  }

  setKind(k: DeliveryKind): void {
    this.kind = k;
    for (const [id, b] of Object.entries(this.kindBtns)) b.setSelected(id === k);
  }
  setLine(l: Line): void {
    this.line = l;
    for (const [id, b] of Object.entries(this.lineBtns)) b.setSelected(id === l);
  }
  setStyle(s: ShotStyle): void {
    this.style = s;
    for (const [id, b] of Object.entries(this.styleBtns)) b.setSelected(id === s);
  }
  setDir(d: ShotDir): void {
    this.dir = d;
    for (const [id, b] of Object.entries(this.dirBtns)) b.setSelected(id === d);
  }

  setBowlEnabled(v: boolean): void {
    Object.values(this.kindBtns).forEach((b) => b.setEnabled(v));
    Object.values(this.lineBtns).forEach((b) => b.setEnabled(v));
    this.bowlBtn.setAlpha(v ? 1 : 0.35);
  }

  setHitEnabled(v: boolean): void {
    this.hitBtn.setAlpha(v ? 1 : 0.45);
  }

  // timing meter ------------------------------------------------------------
  startMeter(): void {
    this.meterOn = true;
    this.meterV = 0;
  }

  /** Returns accuracy 0..1 (1 = dead centre) and hides the meter. */
  lockMeter(): number {
    this.meterOn = false;
    this.meter.clear();
    return Math.max(0, 1 - Math.abs(this.meterV - 0.5) * 2.1);
  }

  get meterActive(): boolean {
    return this.meterOn;
  }

  tick(now: number): void {
    const g = this.meter;
    if (!this.meterOn) return;
    // ping-pong sweep
    const p = (now * 0.0011) % 2;
    this.meterV = p < 1 ? p : 2 - p;
    g.clear();
    const w = 420;
    const x = GAME_W / 2 - w / 2;
    const y = GAME_H - 214;
    g.fillStyle(0x000000, 0.65).fillRoundedRect(x - 8, y - 12, w + 16, 40, 10);
    g.fillStyle(0x3a1d1d, 1).fillRoundedRect(x, y, w, 16, 8);
    g.fillStyle(0xb8860b, 1).fillRect(x + w * 0.3, y, w * 0.4, 16);
    g.fillStyle(0x39ff14, 1).fillRect(x + w * 0.42, y, w * 0.16, 16);
    g.fillStyle(0xffffff, 1).fillRoundedRect(x + w * this.meterV - 4, y - 8, 8, 32, 3);
  }

  hideMeter(): void {
    this.meterOn = false;
    this.meter.clear();
  }
}

// ------------------------------------------------------------------ banners

export class Banners {
  private head: Phaser.GameObjects.Text;
  private sub: Phaser.GameObjects.Text;
  private hint: Phaser.GameObjects.Text;
  private hintBg: Phaser.GameObjects.Rectangle;

  constructor(private scene: Phaser.Scene) {
    this.head = scene.add.text(GAME_W / 2, 300, '', { fontFamily: FONT_DISPLAY, fontSize: '92px', fontStyle: '900', color: '#ffffff' }).setOrigin(0.5).setStroke('#000', 10).setDepth(6500).setAlpha(0);
    this.sub = scene.add.text(GAME_W / 2, 368, '', { fontFamily: FONT_UI, fontSize: '28px', fontStyle: '700', color: '#ffffff' }).setOrigin(0.5).setStroke('#000', 6).setDepth(6500).setAlpha(0);
    this.hintBg = scene.add.rectangle(GAME_W / 2, 142, 10, 36, 0x000000, 0.55).setDepth(6400).setAlpha(0);
    this.hint = scene.add.text(GAME_W / 2, 142, '', { fontFamily: FONT_UI, fontSize: '22px', fontStyle: '700', color: '#d8ffe0' }).setOrigin(0.5).setDepth(6401).setAlpha(0);
  }

  showResult(head: string, sub: string, color: string, ms = 2200): void {
    this.scene.tweens.killTweensOf([this.head, this.sub]);
    this.head.setText(head).setColor(color).setAlpha(1).setScale(1.6);
    this.sub.setText(sub).setAlpha(1);
    this.scene.tweens.add({ targets: this.head, scale: 1, duration: 260, ease: 'Back.easeOut' });
    this.scene.tweens.add({ targets: [this.head, this.sub], alpha: 0, delay: ms, duration: 350 });
  }

  setHint(text: string): void {
    this.scene.tweens.killTweensOf([this.hint, this.hintBg]);
    if (!text) {
      this.hint.setAlpha(0);
      this.hintBg.setAlpha(0);
      return;
    }
    this.hint.setText(text).setAlpha(1);
    this.hintBg.setSize(this.hint.width + 40, 38).setAlpha(0.6);
  }
}
