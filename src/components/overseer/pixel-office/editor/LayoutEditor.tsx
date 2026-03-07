"use client";

import { useCallback } from "react";
import type { OfficeLayout, FurnitureType, FurniturePlacement } from "../types";
import type { Camera } from "../types";
import { screenToGrid } from "../engine/camera";
import { GRID_WIDTH, GRID_HEIGHT } from "../constants";

interface LayoutEditorProps {
  layout: OfficeLayout;
  camera: Camera;
  selectedFurniture: FurnitureType | null;
  onLayoutChange: (layout: OfficeLayout) => void;
  onHover: (tile: { x: number; y: number } | null) => void;
}

let nextId = Date.now();

const FURNITURE_DEFAULTS: Record<FurnitureType, { width: number; height: number }> = {
  desk: { width: 2, height: 1 },
  chair: { width: 1, height: 1 },
  monitor: { width: 1, height: 1 },
  plant: { width: 1, height: 1 },
  bookshelf: { width: 2, height: 1 },
  water_cooler: { width: 1, height: 1 },
};

export function useLayoutEditor({
  layout,
  camera,
  selectedFurniture,
  onLayoutChange,
  onHover,
}: LayoutEditorProps) {
  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const grid = screenToGrid(sx, sy, camera);

      if (grid.x < 0 || grid.x >= GRID_WIDTH || grid.y < 0 || grid.y >= GRID_HEIGHT) return;

      if (selectedFurniture) {
        // Place furniture
        const defaults = FURNITURE_DEFAULTS[selectedFurniture];
        const newFurniture: FurniturePlacement = {
          id: `f-${nextId++}`,
          type: selectedFurniture,
          x: grid.x,
          y: grid.y,
          width: defaults.width,
          height: defaults.height,
        };
        onLayoutChange({
          ...layout,
          furniture: [...layout.furniture, newFurniture],
        });
      } else {
        // Remove furniture at click position
        const idx = layout.furniture.findIndex(
          (f) =>
            grid.x >= f.x &&
            grid.x < f.x + f.width &&
            grid.y >= f.y &&
            grid.y < f.y + f.height,
        );
        if (idx >= 0) {
          const updated = [...layout.furniture];
          updated.splice(idx, 1);
          onLayoutChange({ ...layout, furniture: updated });
        }
      }
    },
    [layout, camera, selectedFurniture, onLayoutChange],
  );

  const handleCanvasMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const grid = screenToGrid(sx, sy, camera);

      if (grid.x >= 0 && grid.x < GRID_WIDTH && grid.y >= 0 && grid.y < GRID_HEIGHT) {
        onHover(grid);
      } else {
        onHover(null);
      }
    },
    [camera, onHover],
  );

  const handleCanvasMouseLeave = useCallback(() => {
    onHover(null);
  }, [onHover]);

  return {
    handleCanvasClick,
    handleCanvasMouseMove,
    handleCanvasMouseLeave,
  };
}
