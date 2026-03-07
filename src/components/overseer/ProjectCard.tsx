"use client";

import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "./StatusBadge";
import { GitSummary } from "./GitSummary";
import { FsHealthPanel } from "./FsHealthPanel";
import { ServiceMonitor } from "./ServiceMonitor";

export interface ProjectSummary {
  id: string;
  name: string;
  path: string;
  github_repo?: string;
  notion_id?: string;
  status: string;
  description?: string;
  tags?: string[];
  updated_at?: string;
  // git
  git_branch?: string;
  git_commit?: string;
  git_msg?: string;
  git_date?: string;
  git_unpushed?: number;
  git_uncommitted?: number;
  git_untracked?: number;
  git_stale?: number;
  git_scanned?: string;
  // fs
  total_size_mb?: number;
  node_modules_mb?: number;
  junk_mb?: number;
  file_count?: number;
  fs_scanned?: string;
  // service
  pm2_status?: string | null;
  pm2_name?: string | null;
  port?: number | null;
  port_open?: boolean;
  tunnel_url?: string | null;
  tunnel_alive?: boolean;
  svc_scanned?: string;
  // hierarchy
  parent_id?: string | null;
  auto_discovered?: boolean;
  category?: string | null;
}

function getHealthLevel(p: ProjectSummary): string {
  if ((p.git_unpushed ?? 0) >= 10) return "warning";
  if ((p.git_uncommitted ?? 0) >= 20) return "warning";
  if ((p.git_stale ?? 0) >= 5) return "warning";
  // node_modules 제외, 나머지 캐시만 판정
  const realJunk = (p.junk_mb ?? 0) - (p.node_modules_mb ?? 0);
  if (realJunk >= 100) return "warning";
  if ((p.total_size_mb ?? 0) >= 5120) return "warning";
  if (p.status === "paused") return "paused";
  return p.status;
}

export function ProjectCard({ project }: { project: ProjectSummary }) {
  const health = getHealthLevel(project);

  return (
    <Link href={`/overseer/${project.id}`}>
      <Card className="hover:border-zinc-600 transition-colors cursor-pointer h-full">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">
              {project.name}
            </CardTitle>
            <StatusBadge status={health} />
          </div>
          {project.description && (
            <p className="text-xs text-muted-foreground">{project.description}</p>
          )}
          {project.auto_discovered && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-blue-400 border-blue-400/30">
              자동감지
            </Badge>
          )}
          {project.tags && project.tags.length > 0 && (
            <div className="flex gap-1 flex-wrap mt-1">
              {project.tags.map((tag) => (
                <Badge key={tag} variant="outline" className="text-[10px] px-1.5 py-0">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          <GitSummary data={project} />
          <FsHealthPanel data={project} />
          <ServiceMonitor data={project} />
        </CardContent>
      </Card>
    </Link>
  );
}
