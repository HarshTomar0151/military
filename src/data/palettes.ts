import type { Appearance } from '../../shared/protocol';

export const ARMOR_COLORS = [0x3a5f2e, 0x2f4f7f, 0x6b2f2f, 0x7a6a2a, 0x4a3a6f, 0x2f6f6a, 0x555a60, 0x8a4a1f];
export const HELMET_COLORS = [0x2a3a22, 0x1f2f4f, 0x3a1f1f, 0x4a4220, 0x2a2244, 0x1f4440, 0x2b2e33, 0x5a2f12];
export const SKIN_COLORS = [0xf0c8a0, 0xd9a577, 0xb07a52, 0x7a4e32, 0x4d2f1e];
export const VISOR_COLORS = [0x39ff14, 0x35d6ff, 0xff3b3b, 0xffb020, 0xd04bff, 0xffffff];

export const ARMOR_NAMES = ['FOREST', 'NAVY', 'CRIMSON', 'DESERT', 'VIOLET', 'TEAL', 'STEEL', 'RUST'];
export const VISOR_NAMES = ['NEON', 'ICE', 'RED', 'AMBER', 'PLASMA', 'WHITE'];

export const DEFAULT_APPEARANCE: Appearance = { armor: 0, helmet: 0, skin: 1, visor: 0 };

export const TEAM_ARMOR = [0x2d6fb0, 0xb03a2d];
export const TEAM_HELMET = [0x17385a, 0x5a1d17];
export const TEAM_VISOR = [0x35d6ff, 0xff7a3c];
