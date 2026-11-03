// Cricket rules + ball resolution, shared by the browser (vs-AI mode) and the Node server (online rooms).
// Everything here is pure / deterministic given the injected RNG, so both sides stay in sync.

export type DeliveryKind = 'fast' | 'medium' | 'spin' | 'yorker';
export type Line = 'off' | 'middle' | 'leg';
export type ShotStyle = 'none' | 'defend' | 'drive' | 'loft';
export type ShotDir = 'off' | 'straight' | 'leg';

export interface CricketConfig {
  overs: number;
  wickets: number;
}

export const OVER_OPTIONS = [1, 2, 3, 5, 10];
export const WICKET_OPTIONS = [2, 3, 5, 10];
export const DEFAULT_CRICKET: CricketConfig = { overs: 2, wickets: 3 };

/** Time the ball takes from release to the batter, in ms. */
export const FLIGHT_MS: Record<DeliveryKind, number> = { fast: 950, medium: 1200, spin: 1550, yorker: 900 };
/** Batter may be this far off (ms) and still make decent contact. */
export const TIMING_WINDOW_MS: Record<DeliveryKind, number> = { fast: 170, medium: 200, spin: 210, yorker: 150 };

export interface Delivery {
  kind: DeliveryKind;
  line: Line;
  acc: number; // 0..1 bowler accuracy (meter)
}

export interface BatInput {
  style: ShotStyle;
  dir: ShotDir;
  err: number; // ms, signed: >0 late, <0 early
}

export interface BallOutcome {
  runs: number; // runs added (bat runs, or 1 for a wide)
  wicket: boolean;
  how?: 'bowled' | 'caught' | 'lbw';
  wide: boolean;
  counts: boolean; // legal delivery (wides don't count)
  hitDir: ShotDir;
  air: boolean;
  quality: number; // 0..1
  headline: string;
  sub: string;
}

const LINE_OF_DIR: Record<ShotDir, Line> = { off: 'off', straight: 'middle', leg: 'leg' };
const MATCH: Record<Line, Record<Line, number>> = {
  off: { off: 1, middle: 0.55, leg: 0.15 },
  middle: { off: 0.55, middle: 1, leg: 0.55 },
  leg: { off: 0.15, middle: 0.55, leg: 1 },
};

const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
const pick = <T>(arr: T[], rnd: () => number): T => arr[Math.floor(rnd() * arr.length) % arr.length];

const RUN_TEXT: Record<number, string[]> = {
  0: ['Dot ball', 'Beaten! No run', 'Solid defence'],
  1: ['Pushed for a single', 'Quick single', 'Worked away for one'],
  2: ['Two runs, well run', 'Placed in the gap — two', 'They come back for the second'],
  3: ['Three! Great running', 'Chased down late — three'],
  4: ['Cracked to the fence', 'Races away to the boundary', 'Timed to perfection'],
  6: ['Launched into the crowd', 'Massive hit over the rope', 'Out of the park'],
};

