"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Sparkles, Plus, Trash2, Save, GripVertical } from "lucide-react";

interface PlanBlock {
  start: string;
  end: string;
  task: string;
  category: string;
}

interface DailyPlanEditorProps {
  date: string;
}

const CATEGORIES = [
  "업무",
  "개발",
  "건강",
  "가족",
  "소개팅비즈니스",
  "온라인판매",
  "기타",
];

export function DailyPlanEditor({ date }: DailyPlanEditorProps) {
  const [plan, setPlan] = useState<PlanBlock[]>([]);
  const [planText, setPlanText] = useState("");
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saved, setSaved] = useState(false);

  const fetchPlan = useCallback(async () => {
    try {
      const res = await fetch(`/api/daily-plan?date=${date}`);
      const data = await res.json();
      if (data.plan) setPlan(data.plan);
      if (data.planText) setPlanText(data.planText);
    } catch {
      // ignore
    }
  }, [date]);

  useEffect(() => {
    fetchPlan();
  }, [fetchPlan]);

  const generate = async () => {
    setGenerating(true);
    try {
      const res = await fetch("/api/daily-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, action: "generate" }),
      });
      const data = await res.json();
      if (data.plan) setPlan(data.plan);
      if (data.planText) setPlanText(data.planText);
    } finally {
      setGenerating(false);
    }
  };

  const save = async () => {
    setLoading(true);
    setSaved(false);
    try {
      await fetch("/api/daily-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, plan, planText }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setLoading(false);
    }
  };

  const addBlock = () => {
    const lastEnd =
      plan.length > 0 ? plan[plan.length - 1].end : "09:00";
    const [h] = lastEnd.split(":").map(Number);
    const newStart = lastEnd;
    const newEnd = `${String(Math.min(h + 1, 23)).padStart(2, "0")}:00`;
    setPlan([...plan, { start: newStart, end: newEnd, task: "", category: "기타" }]);
  };

  const updateBlock = (index: number, field: keyof PlanBlock, value: string) => {
    const updated = [...plan];
    updated[index] = { ...updated[index], [field]: value };
    setPlan(updated);
  };

  const removeBlock = (index: number) => {
    setPlan(plan.filter((_, i) => i !== index));
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">오늘의 계획</CardTitle>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={generate}
              disabled={generating}
            >
              <Sparkles className="w-3.5 h-3.5 mr-1" />
              {generating ? "생성 중..." : "AI 계획 생성"}
            </Button>
            <Button size="sm" onClick={save} disabled={loading}>
              <Save className="w-3.5 h-3.5 mr-1" />
              {saved ? "저장됨" : "저장"}
            </Button>
          </div>
        </div>
        {planText && (
          <p className="text-xs text-muted-foreground mt-1">{planText}</p>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        {/* Timeline */}
        {plan.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            계획이 없습니다. AI로 생성하거나 직접 추가하세요.
          </p>
        ) : (
          <div className="space-y-1.5">
            {plan.map((block, i) => (
              <div
                key={i}
                className="flex items-center gap-2 group"
              >
                <GripVertical className="w-3 h-3 text-muted-foreground/30 shrink-0" />
                <Input
                  type="time"
                  value={block.start}
                  onChange={(e) => updateBlock(i, "start", e.target.value)}
                  className="w-24 h-8 text-xs"
                />
                <span className="text-xs text-muted-foreground">~</span>
                <Input
                  type="time"
                  value={block.end}
                  onChange={(e) => updateBlock(i, "end", e.target.value)}
                  className="w-24 h-8 text-xs"
                />
                <Input
                  value={block.task}
                  onChange={(e) => updateBlock(i, "task", e.target.value)}
                  placeholder="할 일..."
                  className="flex-1 h-8 text-xs"
                />
                <select
                  value={block.category}
                  onChange={(e) => updateBlock(i, "category", e.target.value)}
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => removeBlock(i)}
                  className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        <Button
          size="sm"
          variant="ghost"
          onClick={addBlock}
          className="w-full text-xs"
        >
          <Plus className="w-3.5 h-3.5 mr-1" />
          시간 블록 추가
        </Button>

        {/* Visual Timeline Preview */}
        {plan.length > 0 && (
          <div className="mt-4 pt-3 border-t border-border">
            <p className="text-xs text-muted-foreground mb-2">타임라인</p>
            <div className="space-y-1">
              {plan.map((block, i) => {
                const startH = parseInt(block.start.split(":")[0]);
                const endH = parseInt(block.end.split(":")[0]);
                const duration = endH - startH;
                return (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="w-20 text-muted-foreground shrink-0">
                      {block.start}~{block.end}
                    </span>
                    <div
                      className="h-6 rounded bg-primary/20 flex items-center px-2 text-primary truncate"
                      style={{
                        width: `${Math.max(duration * 40, 60)}px`,
                      }}
                    >
                      {block.task || "..."}
                    </div>
                    <span className="text-muted-foreground shrink-0">
                      {block.category}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
