// Ludo rules, board geometry and the turn engine. Shared by the browser (vs computer / hot-seat) and the Node server (online rooms).
// Deterministic given the injected RNG.

export type LudoColor = 0 | 1 | 2 | 3; // red, green, yellow, blue (clockwise)
export const LUDO_COLORS = [0xe53935, 0x43a047, 0xfdd835, 0x1e88e5];
export const LUDO_COLOR_NAMES = ['RED', 'GREEN', 'YELLOW', 'BLUE'];

/** 52 cells of the outer track on a 15x15 grid, clockwise, starting on Red's start square. */
export const RING: [number, number][] = [
  [1, 6], [2, 6], [3, 6], [4, 6], [5, 6],
  [6, 5], [6, 4], [6, 3], [6, 2], [6, 1], [6, 0],
  [7, 0], [8, 0],
  [8, 1], [8, 2], [8, 3], [8, 4], [8, 5],
  [9, 6], [10, 6], [11, 6], [12, 6], [13, 6], [14, 6],
  [14, 7], [14, 8],
  [13, 8], [12, 8], [11, 8], [10, 8], [9, 8],
  [8, 9], [8, 10], [8, 11], [8, 12], [8, 13], [8, 14],
  [7, 14], [6, 14],
  [6, 13], [6, 12], [6, 11], [6, 10], [6, 9],
  [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8],
  [0, 7], [0, 6],
];
export const START_IDX = [0, 13, 26, 39];
/** Start squares and the star squares 8 steps after them: tokens cannot be captured here. */
export const SAFE_CELLS = new Set([0, 13, 26, 39, 8, 21, 34, 47]);

/** Coloured home column cells (5 per colour) leading to the centre. */
export const HOME_COLS: [number, number][][] = [
  [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7]],
  [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5]],
  [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7]],
  [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9]],
];
/** Token resting spots inside each yard (grid-unit coordinates). */
export const YARD_SLOTS: [number, number][][] = [
  [[2, 2], [4, 2], [2, 4], [4, 4]],
  [[10, 2], [12, 2], [10, 4], [12, 4]],
  [[10, 10], [12, 10], [10, 12], [12, 12]],
  [[2, 10], [4, 10], [2, 12], [4, 12]],
];

export const HOME = 56; // relative progress of a finished token
// relative progress: -1 yard | 0..50 outer track | 51..55 home column | 56 home

export interface LudoSeat {
  color: LudoColor;
  name: string;
  bot: boolean;
}

export interface LudoState {
  seats: LudoSeat[];
  tokens: number[][]; // [seat][token] relative progress
  turn: number;
  phase: 'roll' | 'move' | 'over';
  dice: number;
  legal: number[];
  sixes: number;
  winner: number;
}

export type LudoEvent =
  | { type: 'turn'; state: LudoState }
  | { type: 'roll'; seat: number; dice: number; legal: number[]; state: LudoState }
  | { type: 'noMove'; seat: number; dice: number; state: LudoState }
  | { type: 'forfeit'; seat: number; state: LudoState }
  | { type: 'move'; seat: number; token: number; from: number; to: number; captured: { seat: number; token: number }[]; extra: boolean; state: LudoState }
  | { type: 'over'; winner: number; state: LudoState };

export interface LudoStartPayload {
  seatCount: number;
  ids: string[]; // socket id per seat ('' = computer)
  state: LudoState;
}

export const LUDO_SEAT_OPTIONS = [2, 3, 4];

export function seatColors(n: number): LudoColor[] {
  if (n <= 2) return [0, 2];
  if (n === 3) return [0, 1, 2];
  return [0, 1, 2, 3];
}

export function newLudo(seats: LudoSeat[]): LudoState {
  return {
    seats,
    tokens: seats.map(() => [-1, -1, -1, -1]),
    turn: 0,
    phase: 'roll',
    dice: 0,
    legal: [],
    sixes: 0,
    winner: -1,
  };
}

