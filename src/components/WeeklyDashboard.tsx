"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api-client";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

interface WeeklyEntry {
  date: string;
  adherence_pct: number | null;
  has_plan: boolean;
  has_actual: boolean;
  distractions: string[];
  exercise: boolean | null;
  meals: boolean | null;
}

function getBarColor(pct: number | null): string {
  if (pct === null) return "#374151";
  if (pct >= 70) return "#22c55e";
  if (pct >= 40) return "#eab308";
  return "#ef4444";
}

function getWeekday(dateStr: string): string {
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  const d = new Date(dateStr + "T00:00:00");
  return days[d.getDay()];
}

export function WeeklyDashboard() {
  const [data, setData] = useState<WeeklyEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/planner?days=7");
      const json = await res.json();
      setData(json.weekly || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="h-48 bg-muted animate-pulse rounded" />
        </CardContent>
      </Card>
    );
  }

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">주간 트렌드</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-center text-muted-foreground text-sm py-8">
            최근 7일간 리뷰 데이터가 없습니다
          </p>
        </CardContent>
      </Card>
    );
  }

  // Chart data
  const chartData = data.map((entry) => ({
    date: `${entry.date.slice(5)} (${getWeekday(entry.date)})`,
    adherence: entry.adherence_pct ?? 0,
    rawPct: entry.adherence_pct,
    hasData: entry.has_plan || entry.has_actual,
  }));

  // Aggregate stats
  const withReview = data.filter((d) => d.adherence_pct !== null);
  const avgAdherence =
    withReview.length > 0
      ? Math.round(
          withReview.reduce((sum, d) => sum + (d.adherence_pct || 0), 0) /
            withReview.length
        )
      : null;

  // Top distractions
  const distractionCounts: Record<string, number> = {};
  for (const entry of data) {
    for (const d of entry.distractions) {
      // Extract activity name (before the minutes)
      const name = d.split(/\d+분/)[0].trim();
      if (name) {
        distractionCounts[name] = (distractionCounts[name] || 0) + 1;
      }
    }
  }
  const topDistractions = Object.entries(distractionCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  const exerciseDays = data.filter((d) => d.exercise === true).length;
  const mealDays = data.filter((d) => d.meals === true).length;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">주간 트렌드 (최근 7일)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Chart */}
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: "#888" }}
                axisLine={{ stroke: "#444" }}
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fontSize: 10, fill: "#888" }}
                axisLine={{ stroke: "#444" }}
                tickFormatter={(v) => `${v}%`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#1f2937",
                  border: "1px solid #374151",
                  borderRadius: "6px",
                  fontSize: "12px",
                }}
                formatter={(value) => [`${value}%`, "달성률"]}
              />
              <Bar dataKey="adherence" radius={[4, 4, 0, 0]}>
                {chartData.map((entry, i) => (
                  <Cell key={i} fill={getBarColor(entry.rawPct)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="text-center p-2 rounded bg-muted/50">
            <p className="text-lg font-bold">
              {avgAdherence !== null ? `${avgAdherence}%` : "-"}
            </p>
            <p className="text-[10px] text-muted-foreground">평균 달성률</p>
          </div>
          <div className="text-center p-2 rounded bg-muted/50">
            <p className="text-lg font-bold">{withReview.length}/{data.length}</p>
            <p className="text-[10px] text-muted-foreground">리뷰 완료일</p>
          </div>
          <div className="text-center p-2 rounded bg-muted/50">
            <p className="text-lg font-bold">{exerciseDays}/{data.length}</p>
            <p className="text-[10px] text-muted-foreground">운동 일수</p>
          </div>
          <div className="text-center p-2 rounded bg-muted/50">
            <p className="text-lg font-bold">{mealDays}/{data.length}</p>
            <p className="text-[10px] text-muted-foreground">정규 식사</p>
          </div>
        </div>

        {/* Top distractions */}
        {topDistractions.length > 0 && (
          <div>
            <p className="text-xs font-medium mb-1">주요 이탈 패턴</p>
            <div className="flex flex-wrap gap-2">
              {topDistractions.map(([name, count], i) => (
                <span
                  key={i}
                  className="text-[10px] px-2 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20"
                >
                  {name} ({count}회)
                </span>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
