import type { Character, Direction } from "../types";
import {
  TILE_SIZE,
  WALK_SPEED_PX_PER_SEC,
  WALK_FRAME_DURATION_SEC,
  TYPE_FRAME_DURATION_SEC,
  READ_FRAME_DURATION_SEC,
  IDLE_FRAME_DURATION_SEC,
  SPEECH_BUBBLE_DURATION_SEC,
  WORKER_PALETTE,
  WORKER_NAMES,
  MATRIX_SPAWN_DURATION_SEC,
} from "../constants";

/**
 * Update a character's state for one frame.
 * deltaSec is in seconds.
 * Returns true if the character was removed (walked out door).
 */
export function updateCharacter(char: Character, deltaSec: number): boolean {
  // Update matrix spawn progress
  if (char.spawnProgress < 1) {
    char.spawnProgress += deltaSec / MATRIX_SPAWN_DURATION_SEC;
    if (char.spawnProgress > 1) char.spawnProgress = 1;
  }

  switch (char.action) {
    case "walking":
      return updateWalking(char, deltaSec);
    case "typing":
      updateTyping(char, deltaSec);
      return false;
    case "reading":
      updateReading(char, deltaSec);
      return false;
    case "idle":
      updateIdle(char, deltaSec);
      return false;
    case "offline":
      return false;
    default:
      return false;
  }
}

function updateWalking(char: Character, deltaSec: number): boolean {
  if (char.path.length === 0) {
    // Reached destination
    if (char.status === "active") {
      char.action = "typing";
      char.animFrame = 0;
      char.animTimer = 0;
      char.speechBubbleTimer = SPEECH_BUBBLE_DURATION_SEC;
    } else if (char.status === "idle") {
      char.action = "idle";
      char.animFrame = 0;
      char.animTimer = 0;
    } else {
      // Walking to door to be removed
      return true;
    }
    return false;
  }

  const next = char.path[0];
  const targetPx = next.x * TILE_SIZE;
  const targetPy = next.y * TILE_SIZE;

  const dx = targetPx - char.x;
  const dy = targetPy - char.y;

  if (Math.abs(dx) > Math.abs(dy)) {
    char.direction = dx > 0 ? "right" : "left";
  } else {
    char.direction = dy > 0 ? "down" : "up";
  }

  const speed = WALK_SPEED_PX_PER_SEC * deltaSec;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist <= speed) {
    char.x = targetPx;
    char.y = targetPy;
    char.targetX = next.x;
    char.targetY = next.y;
    char.path.shift();
  } else {
    char.x += (dx / dist) * speed;
    char.y += (dy / dist) * speed;
  }

  // Walk animation
  char.animTimer += deltaSec;
  if (char.animTimer >= WALK_FRAME_DURATION_SEC) {
    char.animFrame = (char.animFrame + 1) % 2;
    char.animTimer = 0;
  }

  return false;
}

function updateTyping(char: Character, deltaSec: number): void {
  char.animTimer += deltaSec;
  if (char.animTimer >= TYPE_FRAME_DURATION_SEC) {
    char.animFrame = (char.animFrame + 1) % 2;
    char.animTimer = 0;
  }
  if (char.speechBubbleTimer > 0) {
    char.speechBubbleTimer -= deltaSec;
  }
}

function updateReading(char: Character, deltaSec: number): void {
  char.animTimer += deltaSec;
  if (char.animTimer >= READ_FRAME_DURATION_SEC) {
    char.animFrame = (char.animFrame + 1) % 2;
    char.animTimer = 0;
  }
  if (char.speechBubbleTimer > 0) {
    char.speechBubbleTimer -= deltaSec;
  }
}

function updateIdle(char: Character, deltaSec: number): void {
  char.animTimer += deltaSec;
  if (char.animTimer >= IDLE_FRAME_DURATION_SEC) {
    char.animFrame = (char.animFrame + 1) % 2;
    char.animTimer = 0;
  }
}

/**
 * Create a new character at the door position.
 */
export function createCharacter(
  workerId: string,
  workerType: string,
  machine: string | null,
  status: "active" | "idle" | "offline",
  currentTask: string | null,
  doorX: number,
  doorY: number,
): Character {
  return {
    workerId,
    workerType,
    name: WORKER_NAMES[workerType] || workerType,
    machine,
    paletteIndex: WORKER_PALETTE[workerType] ?? 0,
    status,
    action: status === "offline" ? "offline" : "walking",
    direction: "down" as Direction,
    x: doorX * TILE_SIZE,
    y: doorY * TILE_SIZE,
    targetX: doorX,
    targetY: doorY,
    path: [],
    animFrame: 0,
    animTimer: 0,
    currentTask,
    currentTool: null,
    speechBubbleTimer: currentTask ? SPEECH_BUBBLE_DURATION_SEC : 0,
    spawnProgress: 0,
    sittingOffset: 0,
  };
}
