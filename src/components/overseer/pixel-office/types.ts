export type TileType = "floor" | "wall" | "carpet" | "window";
export type FurnitureType =
  | "desk"
  | "chair"
  | "plant"
  | "monitor"
  | "bookshelf"
  | "water_cooler";
export type CharacterAction = "idle" | "walking" | "typing" | "offline";
export type Direction = "up" | "down" | "left" | "right";

/** 16x16 hex color grid. null = transparent pixel */
export type SpriteFrame = (string | null)[][];

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
  speechBubbleTimer: number;
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

export interface SpriteSet {
  idle: Record<Direction, SpriteFrame[]>;
  walking: Record<Direction, SpriteFrame[]>;
  typing: SpriteFrame[];
  offline: SpriteFrame[];
}
