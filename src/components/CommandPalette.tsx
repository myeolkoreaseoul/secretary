"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api-client";
import { Command } from "cmdk";
import { useRouter } from "next/navigation";
import {
  CheckSquare,
  Clock,
  Search,
  LayoutGrid,
  MessageSquare,
  Settings,
  X,
} from "lucide-react";

const PAGES = [
  { label: "카테고리", href: "/categories", icon: LayoutGrid },
  { label: "대화", href: "/history", icon: MessageSquare },
  { label: "할일", href: "/todos", icon: CheckSquare },
  { label: "시간", href: "/time", icon: Clock },
  { label: "설정", href: "/settings", icon: Settings },
  { label: "검색", href: "/search", icon: Search },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const runAction = useCallback(
    async (action: string) => {
      // Parse action
      const todoMatch = action.match(/^할일\s+(.+)/);
      const timeMatch = action.match(/^시간\s+(\S+)\s+(.+)/);
      const searchMatch = action.match(/^검색\s+(.+)/);

      if (todoMatch) {
        setStatus("할일 추가 중...");
        await apiFetch("/api/todos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: todoMatch[1] }),
        });
        setStatus("할일이 추가되었습니다");
        setTimeout(() => {
          setOpen(false);
          setStatus(null);
          setValue("");
        }, 800);
        return;
      }

      if (timeMatch) {
        setStatus("시간 기록 중...");
        const duration = timeMatch[1];
        const category = timeMatch[2];
        const hours = parseFloat(duration.replace(/h/i, ""));
        if (isNaN(hours)) {
          setStatus("시간 형식이 올바르지 않습니다 (예: 2h)");
          setTimeout(() => setStatus(null), 1500);
          return;
        }
        const now = new Date();
        const start = new Date(now.getTime() - hours * 60 * 60 * 1000);
        await apiFetch("/api/time", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            description: category,
            category,
            start_time: start.toISOString(),
            end_time: now.toISOString(),
          }),
        });
        setStatus("시간이 기록되었습니다");
        setTimeout(() => {
          setOpen(false);
          setStatus(null);
          setValue("");
        }, 800);
        return;
      }

      if (searchMatch) {
        setOpen(false);
        setValue("");
        router.push(`/search?q=${encodeURIComponent(searchMatch[1])}`);
        return;
      }
    },
    [router]
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={() => {
          setOpen(false);
          setValue("");
          setStatus(null);
        }}
      />
      <div className="absolute top-[20%] left-1/2 -translate-x-1/2 w-full max-w-lg">
        <Command
          className="bg-popover border border-border rounded-lg shadow-2xl overflow-hidden"
          shouldFilter={false}
        >
          <div className="flex items-center border-b border-border px-3">
            <Search className="w-4 h-4 text-muted-foreground shrink-0" />
            <Command.Input
              value={value}
              onValueChange={setValue}
              placeholder="명령어 입력... (할일, 시간, 검색, 페이지 이동)"
              className="flex-1 bg-transparent py-3 px-2 text-sm outline-none placeholder:text-muted-foreground"
              autoFocus
            />
            <button
              onClick={() => {
                setOpen(false);
                setValue("");
                setStatus(null);
              }}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {status && (
            <div className="px-4 py-3 text-sm text-muted-foreground">
              {status}
            </div>
          )}

          <Command.List className="max-h-80 overflow-y-auto p-2">
            <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
              {value
                ? "Enter를 눌러 실행하세요"
                : "명령어를 입력하세요"}
            </Command.Empty>

            {/* Quick actions based on input */}
            {value && (
              <Command.Group heading="액션" className="text-xs text-muted-foreground px-2 py-1">
                {value.startsWith("할일") && value.length > 3 && (
                  <Command.Item
                    onSelect={() => runAction(value)}
                    className="flex items-center gap-2 px-2 py-2 rounded-md text-sm cursor-pointer hover:bg-accent data-[selected=true]:bg-accent"
                  >
                    <CheckSquare className="w-4 h-4" />
                    할일 추가: {value.replace(/^할일\s*/, "")}
                  </Command.Item>
                )}
                {value.startsWith("시간") && value.length > 3 && (
                  <Command.Item
                    onSelect={() => runAction(value)}
                    className="flex items-center gap-2 px-2 py-2 rounded-md text-sm cursor-pointer hover:bg-accent data-[selected=true]:bg-accent"
                  >
                    <Clock className="w-4 h-4" />
                    시간 기록: {value.replace(/^시간\s*/, "")}
                  </Command.Item>
                )}
                {value.startsWith("검색") && value.length > 3 && (
                  <Command.Item
                    onSelect={() => runAction(value)}
                    className="flex items-center gap-2 px-2 py-2 rounded-md text-sm cursor-pointer hover:bg-accent data-[selected=true]:bg-accent"
                  >
                    <Search className="w-4 h-4" />
                    검색: {value.replace(/^검색\s*/, "")}
                  </Command.Item>
                )}
              </Command.Group>
            )}

            {/* Page navigation */}
            <Command.Group heading="페이지" className="text-xs text-muted-foreground px-2 py-1">
              {PAGES.filter(
                (p) => !value || p.label.includes(value) || p.href.includes(value)
              ).map((page) => (
                <Command.Item
                  key={page.href}
                  onSelect={() => {
                    router.push(page.href);
                    setOpen(false);
                    setValue("");
                  }}
                  className="flex items-center gap-2 px-2 py-2 rounded-md text-sm cursor-pointer hover:bg-accent data-[selected=true]:bg-accent"
                >
                  <page.icon className="w-4 h-4" />
                  {page.label}
                </Command.Item>
              ))}
            </Command.Group>

            {/* Hints */}
            {!value && (
              <Command.Group heading="도움말" className="text-xs text-muted-foreground px-2 py-1">
                <div className="px-2 py-1.5 text-xs text-muted-foreground space-y-1">
                  <p><kbd className="px-1 py-0.5 bg-muted rounded text-[10px]">할일 장보기</kbd> 할일 추가</p>
                  <p><kbd className="px-1 py-0.5 bg-muted rounded text-[10px]">시간 2h 코딩</kbd> 시간 기록</p>
                  <p><kbd className="px-1 py-0.5 bg-muted rounded text-[10px]">검색 회의</kbd> 검색 페이지로</p>
                </div>
              </Command.Group>
            )}
          </Command.List>

          {/* Enter to execute */}
          {value && !value.startsWith("할일") && !value.startsWith("시간") && !value.startsWith("검색") && (
            <div className="border-t border-border px-4 py-2">
              <p className="text-xs text-muted-foreground">
                <kbd className="px-1 py-0.5 bg-muted rounded text-[10px]">Enter</kbd> 선택 실행 &middot;{" "}
                <kbd className="px-1 py-0.5 bg-muted rounded text-[10px]">Esc</kbd> 닫기
              </p>
            </div>
          )}
        </Command>
      </div>
    </div>
  );
}
