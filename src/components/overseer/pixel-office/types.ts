export type TileType = "floor" | "wall" | "carpet" | "window" | "void";
export type FurnitureType =
  | "desk"
  | "chair"
  | "plant"
  | "monitor"
  | "bookshelf"
  | "water_cooler";
export type CharacterAction = "idle" | "walking" | "typing" | "reading" | "offline";
export type Direction = "up" | "down" | "left" | "right";

/** 16x24 sprite template. Characters use letter codes mapped to palette colors.
 *  '_' = transparent, 'H' = hair, 'K' = skin, 'S' = shirt, 'P' = pants, 'O' = shoes, 'E' = eyes */
export type SpriteTemplate = string[][];

/** Resolved 16x24 hex color grid. null = transparent pixel */
export type SpriteFrame = (string | null)[][];

/** Character color palette */
export interface CharacterPalette {
  skin: string;
  hair: string;
  shirt: string;
  pants: string;
  shoes: string;
  eyes: string;
}

export interface OfficeLayout {
  version: number;
  gridWidth: number;
  gridHeight: number;
  tiles: { x: number; y: number; type: TileType }[];
  furniture: FurniturePlacement[];
}

export interface FurniturePlacement {
  id: string;
  type: FurnitureType;
  x: number;
  y: number;
  width: number;
  height: number;
  assignedTo?: string;
}

export interface Character {
  workerId: string;
  workerType: string;
  name: string;
  machine: string | null;
  paletteIndex: number;
  status: "active" | "idle" | "offline";
  action: CharacterAction;
  direction: Direction;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  path: { x: number; y: number }[];
  animFrame: number;
  animTimer: number;
  currentTask: string | null;
  currentTool: string | null;
  speechBubbleTimer: number;
  spawnProgress: number; // 0→1 for matrix spawn effect
  sittingOffset: number;
}

export interface Camera {
  scale: number;
  offsetX: number;
  offsetY: number;
  dpr: number;
}

export interface GameState {
  layout: OfficeLayout;
  characters: Character[];
  camera: Camera;
  editing: boolean;
  selectedFurniture: FurnitureType | null;
  hoveredTile: { x: number; y: number } | null;
}

export interface WorkerSnapshot {
  id: string;
  worker_id: string;
  worker_type: string;
  machine: string | null;
  session_id: string | null;
  project_id: string | null;
  project_path: string | null;
  status: "active" | "idle" | "offline";
  current_task: string | null;
  task_detail: unknown[];
  last_activity: string | null;
  scanned_at: string;
}

/** Sprite cache entry — pre-rendered canvas at specific zoom */
export interface CachedSprite {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
}

/** Floor tile pattern — 16x16 grid of hex colors */
export type FloorPattern = string[][];

/** Wall auto-tile bitmask (N=1, E=2, S=4, W=8) */
export type WallBitmask = number;
