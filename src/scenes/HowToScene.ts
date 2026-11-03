import Phaser from 'phaser';
import { COLORS, GAME_H, GAME_W, hex } from '../config';
import { PlayerView } from '../entities/PlayerView';
import { WEAPON_ORDER, type WeaponId } from '../data/weapons';
import { audio } from '../systems/AudioManager';
import { store } from '../systems/Storage';
import { button, createBackdrop, display, fadeTo, panel, ui } from '../ui/theme';

interface Row {
  keys: string[];
  desc: string;
}

interface Page {
  title: string;
  sub: string;
  desktop: Row[];
  mobile: Row[];
  tip: string;
  anim: (t: number) => { x: number; aim: number; vx: number; grounded: boolean; jetting: boolean; dy: number };
}

const PAGES: Page[] = [
  {
    title: 'MOVE & JUMP',
    sub: 'Run, jump, then jump again in mid-air.',
    desktop: [
      { keys: ['A', 'D'], desc: 'Move left / right  (or ← →)' },
      { keys: ['SPACE'], desc: 'Jump — press again in the air to double jump' },
    ],
    mobile: [
      { keys: ['LEFT STICK'], desc: 'Move left / right' },
      { keys: ['JUMP'], desc: 'Jump — tap again in the air for a double jump' },
    ],
    tip: 'Keep moving! Standing still makes you an easy target.',
    anim: (t) => {
      const jump = Math.max(0, Math.sin(t * 3.2));
      return { x: Math.sin(t * 1.1) * 110, aim: Math.cos(t * 1.1) > 0 ? 0 : Math.PI, vx: Math.cos(t * 1.1) * 270, grounded: jump < 0.02, jetting: false, dy: -jump * 80 };
    },
  },
  {
    title: 'AIM & SHOOT',
    sub: 'Aim anywhere in 360° and open fire.',
    desktop: [
      { keys: ['MOUSE'], desc: 'Aim — your gun follows the cursor' },
      { keys: ['LEFT CLICK'], desc: 'Shoot (hold for automatic weapons)' },
    ],
    mobile: [
      { keys: ['RIGHT STICK'], desc: 'Aim. Push it to the edge to auto-fire' },
      { keys: ['FIRE'], desc: 'Shoot with the button instead' },
    ],
    tip: 'Headshots deal extra damage. Weapons kick back — short bursts are more accurate.',
    anim: (t) => ({ x: 0, aim: Math.sin(t * 0.9) * 0.6 - 0.1, vx: 0, grounded: true, jetting: false, dy: 0 }),
  },
  {
    title: 'JETPACK',
    sub: 'Fly to high platforms, dodge fire, get the drop on enemies.',
    desktop: [{ keys: ['SHIFT'], desc: 'Hold to fly — unlimited fuel. Steer with A / D' }],
    mobile: [
      { keys: ['JET'], desc: 'Hold to fly' },
      { keys: ['LEFT STICK ↑'], desc: 'Push the move stick up to fly too' },
    ],
    tip: 'Your jetpack never runs out. Stay airborne, shoot from above and dodge everything.',
    anim: (t) => {
      const up = (Math.sin(t * 1.4) + 1) / 2;
      return { x: Math.sin(t * 0.7) * 60, aim: 0, vx: 0, grounded: false, jetting: Math.cos(t * 1.4) > -0.3, dy: -up * 120 };
    },
  },
  {
    title: 'WEAPONS & GRENADES',
    sub: 'Two weapons plus three kinds of grenades. Choose weapons in CUSTOMIZE.',
    desktop: [
      { keys: ['R', 'Q'], desc: 'Reload  /  swap primary + secondary weapon' },
      { keys: ['G', 'RIGHT CLICK'], desc: 'Throw the selected grenade' },
      { keys: ['E'], desc: 'Switch grenade type: FRAG / GAS / POISON' },
    ],
    mobile: [
      { keys: ['RLD', 'SWAP'], desc: 'Reload  /  swap weapon' },
      { keys: ['NADE'], desc: 'Throw the selected grenade' },
      { keys: ['TYPE'], desc: 'Switch grenade type: FRAG / GAS / POISON' },
    ],
    tip: 'FRAG explodes. GAS makes a slowing, damaging cloud. POISON keeps hurting you even after you leave the cloud.',
    anim: () => ({ x: 0, aim: 0, vx: 0, grounded: true, jetting: false, dy: 0 }),
  },
  {
    title: 'WIN THE MATCH',
    sub: 'First to 20 kills (30 in teams) or the most kills after 5 minutes.',
    desktop: [
      { keys: ['WALK OVER'], desc: 'Pickups: health, armor, ammo (they respawn)' },
      { keys: ['ESC'], desc: 'Pause menu' },
    ],
    mobile: [
      { keys: ['TOUCH'], desc: 'Walk over pickups to collect them' },
      { keys: ['PAUSE'], desc: 'Top-right corner' },
    ],
    tip: 'Armor absorbs 60% of damage. You respawn 3 seconds after dying with brief protection.',
    anim: (t) => ({ x: Math.sin(t * 0.8) * 40, aim: Math.sin(t) * 0.3, vx: 0, grounded: true, jetting: false, dy: 0 }),
  },
];

