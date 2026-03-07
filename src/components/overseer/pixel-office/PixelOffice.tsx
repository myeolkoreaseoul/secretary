'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import type { ProjectSummary } from '../ProjectCard';
import {
  PAN_MARGIN_FRACTION,
  ZOOM_DEFAULT_DPR_FACTOR,
  ZOOM_MAX,
  ZOOM_MIN,
  ZOOM_SCROLL_THRESHOLD,
} from './constants';
import { startGameLoop } from './engine/gameLoop';
import { OfficeState } from './engine/officeState';
import { renderFrame } from './engine/renderer';
import { loadLayout } from './layout/layoutStorage';
import { TILE_SIZE } from './types';

// ── Helpers ──────────────────────────────────────────────────────

/** Stable numeric ID from string project ID */
function projectIdToNum(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  }
  return h >>> 0; // unsigned 32-bit
}

interface AgentLabel {
  id: number;
  name: string;
  x: number;
  y: number;
  active: boolean;
  tool: string | null;
}

// ── Component ────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 10_000;

export function PixelOffice() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const officeRef = useRef<OfficeState | null>(null);
  const zoomRef = useRef(3);
  const panRef = useRef({ x: 0, y: 0 });
  const offsetRef = useRef({ offsetX: 0, offsetY: 0 });
  const sizeRef = useRef({ w: 0, h: 0 });
  const [labels, setLabels] = useState<AgentLabel[]>([]);
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const knownAgentsRef = useRef<Map<number, { name: string; status: string }>>(new Map());

  // ── Initialize office state ──
  useEffect(() => {
    const layout = loadLayout();
    officeRef.current = new OfficeState(layout);
  }, []);

  // ── Fetch project data & sync characters ──
  useEffect(() => {
    let cancelled = false;

    async function syncWorkers() {
      try {
        const res = await apiFetch('/api/overseer/projects');
        const data = await res.json();
        const projects: ProjectSummary[] = data.projects || [];
        const office = officeRef.current;
        if (!office || cancelled) return;

        const activeProjects = projects.filter((p) => p.status !== 'archived');
        const newIds = new Set<number>();

        for (const p of activeProjects) {
          const numId = projectIdToNum(p.id);
          newIds.add(numId);
          const known = knownAgentsRef.current.get(numId);
          // All non-archived projects sit at desks (active=typing, paused=typing slower)
          // Label color distinguishes active vs paused
          const tool = p.git_msg || null;

          if (!known) {
            // New project → add agent, always active so they stay seated
            office.addAgent(numId);
            office.setAgentActive(numId, true);
            office.setAgentTool(numId, tool);
            knownAgentsRef.current.set(numId, { name: p.name, status: p.status });
          } else {
            // Existing project → update tool
            office.setAgentTool(numId, tool);
            known.name = p.name;
            known.status = p.status;
          }
        }

        // Remove agents for projects that disappeared
        for (const [numId] of knownAgentsRef.current) {
          if (!newIds.has(numId)) {
            office.removeAgent(numId);
            knownAgentsRef.current.delete(numId);
          }
        }
      } catch {
        // silently retry next interval
      }
    }

    syncWorkers();
    const interval = setInterval(syncWorkers, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // ── Game loop ──
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const dpr = window.devicePixelRatio || 1;
    zoomRef.current = Math.max(ZOOM_MIN, Math.round(dpr * ZOOM_DEFAULT_DPR_FACTOR));

    function resize() {
      if (!canvas || !container) return;
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      sizeRef.current = { w: canvas.width, h: canvas.height };
    }

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    const stop = startGameLoop(canvas, {
      update: (dt) => {
        officeRef.current?.update(dt);
      },
      render: (ctx) => {
        const office = officeRef.current;
        if (!office) return;

        const { w, h } = sizeRef.current;
        const zoom = zoomRef.current;
        const pan = panRef.current;

        const result = renderFrame(
          ctx,
          w,
          h,
          office.tileMap,
          office.furniture,
          office.getCharacters(),
          zoom,
          pan.x,
          pan.y,
          {
            selectedAgentId: office.selectedAgentId,
            hoveredAgentId: office.hoveredAgentId,
            hoveredTile: office.hoveredTile,
            seats: office.seats,
            characters: office.characters,
          },
          undefined,
          office.layout.tileColors,
          office.layout.cols,
          office.layout.rows,
        );

        offsetRef.current = result;

        // Update labels for HTML overlay
        const chars = office.getCharacters();
        const newLabels: AgentLabel[] = [];
        for (const ch of chars) {
          if (ch.matrixEffect === 'despawn') continue;
          const known = knownAgentsRef.current.get(ch.id);
          if (!known) continue;
          const dpr = window.devicePixelRatio || 1;
          newLabels.push({
            id: ch.id,
            name: known.name,
            x: (result.offsetX + ch.x * zoom) / dpr,
            y: (result.offsetY + ch.y * zoom - 30 * zoom) / dpr,
            active: known.status === 'active',
            tool: ch.currentTool,
          });
        }
        setLabels(newLabels);
      },
    });

    return () => {
      stop();
      ro.disconnect();
    };
  }, []);

  // ── Mouse interaction ──
  const getWorldPos = useCallback(
    (e: React.MouseEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const canvasX = (e.clientX - rect.left) * dpr;
      const canvasY = (e.clientY - rect.top) * dpr;
      const zoom = zoomRef.current;
      const worldX = (canvasX - offsetRef.current.offsetX) / zoom;
      const worldY = (canvasY - offsetRef.current.offsetY) / zoom;
      return { worldX, worldY, canvasX, canvasY };
    },
    [],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const office = officeRef.current;
      if (!office) return;
      const pos = getWorldPos(e);
      if (!pos) return;
      const id = office.getCharacterAt(pos.worldX, pos.worldY);
      office.hoveredAgentId = id;
      setHoveredId(id);
      // Update hovered tile
      const col = Math.floor(pos.worldX / TILE_SIZE);
      const row = Math.floor(pos.worldY / TILE_SIZE);
      office.hoveredTile = col >= 0 && row >= 0 ? { col, row } : null;
    },
    [getWorldPos],
  );

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      const office = officeRef.current;
      if (!office) return;
      const pos = getWorldPos(e);
      if (!pos) return;
      const id = office.getCharacterAt(pos.worldX, pos.worldY);
      office.selectedAgentId = id;
    },
    [getWorldPos],
  );

  // ── Zoom (wheel) ──
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY;
    if (Math.abs(delta) < ZOOM_SCROLL_THRESHOLD * 0.3) return;
    const oldZoom = zoomRef.current;
    const newZoom = delta < 0
      ? Math.min(oldZoom + 1, ZOOM_MAX)
      : Math.max(oldZoom - 1, ZOOM_MIN);
    if (newZoom === oldZoom) return;

    // Zoom toward cursor
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const cx = (e.clientX - rect.left) * dpr;
    const cy = (e.clientY - rect.top) * dpr;
    const { w, h } = sizeRef.current;
    const office = officeRef.current;
    if (!office) return;
    const cols = office.layout.cols;
    const rows = office.layout.rows;

    const oldMapW = cols * TILE_SIZE * oldZoom;
    const oldMapH = rows * TILE_SIZE * oldZoom;
    const oldOx = Math.floor((w - oldMapW) / 2) + Math.round(panRef.current.x);
    const oldOy = Math.floor((h - oldMapH) / 2) + Math.round(panRef.current.y);

    const worldX = (cx - oldOx) / oldZoom;
    const worldY = (cy - oldOy) / oldZoom;

    const newMapW = cols * TILE_SIZE * newZoom;
    const newMapH = rows * TILE_SIZE * newZoom;
    const newCenterOx = Math.floor((w - newMapW) / 2);
    const newCenterOy = Math.floor((h - newMapH) / 2);

    panRef.current = {
      x: cx - worldX * newZoom - newCenterOx,
      y: cy - worldY * newZoom - newCenterOy,
    };
    zoomRef.current = newZoom;
  }, []);

  // ── Pan (middle mouse drag) ──
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0, px: 0, py: 0 });

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 1) {
      // Middle mouse
      e.preventDefault();
      isPanningRef.current = true;
      panStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        px: panRef.current.x,
        py: panRef.current.y,
      };
    }
  }, []);

  useEffect(() => {
    const handleUp = () => {
      isPanningRef.current = false;
    };
    const handleMove = (e: MouseEvent) => {
      if (!isPanningRef.current) return;
      const dpr = window.devicePixelRatio || 1;
      panRef.current = {
        x: panStartRef.current.px + (e.clientX - panStartRef.current.x) * dpr,
        y: panStartRef.current.py + (e.clientY - panStartRef.current.y) * dpr,
      };
    };
    window.addEventListener('mouseup', handleUp);
    window.addEventListener('mousemove', handleMove);
    return () => {
      window.removeEventListener('mouseup', handleUp);
      window.removeEventListener('mousemove', handleMove);
    };
  }, []);

  return (
    <div className="relative rounded-lg border border-border overflow-hidden bg-black" style={{ height: 420 }}>
      <div ref={containerRef} className="absolute inset-0">
        <canvas
          ref={canvasRef}
          className="block"
          onMouseMove={handleMouseMove}
          onClick={handleClick}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          style={{ cursor: hoveredId !== null ? 'pointer' : 'default' }}
        />
      </div>
      {/* Agent name labels */}
      <div className="absolute inset-0 pointer-events-none" style={{ overflow: 'hidden' }}>
        {labels.map((l) => (
          <div
            key={l.id}
            className="absolute text-center pointer-events-none"
            style={{
              left: l.x,
              top: l.y,
              transform: 'translateX(-50%)',
              whiteSpace: 'nowrap',
            }}
          >
            <div
              className="text-[10px] font-bold px-1 rounded"
              style={{
                color: l.active ? '#4ade80' : '#a1a1aa',
                textShadow: '0 0 3px rgba(0,0,0,0.8), 0 1px 2px rgba(0,0,0,0.9)',
              }}
            >
              {l.name}
            </div>
            {l.tool && (
              <div
                className="text-[8px] px-1 rounded mt-0.5 max-w-[120px] truncate"
                style={{
                  color: '#d4d4d8',
                  textShadow: '0 0 3px rgba(0,0,0,0.8)',
                }}
              >
                {l.tool}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
