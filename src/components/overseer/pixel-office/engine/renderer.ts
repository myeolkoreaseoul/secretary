import type { Camera, Character, OfficeLayout, FurniturePlacement } from "../types";
import { TILE_SIZE, TILE_COLORS, WORKER_NAMES, EDITOR_GRID_COLOR, EDITOR_HOVER_COLOR } from "../constants";
import { FURNITURE_SPRITES, CHARACTER_SPRITES } from "../sprites/spriteData";
import { drawSpriteOnTile, drawSpriteAtPixel } from "../sprites/spriteRenderer";

export function render(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  camera: Camera,
  layout: OfficeLayout,
  characters: Character[],
  editing: boolean,
  hoveredTile: { x: number; y: number } | null,
): void {
  // 1. Clear
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#18181b"; // zinc-900 background
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.translate(camera.offsetX, camera.offsetY);
  ctx.scale(camera.scale, camera.scale);

  // 2. Tiles
  renderTiles(ctx, layout);

  // 3. Furniture (sorted by Y for depth)
  const sortedFurniture = [...layout.furniture].sort((a, b) => a.y - b.y);
  renderFurniture(ctx, sortedFurniture);

  // 4. Characters (sorted by Y for Z-sort)
  const sortedChars = [...characters].sort((a, b) => a.y - b.y);
  renderCharacters(ctx, sortedChars);

  // 5. UI overlays (speech bubbles, names)
  renderUI(ctx, sortedChars);

  // 6. Editor overlay
  if (editing) {
    renderEditorOverlay(ctx, layout, hoveredTile);
  }

  ctx.restore();
}

function renderTiles(ctx: CanvasRenderingContext2D, layout: OfficeLayout): void {
  for (const tile of layout.tiles) {
    ctx.fillStyle = TILE_COLORS[tile.type] || TILE_COLORS.floor;
    ctx.fillRect(tile.x * TILE_SIZE, tile.y * TILE_SIZE, TILE_SIZE, TILE_SIZE);

    // Subtle grid lines
    ctx.strokeStyle = "rgba(255,255,255,0.03)";
    ctx.lineWidth = 0.5;
    ctx.strokeRect(tile.x * TILE_SIZE, tile.y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
  }
}

function renderFurniture(ctx: CanvasRenderingContext2D, furniture: FurniturePlacement[]): void {
  for (const f of furniture) {
    const sprite = FURNITURE_SPRITES[f.type];
    if (sprite) {
      drawSpriteOnTile(ctx, sprite, f.x, f.y, TILE_SIZE);
    } else {
      // Fallback: colored rectangle
      ctx.fillStyle = "#52525b";
      ctx.fillRect(f.x * TILE_SIZE + 2, f.y * TILE_SIZE + 2, f.width * TILE_SIZE - 4, f.height * TILE_SIZE - 4);
    }
  }
}

function renderCharacters(ctx: CanvasRenderingContext2D, characters: Character[]): void {
  for (const char of characters) {
    const spriteSet = CHARACTER_SPRITES[char.workerType] || CHARACTER_SPRITES.claude_code;
    if (!spriteSet) continue;

    const isOffline = char.action === "offline";
    let frame;

    switch (char.action) {
      case "typing": {
        const frames = spriteSet.typing;
        frame = frames[char.animFrame % frames.length];
        break;
      }
      case "walking": {
        const dirFrames = spriteSet.walking[char.direction];
        frame = dirFrames[char.animFrame % dirFrames.length];
        break;
      }
      case "offline": {
        frame = spriteSet.offline[0];
        break;
      }
      default: {
        // idle
        const idleFrames = spriteSet.idle[char.direction];
        frame = idleFrames[char.animFrame % idleFrames.length];
        break;
      }
    }

    if (frame) {
      drawSpriteAtPixel(ctx, frame, char.x, char.y, TILE_SIZE, isOffline);
    }
  }
}

function renderUI(ctx: CanvasRenderingContext2D, characters: Character[]): void {
  for (const char of characters) {
    if (char.action === "offline") continue;

    const centerX = char.x + TILE_SIZE / 2;
    const topY = char.y - 4;

    // Name label
    ctx.font = "bold 7px monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    const name = WORKER_NAMES[char.workerType] || char.workerType;
    const nameWidth = ctx.measureText(name).width;
    ctx.fillRect(centerX - nameWidth / 2 - 2, topY - 7, nameWidth + 4, 9);
    ctx.fillStyle = "#e4e4e7";
    ctx.fillText(name, centerX, topY);

    // Speech bubble (current task)
    if (char.currentTask && char.speechBubbleTimer > 0) {
      const text = char.currentTask.length > 20
        ? char.currentTask.slice(0, 20) + "..."
        : char.currentTask;
      ctx.font = "6px monospace";
      const tw = ctx.measureText(text).width;
      const bubbleX = centerX - tw / 2 - 4;
      const bubbleY = topY - 20;
      const bubbleW = tw + 8;
      const bubbleH = 12;

      // Bubble background
      ctx.fillStyle = "rgba(24,24,27,0.9)";
      ctx.beginPath();
      ctx.roundRect(bubbleX, bubbleY, bubbleW, bubbleH, 3);
      ctx.fill();
      ctx.strokeStyle = "#3f3f46";
      ctx.lineWidth = 0.5;
      ctx.stroke();

      // Bubble tail
      ctx.fillStyle = "rgba(24,24,27,0.9)";
      ctx.beginPath();
      ctx.moveTo(centerX - 3, bubbleY + bubbleH);
      ctx.lineTo(centerX, bubbleY + bubbleH + 4);
      ctx.lineTo(centerX + 3, bubbleY + bubbleH);
      ctx.fill();

      // Text
      ctx.fillStyle = "#a1a1aa";
      ctx.textAlign = "center";
      ctx.fillText(text, centerX, bubbleY + 9);
    }
  }
}

function renderEditorOverlay(
  ctx: CanvasRenderingContext2D,
  layout: OfficeLayout,
  hoveredTile: { x: number; y: number } | null,
): void {
  // Grid lines
  ctx.strokeStyle = EDITOR_GRID_COLOR;
  ctx.lineWidth = 1;
  for (let x = 0; x <= layout.gridWidth; x++) {
    ctx.beginPath();
    ctx.moveTo(x * TILE_SIZE, 0);
    ctx.lineTo(x * TILE_SIZE, layout.gridHeight * TILE_SIZE);
    ctx.stroke();
  }
  for (let y = 0; y <= layout.gridHeight; y++) {
    ctx.beginPath();
    ctx.moveTo(0, y * TILE_SIZE);
    ctx.lineTo(layout.gridWidth * TILE_SIZE, y * TILE_SIZE);
    ctx.stroke();
  }

  // Hover highlight
  if (hoveredTile) {
    ctx.fillStyle = EDITOR_HOVER_COLOR;
    ctx.fillRect(
      hoveredTile.x * TILE_SIZE,
      hoveredTile.y * TILE_SIZE,
      TILE_SIZE,
      TILE_SIZE,
    );
  }
}
