import { TILE_COLORS, WALL_E, WALL_N, WALL_S, WALL_W } from "../constants";
import type { OfficeLayout, SpriteFrame, WallBitmask } from "../types";

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

function hasWall(layout: OfficeLayout, x: number, y: number): boolean {
  return layout.tiles.some((tile) => tile.x === x && tile.y === y && tile.type === "wall");
}

export function getWallBitmask(x: number, y: number, layout: OfficeLayout): WallBitmask {
  let mask = 0;
  if (hasWall(layout, x, y - 1)) mask |= WALL_N;
  if (hasWall(layout, x + 1, y)) mask |= WALL_E;
  if (hasWall(layout, x, y + 1)) mask |= WALL_S;
  if (hasWall(layout, x - 1, y)) mask |= WALL_W;
  return mask;
}

function createWallSprite(mask: WallBitmask): SpriteFrame {
  const base = TILE_COLORS.wall;
  const top = shade(base, 16);
  const bottom = shade(base, -18);
  const left = shade(base, 10);
  const right = shade(base, -10);
  const corner = shade(base, 26);

  const sprite: SpriteFrame = Array.from({ length: TILE }, () => Array.from({ length: TILE }, () => base));

  if ((mask & WALL_N) === 0) {
    for (let x = 0; x < TILE; x += 1) {
      sprite[0][x] = top;
      sprite[1][x] = top;
    }
  }
  if ((mask & WALL_S) === 0) {
    for (let x = 0; x < TILE; x += 1) {
      sprite[TILE - 1][x] = bottom;
      sprite[TILE - 2][x] = bottom;
    }
  }
  if ((mask & WALL_W) === 0) {
    for (let y = 0; y < TILE; y += 1) {
      sprite[y][0] = left;
      sprite[y][1] = left;
    }
  }
  if ((mask & WALL_E) === 0) {
    for (let y = 0; y < TILE; y += 1) {
      sprite[y][TILE - 1] = right;
      sprite[y][TILE - 2] = right;
    }
  }

  if ((mask & (WALL_N | WALL_W)) === 0) {
    sprite[0][0] = corner;
    sprite[0][1] = corner;
    sprite[1][0] = corner;
  }
  if ((mask & (WALL_N | WALL_E)) === 0) {
    sprite[0][TILE - 1] = corner;
    sprite[0][TILE - 2] = corner;
    sprite[1][TILE - 1] = corner;
  }
  if ((mask & (WALL_S | WALL_W)) === 0) {
    sprite[TILE - 1][0] = corner;
    sprite[TILE - 2][0] = corner;
    sprite[TILE - 1][1] = corner;
  }
  if ((mask & (WALL_S | WALL_E)) === 0) {
    sprite[TILE - 1][TILE - 1] = corner;
    sprite[TILE - 2][TILE - 1] = corner;
    sprite[TILE - 1][TILE - 2] = corner;
  }

  return sprite;
}

export const WALL_SPRITES: Record<WallBitmask, SpriteFrame> = Object.fromEntries(
  Array.from({ length: 16 }, (_, mask) => [mask, createWallSprite(mask)]),
) as Record<WallBitmask, SpriteFrame>;
