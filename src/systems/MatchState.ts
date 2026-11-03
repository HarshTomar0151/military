import { MATCH_TIME_MS, SCORE_LIMIT, type GameModeId } from '../../shared/protocol';

export interface PlayerStat {
  id: string;
  name: string;
  team: number;
  kills: number;
  deaths: number;
  headshots: number;
  streak: number;
  bestStreak: number;
  isLocal: boolean;
}

/** Scores / timer for the current match. Passive store: offline play and server events both feed it. */
export class MatchState {
  readonly stats = new Map<string, PlayerStat>();
  teamScores: [number, number] = [0, 0];
  readonly scoreLimit: number;
  endTime = 0; // game clock ms
  private readonly duration: number;
  ended = false;
  winnerTeam = -1;

  constructor(
    readonly mode: GameModeId,
    readonly teamPlay: boolean,
    now: number,
    durationMs = MATCH_TIME_MS,
    scoreLimit?: number,
  ) {
    this.scoreLimit = scoreLimit ?? SCORE_LIMIT[mode];
    this.duration = durationMs;
    this.endTime = now + durationMs;
  }

  addPlayer(id: string, name: string, team: number, isLocal: boolean): void {
    this.stats.set(id, { id, name, team, kills: 0, deaths: 0, headshots: 0, streak: 0, bestStreak: 0, isLocal });
  }

  removePlayer(id: string): void {
    this.stats.delete(id);
  }

  remaining(now: number): number {
    return Math.max(0, Math.min(this.duration, this.endTime - now));
  }

  registerKill(killerId: string, victimId: string, headshot: boolean): void {
    const v = this.stats.get(victimId);
    const k = this.stats.get(killerId);
    if (v) {
      v.deaths++;
      v.streak = 0;
    }
    if (killerId === victimId) {
      if (this.teamPlay && v && v.team >= 0) this.teamScores[v.team] = Math.max(0, this.teamScores[v.team] - 1);
      return;
    }
    if (k) {
      k.kills++;
      k.streak++;
      k.bestStreak = Math.max(k.bestStreak, k.streak);
      if (headshot) k.headshots++;
      if (this.teamPlay && k.team >= 0) this.teamScores[k.team]++;
    }
  }

  /** Overwrite with authoritative server numbers. */
  syncFromServer(scores: { id: string; kills: number; deaths: number }[], teams: [number, number]): void {
    for (const s of scores) {
      const st = this.stats.get(s.id);
      if (st) {
        st.kills = s.kills;
        st.deaths = s.deaths;
      }
    }
    this.teamScores = teams;
  }

  leaderboard(): PlayerStat[] {
    return [...this.stats.values()].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
  }

  topScore(): number {
    return this.teamPlay ? Math.max(...this.teamScores) : Math.max(0, ...[...this.stats.values()].map((s) => s.kills));
  }

  /** Offline end condition. */
  checkEnd(now: number): boolean {
    if (this.ended) return true;
    if (this.topScore() >= this.scoreLimit || now >= this.endTime) {
      this.ended = true;
      if (this.teamPlay) {
        const [a, b] = this.teamScores;
        this.winnerTeam = a === b ? -1 : a > b ? 0 : 1;
      }
    }
    return this.ended;
  }
}
