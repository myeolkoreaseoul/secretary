import { MATRIX_HEAD_COLOR, MATRIX_SPAWN_DURATION_SEC, MATRIX_TRAIL_OVERLAY_ALPHA } from "../constants";
import type { Character, SpriteFrame } from "../types";

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function updateSpawnProgress(character: Character, deltaSec: number): void {
  if (character.spawnProgress >= 1) {
    character.spawnProgress = 1;
    return;
  }
  const next = character.spawnProgress + deltaSec / MATRIX_SPAWN_DURATION_SEC;
  character.spawnProgress = clamp01(next);
}

function withOverlay(hex: string, alpha: number): string {
  const raw = hex.startsWith("#") ? hex.slice(1) : hex;
  const full = raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw;
  const r = Number.parseInt(full.slice(0, 2), 16);
  const g = Number.parseInt(full.slice(2, 4), 16);
  const b = Number.parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function hash(value: number): number {
  let h = value | 0;
  h ^= h << 13;
  h ^= h >>> 17;
  h ^= h << 5;
  return h >>> 0;
}

export function flickerVisible(seedA: number, seedB: number, seedC: number): boolean {
  const mixed = hash(seedA * 73856093 ^ seedB * 19349663 ^ seedC * 83492791);
  return (mixed % 100) < 70;
}

export function applyMatrixEffect(
  ctx: CanvasRenderingContext2D,
  frame: SpriteFrame,
  x: number,
  y: number,
  zoom: number,
  progress: number,
): void {
  const rows = frame.length;
  if (rows === 0) return;

  const cols = frame[0]?.length ?? 0;
  const revealRow = progress * rows;
  const headDepth = 2;
  const trailDepth = 6;

  for (let row = 0; row < rows; row += 1) {
    const rowDistance = revealRow - row;
    const unrevealed = rowDistance <= 0;
    const inHead = rowDistance > 0 && rowDistance <= headDepth;
    const inTrail = rowDistance > headDepth && rowDistance <= headDepth + trailDepth;

    for (let col = 0; col < cols; col += 1) {
      const pixel = frame[row]?.[col] ?? null;
      if (!pixel) continue;

      if (unrevealed) {
        continue;
      }

      if (inHead) {
        ctx.fillStyle = MATRIX_HEAD_COLOR;
      } else if (inTrail) {
        const seed = Math.floor(progress * 1000);
        if (!flickerVisible(col, row, seed)) {
          continue;
        }
        const depthFactor = 1 - (rowDistance - headDepth) / trailDepth;
        const alpha = MATRIX_TRAIL_OVERLAY_ALPHA * clamp01(depthFactor);
        ctx.fillStyle = withOverlay("#33ff77", alpha);
      } else {
        ctx.fillStyle = pixel;
      }

      ctx.fillRect(
        Math.floor(x + col * zoom),
        Math.floor(y + row * zoom),
        Math.ceil(zoom),
        Math.ceil(zoom),
      );
    }
  }
}
