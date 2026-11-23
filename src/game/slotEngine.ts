import {
  CardCellData,
  CascadeStep,
  getCascadeTierMultiplier,
  GRID_COLS,
  GRID_ROWS,
  MultiplierValue,
  SpinOutcome,
  SYMBOL_METADATA,
  SymbolId,
  WinningGroup,
} from './types';

let cardSeq = 1;
function nextCardId(): string {
  cardSeq += 1;
  return `card-${cardSeq}`;
}

const BASE_WEIGHTS: Array<{ symbol: SymbolId; weight: number }> = [
  { symbol: 'DIAMOND', weight: 22 },
  { symbol: 'CLUB', weight: 20 },
  { symbol: 'HEART', weight: 18 },
  { symbol: 'SPADE', weight: 16 },
  { symbol: 'QUEEN', weight: 11 },
  { symbol: 'KING', weight: 9 },
  { symbol: 'ACE', weight: 7 },
  { symbol: 'WILD', weight: 4.4 },
  { symbol: 'MULTIPLIER', weight: 4.6 },
  { symbol: 'BONUS', weight: 3.4 },
];

const FREE_SPIN_WEIGHTS: Array<{ symbol: SymbolId; weight: number }> = [
  { symbol: 'DIAMOND', weight: 20 },
  { symbol: 'CLUB', weight: 19 },
  { symbol: 'HEART', weight: 17 },
  { symbol: 'SPADE', weight: 15 },
  { symbol: 'QUEEN', weight: 11 },
  { symbol: 'KING', weight: 10 },
  { symbol: 'ACE', weight: 8 },
  { symbol: 'WILD', weight: 5.5 },
  { symbol: 'MULTIPLIER', weight: 7.2 },
  { symbol: 'BONUS', weight: 2.8 },
];

const MULTIPLIER_WEIGHTS: Array<{ value: MultiplierValue; weight: number }> = [
  { value: 2, weight: 52 },
  { value: 3, weight: 26 },
  { value: 5, weight: 14 },
  { value: 10, weight: 6 },
  { value: 25, weight: 2 },
];

const REGULAR_SYMBOLS: SymbolId[] = [
  'DIAMOND',
  'CLUB',
  'HEART',
  'SPADE',
  'QUEEN',
  'KING',
  'ACE',
];

