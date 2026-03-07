import { FALLBACK_FLOOR_COLOR } from "../constants";
import type { FloorPattern } from "../types";

const TILE = 16;

function shade(hex: string, amount: number): string {
  const raw = hex.startsWith("#") ? hex.slice(1) : hex;
  const full = raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw;
  const r = Number.parseInt(full.slice(0, 2), 16);
  const g = Number.parseInt(full.slice(2, 4), 16);
  const b = Number.parseInt(full.slice(4, 6), 16);
  const apply = (v: number): string => {
    const next = Math.max(0, Math.min(255, Math.round(v + amount)));
    return next.toString(16).padStart(2, "0");
  };
  return `#${apply(r)}${apply(g)}${apply(b)}`;
}

function makePattern(pixel: (x: number, y: number) => string): FloorPattern {
  return Array.from({ length: TILE }, (_, y) =>
    Array.from({ length: TILE }, (_, x) => pixel(x, y)),
  );
}

const plain = makePattern(() => FALLBACK_FLOOR_COLOR);

const checkerboardSubtle = makePattern((x, y) =>
  (x + y) % 2 === 0 ? shade(FALLBACK_FLOOR_COLOR, 5) : shade(FALLBACK_FLOOR_COLOR, -5),
);

const diagonalLines = makePattern((x, y) =>
  (x - y + TILE) % 4 === 0 ? shade(FALLBACK_FLOOR_COLOR, 9) : FALLBACK_FLOOR_COLOR,
);

const dots = makePattern((x, y) =>
  x % 4 === 1 && y % 4 === 1 ? shade(FALLBACK_FLOOR_COLOR, 12) : FALLBACK_FLOOR_COLOR,
);

const crossHatch = makePattern((x, y) => {
  const lineA = (x + y) % 5 === 0;
  const lineB = (x - y + TILE * 2) % 5 === 0;
  if (lineA || lineB) return shade(FALLBACK_FLOOR_COLOR, 7);
  return FALLBACK_FLOOR_COLOR;
});

const bricks = makePattern((x, y) => {
  const mortarX = x % 8 === 0;
  const mortarY = y % 4 === 0;
  const offsetMortar = y % 8 >= 4 && x % 8 === 4;
  if (mortarX || mortarY || offsetMortar) return shade(FALLBACK_FLOOR_COLOR, -9);
  return shade(FALLBACK_FLOOR_COLOR, 3);
});

const herringbone = makePattern((x, y) => {
  const blockX = Math.floor(x / 4);
  const blockY = Math.floor(y / 4);
  const parity = (blockX + blockY) % 2;
  const seam = parity === 0 ? x % 4 === 0 : y % 4 === 0;
  if (seam) return shade(FALLBACK_FLOOR_COLOR, -11);
  return parity === 0 ? shade(FALLBACK_FLOOR_COLOR, 6) : shade(FALLBACK_FLOOR_COLOR, -2);
});

export const FLOOR_PATTERNS: FloorPattern[] = [
  plain,
  checkerboardSubtle,
  diagonalLines,
  dots,
  crossHatch,
  bricks,
  herringbone,
];

export function getFloorPattern(index: number): FloorPattern {
  if (FLOOR_PATTERNS.length === 0) {
    return plain;
  }
  const normalized = ((index % FLOOR_PATTERNS.length) + FLOOR_PATTERNS.length) % FLOOR_PATTERNS.length;
  return FLOOR_PATTERNS[normalized];
}
