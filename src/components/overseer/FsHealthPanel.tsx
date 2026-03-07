"use client";

import { HardDrive, FolderSync } from "lucide-react";

interface FsData {
  total_size_mb?: number;
  node_modules_mb?: number;
  junk_mb?: number;
  file_count?: number;
  fs_scanned?: string;
}

export function FsHealthPanel({ data }: { data: FsData }) {
  if (!data.total_size_mb) {
    return <p className="text-xs text-muted-foreground">FS 데이터 없음</p>;
  }

  const totalGb = (data.total_size_mb / 1024).toFixed(1);
  const isLarge = data.total_size_mb > 5120;
  const hasJunk = (data.junk_mb ?? 0) > 100;

  return (
    <div className="space-y-1.5 text-xs">
      <div className="flex items-center gap-1.5">
        <HardDrive className="w-3 h-3 text-muted-foreground" />
        <span className={isLarge ? "text-orange-400 font-medium" : "text-muted-foreground"}>
          {data.total_size_mb > 1024 ? `${totalGb} GB` : `${data.total_size_mb} MB`}
        </span>
        <span className="text-zinc-600">·</span>
        <span className="text-muted-foreground">{data.file_count?.toLocaleString()} 파일</span>
      </div>
      {(data.junk_mb ?? 0) > 0 && (
        <div className="flex items-center gap-1.5">
          <FolderSync className="w-3 h-3 text-muted-foreground" />
          <span className={hasJunk ? "text-orange-400" : "text-muted-foreground"}>
            캐시 {data.junk_mb} MB
          </span>
          {(data.node_modules_mb ?? 0) > 0 && (
            <span className="text-zinc-600">
              (node_modules {data.node_modules_mb} MB)
            </span>
          )}
        </div>
      )}
    </div>
  );
}
