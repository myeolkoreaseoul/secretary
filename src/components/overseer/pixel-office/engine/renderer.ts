import type { Camera, Character, OfficeLayout, FurniturePlacement } from "../types";
import {
  TILE_SIZE,
  TILE_COLORS,
  WORKER_NAMES,
  STATUS_COLORS,
  EDITOR_GRID_COLOR,
  EDITOR_HOVER_COLOR,
  SPEECH_BUBBLE_DURATION_SEC,
  BUBBLE_FADE_DURATION_SEC,
  BUBBLE_VERTICAL_OFFSET_PX,
  CHARACTER_SITTING_OFFSET_PX,
  CHARACTER_Z_SORT_OFFSET,
} from "../constants";
import { FURNITURE_SPRITES, CHARACTER_SPRITES, resolveTemplate } from "../sprites/spriteData";
import { CHARACTER_PALETTES } from "../constants";
import { drawSpriteOnTile, drawSpriteAtPixel } from "../sprites/spriteRenderer";
import type { CharacterAction, Direction, SpriteFrame, SpriteTemplate } from "../types";

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
  ctx.fillStyle = "#18181b";
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.translate(camera.offsetX, camera.offsetY);
  ctx.scale(camera.scale, camera.scale);

  // 2. Tiles
  renderTiles(ctx, layout);

  // 3+4. Furniture and characters Z-sorted together by Y
  renderEntities(ctx, layout.furniture, characters);

  // 5. UI overlays (speech bubbles, names)
  renderUI(ctx, characters);

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

/** Interleave furniture and characters sorted by Y for proper depth */
function renderEntities(
  ctx: CanvasRenderingContext2D,
  furniture: FurniturePlacement[],
  characters: Character[],
): void {
  // Build a unified list of renderable entities
  type Entity = { y: number; kind: "furniture"; data: FurniturePlacement }
    | { y: number; kind: "character"; data: Character };

  const entities: Entity[] = [];

  for (const f of furniture) {
    entities.push({ y: (f.y + f.height) * TILE_SIZE, kind: "furniture", data: f });
  }
  for (const c of characters) {
    // Use bottom of sprite + offset for Z-sorting
    entities.push({ y: c.y + CHARACTER_Z_SORT_OFFSET, kind: "character", data: c });
  }

  entities.sort((a, b) => a.y - b.y);

  for (const entity of entities) {
    if (entity.kind === "furniture") {
      renderOneFurniture(ctx, entity.data);
    } else {
      renderOneCharacter(ctx, entity.data);
    }
  }
}

function renderOneFurniture(ctx: CanvasRenderingContext2D, f: FurniturePlacement): void {
  const sprite = FURNITURE_SPRITES[f.type];
  if (sprite) {
    drawSpriteOnTile(ctx, sprite, f.x, f.y, TILE_SIZE);
  } else {
    ctx.fillStyle = "#52525b";
    ctx.fillRect(f.x * TILE_SIZE + 2, f.y * TILE_SIZE + 2, f.width * TILE_SIZE - 4, f.height * TILE_SIZE - 4);
  }
}

function getTemplate(action: CharacterAction, direction: Direction, animFrame: number): SpriteTemplate | null {
  const actionKey = action === "offline" ? "offline" : action;
  const actionSet = CHARACTER_SPRITES[actionKey];
  if (!actionSet) return null;

  // Handle "left" by using "right" templates (renderer handles flip)
  const dirKey = direction === "left" ? "left" : direction;
  const templates = actionSet[dirKey];
  if (!templates || templates.length === 0) return null;

  return templates[animFrame % templates.length];
}

