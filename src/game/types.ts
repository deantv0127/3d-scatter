export type SymbolId =
  | 'DIAMOND'
  | 'CLUB'
  | 'HEART'
  | 'SPADE'
  | 'QUEEN'
  | 'KING'
  | 'ACE'
  | 'WILD'
  | 'BONUS';

export const CASCADE_MULTIPLIER_TIERS = [2, 3, 4, 6, 10] as const;
export type CascadeTierMultiplier = (typeof CASCADE_MULTIPLIER_TIERS)[number];

export function getCascadeTierMultiplier(
  cascadeIndex: number,
): CascadeTierMultiplier {
  const clamped = Math.max(
    0,
    Math.min(CASCADE_MULTIPLIER_TIERS.length - 1, cascadeIndex),
  );
  return CASCADE_MULTIPLIER_TIERS[clamped];
}

export interface CardCellData {
  id: string;
  col: number;
  row: number;
  symbol: SymbolId;
}

export interface WinningGroup {
  symbol: SymbolId;
  count: number;
  payoutMultiplier: number;
  payoutAmount: number;
  positions: Array<{ col: number; row: number }>;
}

export interface CascadeStep {
  stepIndex: number;
  tierMultiplier: CascadeTierMultiplier;
  gridBefore: CardCellData[][];
  winningGroups: WinningGroup[];
  rawStepWin: number;
  stepWin: number;
  removedPositions: Array<{ col: number; row: number }>;
  drops: Array<{
    fromCol: number;
    fromRow: number;
    toCol: number;
    toRow: number;
    cell: CardCellData;
  }>;
  newCards: Array<{
    col: number;
    row: number;
    cell: CardCellData;
  }>;
  gridAfter: CardCellData[][];
}

export interface SpinOutcome {
  initialGrid: CardCellData[][];
  cascades: CascadeStep[];
  finalGrid: CardCellData[][];
  peakTierMultiplier: number;
  totalWin: number;
  bonusCount: number;
  awardedFreeSpins: number;
}

export interface SymbolMeta {
  id: SymbolId;
  name: string;
  shortLabel: string;
  tier: 'suit' | 'royal' | 'special';
  minMatch: number;
  accentHex: string;
  payouts: Array<{ count: number; mult: number }>;
  description: string;
}

export const GRID_COLS = 5;
export const GRID_ROWS = 3;

export const BET_STEPS = [1, 2, 5, 10, 20, 50, 100] as const;

export const SYMBOL_METADATA: Record<SymbolId, SymbolMeta> = {
  DIAMOND: {
    id: 'DIAMOND',
    name: 'Sapphire Diamond',
    shortLabel: '♦',
    tier: 'suit',
    minMatch: 6,
    accentHex: '#38bdf8',
    payouts: [
      { count: 6, mult: 0.21 },
      { count: 7, mult: 0.44 },
      { count: 8, mult: 0.85 },
      { count: 9, mult: 1.75 },
    ],
    description:
      'Match 6 or more anywhere on the table to trigger a scatter cascade.',
  },
  CLUB: {
    id: 'CLUB',
    name: 'Emerald Club',
    shortLabel: '♣',
    tier: 'suit',
    minMatch: 6,
    accentHex: '#34d399',
    payouts: [
      { count: 6, mult: 0.27 },
      { count: 7, mult: 0.54 },
      { count: 8, mult: 1.1 },
      { count: 9, mult: 2.2 },
    ],
    description:
      'Match 6 or more anywhere on the table to trigger a scatter cascade.',
  },
  HEART: {
    id: 'HEART',
    name: 'Crimson Heart',
    shortLabel: '♥',
    tier: 'suit',
    minMatch: 6,
    accentHex: '#fb7185',
    payouts: [
      { count: 6, mult: 0.35 },
      { count: 7, mult: 0.7 },
      { count: 8, mult: 1.4 },
      { count: 9, mult: 2.8 },
    ],
    description:
      'Match 6 or more anywhere on the table to trigger a scatter cascade.',
  },
  SPADE: {
    id: 'SPADE',
    name: 'Obsidian Spade',
    shortLabel: '♠',
    tier: 'suit',
    minMatch: 6,
    accentHex: '#cbd5e1',
    payouts: [
      { count: 6, mult: 0.45 },
      { count: 7, mult: 0.9 },
      { count: 8, mult: 1.8 },
      { count: 9, mult: 3.6 },
    ],
    description:
      'Match 6 or more anywhere on the table to trigger a scatter cascade.',
  },
  QUEEN: {
    id: 'QUEEN',
    name: 'Queen of Arcana',
    shortLabel: 'Q',
    tier: 'royal',
    minMatch: 5,
    accentHex: '#c084fc',
    payouts: [
      { count: 5, mult: 0.64 },
      { count: 6, mult: 1.28 },
      { count: 7, mult: 2.55 },
      { count: 8, mult: 5.1 },
    ],
    description:
      'Royal card. Match 5 or more anywhere for high scatter payouts.',
  },
  KING: {
    id: 'KING',
    name: 'King of Vaults',
    shortLabel: 'K',
    tier: 'royal',
    minMatch: 5,
    accentHex: '#fbbf24',
    payouts: [
      { count: 5, mult: 0.9 },
      { count: 6, mult: 1.8 },
      { count: 7, mult: 3.6 },
      { count: 8, mult: 7.2 },
    ],
    description:
      'Royal card. Match 5 or more anywhere for sovereign payouts.',
  },
  ACE: {
    id: 'ACE',
    name: 'Sovereign Ace',
    shortLabel: 'A',
    tier: 'royal',
    minMatch: 4,
    accentHex: '#f59e0b',
    payouts: [
      { count: 4, mult: 1.12 },
      { count: 5, mult: 2.25 },
      { count: 6, mult: 4.5 },
      { count: 7, mult: 9.2 },
    ],
    description:
      'Top royal card. Pays with just 4 or more anywhere on the board.',
  },
  WILD: {
    id: 'WILD',
    name: 'Wild Joker',
    shortLabel: '★',
    tier: 'special',
    minMatch: 1,
    accentHex: '#2dd4bf',
    payouts: [],
    description:
      'Substitutes for all suit and royal cards simultaneously in scatter wins.',
  },
  BONUS: {
    id: 'BONUS',
    name: 'Arcana Scatter',
    shortLabel: '✦',
    tier: 'special',
    minMatch: 3,
    accentHex: '#f472b6',
    payouts: [],
    description:
      'Land 3 or more anywhere on the board to trigger 10 Free Spins.',
  },
};
