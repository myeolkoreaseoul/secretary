import type { OfficeLayout, TileType } from "../types";
import { GRID_WIDTH, GRID_HEIGHT } from "../constants";

function generateTiles(): OfficeLayout["tiles"] {
  const tiles: OfficeLayout["tiles"] = [];
  for (let y = 0; y < GRID_HEIGHT; y++) {
    for (let x = 0; x < GRID_WIDTH; x++) {
      let type: TileType = "floor";
      // Walls: top row and bottom row
      if (y === 0 || y === GRID_HEIGHT - 1) type = "wall";
      // Walls: left and right columns
      if (x === 0 || x === GRID_WIDTH - 1) type = "wall";
      // Windows on top wall
      if (y === 0 && x >= 3 && x <= 7) type = "window";
      if (y === 0 && x >= 12 && x <= 16) type = "window";
      // Carpet in lounge area (bottom-right)
      if (x >= 14 && x <= 18 && y >= 8 && y <= 10) type = "carpet";
      tiles.push({ x, y, type });
    }
  }
  return tiles;
}

export const DEFAULT_LAYOUT: OfficeLayout = {
  version: 1,
  gridWidth: GRID_WIDTH,
  gridHeight: GRID_HEIGHT,
  tiles: generateTiles(),
  furniture: [
    // Row 1: Two desks with chairs (top-left area)
    { id: "desk-1", type: "desk", x: 2, y: 2, width: 2, height: 1 },
    { id: "chair-1", type: "chair", x: 2, y: 3, width: 1, height: 1 },
    { id: "monitor-1", type: "monitor", x: 3, y: 2, width: 1, height: 1 },

    { id: "desk-2", type: "desk", x: 5, y: 2, width: 2, height: 1 },
    { id: "chair-2", type: "chair", x: 5, y: 3, width: 1, height: 1 },
    { id: "monitor-2", type: "monitor", x: 6, y: 2, width: 1, height: 1 },

    // Row 2: Two desks (middle-left area)
    { id: "desk-3", type: "desk", x: 2, y: 6, width: 2, height: 1 },
    { id: "chair-3", type: "chair", x: 2, y: 7, width: 1, height: 1 },
    { id: "monitor-3", type: "monitor", x: 3, y: 6, width: 1, height: 1 },

    { id: "desk-4", type: "desk", x: 5, y: 6, width: 2, height: 1 },
    { id: "chair-4", type: "chair", x: 5, y: 7, width: 1, height: 1 },
    { id: "monitor-4", type: "monitor", x: 6, y: 6, width: 1, height: 1 },

    // Decorations
    { id: "plant-1", type: "plant", x: 9, y: 1, width: 1, height: 1 },
    { id: "plant-2", type: "plant", x: 18, y: 1, width: 1, height: 1 },
    { id: "bookshelf-1", type: "bookshelf", x: 11, y: 1, width: 2, height: 1 },
    { id: "water-1", type: "water_cooler", x: 15, y: 5, width: 1, height: 1 },
    { id: "plant-3", type: "plant", x: 18, y: 10, width: 1, height: 1 },
  ],
};