function renderOneCharacter(ctx: CanvasRenderingContext2D, char: Character): void {
  const isOffline = char.action === "offline";
  const template = getTemplate(char.action, char.direction, char.animFrame);
  if (!template) return;

  // Resolve template with character's palette
  const palette = CHARACTER_PALETTES[char.paletteIndex] || CHARACTER_PALETTES[0];
  const frame: SpriteFrame = resolveTemplate(template, palette);

  // Apply sitting offset when at desk (typing/reading)
  const yOffset = (char.action === "typing" || char.action === "reading")
    ? -CHARACTER_SITTING_OFFSET_PX
    : 0;

  // Matrix spawn effect — clip vertically
  if (char.spawnProgress < 1) {
    const visibleRows = Math.floor(frame.length * char.spawnProgress);
    if (visibleRows <= 0) return;
    const clippedFrame = frame.slice(0, visibleRows);
    drawSpriteAtPixel(ctx, clippedFrame, char.x, char.y + yOffset, TILE_SIZE, isOffline);
  } else {
    drawSpriteAtPixel(ctx, frame, char.x, char.y + yOffset, TILE_SIZE, isOffline);
  }
}

function renderUI(ctx: CanvasRenderingContext2D, characters: Character[]): void {
  for (const char of characters) {
    if (char.action === "offline") continue;

    const centerX = char.x + TILE_SIZE / 2;
    const topY = char.y - BUBBLE_VERTICAL_OFFSET_PX;

    // Name label with status dot
    ctx.font = "bold 5px monospace";
    ctx.textAlign = "center";
    const name = WORKER_NAMES[char.workerType] || char.workerType;
    const nameWidth = ctx.measureText(name).width;

    // Background pill
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    const pillW = nameWidth + 10;
    ctx.beginPath();
    ctx.roundRect(centerX - pillW / 2, topY - 6, pillW, 8, 2);
    ctx.fill();

    // Status dot
    const dotColor = STATUS_COLORS[char.status] || STATUS_COLORS.idle;
    ctx.fillStyle = dotColor;
    ctx.beginPath();
    ctx.arc(centerX - pillW / 2 + 4, topY - 2, 1.5, 0, Math.PI * 2);
    ctx.fill();

    // Name text
    ctx.fillStyle = "#e4e4e7";
    ctx.fillText(name, centerX + 2, topY - 0.5);

    // Speech bubble (current task)
    if (char.currentTask && char.speechBubbleTimer > 0) {
      // Fade out in last BUBBLE_FADE_DURATION_SEC seconds
      let alpha = 1;
      if (char.speechBubbleTimer < BUBBLE_FADE_DURATION_SEC) {
        alpha = char.speechBubbleTimer / BUBBLE_FADE_DURATION_SEC;
      }

      const text = char.currentTask.length > 20
        ? char.currentTask.slice(0, 20) + "..."
        : char.currentTask;
      ctx.font = "4px monospace";
      const tw = ctx.measureText(text).width;
      const bubbleX = centerX - tw / 2 - 3;
      const bubbleY = topY - 16;
      const bubbleW = tw + 6;
      const bubbleH = 9;

      ctx.globalAlpha = alpha;

      // Bubble background
      ctx.fillStyle = "rgba(24,24,27,0.9)";
      ctx.beginPath();
      ctx.roundRect(bubbleX, bubbleY, bubbleW, bubbleH, 2);
      ctx.fill();
      ctx.strokeStyle = "#3f3f46";
      ctx.lineWidth = 0.3;
      ctx.stroke();

      // Bubble tail
      ctx.fillStyle = "rgba(24,24,27,0.9)";
      ctx.beginPath();
      ctx.moveTo(centerX - 2, bubbleY + bubbleH);
      ctx.lineTo(centerX, bubbleY + bubbleH + 3);
      ctx.lineTo(centerX + 2, bubbleY + bubbleH);
      ctx.fill();

      // Text
      ctx.fillStyle = "#a1a1aa";
      ctx.textAlign = "center";
      ctx.fillText(text, centerX, bubbleY + 6.5);

      ctx.globalAlpha = 1;
    }
  }
}

function renderEditorOverlay(
  ctx: CanvasRenderingContext2D,
  layout: OfficeLayout,
  hoveredTile: { x: number; y: number } | null,
): void {
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