export function resolveBall(d: Delivery, b: BatInput, rnd: () => number): BallOutcome {
  // very inaccurate delivery = wide
  if (d.acc < 0.14) {
    return {
      runs: 1, wicket: false, wide: true, counts: false, hitDir: 'straight', air: false, quality: 0,
      headline: 'WIDE', sub: 'Way down the leg side — extra run',
    };
  }
  // poor accuracy: the ball drifts off the intended line
  let line = d.line;
  if (d.acc < 0.45 && rnd() < (0.45 - d.acc) * 1.8) line = pick(['off', 'middle', 'leg'] as Line[], rnd);

  const dir = b.dir;
  if (b.style === 'none') {
    let p = line === 'middle' ? 0.62 : line === 'off' ? 0.22 : 0.34;
    if (d.kind === 'yorker') p += 0.22;
    if (d.kind === 'fast') p += 0.08;
    p = clamp(p * (0.6 + d.acc * 0.5), 0.05, 0.9);
    if (rnd() < p) {
      const how = line === 'middle' && rnd() < 0.4 ? 'lbw' : 'bowled';
      return {
        runs: 0, wicket: true, how, wide: false, counts: true, hitDir: dir, air: false, quality: 0,
        headline: how === 'lbw' ? 'LBW!' : 'BOWLED!', sub: how === 'lbw' ? 'Plumb in front — finger goes up' : 'Timber! Middle stump cartwheels',
      };
    }
    return { runs: 0, wicket: false, wide: false, counts: true, hitDir: dir, air: false, quality: 0, headline: 'LEFT ALONE', sub: 'Well left outside the line' };
  }

  const window = TIMING_WINDOW_MS[d.kind];
  const q = clamp(1 - Math.abs(b.err) / window, 0, 1);
  const match = MATCH[line][LINE_OF_DIR[dir]];
  let s = q * (0.45 + 0.55 * match);
  if (d.kind === 'yorker' && b.style === 'loft') s *= 0.55;
  if (d.kind === 'spin' && b.style === 'loft') s *= 0.9;
  if (d.kind === 'fast' && b.style === 'defend') s = Math.min(1, s * 1.15);
  s = clamp(s * (0.85 + 0.3 * rnd()), 0, 1);

  const air = b.style === 'loft';
  const wk = b.style === 'defend' ? (1 - s) * 0.14 : b.style === 'drive' ? (1 - s) * 0.34 : (1 - s) * 0.6 + 0.05;
  if (rnd() < wk) {
    let how: 'bowled' | 'caught' | 'lbw';
    if (q < 0.22) how = rnd() < 0.65 ? 'bowled' : 'lbw';
    else how = 'caught';
    return {
      runs: 0, wicket: true, how, wide: false, counts: true, hitDir: dir, air: how === 'caught', quality: q,
      headline: how === 'caught' ? 'CAUGHT!' : how === 'lbw' ? 'LBW!' : 'BOWLED!',
      sub: how === 'caught' ? 'Skied it — safely taken in the deep' : how === 'lbw' ? 'Trapped in front of the stumps' : 'Beaten all ends up',
    };
  }

  const r = rnd();
  let runs = 0;
  if (b.style === 'defend') runs = s > 0.6 ? (r < 0.55 ? 1 : 0) : r < 0.2 ? 1 : 0;
  else if (b.style === 'drive') {
    if (s > 0.78) runs = r < 0.5 ? 4 : r < 0.75 ? 2 : r < 0.9 ? 3 : 1;
    else if (s > 0.5) runs = r < 0.18 ? 4 : r < 0.45 ? 2 : r < 0.8 ? 1 : 0;
    else runs = r < 0.18 ? 2 : r < 0.55 ? 1 : 0;
  } else {
    if (s > 0.75) runs = r < 0.5 ? 6 : r < 0.85 ? 4 : 2;
    else if (s > 0.45) runs = r < 0.2 ? 6 : r < 0.5 ? 4 : r < 0.75 ? 2 : 1;
    else runs = r < 0.3 ? 2 : r < 0.6 ? 1 : 0;
  }
  const headline = runs === 6 ? 'SIX!' : runs === 4 ? 'FOUR!' : runs === 0 ? 'DOT BALL' : runs === 1 ? '1 RUN' : `${runs} RUNS`;
  return {
    runs, wicket: false, wide: false, counts: true, hitDir: dir, air: air && runs >= 4, quality: q,
    headline, sub: pick(RUN_TEXT[runs] ?? RUN_TEXT[1], rnd),
  };
}

// ------------------------------------------------------------------ match state

export interface InningsScore {
  runs: number;
  wickets: number;
  balls: number; // legal balls bowled
}

export interface CricketState {
  cfg: CricketConfig;
  names: [string, string];
  innings: 1 | 2;
  batting: 0 | 1;
  score: [InningsScore, InningsScore]; // indexed by player (team)
  target: number | null;
  recent: string[]; // last balls of the current innings ('0','1','4','W','Wd')
  done: boolean;
  result: { winner: -1 | 0 | 1; text: string } | null;
}

export function newMatch(cfg: CricketConfig, names: [string, string], firstBat: 0 | 1): CricketState {
  return {
    cfg, names, innings: 1, batting: firstBat,
    score: [{ runs: 0, wickets: 0, balls: 0 }, { runs: 0, wickets: 0, balls: 0 }],
    target: null, recent: [], done: false, result: null,
  };
}

export const bowlingIdx = (s: CricketState): 0 | 1 => (s.batting === 0 ? 1 : 0);

export function applyOutcome(s: CricketState, o: BallOutcome): { inningsEnded: boolean; matchEnded: boolean } {
  const sc = s.score[s.batting];
  if (o.wide) {
    sc.runs += o.runs;
    s.recent.push('Wd');
  } else {
    sc.balls++;
    if (o.wicket) {
      sc.wickets++;
      s.recent.push('W');
    } else {
      sc.runs += o.runs;
      s.recent.push(String(o.runs));
    }
  }
  if (s.recent.length > 12) s.recent.shift();

  const over = sc.balls >= s.cfg.overs * 6 || sc.wickets >= s.cfg.wickets || (s.innings === 2 && s.target !== null && sc.runs >= s.target);
  if (!over) return { inningsEnded: false, matchEnded: false };

  if (s.innings === 1) {
    s.target = sc.runs + 1;
    s.innings = 2;
    s.batting = bowlingIdx(s);
    s.recent = [];
    return { inningsEnded: true, matchEnded: false };
  }
  s.done = true;
  const chaser = s.batting;
  const first = bowlingIdx(s);
  if (sc.runs >= (s.target ?? 0)) {
    const w = s.cfg.wickets - sc.wickets;
    s.result = { winner: chaser, text: `${s.names[chaser]} won by ${w} wicket${w === 1 ? '' : 's'}` };
  } else if (sc.runs === (s.target ?? 0) - 1) {
    s.result = { winner: -1, text: 'Match tied!' };
  } else {
    const diff = (s.target ?? 0) - 1 - sc.runs;
    s.result = { winner: first, text: `${s.names[first]} won by ${diff} run${diff === 1 ? '' : 's'}` };
  }
  return { inningsEnded: true, matchEnded: true };
}

export const oversText = (balls: number): string => `${Math.floor(balls / 6)}.${balls % 6}`;

