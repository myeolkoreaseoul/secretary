"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Trash2, GitBranch, Archive } from "lucide-react";

interface ActionPanelProps {
  projectId: string;
  projectName: string;
}

interface ActionResult {
  action: string;
  dry_run: boolean;
  items?: Array<{ path: string; size_mb: number }>;
  branches?: string[];
  total_mb?: number;
  count?: number;
  error?: string;
}

export function ActionPanel({ projectId, projectName }: ActionPanelProps) {
  const [result, setResult] = useState<ActionResult | null>(null);
  const [loading, setLoading] = useState(false);

  async function runAction(type: string, dryRun: boolean) {
    setLoading(true);
    try {
      const resp = await fetch("/api/overseer/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: projectId,
          action_type: type,
          dry_run: dryRun,
        }),
      });
      const data = await resp.json();
      setResult(data.result || data);
    } catch {
      setResult({ action: type, dry_run: dryRun, error: "요청 실패" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => runAction("delete_junk", true)}
          disabled={loading}
          className="text-xs"
        >
          <Trash2 className="w-3 h-3 mr-1" />
          캐시 정리
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => runAction("prune_branches", true)}
          disabled={loading}
          className="text-xs"
        >
          <GitBranch className="w-3 h-3 mr-1" />
          브랜치 정리
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => runAction("archive", true)}
          disabled={loading}
          className="text-xs"
        >
          <Archive className="w-3 h-3 mr-1" />
          아카이브
        </Button>
      </div>

      {result && (
        <div className="rounded-md bg-zinc-900 p-3 text-xs space-y-1">
          <p className="font-medium">
            {result.action} {result.dry_run ? "(미리보기)" : "(실행 완료)"}
          </p>
          {result.error && (
            <p className="text-red-400">{result.error}</p>
          )}
          {result.items?.map((item, i) => (
            <p key={i} className="text-muted-foreground">
              {item.path} — {item.size_mb} MB
            </p>
          ))}
          {result.branches?.map((b, i) => (
            <p key={i} className="text-muted-foreground">{b}</p>
          ))}
          {result.total_mb !== undefined && (
            <p className="text-orange-400 font-medium">
              합계: {result.total_mb} MB
            </p>
          )}
          {result.dry_run && !result.error && (
            <Button
              size="sm"
              variant="destructive"
              onClick={() => runAction(result.action, false)}
              disabled={loading}
              className="mt-2 text-xs"
            >
              실행
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
