import Phaser from 'phaser';
import {
  HOME,
  LUDO_COLORS,
  LUDO_COLOR_NAMES,
  LudoEngine,
  type LudoEvent,
  type LudoSeat,
  type LudoState,
  newLudo,
} from '../../shared/ludo';
import { COLORS, FONT_DISPLAY, GAME_H, GAME_W, SAFE, SCREEN_W, hex, viewPad } from '../config';
import { CARD_POS, Dice, LudoView, SeatCard } from '../ludo/LudoView';
import { audio } from '../systems/AudioManager';
import { net } from '../systems/MultiplayerManager';
import { button, fadeTo, panel, ui } from '../ui/theme';

export interface LudoSceneData {
  online: boolean;
  seats: LudoSeat[];
  mySeats: number[]; // seats controlled on this device
  ids?: string[];
  startState?: LudoState;
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export class LudoScene extends Phaser.Scene {
  private d!: LudoSceneData;
  private st!: LudoState;
  private view!: LudoView;
  private dice!: Dice;
  private cards: SeatCard[] = [];
  private engine?: LudoEngine;
  private queue: LudoEvent[] = [];
  private busy = false;
  private legal: number[] = [];
  private legalSeat = -1;
  private rolling = false;
  private over = false;
  private toast!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  private offs: (() => void)[] = [];
  private leaveBtn!: ReturnType<typeof button>;
  private leaveArmed = false;
  private endUi?: Phaser.GameObjects.Container;

  constructor() {
    super('Ludo');
  }

  init(data: LudoSceneData): void {
    this.d = data;
  }

  private get hotSeat(): boolean {
    return this.d.mySeats.length > 1;
  }

  create(): void {
    this.cameras.main.fadeIn(350, 0, 0, 0);
    const pad = viewPad();
    this.cameras.main.setScroll(-pad, 0);
    this.queue = [];
    this.busy = false;
    this.legal = [];
    this.rolling = false;
    this.over = false;
    this.offs = [];
    this.cards = [];
    this.endUi = undefined;

    // background: deep navy with soft glow
    const bg = this.add.graphics().setDepth(-10);
    const bands = 18;
    for (let i = 0; i < bands; i++) {
      const t = i / (bands - 1);
      const c = Phaser.Display.Color.Interpolate.ColorWithColor(new Phaser.Display.Color(16, 24, 58), new Phaser.Display.Color(52, 24, 84), 1, t);
      bg.fillStyle(Phaser.Display.Color.GetColor(c.r, c.g, c.b), 1).fillRect(-pad - 2, (i * GAME_H) / bands, SCREEN_W + 4, GAME_H / bands + 1);
    }
    bg.fillStyle(0xffffff, 0.04).fillCircle(160, 120, 220).fillCircle(1120, 620, 260);

    // state + driver
    if (this.d.online && this.d.startState) {
      this.st = clone(this.d.startState);
      this.bindNetwork();
    } else {
      this.engine = new LudoEngine(this.d.seats, {
        event: (e) => this.onEvent(e),
        schedule: (ms, fn) => {
          const ev = this.time.delayedCall(ms, fn);
          return () => ev.remove(false);
        },
        rnd: Math.random,
      });
      this.st = clone(this.engine.state);
    }

    this.view = new LudoView(this, this.st);
    this.view.layout(this.st);
    this.st.seats.forEach((s, i) => {
      const mine = this.d.mySeats.includes(i);
      const label = mine && !this.hotSeat ? `${s.name} (YOU)` : s.name;
      this.cards.push(new SeatCard(this, i, s.color, label, s.bot));
    });
    const first = CARD_POS[this.st.seats[this.st.turn].color];
    this.dice = new Dice(this, first.dx, first.dy, () => this.onDiceTap());
    this.dice.setRing(LUDO_COLORS[this.st.seats[this.st.turn].color], false);

    this.toast = this.add.text(GAME_W / 2, 360, '', { fontFamily: FONT_DISPLAY, fontSize: '40px', fontStyle: '900', color: '#ffffff' }).setOrigin(0.5).setStroke('#000', 8).setDepth(3000).setAlpha(0);
    this.hint = this.add.text(GAME_W / 2, 26, '', { fontFamily: 'Rajdhani, sans-serif', fontSize: '22px', fontStyle: '700', color: '#ffffff' }).setOrigin(0.5).setStroke('#000', 4).setDepth(3000);
    this.leaveBtn = button(this, 1190 - SAFE.r, 24, 110, 34, 'LEAVE', () => this.onLeave(), { danger: true, fontSize: 11 }).setDepth(3000);

    this.updateCards(this.st);
    this.showToast('LUDO', 1400);
    this.hint.setText('GET READY…');
    this.setupInput();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup());
    this.engine?.begin();
  }