// ----------------------------------------------------------------- network payloads

export interface CricketStartPayload {
  cfg: CricketConfig;
  players: { id: string; name: string }[]; // index 0 / 1 = team index
  state: CricketState;
}
export interface CricketPhasePayload {
  state: CricketState;
  bowler: 0 | 1;
  batter: 0 | 1;
  breakMs?: number; // innings break length, when this phase follows an innings change
}
export interface CricketBallPayload {
  d: Delivery;
  flightMs: number;
}
export interface CricketResultPayload {
  outcome: BallOutcome;
  d: Delivery;
  input: BatInput;
  state: CricketState;
  inningsEnded: boolean;
  matchEnded: boolean;
}
export interface CricketEndPayload {
  state: CricketState;
  reason?: string;
}

// ------------------------------------------------------------------------- engine

export interface EngineIO {
  phase(p: CricketPhasePayload): void;
  ball(p: CricketBallPayload): void;
  result(p: CricketResultPayload): void;
  end(p: CricketEndPayload): void;
  schedule(ms: number, fn: () => void): () => void; // returns cancel
  rnd(): number;
}

/**
 * Authoritative ball-by-ball flow. The server wraps it for online rooms; the browser wraps it
 * (with an AI player) for offline matches, so both modes behave identically.
 */
export class CricketEngine {
  state: CricketState;
  phase: 'idle' | 'bowl' | 'flight' | 'result' | 'over' = 'idle';
  private delivery: Delivery | null = null;
  private cancel: (() => void) | null = null;
  private afterInnings = false;

  constructor(cfg: CricketConfig, names: [string, string], firstBat: 0 | 1, private io: EngineIO) {
    this.state = newMatch(cfg, names, firstBat);
  }

  begin(introMs = 3200): void {
    this.cancel?.();
    this.cancel = this.io.schedule(introMs, () => this.nextBall());
  }

  private nextBall(): void {
    if (this.state.done) return;
    this.phase = 'bowl';
    this.delivery = null;
    const breakMs = this.afterInnings ? 4200 : undefined;
    this.afterInnings = false;
    this.io.phase({ state: this.state, bowler: bowlingIdx(this.state), batter: this.state.batting, breakMs });
    // idle bowler: auto-deliver so the match never stalls
    this.cancel?.();
    this.cancel = this.io.schedule((breakMs ?? 0) + 30000, () => {
      if (this.phase === 'bowl') this.bowl(bowlingIdx(this.state), { kind: 'medium', line: 'middle', acc: 0.5 });
    });
  }

  bowl(player: number, d: Delivery): void {
    if (this.phase !== 'bowl' || player !== bowlingIdx(this.state)) return;
    const kinds: DeliveryKind[] = ['fast', 'medium', 'spin', 'yorker'];
    const lines: Line[] = ['off', 'middle', 'leg'];
    if (!kinds.includes(d.kind) || !lines.includes(d.line)) return;
    this.delivery = { kind: d.kind, line: d.line, acc: clamp(Number(d.acc) || 0, 0, 1) };
    this.phase = 'flight';
    const flightMs = FLIGHT_MS[d.kind];
    this.io.ball({ d: this.delivery, flightMs });
    this.cancel?.();
    // batter gets the flight time plus a generous grace period; no reply = no shot
    this.cancel = this.io.schedule(flightMs + 3200, () => {
      if (this.phase === 'flight') this.resolve({ style: 'none', dir: 'straight', err: 0 });
    });
  }

  bat(player: number, input: BatInput): void {
    if (this.phase !== 'flight' || player !== this.state.batting) return;
    const styles: ShotStyle[] = ['none', 'defend', 'drive', 'loft'];
    const dirs: ShotDir[] = ['off', 'straight', 'leg'];
    if (!styles.includes(input.style) || !dirs.includes(input.dir)) return;
    this.resolve({ style: input.style, dir: input.dir, err: clamp(Number(input.err) || 0, -2000, 2000) });
  }

  private resolve(input: BatInput): void {
    if (!this.delivery) return;
    this.cancel?.();
    this.phase = 'result';
    const outcome = resolveBall(this.delivery, input, this.io.rnd);
    const r = applyOutcome(this.state, outcome);
    this.io.result({ outcome, d: this.delivery, input, state: this.state, inningsEnded: r.inningsEnded, matchEnded: r.matchEnded });
    if (r.matchEnded) {
      this.phase = 'over';
      this.cancel = this.io.schedule(4200, () => this.io.end({ state: this.state }));
    } else {
      this.afterInnings = r.inningsEnded;
      this.cancel = this.io.schedule(r.inningsEnded ? 3600 : 3000, () => this.nextBall());
    }
  }

  forfeit(player: number): void {
    if (this.state.done) return;
    this.cancel?.();
    const other = (1 - player) as 0 | 1;
    this.state.done = true;
    this.state.result = { winner: other, text: `${this.state.names[other]} won — opponent left` };
    this.phase = 'over';
    this.io.end({ state: this.state, reason: 'forfeit' });
  }

  dispose(): void {
    this.cancel?.();
  }
}
