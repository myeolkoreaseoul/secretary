"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  MessageSquare,
  Bot,
  CheckSquare,
  Clock,
  Settings,
  Hash,
  AtSign,
  Search,
  SquarePen,
  Filter,
  Calendar,
  ListTodo,
  CheckCircle,
  BarChart3,
  Loader2,
  Music,
  Disc3,
  Monitor,
} from "lucide-react";
import { useState, useEffect } from "react";
import { TimerWidget } from "./TimerWidget";
import { apiFetch } from "@/lib/api-client";

/* ── 모드 정의 ── */
type Mode = "home" | "channels" | "dm" | "todos" | "time" | "phonk" | "overseer" | "settings";

const railItems: { id: Mode; icon: typeof Home; label: string }[] = [
  { id: "home", icon: Home, label: "홈" },
  { id: "channels", icon: MessageSquare, label: "채널" },
  { id: "dm", icon: Bot, label: "DM" },
  { id: "todos", icon: CheckSquare, label: "할일" },
  { id: "time", icon: Clock, label: "시간" },
  { id: "phonk", icon: Music, label: "Phonk" },
  { id: "overseer", icon: Monitor, label: "총괄" },
];

/* ── 모드별 기본 라우트 ── */
const modeDefaultRoute: Record<Mode, string> = {
  home: "/",
  channels: "/channels",
  dm: "/dm/secretary",
  todos: "/todos",
  time: "/time",
  phonk: "/phonk",
  overseer: "/overseer",
  settings: "/settings",
};

/* ── pathname → 모드 판별 ── */
function getMode(pathname: string): Mode {
  if (pathname === "/") return "home";
  if (pathname.startsWith("/channels")) return "channels";
  if (pathname.startsWith("/dm")) return "dm";
  if (pathname.startsWith("/todos")) return "todos";
  if (pathname.startsWith("/time")) return "time";
  if (pathname.startsWith("/phonk")) return "phonk";
  if (pathname.startsWith("/overseer")) return "overseer";
  if (pathname.startsWith("/settings")) return "settings";
  // fallback: legacy routes
  if (pathname.startsWith("/history")) return "channels";
  if (pathname.startsWith("/conversations")) return "dm";
  return "home";
}

/* ── 페이지 제목 ── */
const pageTitles: Record<string, string> = {
  "/": "대시보드",
  "/channels": "전체 메시지",
  "/dm/secretary": "Secretary",
  "/dm/claude": "Claude Code",
  "/dm/codex": "Codex CLI",
  "/dm/gemini": "Gemini CLI",
  "/todos": "할일",
  "/time": "시간 추적",
  "/settings": "설정",
  "/phonk": "Phonk Generator",
  "/overseer": "프로젝트 총괄",
  "/search": "검색",
};

function getPageTitle(pathname: string): string {
  if (pageTitles[pathname]) return pageTitles[pathname];
  if (pathname.startsWith("/channels/")) {
    const seg = decodeURIComponent(pathname.split("/")[2] || "");
    return seg || "채널";
  }
  if (pathname.startsWith("/dm/")) return "DM";
  for (const [path, title] of Object.entries(pageTitles)) {
    if (path !== "/" && pathname.startsWith(path)) return title;
  }
  return "Secretary";
}

/* ── DM 프로바이더 목록 ── */
const dmProviders = [
  { href: "/dm/secretary", label: "Secretary", desc: "AI 비서", icon: AtSign },
  { href: "/dm/claude", label: "Claude Code", desc: "claude_code", icon: AtSign },
  { href: "/dm/codex", label: "Codex CLI", desc: "codex", icon: AtSign },
  { href: "/dm/gemini", label: "Gemini CLI", desc: "gemini_cli", icon: AtSign },
];

/* ── todos 필터 ── */
const todoFilters = [
  { href: "/todos", label: "전체", icon: ListTodo },
  { href: "/todos?filter=today", label: "오늘", icon: Calendar },
  { href: "/todos?filter=done", label: "완료", icon: CheckCircle },
];

/* ── time 뷰 ── */
const timeViews = [
  { href: "/time", label: "타임라인", icon: BarChart3 },
  { href: "/time?view=weekly", label: "주간 리포트", icon: Calendar },
];

/* ═══════════════════════════════════════
   Icon Rail (70px)
   ═══════════════════════════════════════ */
