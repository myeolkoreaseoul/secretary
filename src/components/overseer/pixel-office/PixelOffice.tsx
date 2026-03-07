"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Users, Pencil, X } from "lucide-react";
import type { WorkerSnapshot, Character, OfficeLayout, FurnitureType, Camera } from "./types";
import { loadLayout, saveLayout, resetLayout } from "./layout/layoutStorage";
import { initCamera, setupHiDPI } from "./engine/camera";
import { createGameLoop } from "./engine/gameLoop";
import { render } from "./engine/renderer";
import { updateCharacter } from "./characters/characterState";
import { syncCharacters } from "./characters/characterManager";
import { EditorToolbar } from "./editor/EditorToolbar";
import { useLayoutEditor } from "./editor/LayoutEditor";

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
  const [hoveredTile, setHoveredTile] = useState<{ x: number; y: number } | null>(null);

  // Mutable refs for game loop access
  const layoutRef = useRef<OfficeLayout>(loadLayout());
  const charactersRef = useRef<Character[]>([]);
  const cameraRef = useRef<Camera>({ scale: 1, offsetX: 0, offsetY: 0, dpr: 1 });
  const editingRef = useRef(false);
  const hoveredTileRef = useRef<{ x: number; y: number } | null>(null);

  // Keep refs in sync
  editingRef.current = editing;
  hoveredTileRef.current = hoveredTile;

  const [layout, setLayout] = useState<OfficeLayout>(layoutRef.current);

  // Fetch worker data
  useEffect(() => {
    async function load() {
      try {
        const url = projectId
          ? `/api/overseer/workers?project_id=${projectId}`
          : "/api/overseer/workers";
        const resp = await fetch(url);
        const data = await resp.json();
        setWorkers(Array.isArray(data) ? data : []);
      } catch {
        setWorkers([]);
      } finally {
        setLoading(false);
      }
    }
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
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

    const stopLoop = createGameLoop(
      (delta) => {
        if (editingRef.current) return; // Pause characters during editing
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

  // Editor handlers
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

  const { handleCanvasClick, handleCanvasMouseMove, handleCanvasMouseLeave } =
    useLayoutEditor({
      layout,
      camera: cameraRef.current,
      selectedFurniture,
      onLayoutChange: handleLayoutChange,
      onHover: setHoveredTile,
    });

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
                setHoveredTile(null);
              }}
              className={`p-1 rounded transition-colors ${
                editing
                  ? "bg-blue-600 text-white"
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
              }`}
              title={editing ? "편집 종료" : "레이아웃 편집"}
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
            <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground z-10">
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
