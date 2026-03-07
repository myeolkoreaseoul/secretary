import type { Character, OfficeLayout, WorkerSnapshot } from "../types";
import { TILE_SIZE, DOOR_POSITION, LOUNGE_AREA } from "../constants";
import { findPath, tileKey } from "./pathfinding";
import { createCharacter } from "./characterState";

/**
 * Synchronize characters with worker snapshots.
 * - New workers → spawn at door, walk to desk or lounge
 * - Status changed → update action and path
 * - Removed workers → walk to door and despawn
 */
export function syncCharacters(
  existing: Character[],
  snapshots: WorkerSnapshot[],
  layout: OfficeLayout,
): Character[] {
  const snapshotMap = new Map(snapshots.map((s) => [s.worker_id, s]));
  const result: Character[] = [];
  const assignedDesks = new Set<string>();
  const occupiedTiles = new Set<string>();

  // Track existing desk assignments
  for (const char of existing) {
    if (char.action === "typing" || (char.action === "walking" && char.status === "active")) {
      const deskId = findAssignedDesk(char.workerId, layout);
      if (deskId) assignedDesks.add(deskId);
    }
  }

  // Update existing characters
  for (const char of existing) {
    const snap = snapshotMap.get(char.workerId);

    if (!snap) {
      // Worker disappeared → walk to door
      if (char.action !== "walking" || char.path.length === 0) {
        char.status = "offline";
        char.action = "walking";
        char.path = findPath(
          { x: char.targetX, y: char.targetY },
          DOOR_POSITION,
          layout,
          occupiedTiles,
        );
        if (char.path.length === 0) {
          // Can't path to door, just remove
          continue;
        }
      }
      result.push(char);
      occupiedTiles.add(tileKey(char.targetX, char.targetY));
      continue;
    }

    // Update status
    const oldStatus = char.status;
    char.status = snap.status;
    char.currentTask = snap.current_task;

    if (snap.status !== oldStatus) {
      handleStatusChange(char, snap, layout, occupiedTiles, assignedDesks);
    }

    snapshotMap.delete(char.workerId);
    result.push(char);
    occupiedTiles.add(tileKey(char.targetX, char.targetY));
  }

  // Spawn new characters
  for (const [, snap] of snapshotMap) {
    const char = createCharacter(
      snap.worker_id,
      snap.worker_type,
      snap.machine,
      snap.status,
      snap.current_task,
      DOOR_POSITION.x,
      DOOR_POSITION.y,
    );

    if (snap.status === "active") {
      const desk = findFreeDesk(layout, assignedDesks);
      if (desk) {
        assignedDesks.add(desk.id);
        // Walk to chair position (y + 1 from desk)
        const chairPos = { x: desk.x, y: desk.y + 1 };
        char.path = findPath(
          DOOR_POSITION,
          chairPos,
          layout,
          occupiedTiles,
        );
        char.targetX = chairPos.x;
        char.targetY = chairPos.y;
      }
    } else if (snap.status === "idle") {
      const loungePos = getRandomLoungePosition();
      char.path = findPath(DOOR_POSITION, loungePos, layout, occupiedTiles);
      char.targetX = loungePos.x;
      char.targetY = loungePos.y;
    } else {
      // offline — place at door, no movement
      char.action = "offline";
      char.x = DOOR_POSITION.x * TILE_SIZE;
      char.y = (DOOR_POSITION.y + 1) * TILE_SIZE;
      char.targetX = DOOR_POSITION.x;
      char.targetY = DOOR_POSITION.y + 1;
    }

    result.push(char);
    occupiedTiles.add(tileKey(char.targetX, char.targetY));
  }

  return result;
}

function handleStatusChange(
  char: Character,
  snap: WorkerSnapshot,
  layout: OfficeLayout,
  occupiedTiles: Set<string>,
  assignedDesks: Set<string>,
): void {
  if (snap.status === "active") {
    const desk = findFreeDesk(layout, assignedDesks);
    if (desk) {
      assignedDesks.add(desk.id);
      const chairPos = { x: desk.x, y: desk.y + 1 };
      char.action = "walking";
      char.path = findPath(
        { x: char.targetX, y: char.targetY },
        chairPos,
        layout,
        occupiedTiles,
      );
    }
  } else if (snap.status === "idle") {
    const loungePos = getRandomLoungePosition();
    char.action = "walking";
    char.path = findPath(
      { x: char.targetX, y: char.targetY },
      loungePos,
      layout,
      occupiedTiles,
    );
  } else {
    // offline
    char.action = "offline";
  }
}

function findAssignedDesk(workerId: string, layout: OfficeLayout): string | null {
  const desk = layout.furniture.find(
    (f) => f.type === "desk" && f.assignedTo === workerId,
  );
  return desk?.id ?? null;
}

function findFreeDesk(
  layout: OfficeLayout,
  assignedDesks: Set<string>,
): OfficeLayout["furniture"][number] | null {
  return (
    layout.furniture.find(
      (f) => f.type === "desk" && !assignedDesks.has(f.id),
    ) ?? null
  );
}

function getRandomLoungePosition(): { x: number; y: number } {
  const x = LOUNGE_AREA.x + Math.floor(Math.random() * LOUNGE_AREA.width);
  const y = LOUNGE_AREA.y + Math.floor(Math.random() * LOUNGE_AREA.height);
  return { x, y };
}
