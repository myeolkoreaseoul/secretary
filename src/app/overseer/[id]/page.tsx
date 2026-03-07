"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ExternalLink, Github } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/overseer/StatusBadge";
import { GitSummary } from "@/components/overseer/GitSummary";
import { FsHealthPanel } from "@/components/overseer/FsHealthPanel";
import { ServiceMonitor } from "@/components/overseer/ServiceMonitor";
import { ActionPanel } from "@/components/overseer/ActionPanel";
import { TrendChart } from "@/components/overseer/TrendChart";
import type { ProjectSummary } from "@/components/overseer/ProjectCard";

interface FsSnapshot {
  scanned_at: string;
  total_size_mb: number;
  junk_mb: number;
}

interface GitSnapshot {
  scanned_at: string;
  unpushed: number;
  uncommitted: number;
}

export default function ProjectDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [project, setProject] = useState<ProjectSummary | null>(null);
  const [fsHistory, setFsHistory] = useState<FsSnapshot[]>([]);
  const [gitHistory, setGitHistory] = useState<GitSnapshot[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [projRes, fsRes, gitRes] = await Promise.all([
          fetch("/api/overseer/projects"),
          fetch(`/api/overseer/fs-health?project_id=${id}`),
          fetch(`/api/overseer/services?project_id=${id}`),
        ]);
        const projects = await projRes.json();
        const proj = Array.isArray(projects)
          ? projects.find((p: ProjectSummary) => p.id === id)
          : null;
        setProject(proj || null);

        const fs = await fsRes.json();
        setFsHistory(Array.isArray(fs) ? fs : []);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        프로젝트를 찾을 수 없습니다.
      </div>
    );
  }

  const sizeTrend = fsHistory
    .map((s) => ({
      date: s.scanned_at?.slice(0, 10) ?? "",
      value: s.total_size_mb,
    }))
    .reverse();

  return (
    <div className="space-y-6">
      {/* Back + Header */}
      <div className="flex items-center gap-3">
        <Link href="/overseer">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4 mr-1" />
            목록
          </Button>
        </Link>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{project.name}</h1>
            <StatusBadge status={project.status} />
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {project.description}
          </p>
          <p className="text-xs text-zinc-600 mt-1 font-mono">{project.path}</p>
        </div>
        <div className="flex gap-2">
          {project.github_repo && (
            <a
              href={`https://github.com/${project.github_repo}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button variant="outline" size="sm">
                <Github className="w-3 h-3 mr-1" />
                GitHub
              </Button>
            </a>
          )}
          {project.notion_id && (
            <a
              href={`https://notion.so/${project.notion_id.replace(/-/g, "")}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button variant="outline" size="sm">
                <ExternalLink className="w-3 h-3 mr-1" />
                Notion
              </Button>
            </a>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">개요</TabsTrigger>
          <TabsTrigger value="trends">트렌드</TabsTrigger>
          <TabsTrigger value="actions">액션</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Git 상태</CardTitle>
              </CardHeader>
              <CardContent>
                <GitSummary data={project} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">파일시스템</CardTitle>
              </CardHeader>
              <CardContent>
                <FsHealthPanel data={project} />
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">서비스</CardTitle>
            </CardHeader>
            <CardContent>
              <ServiceMonitor data={project} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="trends" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">용량 추이</CardTitle>
            </CardHeader>
            <CardContent>
              <TrendChart data={sizeTrend} label="총 용량 (MB)" color="#3b82f6" />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="actions" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">프로젝트 관리</CardTitle>
            </CardHeader>
            <CardContent>
              <ActionPanel projectId={project.id} projectName={project.name} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
