import type { Character, Direction } from "../types";
import { TILE_SIZE, WALK_SPEED, TYPING_FRAME_MS, IDLE_FRAME_MS, SPEECH_BUBBLE_DURATION } from "../constants";

/**
 * Update a character's state for one frame.
 * Returns true if the character was removed (walked out door).
 */
export function updateCharacter(char: Character, deltaMs: number): boolean {
  switch (char.action) {
    case "walking":
      return updateWalking(char, deltaMs);
    case "typing":
      updateTyping(char, deltaMs);
      return false;
    case "idle":
      updateIdle(char, deltaMs);
      return false;
    case "offline":
      // No animation updates for offline
      return false;
    default:
      return false;
  }
}

function updateWalking(char: Character, deltaMs: number): boolean {
  if (char.path.length === 0) {
    // Reached destination — decide next action based on status
    if (char.status === "active") {
      char.action = "typing";
      char.animFrame = 0;
      char.animTimer = 0;
      char.speechBubbleTimer = SPEECH_BUBBLE_DURATION;
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

  // Determine direction
  const dx = targetPx - char.x;
  const dy = targetPy - char.y;

  if (Math.abs(dx) > Math.abs(dy)) {
    char.direction = dx > 0 ? "right" : "left";
  } else {
    char.direction = dy > 0 ? "down" : "up";
  }

  // Move toward target
  const speed = WALK_SPEED;
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
  char.animTimer += deltaMs;
  if (char.animTimer >= 200) {
    char.animFrame = (char.animFrame + 1) % 2;
    char.animTimer = 0;
  }

  return false;
}

function updateTyping(char: Character, deltaMs: number): void {
  char.animTimer += deltaMs;
  if (char.animTimer >= TYPING_FRAME_MS) {
    char.animFrame = (char.animFrame + 1) % 2;
    char.animTimer = 0;
  }
  // Decrease speech bubble timer
  if (char.speechBubbleTimer > 0) {
    char.speechBubbleTimer -= deltaMs;
  }
}

function updateIdle(char: Character, deltaMs: number): void {
  char.animTimer += deltaMs;
  if (char.animTimer >= IDLE_FRAME_MS) {
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
    name: workerType,
    machine,
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
    speechBubbleTimer: currentTask ? SPEECH_BUBBLE_DURATION : 0,
  };
}