function pickWeighted<T extends { weight: number }>(items: T[]): T {
  let total = 0;
  for (let i = 0; i < items.length; i += 1) {
    total += items[i].weight;
  }
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i += 1) {
    r -= items[i].weight;
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

function rollCard(
  col: number,
  row: number,
  isFreeSpin: boolean,
  allowBonus = true,
): CardCellData {
  const weights = isFreeSpin ? FREE_SPIN_WEIGHTS : BASE_WEIGHTS;
  let picked = pickWeighted(weights).symbol;
  if (!allowBonus && picked === 'BONUS') {
    picked = 'HEART';
  }
  const cell: CardCellData = {
    id: nextCardId(),
    col,
    row,
    symbol: picked,
  };
  if (picked === 'MULTIPLIER') {
    cell.multiplier = pickWeighted(MULTIPLIER_WEIGHTS).value;
  }
  return cell;
}

export function createShowcaseGrid(): CardCellData[][] {
  const preset: Array<Array<{ symbol: SymbolId; multiplier?: MultiplierValue }>> = [
    [{ symbol: 'KING' }, { symbol: 'DIAMOND' }, { symbol: 'ACE' }],
    [
      { symbol: 'ACE' },
      { symbol: 'MULTIPLIER', multiplier: 5 },
      { symbol: 'HEART' },
    ],
    [{ symbol: 'QUEEN' }, { symbol: 'WILD' }, { symbol: 'SPADE' }],
    [
      { symbol: 'MULTIPLIER', multiplier: 3 },
      { symbol: 'ACE' },
      { symbol: 'CLUB' },
    ],
    [{ symbol: 'BONUS' }, { symbol: 'KING' }, { symbol: 'ACE' }],
  ];

  const grid: CardCellData[][] = [];
  for (let col = 0; col < GRID_COLS; col += 1) {
    const column: CardCellData[] = [];
    for (let row = 0; row < GRID_ROWS; row += 1) {
      const spec = preset[col][row];
      column.push({
        id: nextCardId(),
        col,
        row,
        symbol: spec.symbol,
        multiplier: spec.multiplier,
      });
    }
    grid.push(column);
  }
  return grid;
}

function cloneGrid(grid: CardCellData[][]): CardCellData[][] {
  return grid.map((col) => col.map((cell) => ({ ...cell })));
}

function getPayoutMultiplier(symbol: SymbolId, count: number): number {
  const meta = SYMBOL_METADATA[symbol];
  if (!meta || meta.payouts.length === 0) return 0;
  let best = 0;
  for (const tier of meta.payouts) {
    if (count >= tier.count && tier.mult > best) {
      best = tier.mult;
    }
  }
  return best;
}

function evaluateGridWins(grid: CardCellData[][], bet: number): WinningGroup[] {
  const positionsBySymbol = new Map<
    SymbolId,
    Array<{ col: number; row: number }>
  >();
  const wildPositions: Array<{ col: number; row: number }> = [];

  for (let col = 0; col < GRID_COLS; col += 1) {
    for (let row = 0; row < GRID_ROWS; row += 1) {
      const cell = grid[col][row];
      if (cell.symbol === 'WILD') {
        wildPositions.push({ col, row });
      } else if (REGULAR_SYMBOLS.includes(cell.symbol)) {
        const list = positionsBySymbol.get(cell.symbol) ?? [];
        list.push({ col, row });
        positionsBySymbol.set(cell.symbol, list);
      }
    }
  }

  const groups: WinningGroup[] = [];
  for (const symbol of REGULAR_SYMBOLS) {
    const basePositions = positionsBySymbol.get(symbol) ?? [];
    const effectiveCount = basePositions.length + wildPositions.length;
    const minMatch = SYMBOL_METADATA[symbol].minMatch;
    if (basePositions.length >= 2 && effectiveCount >= minMatch) {
      const payoutMultiplier = getPayoutMultiplier(symbol, effectiveCount);
      if (payoutMultiplier > 0) {
        const payoutAmount = Math.round(bet * payoutMultiplier * 100) / 100;
        groups.push({
          symbol,
          count: effectiveCount,
          payoutMultiplier,
          payoutAmount,
          positions: [...basePositions, ...wildPositions],
        });
      }
    }
  }

  return groups;
}

export function resolveSpinOutcome(
  bet: number,
  isFreeSpin: boolean,
  persistentFreeSpinMultiplier: number,
): SpinOutcome {
  let currentGrid: CardCellData[][] = [];
  for (let col = 0; col < GRID_COLS; col += 1) {
    const column: CardCellData[] = [];
    let colHasBonus = false;
    for (let row = 0; row < GRID_ROWS; row += 1) {
      const cell = rollCard(col, row, isFreeSpin, !colHasBonus);
      if (cell.symbol === 'BONUS') colHasBonus = true;
      column.push(cell);
    }
    currentGrid.push(column);
  }

  const initialGrid = cloneGrid(currentGrid);
  const cascades: CascadeStep[] = [];
  let cascadeSubtotalWin = 0;
  let peakTierMultiplier = 1;
  let stepIndex = 0;

  while (stepIndex < 8) {
    const winningGroups = evaluateGridWins(currentGrid, bet);
    if (winningGroups.length === 0) break;

    const gridBefore = cloneGrid(currentGrid);
    const removedSet = new Set<string>();
    let rawStepWin = 0;
    for (const group of winningGroups) {
      rawStepWin += group.payoutAmount;
      for (const pos of group.positions) {
        removedSet.add(`${pos.col}:${pos.row}`);
      }
    }
    rawStepWin = Math.round(rawStepWin * 100) / 100;

    // Apply the grid-header multiplier tier (2x, 3x, 4x, 6x, 10x) for this cascade step
    const tierMultiplier = getCascadeTierMultiplier(stepIndex);
    peakTierMultiplier = Math.max(peakTierMultiplier, tierMultiplier);
    const stepWin = Math.round(rawStepWin * tierMultiplier * 100) / 100;
    cascadeSubtotalWin = Math.round((cascadeSubtotalWin + stepWin) * 100) / 100;

    const removedPositions: Array<{ col: number; row: number }> = [];
    const drops: CascadeStep['drops'] = [];
    const newCards: CascadeStep['newCards'] = [];
    const nextGrid: CardCellData[][] = [];

    for (let col = 0; col < GRID_COLS; col += 1) {
      const survivors: Array<{ fromRow: number; cell: CardCellData }> = [];
      let colHasBonus = false;
      for (let row = 0; row < GRID_ROWS; row += 1) {
        const key = `${col}:${row}`;
        if (removedSet.has(key)) {
          removedPositions.push({ col, row });
        } else {
          const cell = currentGrid[col][row];
          if (cell.symbol === 'BONUS') colHasBonus = true;
          survivors.push({ fromRow: row, cell });
        }
      }

      const missingCount = GRID_ROWS - survivors.length;
      const newCol: CardCellData[] = new Array(GRID_ROWS);

      for (let r = 0; r < missingCount; r += 1) {
        const fresh = rollCard(col, r, isFreeSpin, !colHasBonus);
        if (fresh.symbol === 'BONUS') colHasBonus = true;
        newCol[r] = fresh;
        newCards.push({ col, row: r, cell: { ...fresh } });
      }

      for (let i = 0; i < survivors.length; i += 1) {
        const targetRow = missingCount + i;
        const { fromRow, cell } = survivors[i];
        const movedCell: CardCellData = { ...cell, col, row: targetRow };
        newCol[targetRow] = movedCell;
        if (fromRow !== targetRow) {
          drops.push({
            fromCol: col,
            fromRow,
            toCol: col,
            toRow: targetRow,
            cell: { ...movedCell },
          });
        }
      }

      nextGrid.push(newCol);
    }

    currentGrid = nextGrid;
    cascades.push({
      stepIndex,
      tierMultiplier,
      gridBefore,
      winningGroups,
      rawStepWin,
      stepWin,
      removedPositions,
      drops,
      newCards,
      gridAfter: cloneGrid(currentGrid),
    });
    stepIndex += 1;
  }

  // Gather foil multipliers & bonus cards on the settled board
  const boardMultipliers: SpinOutcome['boardMultipliers'] = [];
  let boardMultiplierSum = 0;
  let bonusCount = 0;

  for (let col = 0; col < GRID_COLS; col += 1) {
    for (let row = 0; row < GRID_ROWS; row += 1) {
      const cell = currentGrid[col][row];
      if (cell.symbol === 'MULTIPLIER' && cell.multiplier) {
        boardMultipliers.push({ col, row, value: cell.multiplier });
        boardMultiplierSum += cell.multiplier;
      } else if (cell.symbol === 'BONUS') {
        bonusCount += 1;
      }
    }
  }

  let extraMultiplierFactor = 1;
  if (cascadeSubtotalWin > 0) {
    if (isFreeSpin) {
      extraMultiplierFactor = Math.max(
        1,
        persistentFreeSpinMultiplier + boardMultiplierSum,
      );
    } else if (boardMultiplierSum > 0) {
      extraMultiplierFactor = boardMultiplierSum;
    }
  }

  const totalWin =
    Math.round(cascadeSubtotalWin * extraMultiplierFactor * 100) / 100;

  let awardedFreeSpins = 0;
  if (bonusCount >= 3) {
    awardedFreeSpins = isFreeSpin
      ? 4 + (bonusCount - 3) * 2
      : 8 + (bonusCount - 3) * 2;
  }

  return {
    initialGrid,
    cascades,
    finalGrid: currentGrid,
    peakTierMultiplier,
    cascadeSubtotalWin,
    boardMultipliers,
    boardMultiplierSum,
    extraMultiplierFactor,
    totalWin,
    bonusCount,
    awardedFreeSpins,
  };
}
