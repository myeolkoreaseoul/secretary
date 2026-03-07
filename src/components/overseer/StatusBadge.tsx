"use client";

import { Badge } from "@/components/ui/badge";

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  active: {
    label: "활성",
    className: "bg-green-500/20 text-green-400 border-green-500/30",
  },
  paused: {
    label: "일시정지",
    className: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  },
  archived: {
    label: "보관",
    className: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
  },
  warning: {
    label: "주의",
    className: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  },
  error: {
    label: "오류",
    className: "bg-red-500/20 text-red-400 border-red-500/30",
  },
  online: {
    label: "온라인",
    className: "bg-green-500/20 text-green-400 border-green-500/30",
  },
  offline: {
    label: "오프라인",
    className: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
  },
};

export function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] || {
    label: status,
    className: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
  };

  return <Badge className={config.className}>{config.label}</Badge>;
}
