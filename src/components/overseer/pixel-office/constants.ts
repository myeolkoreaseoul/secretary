import type { CharacterPalette } from "./types";

export const TILE_SIZE = 16;
export const SPRITE_WIDTH = 16;
export const SPRITE_HEIGHT = 24;
export const GRID_WIDTH = 20;
export const GRID_HEIGHT = 14;
export const MAX_DELTA = 0.1; // seconds cap for background tab recovery

// Character movement
export const WALK_SPEED_PX_PER_SEC = 30;
export const WALK_FRAME_DURATION_SEC = 0.2;
export const TYPE_FRAME_DURATION_SEC = 0.4;
export const READ_FRAME_DURATION_SEC = 0.5;
export const IDLE_FRAME_DURATION_SEC = 1.0;

// Sitting
export const CHARACTER_SITTING_OFFSET_PX = 3;
export const CHARACTER_Z_SORT_OFFSET = 4;

// Speech bubbles
export const SPEECH_BUBBLE_DURATION_SEC = 8;
export const BUBBLE_FADE_DURATION_SEC = 2;
export const BUBBLE_VERTICAL_OFFSET_PX = 4;

// Matrix spawn effect
export const MATRIX_SPAWN_DURATION_SEC = 1.5;
export const MATRIX_HEAD_COLOR = "#88ffaa";
export const MATRIX_TRAIL_OVERLAY_ALPHA = 0.3;

// Tile colors
export const FALLBACK_FLOOR_COLOR = "#3A3A5C";
export const TILE_COLORS: Record<string, string> = {
  floor: "#3A3A5C",
  wall: "#4a4a6a",
  carpet: "#3d3d55",
  window: "#1e3a5f",
  void: "#18181b",
};

// 6 character palettes (from Pixel Agents style)
export const CHARACTER_PALETTES: CharacterPalette[] = [
  { skin: "#FFCC99", hair: "#553322", shirt: "#d97706", pants: "#334466", shoes: "#222222", eyes: "#1a1a1a" }, // Claude (orange)
  { skin: "#FFCC99", hair: "#222222", shirt: "#22c55e", pants: "#333333", shoes: "#222222", eyes: "#1a1a1a" }, // Codex (green)
  { skin: "#DEB887", hair: "#FFD700", shirt: "#3b82f6", pants: "#334444", shoes: "#222222", eyes: "#1a1a1a" }, // Gemini (blue)
  { skin: "#FFCC99", hair: "#111111", shirt: "#38bdf8", pants: "#443322", shoes: "#222222", eyes: "#1a1a1a" }, // Telegram (sky)
  { skin: "#DEB887", hair: "#AA4422", shirt: "#AA55CC", pants: "#443355", shoes: "#222222", eyes: "#1a1a1a" }, // spare purple
  { skin: "#FFCC99", hair: "#553322", shirt: "#CC4444", pants: "#333333", shoes: "#222222", eyes: "#1a1a1a" }, // spare red
];

// Worker type → palette index
export const WORKER_PALETTE: Record<string, number> = {
  claude_code: 0,
  codex_cli: 1,
  gemini_cli: 2,
  telegram_bot: 3,
};

// Worker type display names
export const WORKER_NAMES: Record<string, string> = {
  claude_code: "Claude",
  codex_cli: "Codex",
  gemini_cli: "Gemini",
  telegram_bot: "TG Bot",
};

// Status dot colors (for HTML label overlay)
export const STATUS_COLORS: Record<string, string> = {
  active: "#22c55e",
  idle: "#eab308",
  offline: "#6b7280",
};

// Lounge area for idle characters
export const LOUNGE_AREA = { x: 14, y: 9, width: 4, height: 3 };

// Door position (inside wall)
export const DOOR_POSITION = { x: 1, y: 6 };

// Offline grayscale
export const OFFLINE_DESATURATION = 0.4;
export const OFFLINE_GRAY_OFFSET = 80;

// Editor
export const EDITOR_GRID_COLOR = "rgba(255,255,255,0.15)";
export const EDITOR_HOVER_COLOR = "rgba(59,130,246,0.3)";

// Layout storage key
export const LAYOUT_STORAGE_KEY = "pixel-office-layout-v2";

// Reading tools (determines reading vs typing animation)
export const READING_TOOLS = new Set(["Read", "Grep", "Glob", "WebFetch", "WebSearch"]);

// Floor patterns count
export const FLOOR_PATTERN_COUNT = 7;

// Wall bitmask directions
export const WALL_N = 1;
export const WALL_E = 2;
export const WALL_S = 4;
export const WALL_W = 8;