export const absCell = (color: LudoColor, p: number): number => (START_IDX[color] + p) % 52;

export function legalMoves(s: LudoState, seat: number, dice: number): number[] {
  const out: number[] = [];
  s.tokens[seat].forEach((p, i) => {
    if (p === -1) {
      if (dice === 6) out.push(i);
    } else if (p + dice <= HOME) out.push(i);
  });
  return out;
}

/** Applies a move in place. */
export function applyMove(s: LudoState, seat: number, token: number, dice: number): { from: number; to: number; captured: { seat: number; token: number }[] } {
  const from = s.tokens[seat][token];
  const to = from === -1 ? 0 : from + dice;
  s.tokens[seat][token] = to;
  const captured: { seat: number; token: number }[] = [];
  if (to >= 0 && to <= 50) {
    const cell = absCell(s.seats[seat].color, to);
    if (!SAFE_CELLS.has(cell)) {
      s.seats.forEach((other, os) => {
        if (os === seat) return;
        s.tokens[os].forEach((p, ti) => {
          if (p >= 0 && p <= 50 && absCell(other.color, p) === cell) {
            s.tokens[os][ti] = -1;
            captured.push({ seat: os, token: ti });
          }
        });
      });
    }
  }
  return { from, to, captured };
}

const homeCount = (s: LudoState, seat: number): number => s.tokens[seat].filter((p) => p === HOME).length;
export const finished = (s: LudoState, seat: number): boolean => homeCount(s, seat) === 4;

/** Heuristic for computer players (and idle humans): finish > capture > leave yard > safe square > progress. */
export function botChoose(s: LudoState, seat: number, dice: number, legal: number[], rnd: () => number): number {
  let best = legal[0];
  let bestScore = -Infinity;
  for (const t of legal) {
    const p = s.tokens[seat][t];
    const to = p === -1 ? 0 : p + dice;
    let score = rnd() * 6;
    if (to === HOME) score += 100;
    if (to > 50 && to < HOME) score += 22; // inside the safe home column
    if (p === -1) score += 55;
    if (to <= 50) {
      const cell = absCell(s.seats[seat].color, to);
      if (SAFE_CELLS.has(cell)) score += 20;
      else {
        s.seats.forEach((o, os) => {
          if (os === seat) return;
          s.tokens[os].forEach((op) => {
            if (op >= 0 && op <= 50 && absCell(o.color, op) === cell) score += 80; // capture
          });
        });
        // avoid landing 1-6 squares in front of an opponent token
        s.seats.forEach((o, os) => {
          if (os === seat) return;
          s.tokens[os].forEach((op) => {
            if (op < 0 || op > 50) return;
            const d = (cell - absCell(o.color, op) + 52) % 52;
            if (d >= 1 && d <= 6) score -= 14;
          });
        });
      }
    }
    // rescue a token that is currently threatened
    if (p >= 0 && p <= 50) {
      const cur = absCell(s.seats[seat].color, p);
      if (!SAFE_CELLS.has(cur)) {
        s.seats.forEach((o, os) => {
          if (os === seat) return;
          s.tokens[os].forEach((op) => {
            if (op < 0 || op > 50) return;
            const d = (cur - absCell(o.color, op) + 52) % 52;
            if (d >= 1 && d <= 6) score += 12;
          });
        });
      }
    }
    score += Math.max(0, p) * 0.3;
    if (score > bestScore) {
      bestScore = score;
      best = t;
    }
  }
  return best;
}

// ----------------------------------------------------------------------- engine

export interface LudoIO {
  event(e: LudoEvent): void;
  schedule(ms: number, fn: () => void): () => void;
  rnd(): number;
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/**
 * Authoritative turn flow. The server wraps it for online rooms; the browser wraps it for
 * offline games. Computer-controlled seats are driven by the engine itself.
 */
export class LudoEngine {
  state: LudoState;
  private cancel: (() => void) | null = null;

  constructor(seats: LudoSeat[], private io: LudoIO) {
    this.state = newLudo(seats);
  }

