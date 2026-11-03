import Phaser from 'phaser';
import {
  CricketEngine,
  type BatInput,
  type CricketBallPayload,
  type CricketConfig,
  type CricketEndPayload,
  type CricketPhasePayload,
  type CricketResultPayload,
  type CricketState,
  type Delivery,
  type DeliveryKind,
  type Line,
  type ShotDir,
  type ShotStyle,
} from '../../shared/cricket';
import type { Difficulty } from '../systems/Storage';

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export interface MatchHandlers {
  phase(p: CricketPhasePayload): void;
  ball(p: CricketBallPayload): void;
  result(p: CricketResultPayload): void;
  end(p: CricketEndPayload): void;
}

const SKILL: Record<Difficulty, { acc: [number, number]; timingSd: number; lineMatch: number }> = {
  easy: { acc: [0.3, 0.85], timingSd: 150, lineMatch: 0.35 },
  normal: { acc: [0.5, 0.95], timingSd: 100, lineMatch: 0.55 },
  hard: { acc: [0.65, 1], timingSd: 60, lineMatch: 0.78 },
};

const gauss = (): number => {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

/** Offline match: the shared CricketEngine plus a computer opponent (always player index 1). */
export class LocalMatch {
  readonly engine: CricketEngine;
  private cancels = new Set<() => void>();
  private cpu = 1 as const;

  constructor(private scene: Phaser.Scene, cfg: CricketConfig, names: [string, string], firstBat: 0 | 1, private diff: Difficulty, private h: MatchHandlers) {
    this.engine = new CricketEngine(cfg, names, firstBat, {
      phase: (p) => {
        const snap = clone(p);
        this.h.phase(snap);
        if (p.bowler === this.cpu) this.cpuBowl((p.breakMs ?? 0) + 1100);
      },
      ball: (p) => {
        this.h.ball(clone(p));
        if (this.engine.state.batting === this.cpu) this.cpuBat(p);
      },
      result: (p) => this.h.result(clone(p)),
      end: (p) => this.h.end(clone(p)),
      schedule: (ms, fn) => this.schedule(ms, fn),
      rnd: Math.random,
    });
  }

  get state(): CricketState {
    return clone(this.engine.state);
  }

  start(): void {
    this.engine.begin();
  }

  private schedule(ms: number, fn: () => void): () => void {
    const ev = this.scene.time.delayedCall(ms, () => {
      this.cancels.delete(cancel);
      fn();
    });
    const cancel = (): void => {
      ev.remove(false);
      this.cancels.delete(cancel);
    };
    this.cancels.add(cancel);
    return cancel;
  }

  private cpuBowl(delay: number): void {
    const k = SKILL[this.diff];
    const r = Math.random();
    const kind: DeliveryKind = r < 0.3 ? 'fast' : r < 0.6 ? 'medium' : r < 0.85 ? 'spin' : 'yorker';
    const line: Line = (['off', 'middle', 'leg'] as Line[])[Math.floor(Math.random() * 3)];
    const acc = k.acc[0] + Math.random() * (k.acc[1] - k.acc[0]);
    this.schedule(delay, () => this.engine.bowl(this.cpu, { kind, line, acc }));
  }

  private cpuBat(p: CricketBallPayload): void {
    const k = SKILL[this.diff];
    const s = this.engine.state;
    const sc = s.score[this.cpu];
    const ballsLeft = Math.max(1, s.cfg.overs * 6 - sc.balls);
    let aggression = 0.35;
    if (s.innings === 2 && s.target !== null) aggression = Math.min(0.95, Math.max(0.15, (s.target - sc.runs) / ballsLeft / 2.2));
    const r = Math.random();
    const style: ShotStyle = r < aggression * 0.55 ? 'loft' : r < 0.25 + aggression * 0.55 ? 'drive' : 'defend';
    const wantDir: ShotDir = p.d.line === 'off' ? 'off' : p.d.line === 'leg' ? 'leg' : 'straight';
    const dir: ShotDir = Math.random() < k.lineMatch ? wantDir : (['off', 'straight', 'leg'] as ShotDir[])[Math.floor(Math.random() * 3)];
    const err = gauss() * k.timingSd;
    const input: BatInput = { style, dir, err };
    this.schedule(Math.max(250, p.flightMs + err), () => this.engine.bat(this.cpu, input));
  }

  dispose(): void {
    this.cancels.forEach((c) => c());
    this.cancels.clear();
    this.engine.dispose();
  }
}

export type { Delivery };
