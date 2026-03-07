import type { CachedSprite, SpriteFrame } from "../types";

const spriteCache = new Map<number, Map<string, CachedSprite>>();

export function getOrCreateSprite(frame: SpriteFrame, key: string, zoom: number): CachedSprite {
  let zoomBucket = spriteCache.get(zoom);
  if (!zoomBucket) {
    zoomBucket = new Map<string, CachedSprite>();
    spriteCache.set(zoom, zoomBucket);
  }

  const cached = zoomBucket.get(key);
  if (cached) {
    return cached;
  }

  const width = frame[0]?.length ?? 0;
  const height = frame.length;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * zoom));
  canvas.height = Math.max(1, Math.round(height * zoom));

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    const fallback: CachedSprite = { canvas, width: canvas.width, height: canvas.height };
    zoomBucket.set(key, fallback);
    return fallback;
  }

  ctx.imageSmoothingEnabled = false;

  for (let y = 0; y < height; y += 1) {
    const row = frame[y];
    for (let x = 0; x < width; x += 1) {
      const color = row?.[x] ?? null;
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(
        Math.floor(x * zoom),
        Math.floor(y * zoom),
        Math.ceil(zoom),
        Math.ceil(zoom),
      );
    }
  }

  const sprite: CachedSprite = {
    canvas,
    width: canvas.width,
    height: canvas.height,
  };

  zoomBucket.set(key, sprite);
  return sprite;
}

export function clearCache(): void {
  spriteCache.clear();
}
