"use client";

import { useState, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TimeGrid } from "@/components/TimeGrid";
import type { HourlySummary, ActivityLog, DailyReportV2 } from "@/types";

interface TimeData {
  date: string;
  summaries: HourlySummary[];
  logs: ActivityLog[];
  report: DailyReportV2 | null;
}

export default function TimePage() {
  const [date, setDate] = useState(
    () => new Date().toISOString().split("T")[0]
  );
  const [data, setData] = useState<TimeData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/time?date=${date}`);
      const json = await res.json();
      setData(json);
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">시간 추적</h1>
          <p className="text-muted-foreground text-sm mt-1">
            하루 활동을 시간대별로 확인합니다
          </p>
        </div>
        <Input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-auto"
        />
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : data ? (
        <div className="space-y-6">
          {/* Time Grid */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">24시간 그리드</CardTitle>
            </CardHeader>
            <CardContent>
              <TimeGrid summaries={data.summaries} />
            </CardContent>
          </Card>

          {/* Daily Report */}
          {data.report && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Daily Report</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap">
                  {data.report.content}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Raw Logs */}
          {data.logs.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">
                  활동 로그 ({data.logs.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="max-h-64 overflow-y-auto space-y-1">
                  {data.logs.slice(0, 100).map((log) => (
                    <div
                      key={log.id}
                      className="flex items-center gap-3 text-xs py-1"
                    >
                      <span className="text-muted-foreground w-12 shrink-0">
                        {new Date(log.recorded_at).toLocaleTimeString("ko-KR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      <span className="text-muted-foreground w-20 shrink-0 truncate">
                        {log.app_name || "-"}
                      </span>
                      <span className="truncate">{log.window_title}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {data.summaries.length === 0 && data.logs.length === 0 && (
            <p className="text-center text-muted-foreground py-12">
              이 날짜에 기록된 활동이 없습니다
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
