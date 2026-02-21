"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { apiFetch } from "@/lib/api-client";
import { Play, Square } from "lucide-react";

const CATEGORIES = [
  "업무",
  "개발",
  "건강",
  "가족",
  "소개팅비즈니스",
  "온라인판매",
  "기타",
];

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function TimerWidget() {
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [category, setCategory] = useState("개발");
  const [description, setDescription] = useState("");
  const startTimeRef = useRef<Date | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = useCallback(async () => {
    if (!startTimeRef.current) return;

    setRunning(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    const endTime = new Date();
    await apiFetch("/api/time", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        description: description || category,
        category,
        start_time: startTimeRef.current.toISOString(),
        end_time: endTime.toISOString(),
      }),
    });

    startTimeRef.current = null;
    setElapsed(0);
    setDescription("");
  }, [category, description]);

  const start = () => {
    startTimeRef.current = new Date();
    setRunning(true);
    setElapsed(0);
    intervalRef.current = setInterval(() => {
      if (startTimeRef.current) {
        setElapsed(
          Math.floor(
            (Date.now() - startTimeRef.current.getTime()) / 1000
          )
        );
      }
    }, 1000);
  };

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return (
    <div className="flex items-center gap-2 text-sm">
      {running ? (
        <>
          <span className="text-xs text-muted-foreground">{category}</span>
          <span className="font-mono text-xs tabular-nums">
            {formatElapsed(elapsed)}
          </span>
          <button
            onClick={stop}
            className="p-1 rounded hover:bg-accent text-destructive"
            title="중지"
          >
            <Square className="w-3.5 h-3.5 fill-current" />
          </button>
        </>
      ) : (
        <>
          <input
            type="text"
            placeholder="활동..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="bg-transparent border-b border-border text-xs w-20 outline-none placeholder:text-muted-foreground"
          />
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="bg-transparent text-xs text-muted-foreground outline-none cursor-pointer"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <button
            onClick={start}
            className="p-1 rounded hover:bg-accent text-primary"
            title="시작"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
          </button>
        </>
      )}
    </div>
  );
}