  begin(introMs = 1200): void {
    this.cancel?.();
    this.cancel = this.io.schedule(introMs, () => this.startTurn());
  }

  /** A human left mid-game: the computer takes over their seat. */
  setBot(seat: number): void {
    if (!this.state.seats[seat] || this.state.seats[seat].bot) return;
    this.state.seats[seat].bot = true;
    if (this.state.turn === seat && this.state.phase !== 'over') {
      if (this.state.phase === 'roll') this.cancel = this.io.schedule(900, () => this.roll(seat));
      else this.cancel = this.io.schedule(900, () => this.autoMove(seat));
    }
  }

  private startTurn(): void {
    const s = this.state;
    if (s.phase === 'over') return;
    s.phase = 'roll';
    s.dice = 0;
    s.legal = [];
    this.io.event({ type: 'turn', state: clone(s) });
    const seat = s.turn;
    this.cancel?.();
    if (s.seats[seat].bot) this.cancel = this.io.schedule(800 + this.io.rnd() * 600, () => this.roll(seat));
    else this.cancel = this.io.schedule(25000, () => this.roll(seat)); // idle human: roll for them
  }

  roll(seat: number): void {
    const s = this.state;
    if (s.phase !== 'roll' || seat !== s.turn) return;
    this.cancel?.();
    const dice = 1 + Math.floor(this.io.rnd() * 6);
    s.dice = dice;
    s.sixes = dice === 6 ? s.sixes + 1 : 0;
    if (s.sixes >= 3) {
      s.sixes = 0;
      s.legal = [];
      this.io.event({ type: 'forfeit', seat, state: clone(s) });
      this.cancel = this.io.schedule(1800, () => this.nextTurn());
      return;
    }
    const legal = legalMoves(s, seat, dice);
    s.legal = legal;
    if (!legal.length) {
      this.io.event({ type: 'noMove', seat, dice, state: clone(s) });
      s.sixes = 0;
      this.cancel = this.io.schedule(1500, () => this.nextTurn());
      return;
    }
    s.phase = 'move';
    this.io.event({ type: 'roll', seat, dice, legal, state: clone(s) });
    if (s.seats[seat].bot) this.cancel = this.io.schedule(1000 + this.io.rnd() * 500, () => this.autoMove(seat));
    else if (legal.length === 1) this.cancel = this.io.schedule(750, () => this.move(seat, legal[0]));
    else this.cancel = this.io.schedule(22000, () => this.autoMove(seat));
  }

  private autoMove(seat: number): void {
    const s = this.state;
    if (s.phase !== 'move' || seat !== s.turn) return;
    this.move(seat, botChoose(s, seat, s.dice, s.legal, this.io.rnd));
  }

  move(seat: number, token: number): void {
    const s = this.state;
    if (s.phase !== 'move' || seat !== s.turn || !s.legal.includes(token)) return;
    this.cancel?.();
    const dice = s.dice;
    const { from, to, captured } = applyMove(s, seat, token, dice);
    const steps = from === -1 ? 1 : dice;
    const extra = dice === 6 || captured.length > 0 || to === HOME;
    const win = finished(s, seat);
    s.legal = [];
    s.phase = win ? 'over' : 'roll';
    if (win) s.winner = seat;
    this.io.event({ type: 'move', seat, token, from, to, captured, extra, state: clone(s) });
    const wait = steps * 150 + (captured.length ? 1000 : 600);
    if (win) {
      this.cancel = this.io.schedule(wait + 600, () => this.io.event({ type: 'over', winner: seat, state: clone(s) }));
      return;
    }
    this.cancel = this.io.schedule(wait, () => (extra ? this.startTurn() : this.nextTurn()));
  }

  private nextTurn(): void {
    const s = this.state;
    if (s.phase === 'over') return;
    s.sixes = 0;
    s.turn = (s.turn + 1) % s.seats.length;
    this.startTurn();
  }

  dispose(): void {
    this.cancel?.();
    this.cancel = null;
  }
}