export class HowToScene extends Phaser.Scene {
  private next = 'Menu';
  private nextData?: object;
  private page = 0;
  private view?: PlayerView;
  private t = 0;
  private body?: Phaser.GameObjects.Container;
  private dots?: Phaser.GameObjects.Graphics;
  private weaponLabel?: Phaser.GameObjects.Text;
  private lastShot = 0;
  private lastWeapon = -1;
  private nextBtn!: ReturnType<typeof button>;

  constructor() {
    super('HowTo');
  }

  init(data: { next?: string; nextData?: object }): void {
    this.next = data?.next ?? 'Menu';
    this.nextData = data?.nextData;
    this.page = 0;
  }

  create(): void {
    this.cameras.main.fadeIn(250, 0, 0, 0);
    createBackdrop(this);
    this.t = 0;
    display(this, 56, 36, 'HOW TO PLAY', 34, hex(COLORS.neon));
    const bar = this.add.graphics();
    bar.fillStyle(COLORS.neon, 1).fillRect(56, 112, 90, 3);
    bar.fillStyle(COLORS.neonDim, 1).fillRect(150, 112, GAME_W - 206, 1);

    panel(this, 56, 140, 480, 500, { title: 'DEMO' });
    const floor = this.add.graphics();
    floor.fillStyle(COLORS.neon, 0.1).fillEllipse(296, 560, 260, 30);
    floor.lineStyle(1.5, COLORS.neon, 0.5).strokeEllipse(296, 560, 260, 30);
    this.view = new PlayerView(this, store.data.appearance, -1, null, 3.4);
    this.view.container.setDepth(5);
    this.view.setWeapon(store.data.primary as WeaponId);
    this.weaponLabel = display(this, 296, 600, '', 14, '#d8ffe0', [0.5, 0]);
    this.dots = this.add.graphics();

    button(this, 120, GAME_H - 52, 168, 46, 'SKIP', () => this.finish(), { fontSize: 15 });
    button(this, GAME_W - 430, GAME_H - 52, 160, 46, '◀ PREV', () => this.go(-1), { fontSize: 14 });
    this.nextBtn = button(this, GAME_W - 240, GAME_H - 52, 260, 46, 'NEXT ▶', () => this.go(1), { primary: true, fontSize: 15 });
    this.input.keyboard?.on('keydown-RIGHT', () => this.go(1));
    this.input.keyboard?.on('keydown-LEFT', () => this.go(-1));
    this.input.keyboard?.on('keydown-ENTER', () => this.go(1));
    this.render();
  }

  private go(d: number): void {
    const n = this.page + d;
    if (n < 0) return;
    if (n >= PAGES.length) {
      this.finish();
      return;
    }
    this.page = n;
    audio.play('ui');
    this.render();
  }

