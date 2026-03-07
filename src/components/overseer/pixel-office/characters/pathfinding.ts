import type { OfficeLayout } from "../types";
import { GRID_WIDTH, GRID_HEIGHT } from "../constants";

interface Point {
  x: number;
  y: number;
}

/**
 * BFS 4-direction pathfinding on the office grid.
 * Returns array of grid positions from start to end (exclusive of start).
 * Returns empty array if no path found.
 */
export function findPath(
  start: Point,
  end: Point,
  layout: OfficeLayout,
  occupiedTiles: Set<string>,
): Point[] {
  if (start.x === end.x && start.y === end.y) return [];

  const blocked = buildBlockedSet(layout, occupiedTiles);
  // Don't block the destination
  blocked.delete(key(end.x, end.y));

  const queue: Point[] = [start];
  const visited = new Set<string>([key(start.x, start.y)]);
  const parent = new Map<string, Point>();

  const dirs = [
    { x: 0, y: -1 }, // up
    { x: 0, y: 1 },  // down
    { x: -1, y: 0 }, // left
    { x: 1, y: 0 },  // right
  ];

  while (queue.length > 0) {
    const current = queue.shift()!;

    if (current.x === end.x && current.y === end.y) {
      // Reconstruct path
      const path: Point[] = [];
      let node: Point | undefined = current;
      while (node && !(node.x === start.x && node.y === start.y)) {
        path.unshift({ x: node.x, y: node.y });
        node = parent.get(key(node.x, node.y));
      }
      return path;
    }

    for (const d of dirs) {
      const nx = current.x + d.x;
      const ny = current.y + d.y;
      const k = key(nx, ny);

      if (nx < 0 || nx >= GRID_WIDTH || ny < 0 || ny >= GRID_HEIGHT) continue;
      if (visited.has(k)) continue;
      if (blocked.has(k)) continue;

      visited.add(k);
      parent.set(k, current);
      queue.push({ x: nx, y: ny });
    }
  }

  return []; // No path found
}

function buildBlockedSet(layout: OfficeLayout, occupiedTiles: Set<string>): Set<string> {
  const blocked = new Set<string>();

  // Walls block movement
  for (const tile of layout.tiles) {
    if (tile.type === "wall" || tile.type === "window") {
      blocked.add(key(tile.x, tile.y));
    }
  }

  // Furniture blocks movement (except chairs)
  for (const f of layout.furniture) {
    if (f.type === "chair") continue; // Characters sit on chairs
    for (let dx = 0; dx < f.width; dx++) {
      for (let dy = 0; dy < f.height; dy++) {
        blocked.add(key(f.x + dx, f.y + dy));
      }
    }
  }

  // Other characters' positions
  for (const k of occupiedTiles) {
    blocked.add(k);
  }

  return blocked;
}

function key(x: number, y: number): string {
  return `${x},${y}`;
}

export { key as tileKey };
