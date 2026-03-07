"use client";

import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Building2,
  FolderOpen,
  Folder,
} from "lucide-react";
import { ProjectCard, type ProjectSummary } from "./ProjectCard";

interface TreeCategory {
  id: string;
  name: string;
  type: "category";
  projects: string[];
}

interface TreeOrg {
  id: string;
  name: string;
  type: "org";
  children?: TreeCategory[];
  projects?: string[];
}

interface TreeRoot {
  id: string;
  name: string;
  children: TreeOrg[];
}

interface ApiResponse {
  tree: TreeRoot;
  projects: ProjectSummary[];
}

export function ProjectGrid() {
  const [tree, setTree] = useState<TreeRoot | null>(null);
  const [projectMap, setProjectMap] = useState<Record<string, ProjectSummary>>(
    {}
  );
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  async function fetchProjects() {
    setLoading(true);
    try {
      const resp = await fetch("/api/overseer/projects");
      const data: ApiResponse = await resp.json();
      setTree(data.tree);
      const map: Record<string, ProjectSummary> = {};
      for (const p of data.projects || []) {
        map[p.name] = p;
      }
      setProjectMap(map);
    } catch {
      setTree(null);
      setProjectMap({});
    } finally {
      setLoading(false);
    }
  }

  async function triggerScan() {
    setScanning(true);
    try {
      await fetch("/api/overseer/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "all" }),
      });
      await fetchProjects();
    } finally {
      setScanning(false);
    }
  }

  useEffect(() => {
    fetchProjects();
  }, []);

  function toggle(id: string) {
    setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  const allProjects = Object.values(projectMap);
  const active = allProjects.filter((p) => p.status === "active").length;
  const paused = allProjects.filter((p) => p.status === "paused").length;
  const warnings = allProjects.filter(
    (p) =>
      (p.git_unpushed ?? 0) >= 10 ||
      (p.git_uncommitted ?? 0) >= 20 ||
      ((p.junk_mb ?? 0) - (p.node_modules_mb ?? 0)) >= 100
  ).length;

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
    );
  }

  function renderProjects(names: string[]) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {names.map((name) => {
          const proj = projectMap[name];
          if (proj) {
            return <ProjectCard key={name} project={proj} />;
          }
          // 프로젝트 데이터 없음 (보류/미스캔)
          return (
            <div
              key={name}
              className="rounded-xl border border-dashed border-zinc-700 p-4 text-sm text-zinc-500"
            >
              {name} <span className="text-xs">(데이터 없음)</span>
            </div>
          );
        })}
      </div>
    );
  }

  function renderCategory(cat: TreeCategory) {
    const isCollapsed = collapsed[cat.id];
    const catProjects = cat.projects || [];
    const hasWarning = catProjects.some((n) => {
      const p = projectMap[n];
      return (
        p &&
        ((p.git_unpushed ?? 0) >= 10 ||
          (p.git_uncommitted ?? 0) >= 20 ||
          ((p.junk_mb ?? 0) - (p.node_modules_mb ?? 0)) >= 100)
      );
    });

    return (
      <div key={cat.id} className="ml-6">
        <button
          onClick={() => toggle(cat.id)}
          className="flex items-center gap-2 py-1.5 text-sm font-medium text-zinc-300 hover:text-white transition-colors w-full text-left"
        >
          {isCollapsed ? (
            <>
              <ChevronRight className="w-3.5 h-3.5" />
              <Folder className="w-3.5 h-3.5 text-zinc-500" />
            </>
          ) : (
            <>
              <ChevronDown className="w-3.5 h-3.5" />
              <FolderOpen className="w-3.5 h-3.5 text-yellow-500/70" />
            </>
          )}
          <span>{cat.name}</span>
          <span className="text-xs text-zinc-600">
            ({catProjects.length})
          </span>
          {hasWarning && (
            <span className="w-1.5 h-1.5 rounded-full bg-orange-400 inline-block" />
          )}
        </button>
        {!isCollapsed && catProjects.length > 0 && (
          <div className="ml-6 mt-2 mb-4">
            {renderProjects(catProjects)}
          </div>
        )}
      </div>
    );
  }

  function renderOrg(org: TreeOrg) {
    const isCollapsed = collapsed[org.id];
    const hasCategories = org.children && org.children.length > 0;
    const directProjects = org.projects || [];

    return (
      <div key={org.id} className="mb-2">
        <button
          onClick={() => toggle(org.id)}
          className="flex items-center gap-2 py-2 text-base font-semibold text-zinc-200 hover:text-white transition-colors w-full text-left"
        >
          {isCollapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
          <Building2 className="w-4 h-4 text-blue-400/70" />
          <span>{org.name}</span>
        </button>
        {!isCollapsed && (
          <div>
            {hasCategories &&
              org.children!.map((cat) => renderCategory(cat))}
            {directProjects.length > 0 && (
              <div className="ml-6 mt-2 mb-4">
                {renderProjects(directProjects)}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header stats */}
      <div className="flex items-center justify-between">
        <div className="flex gap-4 text-sm">
          <span className="text-green-400">{active} 활성</span>
          <span className="text-yellow-400">{paused} 일시정지</span>
          {warnings > 0 && (
            <span className="text-orange-400">{warnings} 주의</span>
          )}
          <span className="text-zinc-500">
            {allProjects.length} 프로젝트
          </span>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              // 전체 펼치기/접기 토글
              const allIds = tree?.children
                .flatMap((org) => [org.id, ...(org.children?.map((c) => c.id) || [])])
                || [];
              const allCollapsed = allIds.every((id) => collapsed[id]);
              const newState: Record<string, boolean> = {};
              allIds.forEach((id) => (newState[id] = !allCollapsed));
              setCollapsed(newState);
            }}
            className="text-xs"
          >
            전체 {Object.values(collapsed).every(Boolean) ? "펼치기" : "접기"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={triggerScan}
            disabled={scanning}
            className="text-xs"
          >
            <RefreshCw
              className={`w-3 h-3 mr-1 ${scanning ? "animate-spin" : ""}`}
            />
            {scanning ? "스캔 중..." : "전체 스캔"}
          </Button>
        </div>
      </div>

      {/* Tree */}
      {tree ? (
        <div className="space-y-1">
          {tree.children.map((org) => renderOrg(org))}
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          <p>데이터를 불러올 수 없습니다.</p>
        </div>
      )}
    </div>
  );
}