  // ------------------------------------------------------------------ driver

  private bindNetwork(): void {
    const on = <T>(evt: string, fn: (p: T) => void): void => {
      net.on(evt, fn);
      this.offs.push(() => net.off(evt, fn));
    };
    on<LudoEvent>('levent', (e) => this.onEvent(e));
    on<unknown>('disconnected', () => {
      if (this.over) return;
      this.showToast('DISCONNECTED', 2500);
      this.time.delayedCall(2200, () => fadeTo(this, 'LudoMenu'));
    });
  }

  private sendRoll(): void {
    if (this.d.online) net.ludoRoll();
    else this.engine?.roll(this.st.turn);
  }

  private sendMove(token: number): void {
    if (this.d.online) net.ludoMove(token);
    else this.engine?.move(this.st.turn, token);
  }

  // ------------------------------------------------------------------- input

  private setupInput(): void {
    this.input.keyboard?.on('keydown-SPACE', () => this.onDiceTap());
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.over || !this.legal.length || this.legal.length < 2 || !this.d.mySeats.includes(this.legalSeat)) return;
      let best = -1;
      let bd = 38;
      for (const ti of this.legal) {
        const tk = this.view.tokens[this.legalSeat][ti];
        const dd = Math.hypot(tk.x - p.worldX, tk.y - p.worldY);
        if (dd < bd) {
          bd = dd;
          best = ti;
        }
      }
      if (best >= 0) {
        this.legal = [];
        this.view.setHighlights([]);
        audio.play('ui');
        this.sendMove(best);
      }
    });
  }

  private canRoll(): boolean {
    return !this.over && !this.rolling && this.st.phase === 'roll' && this.d.mySeats.includes(this.st.turn) && !this.busy;
  }

  private onDiceTap(): void {
    if (!this.canRoll()) return;
    this.rolling = true;
    this.dice.setRing(LUDO_COLORS[this.st.seats[this.st.turn].color], false);
    this.sendRoll();
  }

  // ---------------------------------------------------------- event pipeline

  private onEvent(e: LudoEvent): void {
    if (this.over && e.type !== 'over') return;
    this.queue.push(e);
    this.pump();
  }

  private pump(): void {
    if (this.busy || !this.queue.length) return;
    this.busy = true;
    const e = this.queue.shift()!;
    const dur = this.handle(e);
    this.time.delayedCall(dur, () => {
      this.busy = false;
      this.pump();
    });
  }

  private seatLabel(seat: number): string {
    const s = this.st.seats[seat];
    return this.hotSeat || !this.d.mySeats.includes(seat) ? s.name : 'YOU';
  }

  private handle(e: LudoEvent): number {
    switch (e.type) {
      case 'turn': {
        this.st = e.state;
        this.rolling = false;
        this.legal = [];
        this.view.setHighlights([]);
        this.positionDice(e.state.turn);
        this.dice.setValue(0);
        this.updateCards(e.state);
        const mine = this.d.mySeats.includes(e.state.turn);
        const name = LUDO_COLOR_NAMES[e.state.seats[e.state.turn].color];
        this.hint.setText(mine ? (this.hotSeat ? `${name}: TAP THE DICE` : 'YOUR TURN — TAP THE DICE') : `${this.st.seats[e.state.turn].name} is rolling…`);
        this.dice.setHint(mine ? 'TAP TO ROLL' : '');
        this.dice.setRing(LUDO_COLORS[e.state.seats[e.state.turn].color], mine);
        return 200;
      }
      case 'roll': {
        this.st = e.state;
        this.dice.setHint('');
        this.dice.setRing(LUDO_COLORS[e.state.seats[e.seat].color], false);
        audio.play('dice');
        this.dice.roll(e.dice, 800, () => {
          this.legal = e.legal;
          this.legalSeat = e.seat;
          if (this.d.mySeats.includes(e.seat) && e.legal.length > 1) {
            this.view.setHighlights(e.legal.map((t) => ({ seat: e.seat, token: t })));
            this.hint.setText('TAP A GLOWING TOKEN TO MOVE');
          } else if (e.legal.length === 1) {
            this.view.setHighlights([{ seat: e.seat, token: e.legal[0] }]);
          }
        });
        return 1080;
      }
      case 'noMove': {
        this.st = e.state;
        this.dice.setHint('');
        audio.play('dice');
        this.dice.roll(e.dice, 700, () => this.showToast('NO MOVE', 1000));
        return 1500;
      }
      case 'forfeit': {
        this.st = e.state;
        this.dice.setValue(6);
        this.showToast('THREE 6s — TURN LOST', 1500);
        return 1700;
      }
      case 'move': {
        this.st = e.state;
        this.legal = [];
        this.view.setHighlights([]);
        const steps = e.from === -1 ? 1 : e.to - e.from;
        this.view.hop(e.state, e.seat, e.token, e.from, e.to, 130, () => this.afterHop(e), () => audio.play('tick', 0.8));
        return steps * 135 + 200 + (e.captured.length ? 850 : 250) + (e.to === HOME ? 250 : 0);
      }
      case 'over': {
        this.st = e.state;
        this.showEnd(e.winner);
        return 100;
      }
    }
    return 0;
  }

  private afterHop(e: Extract<LudoEvent, { type: 'move' }>): void {
    this.view.layout(e.state);
    for (const c of e.captured) {
      this.view.sendHome(e.state, c.seat, c.token, () => this.view.layout(e.state));
    }
    this.updateCards(e.state);
    if (e.captured.length) {
      audio.play('capture');
      this.showToast('CAPTURED!', 1100);
      this.cameras.main.shake(160, 0.004);
    } else if (e.to === HOME) {
      audio.play('home');
      this.showToast('HOME!', 1000);
    } else if (e.extra) {
      this.showToast('EXTRA TURN!', 900);
    }
  }

  // --------------------------------------------------------------------- ui

  private positionDice(seat: number): void {
    const pos = CARD_POS[this.st.seats[seat].color];
    this.tweens.add({ targets: this.dice, x: pos.dx, y: pos.dy, duration: 260, ease: 'Cubic.easeOut' });
  }

  private updateCards(s: LudoState): void {
    this.cards.forEach((c, i) => {
      const active = i === s.turn;
      const label = active && s.phase !== 'over' ? (s.seats[i].bot ? 'THINKING…' : this.d.mySeats.includes(i) ? 'YOUR TURN' : 'PLAYING…') : '';
      c.update(s, s.turn, label);
    });
  }

  private showToast(text: string, ms: number): void {
    this.tweens.killTweensOf(this.toast);
    this.toast.setText(text).setAlpha(1).setScale(1.5);
    this.tweens.add({ targets: this.toast, scale: 1, duration: 220, ease: 'Back.easeOut' });
    this.tweens.add({ targets: this.toast, alpha: 0, delay: ms, duration: 300 });
  }

  private showEnd(winner: number): void {
    if (this.over) return;
    this.over = true;
    this.hint.setText('');
    this.view.setHighlights([]);
    const s = this.st;
    const w = s.seats[winner];
    const mine = this.d.mySeats.includes(winner);
    audio.play(mine || this.hotSeat ? 'win' : 'back');
    // confetti
    for (let i = 0; i < 90; i++) {
      const r = this.add.rectangle(Math.random() * GAME_W, -20, 8, 14, LUDO_COLORS[i % 4]).setDepth(7000).setAngle(Math.random() * 360);
      this.tweens.add({ targets: r, y: GAME_H + 30, x: r.x + (Math.random() - 0.5) * 200, angle: r.angle + 400, duration: 2200 + Math.random() * 1800, delay: Math.random() * 900, onComplete: () => r.destroy() });
    }
    const c = this.add.container(0, 0).setDepth(8000);
    const dim = this.add.rectangle(GAME_W / 2, GAME_H / 2, SCREEN_W + 40, GAME_H, 0x000000, 0.7).setInteractive();
    const pn = panel(this, GAME_W / 2 - 300, 130, 600, 460, { title: 'GAME OVER' });
    const title = mine && !this.hotSeat ? 'YOU WIN!' : `${w.name.toUpperCase()} WINS!`;
    c.add([
      dim, pn,
      this.add.text(GAME_W / 2, 220, title, { fontFamily: FONT_DISPLAY, fontSize: '50px', fontStyle: '900', color: hex(LUDO_COLORS[w.color]) }).setOrigin(0.5).setStroke('#000', 8),
    ]);
    const order = s.seats.map((_, i) => i).sort((a, b) => s.tokens[b].filter((p) => p === HOME).length - s.tokens[a].filter((p) => p === HOME).length);
    order.forEach((si, k) => {
      const y = 280 + k * 52;
      const col = LUDO_COLORS[s.seats[si].color];
      const home = s.tokens[si].filter((p) => p === HOME).length;
      const g = this.add.graphics();
      g.fillStyle(col, 0.18).fillRect(GAME_W / 2 - 250, y, 500, 44);
      g.fillStyle(col, 1).fillRect(GAME_W / 2 - 250, y, 5, 44);
      c.add([
        g,
        ui(this, GAME_W / 2 - 230, y + 9, `${k + 1}. ${s.seats[si].name}`, 22, '#ffffff'),
        ui(this, GAME_W / 2 + 230, y + 9, `${home}/4 home`, 20, hex(col), { origin: [1, 0] }),
      ]);
    });
    const online = this.d.online;
    c.add(button(this, GAME_W / 2 - 150, 540, 270, 52, online ? 'BACK TO LOBBY' : 'PLAY AGAIN', () => {
      if (online) fadeTo(this, 'LudoLobby');
      else fadeTo(this, 'Ludo', { ...this.d, startState: undefined });
    }, { primary: true, fontSize: 15 }));
    c.add(button(this, GAME_W / 2 + 150, 540, 270, 52, 'MENU', () => {
      if (online) net.leaveRoom();
      fadeTo(this, 'LudoMenu');
    }, { fontSize: 15 }));
    this.endUi = c;
  }

  private onLeave(): void {
    if (this.over) return;
    if (!this.leaveArmed) {
      this.leaveArmed = true;
      this.leaveBtn.setText('SURE?');
      this.time.delayedCall(2200, () => {
        this.leaveArmed = false;
        this.leaveBtn.setText('LEAVE');
      });
      return;
    }
    if (this.d.online) net.leaveRoom();
    this.over = true;
    fadeTo(this, this.d.online ? 'LudoLobby' : 'LudoMenu');
  }

  update(_t: number, delta: number): void {
    this.view.update(Math.min(delta / 1000, 0.05));
  }

  private cleanup(): void {
    this.offs.forEach((f) => f());
    this.offs = [];
    this.engine?.dispose();
    this.input.keyboard?.removeAllListeners();
    void COLORS;
    void this.endUi;
  }
}

export { newLudo };
