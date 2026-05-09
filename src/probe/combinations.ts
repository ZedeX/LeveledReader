import { ICON_COUNT, ICON_NAMES } from './types';

export function generateCombinations(length: 1 | 2): number[][] {
  const results: number[][] = [];

  if (length === 1) {
    for (let i = 1; i <= ICON_COUNT; i++) {
      results.push([i]);
    }
  } else if (length === 2) {
    for (let i = 1; i <= ICON_COUNT; i++) {
      for (let j = 1; j <= ICON_COUNT; j++) {
        if (j !== i) {
          results.push([i, j]);
        }
      }
    }
  }

  return results;
}

export function combinationToNames(combo: number[]): string[] {
  return combo.map(i => ICON_NAMES[i - 1] || `icon-${i}`);
}

export function getCombinationCount(length: 1 | 2): number {
  if (length === 1) return ICON_COUNT;
  return ICON_COUNT * (ICON_COUNT - 1);
}
