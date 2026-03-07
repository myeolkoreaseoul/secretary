import type { Camera } from "../types";
import { TILE_SIZE, GRID_WIDTH, GRID_HEIGHT } from "../constants";

/**
 * Initialize camera to fit the grid into the given container size.
 */
export function initCamera(containerWidth: number, containerHeight: number): Camera {
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  const worldWidth = GRID_WIDTH * TILE_SIZE;
  const worldHeight = GRID_HEIGHT * TILE_SIZE;

  // Scale to fit container while maintaining aspect ratio
  const scaleX = containerWidth / worldWidth;
  const scaleY = containerHeight / worldHeight;
  const scale = Math.min(scaleX, scaleY);

  // Center the grid in the container
  const offsetX = (containerWidth - worldWidth * scale) / 2;
  const offsetY = (containerHeight - worldHeight * scale) / 2;

  return { scale, offsetX, offsetY, dpr };
}

/**
 * Set up canvas for HiDPI rendering.
 */
export function setupHiDPI(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  dpr: number,
): void {
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  // Pixel-perfect rendering
  ctx.imageSmoothingEnabled = false;
}

/**
 * Convert screen (mouse) coordinates to grid coordinates.
 */
export function screenToGrid(
  screenX: number,
  screenY: number,
  camera: Camera,
): { x: number; y: number } {
  const worldX = (screenX - camera.offsetX) / camera.scale;
  const worldY = (screenY - camera.offsetY) / camera.scale;
  return {
    x: Math.floor(worldX / TILE_SIZE),
    y: Math.floor(worldY / TILE_SIZE),
  };
}

/**
 * Convert grid coordinates to screen pixel position.
 */
export function gridToScreen(
  gridX: number,
  gridY: number,
  camera: Camera,
): { x: number; y: number } {
  return {
    x: camera.offsetX + gridX * TILE_SIZE * camera.scale,
    y: camera.offsetY + gridY * TILE_SIZE * camera.scale,
  };
}
