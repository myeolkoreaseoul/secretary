export const TILE_SIZE = 32;
export const GRID_WIDTH = 20;
export const GRID_HEIGHT = 12;
export const TARGET_FPS = 15;
export const FRAME_INTERVAL = 1000 / TARGET_FPS;
export const SPRITE_SIZE = 16;
export const MAX_DELTA = 66; // ms cap for background tab recovery

// Character animation speeds (ms)
export const WALK_SPEED = 2; // pixels per frame
export const TYPING_FRAME_MS = 300;
export const IDLE_FRAME_MS = 800;
export const SPEECH_BUBBLE_DURATION = 5000; // ms

// Tile colors (zinc palette)
export const TILE_COLORS: Record<string, string> = {
  floor: "#27272a",    // zinc-800
  wall: "#3f3f46",     // zinc-700
  carpet: "#2e2e33",   // between zinc-800 and zinc-750
  window: "#1e3a5f",   // dark blue tint
};

// Worker type theme colors
export const WORKER_COLORS: Record<string, { primary: string; secondary: string }> = {
  claude_code: { primary: "#d97706", secondary: "#92400e" },  // amber/tan
  codex_cli: { primary: "#22c55e", secondary: "#166534" },    // green
  gemini_cli: { primary: "#3b82f6", secondary: "#1e40af" },   // blue
  telegram_bot: { primary: "#38bdf8", secondary: "#0369a1" }, // sky
};

// Worker type display names
export const WORKER_NAMES: Record<string, string> = {
  claude_code: "Claude",
  codex_cli: "Codex",
  gemini_cli: "Gemini",
  telegram_bot: "TG Bot",
};

// Lounge area for idle characters
export const LOUNGE_AREA = { x: 14, y: 8, width: 4, height: 3 };

// Door position for enter/exit
export const DOOR_POSITION = { x: 0, y: 5 };

// Offline grayscale factor
export const OFFLINE_DESATURATION = 0.4;
export const OFFLINE_GRAY_OFFSET = 80;

// Editor
export const EDITOR_GRID_COLOR = "rgba(255,255,255,0.15)";
export const EDITOR_HOVER_COLOR = "rgba(59,130,246,0.3)";

// Layout storage key
export const LAYOUT_STORAGE_KEY = "pixel-office-layout";
