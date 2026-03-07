"use client";

import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { ProjectCard, type ProjectSummary } from "./ProjectCard";

export function ProjectGrid() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);

  async function fetchProjects() {
    setLoading(true);
    try {
      const resp = await fetch("/api/overseer/projects");
      const data = await resp.json();
      setProjects(Array.isArray(data) ? data : []);
    } catch {
      setProjects([]);
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

  const active = projects.filter((p) => p.status === "active");
  const paused = projects.filter((p) => p.status === "paused");
  const archived = projects.filter((p) => p.status === "archived");
  const warnings = projects.filter(
    (p) =>
      (p.git_unpushed ?? 0) >= 10 ||
      (p.git_uncommitted ?? 0) >= 20 ||
      (p.junk_mb ?? 0) >= 100
  );

  return (
    <div className="space-y-6">
      {/* Header stats */}
      <div className="flex items-center justify-between">
        <div className="flex gap-4 text-sm">
          <span className="text-green-400">{active.length} 활성</span>
          <span className="text-yellow-400">{paused.length} 일시정지</span>
          {warnings.length > 0 && (
            <span className="text-orange-400">{warnings.length} 주의</span>
          )}
          <span className="text-zinc-500">{archived.length} 보관</span>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={triggerScan}
          disabled={scanning}
          className="text-xs"
        >
          <RefreshCw className={`w-3 h-3 mr-1 ${scanning ? "animate-spin" : ""}`} />
          {scanning ? "스캔 중..." : "전체 스캔"}
        </Button>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-56 rounded-xl" />
          ))}
        </div>
      ) : projects.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p>등록된 프로젝트가 없습니다.</p>
          <p className="text-xs mt-1">
            python3 -m scripts.overseer.main 을 실행하여 데이터를 수집하세요.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}
    </div>
  );
}