  private finish(): void {
    store.data.seenIntro = true;
    store.save();
    fadeTo(this, this.next, this.nextData);
  }

  private keycap(parent: Phaser.GameObjects.Container, x: number, y: number, label: string, touch: boolean): number {
    const txt = display(this, 0, 0, label, 13, touch ? hex(COLORS.neon) : '#ffffff', [0, 0.5]);
    const w = txt.width + 22;
    const g = this.add.graphics();
    g.fillStyle(touch ? 0x0d2a14 : 0x1b2a21, 1).fillRoundedRect(0, -16, w, 32, touch ? 16 : 6);
    g.lineStyle(2, touch ? COLORS.neon : 0x6f9a7b, 1).strokeRoundedRect(0, -16, w, 32, touch ? 16 : 6);
    if (!touch) g.fillStyle(0x000000, 0.35).fillRect(4, 13, w - 8, 3);
    txt.setX(11);
    parent.add(this.add.container(x, y, [g, txt]));
    return w;
  }

  private render(): void {
    this.body?.destroy();
    const p = PAGES[this.page];
    const body = (this.body = this.add.container(0, 0));
    body.add(panel(this, 570, 140, 654, 500, { title: `STEP ${this.page + 1} / ${PAGES.length}` }));
    body.add(display(this, 600, 190, p.title, 30, hex(COLORS.neon)));
    body.add(ui(this, 602, 234, p.sub, 18, '#d8ffe0', { width: 590 }));

    let y = 290;
    const section = (label: string, rows: Row[], touch: boolean): void => {
      body.add(ui(this, 602, y - 16, label, 13, COLORS.textDim));
      y += 18;
      for (const r of rows) {
        let x = 602;
        for (const k of r.keys) x += this.keycap(body, x, y, k, touch) + 8;
        body.add(ui(this, x + 6, y, r.desc, 16, '#d8ffe0', { origin: [0, 0.5], width: 1200 - x - 20 }));
        y += 44;
      }
      y += 8;
    };
    section('DESKTOP', p.desktop, false);
    section('MOBILE / TOUCH', p.mobile, true);

    const tip = this.add.graphics();
    tip.fillStyle(0x14301a, 0.9).fillRect(600, 556, 596, 62);
    tip.fillStyle(COLORS.amber, 1).fillRect(600, 556, 4, 62);
    body.add(tip);
    body.add(ui(this, 620, 565, `TIP  ${p.tip}`, 16, '#ffe9b0', { width: 560 }));

    this.nextBtn.setText(this.page === PAGES.length - 1 ? "LET'S GO ▶" : 'NEXT ▶');
    this.dots?.clear();
    PAGES.forEach((_, i) => {
      this.dots?.fillStyle(i === this.page ? COLORS.neon : 0x2a4a33, 1).fillCircle(GAME_W / 2 - 40 + i * 20, GAME_H - 52, i === this.page ? 6 : 4);
    });
    this.weaponLabel?.setText('');
    this.lastWeapon = -1;
  }

  update(_t: number, delta: number): void {
    const dt = delta / 1000;
    this.t += dt;
    const a = PAGES[this.page].anim(this.t);
    const cx = 296 + a.x;
    const cy = 470 + a.dy;
    // page 4 cycles through every weapon, page 2 fires bursts
    if (this.page === 3) {
      const i = Math.floor(this.t / 1.6) % WEAPON_ORDER.length;
      if (i !== this.lastWeapon) {
        this.lastWeapon = i;
        this.view?.setWeapon(WEAPON_ORDER[i]);
        this.weaponLabel?.setText(WEAPON_ORDER[i].toUpperCase());
      }
    }
    if (this.page === 1 && this.t - this.lastShot > 0.45) {
      this.lastShot = this.t;
      this.view?.flashMuzzle(5);
    }
    this.view?.update(
      { x: cx, y: cy, aim: a.aim, vx: a.vx, grounded: a.grounded, jetting: a.jetting, alive: true, hp: 100, armor: 50, protectedFx: false },
      dt,
    );
  }
}
