import { DEFAULT_APPEARANCE } from '../data/palettes';
import type { Appearance, GameModeId, MapId } from '../../shared/protocol';

export type TouchMode = 'auto' | 'on' | 'off';
export type Difficulty = 'easy' | 'normal' | 'hard';

export interface Settings {
  sfx: number; // 0..1
  shake: boolean;
  fps: boolean;
  dmgNumbers: boolean;
  particles: 'low' | 'high';
  touch: TouchMode;
  touchScale: number;
  touchOpacity: number;
  autoFire: boolean; // aim stick fires when pushed to the edge
  autoFullscreen: boolean; // first tap on a touch device enters fullscreen
  serverUrl: string; // empty = same origin (dev proxy)
}

export interface Stats {
  kills: number;
  deaths: number;
  matches: number;
  wins: number;
  headshots: number;
  xp: number;
  bestKills: number;
}

export interface PracticeConfig {
  mode: GameModeId;
  mapId: MapId;
  bots: number;
  difficulty: Difficulty;
}

export interface SaveData {
  version: 1;
  name: string;
  appearance: Appearance;
  primary: string;
  secondary: string;
  settings: Settings;
  stats: Stats;
  practice: PracticeConfig;
  seenIntro: boolean;
}

const KEY = 'jetfront.save.v1';

function defaults(): SaveData {
  return {
    version: 1,
    name: 'Operator',
    appearance: { ...DEFAULT_APPEARANCE },
    primary: 'assault',
    secondary: 'pistol',
    settings: {
      sfx: 0.7,
      shake: true,
      fps: false,
      dmgNumbers: true,
      particles: typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches ? 'low' : 'high',
      touch: 'auto',
      touchScale: 1,
      touchOpacity: 0.7,
      autoFire: true,
      autoFullscreen: true,
      serverUrl: '',
    },
    stats: { kills: 0, deaths: 0, matches: 0, wins: 0, headshots: 0, xp: 0, bestKills: 0 },
    practice: { mode: 'deathmatch', mapId: 'military', bots: 4, difficulty: 'normal' },
    seenIntro: false,
  };
}

function merge<T extends object>(base: T, extra: unknown): T {
  if (!extra || typeof extra !== 'object') return base;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(extra as Record<string, unknown>)) {
    const cur = (base as Record<string, unknown>)[k];
    if (cur && typeof cur === 'object' && !Array.isArray(cur)) out[k] = merge(cur as object, v);
    else if (k in base && typeof v === typeof cur) out[k] = v;
  }
  return out as T;
}

class Store {
  data: SaveData = defaults();

  constructor() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) this.data = merge(defaults(), JSON.parse(raw));
    } catch {
      /* storage unavailable or corrupt: fall back to defaults */
    }
  }

  save(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      /* ignore quota / privacy-mode errors */
    }
  }

  reset(): void {
    this.data = defaults();
    this.save();
  }

  get settings(): Settings {
    return this.data.settings;
  }

  /** Level from total XP: 100 xp for level 2, then growing. */
  levelInfo(): { level: number; into: number; need: number } {
    let level = 1;
    let xp = this.data.stats.xp;
    let need = 100;
    while (xp >= need) {
      xp -= need;
      level++;
      need = 100 + (level - 1) * 40;
    }
    return { level, into: xp, need };
  }

  touchEnabled(): boolean {
    const m = this.data.settings.touch;
    if (m === 'on') return true;
    if (m === 'off') return false;
    return typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches === true;
  }
}

export const store = new Store();
