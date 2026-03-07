"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Users } from "lucide-react";

interface WorkerSnapshot {
  id: string;
  worker_id: string;
  worker_type: string;
  machine: string | null;
  session_id: string | null;
  project_id: string | null;
  project_path: string | null;
  status: "active" | "idle" | "offline";
  current_task: string | null;
  task_detail: unknown[];
  last_activity: string | null;
  scanned_at: string;
}

const STATUS_ICON: Record<string, string> = {
  active: "\u{1F7E2}",   // green circle
  idle: "\u{1F7E1}",     // yellow circle
  offline: "\u{26AB}",   // black circle
};

const TYPE_LABEL: Record<string, string> = {
  claude_code: "Claude Code",
  telegram_bot: "Telegram Bot",
  codex_cli: "Codex CLI",
  gemini_cli: "Gemini CLI",
};

function formatTimeAgo(dateStr: string | null): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "방금";
  if (mins < 60) return `${mins}분 전`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}

export function WorkerPanel({ projectId }: { projectId?: string }) {
  const [workers, setWorkers] = useState<WorkerSnapshot[]>([]);
  const [loading, setLoading] = useState(true);

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
    // 30초마다 갱신
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [projectId]);

  const activeCount = workers.filter((w) => w.status === "active").length;

  // status 순서: active → idle → offline
  const sorted = [...workers].sort((a, b) => {
    const order = { active: 0, idle: 1, offline: 2 };
    return (order[a.status] ?? 3) - (order[b.status] ?? 3);
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Users className="w-4 h-4" />
            워커 현황
          </CardTitle>
          <span className="text-xs text-muted-foreground">
            {activeCount > 0 ? (
              <span className="text-green-400">{activeCount} 활성</span>
            ) : (
              "비활성"
            )}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-xs text-muted-foreground">로딩 중...</div>
        ) : sorted.length === 0 ? (
          <div className="text-xs text-muted-foreground">활성 워커 없음</div>
        ) : (
          <div className="space-y-3">
            {sorted.map((w) => (
              <div
                key={w.worker_id}
                className="flex items-start gap-2 text-sm"
              >
                <span className="mt-0.5 text-base leading-none">
                  {STATUS_ICON[w.status] || STATUS_ICON.offline}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-zinc-200">
                      {TYPE_LABEL[w.worker_type] || w.worker_type}
                    </span>
                    <span className="text-xs text-zinc-500">
                      {w.machine || ""}
                    </span>
                    {w.status === "offline" && (
                      <span className="text-xs text-zinc-600">(오프라인)</span>
                    )}
                  </div>
                  {w.current_task && w.status !== "offline" && (
                    <p className="text-xs text-zinc-400 truncate mt-0.5">
                      {w.current_task}
                    </p>
                  )}
                  <p className="text-xs text-zinc-600 mt-0.5">
                    {w.status === "idle"
                      ? `대기 중 \u00B7 ${formatTimeAgo(w.last_activity)}`
                      : formatTimeAgo(w.last_activity)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
