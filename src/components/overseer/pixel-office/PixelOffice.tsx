"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Users, Pencil, X } from "lucide-react";
import type { WorkerSnapshot, OfficeLayout, FurnitureType, Camera } from "./types";
import { loadLayout, saveLayout, resetLayout } from "./layout/layoutStorage";
import { initCamera, setupHiDPI, screenToGrid } from "./engine/camera";
import { createGameLoop } from "./engine/gameLoop";
import { render } from "./engine/renderer";
import { updateCharacter } from "./characters/characterState";
import { syncCharacters } from "./characters/characterManager";
import { EditorToolbar } from "./editor/EditorToolbar";
import { GRID_WIDTH, GRID_HEIGHT } from "./constants";

interface PixelOfficeProps {
  projectId?: string;
}

export function PixelOffice({ projectId }: PixelOfficeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [workers, setWorkers] = useState<WorkerSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [selectedFurniture, setSelectedFurniture] = useState<FurnitureType | null>(null);

  // Mutable refs for game loop access (no React state to avoid re-renders)
  const layoutRef = useRef<OfficeLayout>(loadLayout());
  const charactersRef = useRef<ReturnType<typeof syncCharacters>>([]);
  const cameraRef = useRef<Camera>({ scale: 1, offsetX: 0, offsetY: 0, dpr: 1 });
  const editingRef = useRef(false);
  const hoveredTileRef = useRef<{ x: number; y: number } | null>(null);
  const selectedFurnitureRef = useRef<FurnitureType | null>(null);

  // Keep refs in sync
  editingRef.current = editing;
  selectedFurnitureRef.current = selectedFurniture;

  const [layout, setLayout] = useState<OfficeLayout>(layoutRef.current);

  // Fetch worker data with AbortController (fix #4)
  useEffect(() => {
    const controller = new AbortController();
    let interval: ReturnType<typeof setInterval>;

    async function load() {
      try {
        const url = projectId
          ? `/api/overseer/workers?project_id=${projectId}`
          : "/api/overseer/workers";
        const resp = await fetch(url, { signal: controller.signal });
        const data = await resp.json();
        setWorkers(Array.isArray(data) ? data : []);
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setWorkers([]);
      } finally {
        setLoading(false);
      }
    }
    load();
    interval = setInterval(load, 30000);
    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, [projectId]);

  // Sync characters when workers change
  useEffect(() => {
    if (loading) return;
    charactersRef.current = syncCharacters(
      charactersRef.current,
      workers,
      layoutRef.current,
    );
  }, [workers, loading]);

  // Game loop setup
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    function resize() {
      if (!container || !canvas || !ctx) return;
      const rect = container.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      const cam = initCamera(w, h);
      cameraRef.current = cam;
      setupHiDPI(canvas, ctx, w, h, cam.dpr);
    }

    resize();

    const ro = new ResizeObserver(resize);
    ro.observe(container);

    // Fix #5: render only when update ran (inside accumulator loop)
    const stopLoop = createGameLoop(
      (delta) => {
        if (editingRef.current) return;
        const chars = charactersRef.current;
        for (let i = chars.length - 1; i >= 0; i--) {
          const removed = updateCharacter(chars[i], delta);
          if (removed) {
            chars.splice(i, 1);
          }
        }
      },
      () => {
        if (!ctx) return;
        const rect = container!.getBoundingClientRect();
        render(
          ctx,
          rect.width,
          rect.height,
          cameraRef.current,
          layoutRef.current,
          charactersRef.current,
          editingRef.current,
          hoveredTileRef.current,
        );
      },
    );

    return () => {
      stopLoop();
      ro.disconnect();
    };
  }, []);

  // Editor handlers — use cameraRef.current at call time (fix #1)
  const handleLayoutChange = useCallback((newLayout: OfficeLayout) => {
    layoutRef.current = newLayout;
    setLayout(newLayout);
  }, []);

  const handleSave = useCallback(() => {
    saveLayout(layoutRef.current);
  }, []);

  const handleReset = useCallback(() => {
    const def = resetLayout();
    layoutRef.current = def;
    setLayout(def);
  }, []);

  // Fix #1: Read cameraRef at event time, not at hook creation time
  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const camera = cameraRef.current;
    const currentLayout = layoutRef.current;
    const furniture = selectedFurnitureRef.current;
    const rect = e.currentTarget.getBoundingClientRect();
    const grid = screenToGrid(e.clientX - rect.left, e.clientY - rect.top, camera);

    if (grid.x < 0 || grid.x >= GRID_WIDTH || grid.y < 0 || grid.y >= GRID_HEIGHT) return;

    if (furniture) {
      const defaults: Record<string, { width: number; height: number }> = {
        desk: { width: 2, height: 1 }, chair: { width: 1, height: 1 },
        monitor: { width: 1, height: 1 }, plant: { width: 1, height: 1 },
        bookshelf: { width: 2, height: 1 }, water_cooler: { width: 1, height: 1 },
      };
      const d = defaults[furniture] || { width: 1, height: 1 };
      // Fix #9: bounds check
      if (grid.x + d.width > GRID_WIDTH || grid.y + d.height > GRID_HEIGHT) return;
      handleLayoutChange({
        ...currentLayout,
        furniture: [...currentLayout.furniture, {
          id: `f-${Date.now()}`,
          type: furniture,
          x: grid.x, y: grid.y,
          width: d.width, height: d.height,
        }],
      });
    } else {
      const idx = currentLayout.furniture.findIndex(
        (f) => grid.x >= f.x && grid.x < f.x + f.width && grid.y >= f.y && grid.y < f.y + f.height,
      );
      if (idx >= 0) {
        const updated = [...currentLayout.furniture];
        updated.splice(idx, 1);
        handleLayoutChange({ ...currentLayout, furniture: updated });
      }
    }
  }, [handleLayoutChange]);

  const handleCanvasMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const camera = cameraRef.current;
    const rect = e.currentTarget.getBoundingClientRect();
    const grid = screenToGrid(e.clientX - rect.left, e.clientY - rect.top, camera);
    // Fix #7: only update if tile changed
    const prev = hoveredTileRef.current;
    if (prev && prev.x === grid.x && prev.y === grid.y) return;
    if (grid.x >= 0 && grid.x < GRID_WIDTH && grid.y >= 0 && grid.y < GRID_HEIGHT) {
      hoveredTileRef.current = grid;
    } else {
      hoveredTileRef.current = null;
    }
  }, []);

  const handleCanvasMouseLeave = useCallback(() => {
    hoveredTileRef.current = null;
  }, []);

  const activeCount = workers.filter((w) => w.status === "active").length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Users className="w-4 h-4" />
            워커 현황
          </CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {activeCount > 0 ? (
                <span className="text-green-400">{activeCount} 활성</span>
              ) : (
                "비활성"
              )}
            </span>
            <button
              onClick={() => {
                setEditing(!editing);
                setSelectedFurniture(null);
                hoveredTileRef.current = null;
              }}
              className={`p-1 rounded transition-colors ${
                editing
                  ? "bg-blue-600 text-white"
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
              }`}
              aria-label={editing ? "편집 종료" : "레이아웃 편집"}
            >
              {editing ? <X className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {editing && (
          <div className="mb-2">
            <EditorToolbar
              selected={selectedFurniture}
              onSelect={setSelectedFurniture}
              onReset={handleReset}
              onSave={handleSave}
            />
          </div>
        )}
        <div
          ref={containerRef}
          className="relative w-full bg-zinc-950 rounded-lg overflow-hidden"
          style={{ aspectRatio: "20 / 12" }}
        >
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground z-10" aria-live="polite">
              로딩 중...
            </div>
          )}
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full"
            onClick={editing ? handleCanvasClick : undefined}
            onMouseMove={editing ? handleCanvasMouseMove : undefined}
            onMouseLeave={editing ? handleCanvasMouseLeave : undefined}
            style={{ cursor: editing ? (selectedFurniture ? "crosshair" : "pointer") : "default" }}
          />
        </div>
      </CardContent>
    </Card>
  );
}
