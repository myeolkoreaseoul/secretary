"use client";

import { GitBranch, GitCommit, AlertTriangle } from "lucide-react";

interface GitData {
  git_branch?: string;
  git_commit?: string;
  git_msg?: string;
  git_date?: string;
  git_unpushed?: number;
  git_uncommitted?: number;
  git_untracked?: number;
  git_stale?: number;
  git_scanned?: string;
}

export function GitSummary({ data }: { data: GitData }) {
  if (!data.git_commit) {
    return <p className="text-xs text-muted-foreground">Git 데이터 없음</p>;
  }

  const warnings: string[] = [];
  if ((data.git_unpushed ?? 0) >= 10) warnings.push(`미푸시 ${data.git_unpushed}`);
  if ((data.git_uncommitted ?? 0) >= 20) warnings.push(`미커밋 ${data.git_uncommitted}`);
  if ((data.git_stale ?? 0) >= 5) warnings.push(`stale ${data.git_stale}`);

  const timeAgo = data.git_date
    ? formatTimeAgo(new Date(data.git_date))
    : "";

  return (
    <div className="space-y-1.5 text-xs">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <GitBranch className="w-3 h-3" />
        <span>{data.git_branch}</span>
        <span className="text-zinc-600">·</span>
        <GitCommit className="w-3 h-3" />
        <span className="font-mono">{data.git_commit?.slice(0, 7)}</span>
      </div>
      <p className="text-muted-foreground truncate" title={data.git_msg}>
        {data.git_msg}
      </p>
      <div className="flex gap-3 text-muted-foreground">
        {data.git_unpushed ? (
          <span className={data.git_unpushed >= 10 ? "text-orange-400" : ""}>
            ↑{data.git_unpushed} 미푸시
          </span>
        ) : null}
        {data.git_uncommitted ? (
          <span className={data.git_uncommitted >= 20 ? "text-orange-400" : ""}>
            ~{data.git_uncommitted} 변경
          </span>
        ) : null}
        {data.git_untracked ? (
          <span>?{data.git_untracked} 미추적</span>
        ) : null}
      </div>
      {warnings.length > 0 && (
        <div className="flex items-center gap-1 text-orange-400">
          <AlertTriangle className="w-3 h-3" />
          <span>{warnings.join(", ")}</span>
        </div>
      )}
      {timeAgo && (
        <p className="text-zinc-600">{timeAgo}</p>
      )}
    </div>
  );
}

function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (diff < 60) return "방금 전";
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  const days = Math.floor(diff / 86400);
  if (days === 1) return "어제";
  if (days < 30) return `${days}일 전`;
  return `${Math.floor(days / 30)}개월 전`;
}
