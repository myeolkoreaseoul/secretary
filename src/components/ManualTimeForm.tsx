"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus } from "lucide-react";

const CATEGORIES = [
  "업무",
  "개발",
  "건강",
  "가족",
  "소개팅비즈니스",
  "온라인판매",
  "기타",
];

interface ManualTimeFormProps {
  initialHour?: number | null;
  date: string;
  onSaved?: () => void;
}

export function ManualTimeForm({
  initialHour,
  date,
  onSaved,
}: ManualTimeFormProps) {
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("기타");
  const [startTime, setStartTime] = useState(() => {
    if (initialHour !== null && initialHour !== undefined) {
      return `${String(initialHour).padStart(2, "0")}:00`;
    }
    return "";
  });
  const [endTime, setEndTime] = useState(() => {
    if (initialHour !== null && initialHour !== undefined) {
      return `${String(Math.min(initialHour + 1, 23)).padStart(2, "0")}:00`;
    }
    return "";
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Update times when initialHour changes
  const updateFromHour = (hour: number) => {
    setStartTime(`${String(hour).padStart(2, "0")}:00`);
    setEndTime(`${String(Math.min(hour + 1, 23)).padStart(2, "0")}:00`);
  };

  // Expose updateFromHour for parent
  if (
    initialHour !== null &&
    initialHour !== undefined &&
    startTime === "" &&
    endTime === ""
  ) {
    updateFromHour(initialHour);
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim() || !startTime || !endTime) return;

    setSaving(true);
    setMessage(null);

    try {
      const start = new Date(`${date}T${startTime}:00+09:00`);
      const end = new Date(`${date}T${endTime}:00+09:00`);

      const res = await fetch("/api/time", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: description.trim(),
          category,
          start_time: start.toISOString(),
          end_time: end.toISOString(),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setMessage(`${data.count}개 항목이 기록되었습니다`);
        setDescription("");
        onSaved?.();
      } else {
        const err = await res.json();
        setMessage(`오류: ${err.error}`);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">수동 시간 입력</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-3">
          <Input
            placeholder="활동 설명 (예: 코딩, 독서, 운동)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs text-muted-foreground mb-1 block">
                시작
              </label>
              <Input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-muted-foreground mb-1 block">
                종료
              </label>
              <Input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              카테고리
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" size="sm" disabled={saving} className="w-full">
            <Plus className="w-4 h-4 mr-1" />
            {saving ? "저장 중..." : "시간 기록"}
          </Button>
          {message && (
            <p className="text-xs text-muted-foreground text-center">
              {message}
            </p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
