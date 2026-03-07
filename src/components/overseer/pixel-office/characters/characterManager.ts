import type { Character, OfficeLayout, WorkerSnapshot } from "../types";
import { TILE_SIZE, DOOR_POSITION, LOUNGE_AREA } from "../constants";
import { findPath, tileKey } from "./pathfinding";
import { createCharacter } from "./characterState";

// Persistent desk assignment map (workerId → deskId)
const deskAssignments = new Map<string, string>();

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
  const occupiedTiles = new Set<string>();

  // Clean up desk assignments for workers that no longer exist
  for (const [workerId] of deskAssignments) {
    if (!snapshotMap.has(workerId)) {
      deskAssignments.delete(workerId);
    }
  }

  // Collect currently assigned desk IDs
  const assignedDesks = new Set<string>(deskAssignments.values());

  // Update existing characters
  for (const char of existing) {
    const snap = snapshotMap.get(char.workerId);

    if (!snap) {
      // Worker disappeared → reroute to door (fix #8: always reroute)
      deskAssignments.delete(char.workerId);
      char.status = "offline";
      char.action = "walking";
      char.path = findPath(
        { x: char.targetX, y: char.targetY },
        DOOR_POSITION,
        layout,
        occupiedTiles,
      );
      // Fix #3: if no path, teleport to door and mark for removal
      if (char.path.length === 0) {
        continue; // Remove character immediately
      }
      result.push(char);
      occupiedTiles.add(tileKey(char.targetX, char.targetY));
      continue;
    }

    // Update from snapshot
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
        // Fix #2: persist desk assignment
        deskAssignments.set(snap.worker_id, desk.id);
        assignedDesks.add(desk.id);
        const chairPos = { x: desk.x, y: desk.y + 1 };
        const path = findPath(DOOR_POSITION, chairPos, layout, occupiedTiles);
        // Fix #3: only walk if path found
        if (path.length > 0) {
          char.path = path;
          char.targetX = chairPos.x;
          char.targetY = chairPos.y;
        } else {
          // Teleport to destination
          char.x = chairPos.x * TILE_SIZE;
          char.y = chairPos.y * TILE_SIZE;
          char.targetX = chairPos.x;
          char.targetY = chairPos.y;
          char.action = "typing";
        }
      }
    } else if (snap.status === "idle") {
      const loungePos = getRandomLoungePosition();
      const path = findPath(DOOR_POSITION, loungePos, layout, occupiedTiles);
      if (path.length > 0) {
        char.path = path;
        char.targetX = loungePos.x;
        char.targetY = loungePos.y;
      } else {
        // Teleport to lounge
        char.x = loungePos.x * TILE_SIZE;
        char.y = loungePos.y * TILE_SIZE;
        char.targetX = loungePos.x;
        char.targetY = loungePos.y;
        char.action = "idle";
      }
    } else {
      // offline — place near door
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
    // Check existing assignment first
    let deskId = deskAssignments.get(char.workerId);
    let desk = deskId
      ? layout.furniture.find((f) => f.id === deskId)
      : null;

    if (!desk) {
      desk = findFreeDesk(layout, assignedDesks);
      if (desk) {
        deskAssignments.set(char.workerId, desk.id);
        assignedDesks.add(desk.id);
      }
    }

    if (desk) {
      const chairPos = { x: desk.x, y: desk.y + 1 };
      const path = findPath(
        { x: char.targetX, y: char.targetY },
        chairPos,
        layout,
        occupiedTiles,
      );
      if (path.length > 0) {
        char.action = "walking";
        char.path = path;
      } else {
        // Teleport
        char.x = chairPos.x * TILE_SIZE;
        char.y = chairPos.y * TILE_SIZE;
        char.targetX = chairPos.x;
        char.targetY = chairPos.y;
        char.action = "typing";
      }
    }
  } else if (snap.status === "idle") {
    // Release desk
    deskAssignments.delete(char.workerId);
    const loungePos = getRandomLoungePosition();
    const path = findPath(
      { x: char.targetX, y: char.targetY },
      loungePos,
      layout,
      occupiedTiles,
    );
    if (path.length > 0) {
      char.action = "walking";
      char.path = path;
    } else {
      char.x = loungePos.x * TILE_SIZE;
      char.y = loungePos.y * TILE_SIZE;
      char.targetX = loungePos.x;
      char.targetY = loungePos.y;
      char.action = "idle";
    }
  } else {
    // offline — release desk
    deskAssignments.delete(char.workerId);
    char.action = "offline";
  }
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
