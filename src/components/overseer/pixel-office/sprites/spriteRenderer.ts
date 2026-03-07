import type { SpriteFrame } from "../types";
import { SPRITE_SIZE, OFFLINE_DESATURATION, OFFLINE_GRAY_OFFSET } from "../constants";

/**
 * Draw a sprite frame onto the canvas at the given position.
 * Each cell in the frame is a hex color or null (transparent).
 */
export function drawSprite(
  ctx: CanvasRenderingContext2D,
  frame: SpriteFrame,
  x: number,
  y: number,
  scale: number,
  offline = false,
): void {
  const pixelSize = scale;
  for (let row = 0; row < frame.length; row++) {
    const cols = frame[row];
    for (let col = 0; col < cols.length; col++) {
      const color = cols[col];
      if (!color) continue;
      ctx.fillStyle = offline ? desaturate(color) : color;
      ctx.fillRect(
        Math.floor(x + col * pixelSize),
        Math.floor(y + row * pixelSize),
        Math.ceil(pixelSize),
        Math.ceil(pixelSize),
      );
    }
  }
}

/**
 * Draw a sprite centered on a tile position.
 * tileX/tileY are grid coordinates, tileSize is pixel size of one tile.
 */
export function drawSpriteOnTile(
  ctx: CanvasRenderingContext2D,
  frame: SpriteFrame,
  tileX: number,
  tileY: number,
  tileSize: number,
  offline = false,
): void {
  const spriteScale = tileSize / SPRITE_SIZE;
  const px = tileX * tileSize;
  const py = tileY * tileSize;
  drawSprite(ctx, frame, px, py, spriteScale, offline);
}

/**
 * Draw sprite at pixel position (for characters with sub-tile movement).
 */
export function drawSpriteAtPixel(
  ctx: CanvasRenderingContext2D,
  frame: SpriteFrame,
  px: number,
  py: number,
  tileSize: number,
  offline = false,
): void {
  const spriteScale = tileSize / SPRITE_SIZE;
  drawSprite(ctx, frame, px, py, spriteScale, offline);
}

/** Convert a hex color to desaturated grayscale for offline state */
function desaturate(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const gray = Math.round(r * 0.299 + g * 0.587 + b * 0.114);
  const nr = Math.round(r * OFFLINE_DESATURATION + OFFLINE_GRAY_OFFSET * (1 - OFFLINE_DESATURATION));
  const ng = Math.round(g * OFFLINE_DESATURATION + OFFLINE_GRAY_OFFSET * (1 - OFFLINE_DESATURATION));
  const nb = Math.round(b * OFFLINE_DESATURATION + OFFLINE_GRAY_OFFSET * (1 - OFFLINE_DESATURATION));
  // Blend toward gray
  const fr = Math.round(nr * 0.5 + gray * 0.5);
  const fg = Math.round(ng * 0.5 + gray * 0.5);
  const fb = Math.round(nb * 0.5 + gray * 0.5);
  return `rgb(${clamp(fr)},${clamp(fg)},${clamp(fb)})`;
}

function clamp(v: number): number {
  return Math.max(0, Math.min(255, v));
}
