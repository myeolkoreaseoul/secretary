"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CheckSquare,
  Clock,
  MessageSquare,
  ArrowRight,
  Circle,
  CheckCircle,
} from "lucide-react";
import { TimeGrid } from "@/components/TimeGrid";
import { DailyPlanEditor } from "@/components/DailyPlanEditor";
import type { Todo, HourlySummary, TelegramMessage, Category } from "@/types";

const priorityLabels: Record<number, { label: string; color: string }> = {
  0: { label: "보통", color: "secondary" },
  1: { label: "중요", color: "default" },
  2: { label: "긴급", color: "destructive" },
  3: { label: "매우긴급", color: "destructive" },
};

function getToday() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export default function DashboardPage() {
  const [todos, setTodos] = useState<(Todo & { category?: Category })[]>([]);
  const [summaries, setSummaries] = useState<HourlySummary[]>([]);
  const [recentMessages, setRecentMessages] = useState<TelegramMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const today = getToday();

  const fetchDashboardData = useCallback(async () => {
    setLoading(true);
    try {
      const [todosRes, timeRes, historyRes] = await Promise.all([
        fetch("/api/todos"),
        fetch(`/api/time?date=${today}`),
        fetch("/api/history?page=1"),
      ]);

      const [todosData, timeData, historyData] = await Promise.all([
        todosRes.json(),
        timeRes.json(),
        historyRes.json(),
      ]);

      setTodos(todosData.todos || []);
      setSummaries(timeData.summaries || []);
      setRecentMessages((historyData.messages || []).slice(0, 6));
    } finally {
      setLoading(false);
    }
  }, [today]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const toggleTodo = async (id: string, isDone: boolean) => {
    await fetch("/api/todos", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, is_done: !isDone }),
    });
    fetchDashboardData();
  };

  const activeTodos = todos.filter((t) => !t.is_done);
  const doneTodosCount = todos.filter((t) => t.is_done).length;

  // Stats
  const activeHours = summaries.filter(
    (s) => s.top_apps && s.top_apps.length > 0
  ).length;
  const totalMinutes = summaries.reduce((acc, s) => {
    return (
      acc + (s.top_apps || []).reduce((a, app) => a + (app.minutes || 0), 0)
    );
  }, 0);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-3 gap-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">대시보드</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {new Date().toLocaleDateString("ko-KR", {
            year: "numeric",
            month: "long",
            day: "numeric",
            weekday: "long",
          })}
        </p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <CheckSquare className="w-5 h-5 text-primary" />
              <div>
                <p className="text-2xl font-bold">{activeTodos.length}</p>
                <p className="text-xs text-muted-foreground">
                  진행중 / {doneTodosCount}완료
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <Clock className="w-5 h-5 text-primary" />
              <div>
                <p className="text-2xl font-bold">{activeHours}h</p>
                <p className="text-xs text-muted-foreground">
                  활동 시간 / {Math.round(totalMinutes)}분
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <MessageSquare className="w-5 h-5 text-primary" />
              <div>
                <p className="text-2xl font-bold">{recentMessages.length}</p>
                <p className="text-xs text-muted-foreground">최근 대화</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Daily Plan */}
      <DailyPlanEditor date={today} />

      {/* Two column layout */}
      <div className="grid grid-cols-2 gap-6">
        {/* Today's Todos */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">오늘 할일</CardTitle>
              <Link
                href="/todos"
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                전체 보기
                <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {activeTodos.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                모든 할일을 완료했습니다
              </p>
            ) : (
              <div className="space-y-2">
                {activeTodos.slice(0, 8).map((todo) => {
                  const p = priorityLabels[todo.priority] || priorityLabels[0];
                  return (
                    <div
                      key={todo.id}
                      className="flex items-center gap-2 group"
                    >
                      <button
                        onClick={() => toggleTodo(todo.id, todo.is_done)}
                        className="text-muted-foreground hover:text-foreground shrink-0"
                      >
                        {todo.is_done ? (
                          <CheckCircle className="w-4 h-4 text-primary" />
                        ) : (
                          <Circle className="w-4 h-4" />
                        )}
                      </button>
                      <span className="text-sm truncate flex-1">
                        {todo.title}
                      </span>
                      {todo.priority > 0 && (
                        <Badge
                          variant={
                            p.color as "default" | "secondary" | "destructive"
                          }
                          className="text-[10px] shrink-0"
                        >
                          P{todo.priority}
                        </Badge>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Messages */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">최근 대화</CardTitle>
              <Link
                href="/history"
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                전체 보기
                <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {recentMessages.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                아직 대화가 없습니다
              </p>
            ) : (
              <div className="space-y-2">
                {recentMessages.map((msg) => (
                  <div key={msg.id} className="flex items-start gap-2">
                    <Badge
                      variant={msg.role === "user" ? "default" : "secondary"}
                      className="text-[10px] shrink-0 mt-0.5"
                    >
                      {msg.role === "user" ? "나" : "비서"}
                    </Badge>
                    <p className="text-xs text-muted-foreground line-clamp-1 flex-1">
                      {msg.content}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Mini Time Grid */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">오늘 시간 추적</CardTitle>
            <Link
              href="/time"
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              상세 보기
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          <TimeGrid summaries={summaries} />
        </CardContent>
      </Card>
    </div>
  );
}
