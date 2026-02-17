"use client";

import type { HourlySummary } from "@/types";
import { cn } from "@/lib/utils";

interface Props {
  summaries: HourlySummary[];
}

const HOUR_LABELS = Array.from({ length: 24 }, (_, i) =>
  i.toString().padStart(2, "0")
);

// Activity level color mapping
function getActivityColor(summary: HourlySummary | undefined): string {
  if (!summary) return "bg-muted/30";

  const topApps = summary.top_apps;
  if (!topApps || topApps.length === 0) return "bg-muted/30";

  const totalMinutes = topApps.reduce(
    (acc, app) => acc + (app.minutes || 0),
    0
  );

  if (totalMinutes >= 50) return "bg-primary/80";
  if (totalMinutes >= 30) return "bg-primary/50";
  if (totalMinutes >= 10) return "bg-primary/25";
  return "bg-primary/10";
}

export function TimeGrid({ summaries }: Props) {
  const summaryByHour = new Map<number, HourlySummary>();
  for (const s of summaries) {
    summaryByHour.set(s.hour, s);
  }

  return (
    <div>
      <div className="grid grid-cols-12 gap-1">
        {HOUR_LABELS.map((label, hour) => {
          const summary = summaryByHour.get(hour);
          const topApps = summary?.top_apps || [];
          const tooltip =
            topApps.length > 0
              ? topApps.map((a) => `${a.app}: ${a.minutes}분`).join(", ")
              : "활동 없음";

          return (
            <div key={hour} className="text-center">
              <div
                className={cn(
                  "aspect-square rounded-sm transition-colors",
                  getActivityColor(summary)
                )}
                title={`${label}시 — ${tooltip}`}
              />
              <span className="text-[10px] text-muted-foreground">{label}</span>
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
        <span>적음</span>
        <div className="flex gap-1">
          <div className="w-3 h-3 rounded-sm bg-muted/30" />
          <div className="w-3 h-3 rounded-sm bg-primary/10" />
          <div className="w-3 h-3 rounded-sm bg-primary/25" />
          <div className="w-3 h-3 rounded-sm bg-primary/50" />
          <div className="w-3 h-3 rounded-sm bg-primary/80" />
        </div>
        <span>많음</span>
      </div>
    </div>
  );
}
