"use client";

import { Monitor } from "lucide-react";
import { ProjectGrid } from "@/components/overseer/ProjectGrid";
import { PixelOffice } from "@/components/overseer/pixel-office";

export default function OverseerPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Monitor className="w-6 h-6" />
        <div>
          <h1 className="text-2xl font-bold">프로젝트 총괄</h1>
          <p className="text-sm text-muted-foreground">
            전체 프로젝트 상태 대시보드
          </p>
        </div>
      </div>
      <PixelOffice />
      <ProjectGrid />
    </div>
  );
}
