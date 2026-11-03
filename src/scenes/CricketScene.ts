import Phaser from 'phaser';
import {
  oversText,
  type BatInput,
  type CricketBallPayload,
  type CricketConfig,
  type CricketEndPayload,
  type CricketPhasePayload,
  type CricketResultPayload,
  type CricketState,
  type Delivery,
} from '../../shared/cricket';
import { COLORS, FONT_DISPLAY, GAME_H, GAME_W, SAFE, SCREEN_W, hex, viewPad } from '../config';
import { Banners, CricketControls, Scoreboard } from '../cricket/CricketUI';
import { CricketView, TEAM_COLORS } from '../cricket/CricketView';
import { LocalMatch } from '../cricket/LocalMatch';
import { audio } from '../systems/AudioManager';
import { net } from '../systems/MultiplayerManager';
import { store, type Difficulty } from '../systems/Storage';
import { button, fadeTo, panel, ui } from '../ui/theme';

export interface CricketSceneData {
  online: boolean;
  cfg: CricketConfig;
  names: [string, string];
  myIdx: 0 | 1;
  firstBat?: 0 | 1;
  difficulty?: Difficulty;
  startState?: CricketState;
}

type Stage = 'intro' | 'wait' | 'select' | 'meter' | 'runup' | 'flight' | 'result' | 'over';

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export class CricketScene extends Phaser.Scene {
  private d!: CricketSceneData;
  private st!: CricketState;
  private view!: CricketView;
  private sb!: Scoreboard;
  private controls!: CricketControls;
  private banners!: Banners;
  private local?: LocalMatch;
  private stage: Stage = 'intro';
  private pending: CricketResultPayload | null = null;
  private hitSent = false;
  private noShotTimer?: Phaser.Time.TimerEvent;
  private offs: (() => void)[] = [];
  private endUi?: Phaser.GameObjects.Container;
  private leaveArmed = false;
  private touch = false;

  constructor() {
    super('Cricket');
  }

  init(data: CricketSceneData): void {
    this.d = data;
  }

  private get role(): 'bat' | 'bowl' {
    return this.st.batting === this.d.myIdx ? 'bat' : 'bowl';
  }

  create(): void {
    this.cameras.main.fadeIn(350, 0, 0, 0);
    this.cameras.main.setScroll(-viewPad(), 0); // keep the 1280 design area centred
    this.touch = store.touchEnabled();
    const k = this.touch ? 1.12 : 1;
    this.stage = 'intro';
    this.pending = null;
    this.offs = [];
    this.endUi = undefined;

    this.view = new CricketView(this);
    this.sb = new Scoreboard(this, this.touch ? 1.08 : 1);
    this.banners = new Banners(this);
    this.controls = new CricketControls(this, { bowl: () => this.pressBowl(), hit: () => this.pressHit() }, k);

    // leave button (double-tap to confirm so it can't be hit by accident)
    const leave = button(this, GAME_W - 74 + viewPad() - SAFE.r, 36, 120, 40, 'LEAVE', () => this.onLeave(), { danger: true, fontSize: 12 });
    leave.setDepth(7000);
    this.leaveBtn = leave;

    this.d.firstBat = this.d.firstBat ?? (Math.random() < 0.5 ? 0 : 1);
    if (this.d.online && this.d.startState) {
      this.st = clone(this.d.startState);
      this.bindNetwork();
    } else {
      this.local = new LocalMatch(this, this.d.cfg, this.d.names, this.d.firstBat, this.d.difficulty ?? 'normal', {
        phase: (p) => this.onPhase(p),
        ball: (p) => this.onBall(p),
        result: (p) => this.onResult(p),
        end: (p) => this.onEnd(p),
      });
      this.st = this.local.state;
    }
    this.view.setBattingTeam(this.st.batting);
    this.view.resetBall();
    this.sb.update(this.st, this.d.myIdx);
    this.controls.show('none');

    // ---- intro banner
    const batter = this.st.names[this.st.batting];
    this.banners.showResult('PLAY BALL!', `${batter} bat first · ${this.d.cfg.overs} overs · ${this.d.cfg.wickets} wickets`, '#ffd166', 2800);
    this.banners.setHint(this.st.batting === this.d.myIdx ? 'YOU BAT FIRST — GET READY' : 'YOU BOWL FIRST — GET READY');
    audio.play('crowd');

    this.setupInput();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup());
    this.local?.start();
  }

  private leaveBtn!: ReturnType<typeof button>;

  // ----------------------------------------------------------------- input

  private setupInput(): void {
    const kb = this.input.keyboard;
    if (kb) {
      kb.on('keydown-SPACE', () => (this.role === 'bowl' ? this.pressBowl() : this.pressHit()));
      const nums = ['ONE', 'TWO', 'THREE', 'FOUR'];
      nums.forEach((n, i) => kb.on(`keydown-${n}`, () => this.numKey(i)));
      const dirKey = (side: 'leg' | 'straight' | 'off'): void => {
        if (this.role === 'bat') this.controls.setDir(side);
        else this.controls.setLine(side === 'straight' ? 'middle' : side);
      };
      for (const key of ['LEFT', 'A']) kb.on(`keydown-${key}`, () => dirKey('leg'));
      for (const key of ['UP', 'W']) kb.on(`keydown-${key}`, () => dirKey('straight'));
      for (const key of ['RIGHT', 'D']) kb.on(`keydown-${key}`, () => dirKey('off'));
    }
    // tapping the field itself also plays the shot / locks the meter (big target on phones)
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.y > 100 && p.y < GAME_H - 235 && p.x < SCREEN_W - 160) {
        if (this.stage === 'flight' && this.role === 'bat') this.pressHit();
        else if (this.stage === 'meter') this.pressBowl();
      }
    });
  }

  private numKey(i: number): void {
    if (this.role === 'bowl') {
      const kinds = ['fast', 'medium', 'spin', 'yorker'] as const;
      if (this.stage === 'select' && kinds[i]) this.controls.setKind(kinds[i]);
    } else {
      const styles = ['defend', 'drive', 'loft'] as const;
      if (styles[i]) this.controls.setStyle(styles[i]);
    }
  }

  private pressBowl(): void {
    if (this.role !== 'bowl') return;
    if (this.stage === 'select') {
      this.stage = 'meter';
      this.controls.startMeter();
      this.controls.setBowlEnabled(false);
      this.controls.setBowlLabel('LOCK');
      this.banners.setHint('TAP AGAIN WHEN THE MARKER IS IN THE GREEN');
    } else if (this.stage === 'meter') {
      const acc = this.controls.lockMeter();
      const d: Delivery = { kind: this.controls.kind, line: this.controls.line, acc };
      this.stage = 'runup';
      this.controls.setBowlLabel('BOWL');
      this.banners.setHint('');
      audio.play('swish', 0.6);
      this.view.runUp(430, () => this.sendBowl(d));
    }
  }

  private sendBowl(d: Delivery): void {
    if (this.d.online) net.cricketBowl(d);
    else this.local?.engine.bowl(this.d.myIdx, d);
  }

  private sendBat(i: BatInput): void {
    if (this.d.online) net.cricketBat(i);
    else this.local?.engine.bat(this.d.myIdx, i);
  }

  private pressHit(): void {
    if (this.role !== 'bat' || this.stage !== 'flight' || this.hitSent) return;
    const arrival = this.view.arrivalAt;
    if (!arrival) return;
    this.hitSent = true;
    const err = Math.round(this.time.now - arrival);
    this.noShotTimer?.remove(false);
    this.sendBat({ style: this.controls.style, dir: this.controls.dir, err });
    audio.play('swish');
    this.controls.setHitEnabled(false);
    const a = Math.abs(err);
    const label = a < 45 ? 'PERFECT!' : a < 110 ? (err < 0 ? 'GOOD · EARLY' : 'GOOD · LATE') : err < 0 ? 'TOO EARLY' : 'TOO LATE';
    const col = a < 45 ? '#39ff14' : a < 110 ? '#ffd166' : '#ff6b6b';
    const t = this.add.text(GAME_W / 2, 520, label, { fontFamily: FONT_DISPLAY, fontSize: '26px', fontStyle: '700', color: col }).setOrigin(0.5).setStroke('#000', 5).setDepth(6600);
    this.tweens.add({ targets: t, y: 480, alpha: 0, duration: 900, onComplete: () => t.destroy() });
  }

  // --------------------------------------------------------------- driver events

  private onPhase(p: CricketPhasePayload): void {
    if (this.stage === 'over') return;
    this.st = p.state;
    this.pending = null;
    this.sb.update(this.st, this.d.myIdx);
    this.view.setBattingTeam(this.st.batting);
    this.view.resetBall();
    this.hitSent = false;
    this.controls.show(this.role);
    this.controls.hideMeter();
    this.controls.setBowlLabel('BOWL');
    if (this.role === 'bowl') {
      this.stage = 'select';
      this.controls.setBowlEnabled(true);
      this.banners.setHint('PICK A DELIVERY + LINE, THEN TAP BOWL');
    } else {
      this.stage = 'wait';
      this.controls.setHitEnabled(false);
      this.banners.setHint('SET YOUR SHOT — BOWLER IS PREPARING…');
    }
  }

  private onBall(p: CricketBallPayload): void {
    if (this.stage === 'over') return;
    this.hitSent = false;
    this.stage = 'flight';
    this.banners.setHint(this.role === 'bat' ? 'HIT WHEN THE RING CLOSES!' : 'WATCH THE BALL…');
    if (this.role === 'bowl') {
      this.view.launch(p.d, p.flightMs, 0);
      this.view.ringOn = false;
      audio.play('bowl');
    } else {
      this.view.runUp(430, () => audio.play('bowl'));
      this.view.launch(p.d, p.flightMs, 430);
      this.controls.setHitEnabled(true);
      // no press = no shot (sent just after the ball passes)
      this.noShotTimer?.remove(false);
      const wait = 430 + p.flightMs + 380;
      this.noShotTimer = this.time.delayedCall(wait, () => {
        if (!this.hitSent && this.stage === 'flight') {
          this.hitSent = true;
          this.sendBat({ style: 'none', dir: this.controls.dir, err: 0 });
        }
      });
    }
  }

  private onResult(r: CricketResultPayload): void {
    if (this.stage === 'over') return;
    this.pending = r;
  }

  private playPending(): void {
    const r = this.pending;
    if (!r) return;
    this.pending = null;
    const o = r.outcome;
    this.stage = 'result';
    this.controls.setHitEnabled(false);
    this.banners.setHint('');
    const dur = this.view.playOutcome(o, { style: r.input.style, dir: r.input.dir });
    const swung = r.input.style !== 'none' && !o.wide;
    if (swung) audio.play('bat', 0.6 + 0.4 * o.quality);
    this.time.delayedCall(180, () => {
      this.st = r.state;
      this.sb.update(this.st, this.d.myIdx);
      const col = o.wicket ? '#ff4d4d' : o.runs === 6 ? '#d06bff' : o.runs === 4 ? '#35d6ff' : o.wide ? '#ffd166' : '#ffffff';
      this.banners.showResult(o.headline, o.sub, col, 2000);
      if (o.wicket) audio.play('wicket');
      if (o.runs >= 4) audio.play('cheer');
      else if (o.runs > 0) audio.play('crowd');
    });
    if (r.inningsEnded && !r.matchEnded) {
      this.time.delayedCall(Math.max(dur, 1800) + 300, () => {
        if (this.stage === 'over') return;
        const chaser = r.state.names[r.state.batting];
        this.banners.showResult('INNINGS BREAK', `${chaser} need ${r.state.target} to win`, '#ffd166', 3000);
      });
    }
  }

  private onEnd(p: CricketEndPayload): void {
    if (this.stage === 'over') return;
    this.stage = 'over';
    this.st = p.state;
    this.sb.update(this.st, this.d.myIdx);
    this.controls.show('none');
    this.controls.hideMeter();
    this.banners.setHint('');
    this.showEnd(p);
  }

  private bindNetwork(): void {
    const on = <T>(evt: string, fn: (p: T) => void): void => {
      net.on(evt, fn);
      this.offs.push(() => net.off(evt, fn));
    };
    on<CricketPhasePayload>('cphase', (p) => this.onPhase(p));
    on<CricketBallPayload>('cball', (p) => this.onBall(p));
    on<CricketResultPayload>('cresult', (p) => this.onResult(p));
    on<CricketEndPayload>('cend', (p) => this.onEnd(p));
    on<unknown>('disconnected', () => {
      if (this.stage === 'over') return;
      this.banners.showResult('DISCONNECTED', 'Lost connection to the server', '#ff6b6b', 3000);
      this.time.delayedCall(2200, () => fadeTo(this, 'CricketMenu'));
    });
  }

  // -------------------------------------------------------------------- end

  private showEnd(p: CricketEndPayload): void {
    const s = p.state;
    const win = s.result?.winner ?? -1;
    const mine = win === this.d.myIdx;
    const title = win === -1 ? 'MATCH TIED' : mine ? 'YOU WIN!' : this.d.online ? 'YOU LOSE' : 'DEFEAT';
    const col = win === -1 ? '#ffd166' : mine ? hex(COLORS.neon) : '#ff6b6b';
    audio.play(mine ? 'win' : 'back');
    if (mine) this.view.celebrate('six');

    const c = this.add.container(0, 0).setDepth(8000);
    const dim = this.add.rectangle(GAME_W / 2, GAME_H / 2, SCREEN_W + 40, GAME_H, 0x000000, 0.72).setInteractive();
    const pn = panel(this, GAME_W / 2 - 300, 140, 600, 440, { title: 'FULL TIME' });
    const head = this.add.text(GAME_W / 2, 230, title, { fontFamily: FONT_DISPLAY, fontSize: '56px', fontStyle: '900', color: col }).setOrigin(0.5).setStroke('#000', 8);
    const res = ui(this, GAME_W / 2, 282, s.result?.text ?? '', 24, '#d8ffe0', { origin: [0.5, 0] });
    c.add([dim, pn, head, res]);
    [0, 1].forEach((i) => {
      const y = 350 + i * 58;
      const sc = s.score[i];
      const t = TEAM_COLORS[i];
      const g = this.add.graphics();
      g.fillStyle(t, 0.18).fillRect(GAME_W / 2 - 260, y, 520, 48);
      g.fillStyle(t, 1).fillRect(GAME_W / 2 - 260, y, 5, 48);
      c.add([
        g,
        ui(this, GAME_W / 2 - 240, y + 8, `${s.names[i]}${i === this.d.myIdx ? ' (YOU)' : ''}`, 24, '#d8ffe0'),
        ui(this, GAME_W / 2 + 240, y + 4, `${sc.runs}/${sc.wickets}`, 34, hex(t), { origin: [1, 0] }),
        ui(this, GAME_W / 2 + 120, y + 14, `${oversText(sc.balls)} ov`, 18, '#7fa889', { origin: [1, 0] }),
      ]);
    });
    const online = this.d.online;
    c.add(
      button(this, GAME_W / 2 - 150, 520, 270, 54, online ? 'BACK TO LOBBY' : 'REMATCH', () => {
        if (online) fadeTo(this, 'CricketLobby');
        else fadeTo(this, 'Cricket', { ...this.d, firstBat: undefined, startState: undefined });
      }, { primary: true, fontSize: 16 }),
    );
    c.add(button(this, GAME_W / 2 + 150, 520, 270, 54, 'MENU', () => {
      if (online) net.leaveRoom();
      fadeTo(this, 'CricketMenu');
    }, { fontSize: 16 }));
    this.endUi = c;
  }

  private onLeave(): void {
    if (this.stage === 'over') return;
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
    this.stage = 'over';
    fadeTo(this, this.d.online ? 'CricketLobby' : 'CricketMenu');
  }

  // ------------------------------------------------------------------- frame

  update(_t: number, delta: number): void {
    const dt = Math.min(delta / 1000, 0.05);
    this.view.update(dt);
    this.controls.tick(this.time.now);
    if (this.pending && (this.view.arrived || !this.view.hasBall)) this.playPending();
  }

  private cleanup(): void {
    this.offs.forEach((f) => f());
    this.offs = [];
    this.local?.dispose();
    this.noShotTimer?.remove(false);
    this.input.keyboard?.removeAllListeners();
    this.view.destroy();
  }
}

