// Greedy bento-grid packer used by the Discover editor's "Tidy grid"
// action. Pure functions, no React, no DB — easy to test in isolation.

import type { StoryBlock, StoryBlockSize } from "@/lib/types/productStory";

export const SIZE_FOOTPRINT: Record<
  StoryBlockSize,
  { w: number; h: number }
> = {
  "1x1": { w: 1, h: 1 },
  "2x1": { w: 2, h: 1 },
  "1x2": { w: 1, h: 2 },
  "2x2": { w: 2, h: 2 },
  "4x1": { w: 4, h: 1 },
};

export const DEFAULT_COLS = 4;

export type Placement = {
  index: number; // index into the input order
  row: number;
  col: number;
  w: number;
  h: number;
};

export type PackResult = {
  placements: Placement[];
  totalRows: number;
  totalCells: number;
  emptyCells: number;
  /**
   * True when any block can't fit (e.g. width > columns). Today every
   * size fits in a 4-col grid; flag exists so v4 can warn cleanly.
   */
  overflow: boolean;
};

/**
 * Pack blocks left-to-right top-to-bottom using a fixed column count.
 * Returns placement metadata and empty-cell count. Stable: same input
 * always produces the same output.
 */
export function packBlocks(
  sizes: StoryBlockSize[],
  cols: number = DEFAULT_COLS
): PackResult {
  const filled: boolean[][] = []; // filled[row][col]
  const ensureRow = (r: number) => {
    while (filled.length <= r) {
      const row = new Array(cols).fill(false);
      filled.push(row);
    }
  };
  const fits = (row: number, col: number, w: number, h: number): boolean => {
    if (col + w > cols) return false;
    for (let r = 0; r < h; r++) {
      ensureRow(row + r);
      for (let c = 0; c < w; c++) {
        if (filled[row + r][col + c]) return false;
      }
    }
    return true;
  };
  const place = (row: number, col: number, w: number, h: number) => {
    for (let r = 0; r < h; r++) {
      ensureRow(row + r);
      for (let c = 0; c < w; c++) {
        filled[row + r][col + c] = true;
      }
    }
  };

  const placements: Placement[] = [];
  let overflow = false;
  for (let i = 0; i < sizes.length; i++) {
    const fp = SIZE_FOOTPRINT[sizes[i]];
    if (!fp || fp.w > cols) {
      overflow = true;
      continue;
    }
    let placed = false;
    let row = 0;
    while (!placed) {
      for (let col = 0; col + fp.w <= cols; col++) {
        if (fits(row, col, fp.w, fp.h)) {
          place(row, col, fp.w, fp.h);
          placements.push({ index: i, row, col, w: fp.w, h: fp.h });
          placed = true;
          break;
        }
      }
      if (!placed) row++;
      if (row > sizes.length * 4) {
        // Safety net — shouldn't happen with the current size set.
        overflow = true;
        break;
      }
    }
  }

  const totalRows = filled.length;
  const totalCells = totalRows * cols;
  let used = 0;
  for (const r of filled) for (const c of r) if (c) used++;
  return {
    placements,
    totalRows,
    totalCells,
    emptyCells: totalCells - used,
    overflow,
  };
}

/**
 * Try a few candidate orderings and return the one that minimises
 * empty cells, breaking ties by total rows. Heuristic — not optimal,
 * but good enough for the v3 "Tidy grid" experience.
 */
export function tidyOrder<T extends StoryBlock>(
  blocks: T[],
  cols: number = DEFAULT_COLS
): {
  ordered: T[];
  before: PackResult;
  after: PackResult;
  changed: boolean;
} {
  const sizes = blocks.map((b) => b.size);
  const before = packBlocks(sizes, cols);

  const candidates: T[][] = [];
  // Original order (no-op).
  candidates.push(blocks.slice());
  // Largest-area first (stable on ties: original index).
  candidates.push(
    blocks
      .map((b, i) => ({ b, i }))
      .sort((a, z) => {
        const A = SIZE_FOOTPRINT[a.b.size];
        const Z = SIZE_FOOTPRINT[z.b.size];
        const ar = (Z.w * Z.h) - (A.w * A.h);
        return ar !== 0 ? ar : a.i - z.i;
      })
      .map((x) => x.b)
  );
  // Tallest-first.
  candidates.push(
    blocks
      .map((b, i) => ({ b, i }))
      .sort((a, z) => {
        const ah = SIZE_FOOTPRINT[a.b.size].h;
        const zh = SIZE_FOOTPRINT[z.b.size].h;
        return zh !== ah ? zh - ah : a.i - z.i;
      })
      .map((x) => x.b)
  );
  // Widest-first.
  candidates.push(
    blocks
      .map((b, i) => ({ b, i }))
      .sort((a, z) => {
        const aw = SIZE_FOOTPRINT[a.b.size].w;
        const zw = SIZE_FOOTPRINT[z.b.size].w;
        return zw !== aw ? zw - aw : a.i - z.i;
      })
      .map((x) => x.b)
  );

  let bestOrder = candidates[0];
  let bestResult = before;
  for (const cand of candidates) {
    const result = packBlocks(cand.map((b) => b.size), cols);
    const better =
      result.emptyCells < bestResult.emptyCells ||
      (result.emptyCells === bestResult.emptyCells &&
        result.totalRows < bestResult.totalRows);
    if (better) {
      bestOrder = cand;
      bestResult = result;
    }
  }

  // Compare by id sequence to detect change.
  const changed = bestOrder.some((b, i) => b.id !== blocks[i].id);
  return { ordered: bestOrder, before, after: bestResult, changed };
}