export function SlackRail() {
  const pathname = usePathname();
  const currentMode = getMode(pathname);

  return (
    <div className="slack-rail">
      {/* Logo */}
      <div className="slack-rail-logo">S</div>
      <div className="slack-rail-divider" />

      {/* Nav icons */}
      <div className="flex-1 flex flex-col items-center gap-1 py-1">
        {railItems.map(({ id, icon: Icon, label }) => (
          <Link
            key={id}
            href={modeDefaultRoute[id]}
            className={`slack-rail-item ${currentMode === id ? "active" : ""}`}
          >
            <Icon className="w-5 h-5" />
            <span className="text-[10px] mt-0.5 leading-none">{label}</span>
          </Link>
        ))}
      </div>

      {/* Bottom: Settings */}
      <div className="flex flex-col items-center gap-1 pb-3">
        <Link
          href="/settings"
          className={`slack-rail-item ${currentMode === "settings" ? "active" : ""}`}
        >
          <Settings className="w-5 h-5" />
          <span className="text-[10px] mt-0.5 leading-none">설정</span>
        </Link>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════
   Sidebar (289px) — 모드별 컨텍스트
   ═══════════════════════════════════════ */
export function SlackSidebar() {
  const pathname = usePathname();
  const currentMode = getMode(pathname);

  return (
    <div className="slack-sidebar">
      {/* Header */}
      <div className="slack-sidebar-header">
        <span className="font-bold text-[#f8f8f8] text-[15px]">Secretary</span>
        <div className="flex items-center gap-1">
          <Link href="/search" className="slack-sidebar-action">
            <Search className="w-4 h-4" />
          </Link>
          <button className="slack-sidebar-action">
            <SquarePen className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Mode-specific content */}
      <nav className="flex-1 overflow-y-auto scroll-thin px-2 py-2">
        {currentMode === "home" && <HomeSidebar pathname={pathname} />}
        {currentMode === "channels" && <ChannelsSidebar pathname={pathname} />}
        {currentMode === "dm" && <DMSidebar pathname={pathname} />}
        {currentMode === "todos" && <TodosSidebar pathname={pathname} />}
        {currentMode === "time" && <TimeSidebar pathname={pathname} />}
        {currentMode === "phonk" && <PhonkSidebar pathname={pathname} />}
        {currentMode === "overseer" && <OverseerSidebar pathname={pathname} />}
        {currentMode === "settings" && <SettingsSidebar pathname={pathname} />}
      </nav>
    </div>
  );
}

/* ── Home Sidebar ── */
function HomeSidebar({ pathname }: { pathname: string }) {
  return (
    <div className="space-y-1">
      <SidebarItem href="/" label="대시보드" icon={Home} active={pathname === "/"} />
      <div className="slack-sidebar-section-header mt-3">
        <span>빠른 접근</span>
      </div>
      <SidebarItem href="/channels" label="전체 메시지" icon={MessageSquare} active={false} />
      <SidebarItem href="/dm/secretary" label="AI 비서 채팅" icon={AtSign} active={false} />
      <SidebarItem href="/todos" label="할일" icon={CheckSquare} active={false} />
    </div>
  );
}

/* ── Channels Sidebar (동적 카테고리 로딩) ── */
function ChannelsSidebar({ pathname }: { pathname: string }) {
  const [categories, setCategories] = useState<{ id: string; name: string; color: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/api/categories")
      .then((r) => r.json())
      .then((data) => setCategories(data.categories || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-1">
      <SidebarItem
        href="/channels"
        label="# 전체"
        icon={Hash}
        active={pathname === "/channels"}
      />
      <div className="slack-sidebar-section-header mt-3">
        <span>카테고리</span>
      </div>
      {loading ? (
        <div className="flex items-center gap-2 px-6 py-2 text-xs text-muted-foreground">
          <Loader2 className="w-3 h-3 animate-spin" />
          <span>로딩 중...</span>
        </div>
      ) : (
        categories.map((cat) => (
          <SidebarItem
            key={cat.id}
            href={`/channels/${encodeURIComponent(cat.name)}`}
            label={`# ${cat.name}`}
            icon={Hash}
            active={pathname === `/channels/${encodeURIComponent(cat.name)}`}
            dotColor={cat.color}
          />
        ))
      )}
    </div>
  );
}

/* ── DM Sidebar ── */
function DMSidebar({ pathname }: { pathname: string }) {
  return (
    <div className="space-y-1">
      <div className="slack-sidebar-section-header">
        <span>다이렉트 메시지</span>
      </div>
      {dmProviders.map((p) => (
        <SidebarItem
          key={p.href}
          href={p.href}
          label={p.label}
          icon={p.icon}
          active={pathname === p.href}
        />
      ))}
    </div>
  );
}

/* ── Todos Sidebar ── */
function TodosSidebar({ pathname }: { pathname: string }) {
  return (
    <div className="space-y-1">
      <div className="slack-sidebar-section-header">
        <span>할일 필터</span>
      </div>
      {todoFilters.map((f) => (
        <SidebarItem
          key={f.label}
          href={f.href}
          label={f.label}
          icon={f.icon}
          active={pathname + (typeof window !== "undefined" ? window.location.search : "") === f.href}
        />
      ))}
    </div>
  );
}

/* ── Time Sidebar ── */
function TimeSidebar({ pathname }: { pathname: string }) {
  return (
    <div className="space-y-1">
      <div className="slack-sidebar-section-header">
        <span>시간 뷰</span>
      </div>
      {timeViews.map((v) => (
        <SidebarItem
          key={v.label}
          href={v.href}
          label={v.label}
          icon={v.icon}
          active={pathname + (typeof window !== "undefined" ? window.location.search : "") === v.href}
        />
      ))}
    </div>
  );
}

/* ── Phonk Sidebar ── */
const phonkGenres = [
  { label: "전체", genre: undefined },
  { label: "phonk brasileiro", genre: "phonk brasileiro" },
  { label: "drift phonk", genre: "drift phonk + brasileiro" },
  { label: "gym phonk", genre: "gym phonk brasileiro" },
  { label: "funk carioca", genre: "funk carioca + phonk" },
  { label: "trap brasileiro", genre: "trap brasileiro + phonk" },
  { label: "mega funk", genre: "mega funk phonk" },
  { label: "anime phonk", genre: "anime phonk brasileiro" },
];

function PhonkSidebar({ pathname }: { pathname: string }) {
  const [activeGenre, setActiveGenre] = useState<string | undefined>(undefined);
  const [showHistory, setShowHistory] = useState(false);

  const handleGenreClick = (genre: string | undefined) => {
    setActiveGenre(genre);
    setShowHistory(false);
    window.dispatchEvent(new CustomEvent("phonk-genre-filter", { detail: genre }));
  };

  const handleHistoryClick = () => {
    setShowHistory(true);
    setActiveGenre(undefined);
    window.dispatchEvent(new Event("phonk-show-history"));
  };

  return (
    <div className="space-y-1">
      <div className="slack-sidebar-section-header">
        <span>장르 필터</span>
      </div>
      {phonkGenres.map((g) => (
        <button
          key={g.label}
          onClick={() => handleGenreClick(g.genre)}
          className={`slack-sidebar-item w-full text-left ${!showHistory && activeGenre === g.genre ? "active" : ""}`}
        >
          <Disc3 className="w-4 h-4 shrink-0 opacity-70" />
          <span className="truncate">{g.label}</span>
        </button>
      ))}
      <div className="slack-sidebar-divider my-2" />
      <button
        onClick={handleHistoryClick}
        className={`slack-sidebar-item w-full text-left ${showHistory ? "active" : ""}`}
      >
        <Clock className="w-4 h-4 shrink-0 opacity-70" />
        <span className="truncate">히스토리</span>
      </button>
    </div>
  );
}

/* ── Overseer Sidebar ── */
function OverseerSidebar({ pathname }: { pathname: string }) {
  return (
    <div className="space-y-1">
      <div className="slack-sidebar-section-header">
        <span>프로젝트 총괄</span>
      </div>
      <SidebarItem href="/overseer" label="대시보드" icon={Monitor} active={pathname === "/overseer"} />
    </div>
  );
}

/* ── Settings Sidebar ── */
function SettingsSidebar({ pathname }: { pathname: string }) {
  return (
    <div className="space-y-1">
      <div className="slack-sidebar-section-header">
        <span>설정</span>
      </div>
      <SidebarItem href="/settings" label="일반 설정" icon={Settings} active={pathname === "/settings"} />
      <SidebarItem href="/categories" label="카테고리 관리" icon={Filter} active={pathname === "/categories"} />
    </div>
  );
}

/* ── 공통 사이드바 아이템 ── */
function SidebarItem({
  href,
  label,
  icon: Icon,
  active,
  dotColor,
}: {
  href: string;
  label: string;
  icon: typeof Home;
  active: boolean;
  dotColor?: string;
}) {
  return (
    <Link href={href} className={`slack-sidebar-item ${active ? "active" : ""}`}>
      {dotColor ? (
        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{ backgroundColor: dotColor }}
        />
      ) : (
        <Icon className="w-4 h-4 shrink-0 opacity-70" />
      )}
      <span className="truncate">{label}</span>
    </Link>
  );
}

/* ═══════════════════════════════════════
   Channel Header (49px)
   ═══════════════════════════════════════ */
export function SlackHeader() {
  const pathname = usePathname();
  const title = getPageTitle(pathname);
  const mode = getMode(pathname);
  const isChat = pathname === "/dm/secretary";

  return (
    <div className="slack-header">
      <div className="flex items-center gap-2">
        {mode === "dm" ? (
          <AtSign className="w-4 h-4 opacity-50" />
        ) : (
          <Hash className="w-4 h-4 opacity-50" />
        )}
        <span className="font-bold text-[15px]">{title}</span>
      </div>
      <div className="flex items-center gap-2">
        <TimerWidget />
      </div>
    </div>
  );
}
