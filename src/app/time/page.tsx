"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { apiFetch } from "@/lib/api-client";
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  FolderOpen,
  Code2,
  Zap,
  Star,
  Calendar,
  TrendingUp,
  Plus,
  X,
} from "lucide-react";
import type {
  ActivityEvent,
  DailyReportV2,
  TimeViewWeekly,
  TimeViewMonthly,
  TimeViewYearly,
} from "@/types";

interface PlanBlock {
  id: string;
  date: string;
  start_time: string; // "09:00"
  end_time: string;   // "10:30"
  title: string;
  category: string;
  color: string | null;
}

interface Priority {
  text: string;
  done: boolean;
}

interface DailyNotes {
  date: string;
  brain_dump: string;
  priorities: Priority[];
}

type View = "daily" | "weekly" | "monthly" | "yearly";

const WEEKDAYS = ["월", "화", "수", "목", "금", "토", "일"];
const MONTHS = ["1월","2월","3월","4월","5월","6월","7월","8월","9월","10월","11월","12월"];

const CAT_COLORS: Record<string, string> = {
  coding: "#00E676",
  communication: "#29B6F6",
  sleep: "#7C4DFF",
  transit: "#FFD740",
  meal: "#FF9100",
  exercise: "#FF4081",
  meeting: "#B388FF",
  other: "#666",
};
const CAT_LABELS: Record<string, string> = {
  coding: "코딩",
  communication: "소통",
  sleep: "수면",
  transit: "이동",
  meal: "식사",
  exercise: "운동",
  meeting: "회의",
  other: "기타",
};

function todayKST(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().split("T")[0];
}

function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtDur(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}분`;
  if (m === 0) return `${h}시간`;
  return `${h}h ${m}m`;
}

function fmtDurShort(mins: number): string {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h${m}m` : `${h}h`;
}

// ═══════════════════════════════════════════════════════
// Main Page
// ═══════════════════════════════════════════════════════
export default function TimePage() {
  const [view, setView] = useState<View>("daily");
  const [date, setDate] = useState(todayKST);
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);

  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [planBlocks, setPlanBlocks] = useState<PlanBlock[]>([]);
  const [stats, setStats] = useState({ total_minutes: 0, total_sessions: 0, projects: [] as string[], categories: {} as Record<string, number>, density: 0 });
  const [report, setReport] = useState<DailyReportV2 | null>(null);
  const [weeklyData, setWeeklyData] = useState<TimeViewWeekly | null>(null);
  const [monthlyData, setMonthlyData] = useState<TimeViewMonthly | null>(null);
  const [yearlyData, setYearlyData] = useState<TimeViewYearly | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchPlan = useCallback(async (d: string) => {
    try {
      const res = await apiFetch(`/api/time/plan?date=${d}`);
      const json = await res.json();
      setPlanBlocks(Array.isArray(json) ? json : []);
    } catch { setPlanBlocks([]); }
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const urls: Record<View, string> = {
        daily: `/api/time?view=daily&date=${date}`,
        weekly: `/api/time?view=weekly&date=${date}`,
        monthly: `/api/time?view=monthly&year=${year}&month=${month}`,
        yearly: `/api/time?view=yearly&year=${year}`,
      };
      const res = await apiFetch(urls[view]);
      const json = await res.json();
      if (view === "daily") {
        setEvents(json.events || []);
        setStats(json.stats || { total_minutes: 0, total_sessions: 0, projects: [], categories: {}, density: 0 });
        setReport(json.report || null);
        fetchPlan(date);
      }
      else if (view === "weekly") setWeeklyData(json);
      else if (view === "monthly") setMonthlyData(json);
      else setYearlyData(json);
    } finally { setLoading(false); }
  }, [view, date, year, month, fetchPlan]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Navigation per view
  const navigate = (dir: -1 | 1) => {
    if (view === "daily") {
      const d = new Date(date + "T00:00:00+09:00");
      d.setDate(d.getDate() + dir);
      setDate(fmtDate(d));
    } else if (view === "weekly") {
      const d = new Date(date + "T00:00:00+09:00");
      d.setDate(d.getDate() + dir * 7);
      setDate(fmtDate(d));
    } else if (view === "monthly") {
      let m = month + dir, y = year;
      if (m < 1) { m = 12; y--; }
      if (m > 12) { m = 1; y++; }
      setMonth(m); setYear(y);
    } else {
      setYear(y => y + dir);
    }
  };

  const dateLabel = (() => {
    if (view === "daily") {
      const d = new Date(date + "T00:00:00+09:00");
      return `${date} (${WEEKDAYS[(d.getDay() + 6) % 7]})`;
    }
    if (view === "weekly" && weeklyData) return `${weeklyData.start_date} ~ ${weeklyData.end_date}`;
    if (view === "weekly") return date;
    if (view === "monthly") return `${year}년 ${month}월`;
    return `${year}년`;
  })();

  return (
    <div className="time-page -mx-6 -mt-6">
      {/* Header */}
      <div className="flex items-center justify-between px-8 py-5 border-b border-[#2a2a2a]">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="time-btn-nav"><ChevronLeft className="w-5 h-5" /></button>
          <h1 className="text-lg font-semibold text-white min-w-[220px] text-center">{dateLabel}</h1>
          <button onClick={() => navigate(1)} className="time-btn-nav"><ChevronRight className="w-5 h-5" /></button>
          <button onClick={() => { setDate(todayKST()); setYear(new Date().getFullYear()); setMonth(new Date().getMonth() + 1); }} className="time-btn-today">오늘</button>
        </div>
        <ViewTabs current={view} onChange={setView} />
      </div>

      {/* Content */}
      <div className="p-8">
        {loading ? <Skeleton view={view} /> :
          view === "daily" ? <DailyView events={events} stats={stats} report={report} planBlocks={planBlocks} date={date}
            onPlanAdd={async (b) => {
              await apiFetch("/api/time/plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) });
              fetchPlan(date);
            }}
            onPlanDelete={async (id) => {
              await apiFetch(`/api/time/plan?id=${id}`, { method: "DELETE" });
              fetchPlan(date);
            }}
          /> :
          view === "weekly" ? <WeeklyView data={weeklyData} /> :
          view === "monthly" ? <MonthlyView data={monthlyData} /> :
          <YearlyView data={yearlyData} />}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// View Tabs
// ═══════════════════════════════════════════════════════
function ViewTabs({ current, onChange }: { current: View; onChange: (v: View) => void }) {
  const tabs: { id: View; label: string; icon: typeof Clock }[] = [
    { id: "daily", label: "일간", icon: Clock },
    { id: "weekly", label: "주간", icon: Calendar },
    { id: "monthly", label: "월간", icon: TrendingUp },
    { id: "yearly", label: "연간", icon: Star },
  ];
  return (
    <div className="flex bg-[#141414] rounded-lg p-1 gap-0.5">
      {tabs.map(t => (
        <button key={t.id} onClick={() => onChange(t.id)}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-all ${
            current === t.id ? "bg-[#00E676] text-black" : "text-[#888] hover:text-white hover:bg-[#1e1e1e]"
          }`}>
          <t.icon className="w-4 h-4" />
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// Daily View — Elon Musk Timeboxing (Reference Layout)
// Top: [Brain Dump + Top 3] | [Plan | T | Do]
// Bottom: Donut + Project Bars + Stats + AI Insight
// ═══════════════════════════════════════════════════════
function DailyView({ events, stats, report, planBlocks, date, onPlanAdd, onPlanDelete }: {
  events: ActivityEvent[];
  stats: { total_minutes: number; total_sessions: number; projects: string[]; categories: Record<string, number>; density: number };
  report: DailyReportV2 | null;
  planBlocks: PlanBlock[];
  date: string;
  onPlanAdd: (b: Omit<PlanBlock, "id">) => Promise<void>;
  onPlanDelete: (id: string) => Promise<void>;
}) {
  const [brainDump, setBrainDump] = useState("");
  const [priorities, setPriorities] = useState<Priority[]>([]);
  const [notesLoaded, setNotesLoaded] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parsedTasks, setParsedTasks] = useState<{ title: string; start_time: string; end_time: string; category: string }[] | null>(null);
  const [savingParsed, setSavingParsed] = useState(false);

  // Load notes for this date
  useEffect(() => {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
    let cancelled = false;
    setNotesLoaded(false);
    apiFetch(`/api/time/notes?date=${date}`)
      .then(r => r.json())
      .then((n: DailyNotes) => {
        if (cancelled) return;
        setBrainDump(n.brain_dump || "");
        setPriorities(n.priorities || []);
        setNotesLoaded(true);
      })
      .catch(() => { if (!cancelled) setNotesLoaded(true); });
    return () => { cancelled = true; };
  }, [date]);

  // Auto-save brain dump with debounce
  const saveBrainDump = useCallback((text: string) => {
    setBrainDump(text);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      apiFetch("/api/time/notes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, brain_dump: text }),
      }).catch(() => {});
    }, 1000);
  }, [date]);

  // Save priorities
  const savePriorities = useCallback((ps: Priority[]) => {
    setPriorities(ps);
    apiFetch("/api/time/notes", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, priorities: ps }),
    }).catch(() => {});
  }, [date]);

  // Parse brain dump → structured tasks via AI
  const parseBrainDump = useCallback(async () => {
    if (!brainDump.trim()) return;
    setParsing(true);
    setParsedTasks(null);
    try {
      const res = await apiFetch("/api/time/plan/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          text: brainDump,
          existing_blocks: planBlocks.map(b => ({ start_time: b.start_time, end_time: b.end_time, title: b.title })),
        }),
      });
      const data = await res.json();
      if (data.tasks?.length) {
        setParsedTasks(data.tasks);
      }
    } catch { /* ignore */ }
    setParsing(false);
  }, [brainDump, date, planBlocks]);

  // Remove a parsed task from preview
  const removeParsedTask = (idx: number) => {
    setParsedTasks(prev => prev ? prev.filter((_, i) => i !== idx) : null);
  };

  // Confirm parsed tasks → save as plan_blocks
  const confirmParsedTasks = useCallback(async () => {
    if (!parsedTasks?.length) return;
    setSavingParsed(true);
    for (const t of parsedTasks) {
      await onPlanAdd({
        date,
        start_time: t.start_time,
        end_time: t.end_time,
        title: t.title,
        category: t.category,
        color: null,
      });
    }
    setParsedTasks(null);
    setBrainDump("");
    // Clear brain dump from DB too
    apiFetch("/api/time/notes", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, brain_dump: "" }),
    }).catch(() => {});
    setSavingParsed(false);
  }, [parsedTasks, date, onPlanAdd]);

  // Build project stats for bottom section
  const projectStats: { name: string; mins: number }[] = [];
  const pMap: Record<string, number> = {};
  for (const e of events) {
    const p = String((e.metadata as Record<string, unknown>)?.project || "기타");
    pMap[p] = (pMap[p] || 0) + (e.duration_minutes || 0);
  }
  for (const [name, mins] of Object.entries(pMap)) {
    projectStats.push({ name, mins });
  }
  projectStats.sort((a, b) => b.mins - a.mins);
  const maxProjectMins = Math.max(...projectStats.map(p => p.mins), 1);

  return (
    <div className="space-y-4">
      {/* ════ TOP SECTION: Brain Dump + Priorities (1/3) | Timebox (2/3) ════ */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_2fr] gap-4">
        {/* ── Left Half: Top 3 + Brain Dump ── */}
        <div className="space-y-3">
          <Card title="TOP 3 PRIORITIES">
            <TopPrioritiesChecklist priorities={priorities} onUpdate={savePriorities} brainDump={brainDump} date={date} />
          </Card>

          <Card title="BRAIN DUMP" className="flex-1">
            {parsedTasks ? (
              /* ── Preview: AI-extracted tasks ── */
              <div className="space-y-2">
                <p className="text-[11px] text-[#666] mb-2">AI가 추출한 계획 — 삭제하거나 확인하세요</p>
                {parsedTasks.map((t, i) => (
                  <div key={i} className="flex items-center gap-2 p-2.5 rounded-lg bg-[#1a1a1a] group">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: CAT_COLORS[t.category] || "#666" }} />
                    <span className="text-[12px] text-[#888] font-mono w-[90px] shrink-0">{t.start_time}~{t.end_time}</span>
                    <span className="text-[13px] text-white flex-1 truncate">{t.title}</span>
                    <span className="text-[10px] text-[#555] shrink-0">{CAT_LABELS[t.category] || t.category}</span>
                    <button onClick={() => removeParsedTask(i)}
                      className="opacity-0 group-hover:opacity-100 text-[#666] hover:text-[#ff4757] transition-all shrink-0">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                <div className="flex gap-2 pt-2">
                  <button onClick={confirmParsedTasks} disabled={savingParsed || parsedTasks.length === 0}
                    className="bg-[#00E676] text-black text-xs font-semibold px-4 py-2 rounded-lg hover:bg-[#00C853] disabled:opacity-40 transition-colors">
                    {savingParsed ? "저장 중..." : `Plan에 추가 (${parsedTasks.length}건)`}
                  </button>
                  <button onClick={() => setParsedTasks(null)}
                    className="text-xs text-[#666] hover:text-white px-3 py-2 rounded-lg border border-[#333] hover:border-[#555] transition-colors">
                    취소
                  </button>
                </div>
              </div>
            ) : (
              /* ── Input: textarea + 정리 button ── */
              <div className="relative">
                <textarea
                  value={brainDump}
                  onChange={e => saveBrainDump(e.target.value)}
                  placeholder={"오늘 할 일을 자유롭게 적으세요...\n\n예: 오전에 tessera 빌드, 점심 후 secretary UI 손보기, 저녁에 운동"}
                  className="w-full min-h-[280px] bg-[#0a0a0a] border border-[#2a2a2a] rounded-xl p-4 pr-20 text-[15px] text-[#ccc] placeholder-[#444] resize-y outline-none focus:border-[#00E676]/50 leading-relaxed"
                />
                {brainDump.trim() && (
                  <button onClick={parseBrainDump} disabled={parsing}
                    className="absolute bottom-4 right-4 bg-[#00E676] text-black text-xs font-bold px-4 py-2 rounded-lg hover:bg-[#00C853] disabled:opacity-50 transition-colors">
                    {parsing ? "분석 중..." : "⚡ 정리"}
                  </button>
                )}
              </div>
            )}
          </Card>
        </div>

        {/* ── Right Half: Plan | T | Do Timebox Grid ── */}
        <Card title="" className="overflow-hidden !p-0">
          <TimeboxGrid events={events} planBlocks={planBlocks} date={date} onPlanAdd={onPlanAdd} onPlanDelete={onPlanDelete} />
        </Card>
      </div>

      {/* ════ BOTTOM SECTION: Auto Stats ════ */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr_180px] gap-4">
        {/* ── Donut Chart (Category breakdown) ── */}
        <Card title="CATEGORIES">
          <div className="flex items-center gap-6">
            <CategoryDonut categories={stats.categories} total={stats.total_minutes} />
            <div className="flex-1 space-y-2">
              {Object.entries(stats.categories).sort(([,a],[,b]) => b - a).map(([cat, mins]) => (
                <div key={cat} className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: CAT_COLORS[cat] || "#666" }} />
                  <span className="text-[14px] text-[#888] flex-1">{CAT_LABELS[cat] || cat}</span>
                  <span className="text-[14px] text-white font-medium font-mono">{fmtDurShort(mins)}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* ── Project Progress Bars ── */}
        <Card title="PROJECTS">
          <div className="space-y-3">
            {projectStats.slice(0, 6).map(p => (
              <div key={p.name}>
                <div className="flex justify-between mb-0.5">
                  <span className="text-[14px] text-white truncate">{p.name}</span>
                  <span className="text-[13px] text-[#888] font-mono ml-2">{fmtDurShort(p.mins)}</span>
                </div>
                <div className="h-1.5 rounded-full bg-[#1a1a1a]">
                  <div className="h-full rounded-full bg-[#00E676] transition-all duration-500"
                    style={{ width: `${(p.mins / maxProjectMins) * 100}%` }} />
                </div>
              </div>
            ))}
            {projectStats.length === 0 && <div className="text-xs text-[#555]">활동 없음</div>}
          </div>
        </Card>

        {/* ── Stats Cards ── */}
        <div className="space-y-2">
          <MiniStat label="활동시간" value={fmtDurShort(stats.total_minutes)} icon={Clock} />
          <MiniStat label="세션" value={`${stats.total_sessions}`} icon={Code2} />
          <MiniStat label="프로젝트" value={`${stats.projects.length}`} icon={FolderOpen} />
          <MiniStat label="밀도" value={`${stats.density}%`} icon={Zap}
            color={stats.density >= 60 ? "#00E676" : stats.density >= 30 ? "#FFD740" : "#ff4757"} />
        </div>
      </div>

      {/* ════ HOURLY SUMMARY: 시간대별 뭘 했는지 ════ */}
      {events.length > 0 && (
        <Card title="시간대별 활동">
          <HourlySummary events={events} />
        </Card>
      )}

      {/* ════ PER-PROJECT SUMMARY: 건별 뭘 했나 ════ */}
      {events.length > 0 && (
        <Card title="프로젝트별 작업 내역">
          <ProjectSummary events={events} />
        </Card>
      )}

      {/* ── AI Insight (3 lines) ── */}
      <AiInsight date={date} eventCount={events.length} />
    </div>
  );
}

// ── Category Donut (SVG) ──
function CategoryDonut({ categories, total }: { categories: Record<string, number>; total: number }) {
  const size = 100;
  const cx = size / 2, cy = size / 2;
  const r = 36, strokeW = 14;

  if (total === 0) {
    return (
      <svg width={size} height={size} className="shrink-0">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1e1e1e" strokeWidth={strokeW} />
        <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" className="fill-[#555] text-xs">0m</text>
      </svg>
    );
  }

  const sorted = Object.entries(categories).sort(([,a],[,b]) => b - a);
  const circumference = 2 * Math.PI * r;
  let offset = -circumference / 4; // start at 12 o'clock

  return (
    <svg width={size} height={size} className="shrink-0">
      {/* Background ring */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1e1e1e" strokeWidth={strokeW} />
      {/* Category segments */}
      {sorted.map(([cat, mins]) => {
        const pct = mins / total;
        const dash = pct * circumference;
        const el = (
          <circle key={cat} cx={cx} cy={cy} r={r} fill="none"
            stroke={CAT_COLORS[cat] || "#666"} strokeWidth={strokeW}
            strokeDasharray={`${dash} ${circumference - dash}`}
            strokeDashoffset={-offset}
            strokeLinecap="butt"
            className="transition-all duration-500" />
        );
        offset += dash;
        return el;
      })}
      {/* Center text */}
      <text x={cx} y={cy - 6} textAnchor="middle" dominantBaseline="central" className="fill-white text-sm font-bold">{fmtDurShort(total)}</text>
      <text x={cx} y={cy + 10} textAnchor="middle" dominantBaseline="central" className="fill-[#666] text-[10px]">활동</text>
    </svg>
  );
}

// ── Mini Stat (for bottom right) ──
function MiniStat({ label, value, icon: Icon, color = "#00E676" }: { label: string; value: string; icon: typeof Clock; color?: string }) {
  return (
    <div className="bg-[#141414] border border-[#1e1e1e] rounded-lg p-3 flex items-center gap-2.5">
      <Icon className="w-3.5 h-3.5 shrink-0" style={{ color }} />
      <div>
        <div className="text-lg font-bold text-white leading-tight">{value}</div>
        <div className="text-[11px] text-[#555] uppercase tracking-wide">{label}</div>
      </div>
    </div>
  );
}

// ── Timebox Grid: Plan (vertical timeline) + Do (10-min table grid) ──
// Do grid: rows = hours, cols = 00/10/20/30/40/50
// Each cell shows category keyword. Click → detail popover.

function TimeboxGrid({ events: rawEvents, planBlocks, date, onPlanAdd, onPlanDelete }: {
  events: ActivityEvent[];
  planBlocks: PlanBlock[];
  date: string;
  onPlanAdd: (b: Omit<PlanBlock, "id">) => Promise<void>;
  onPlanDelete: (id: string) => Promise<void>;
}) {
  const [showAddPlan, setShowAddPlan] = useState(false);
  const [selectedCell, setSelectedCell] = useState<{ hour: number; slot: number } | null>(null);
  const events = rawEvents.filter(e => (e.duration_minutes || 0) >= 1);

  const startHour = 7;
  const endHour = 26; // up to 02:50 next day
  const ROW_H = 36; // px per hour row — tight density
  const PLAN_SLOT_H = ROW_H; // plan blocks match row height

  // Wrap early morning (0~6) to after midnight (24~30)
  const toGridHour = (h: number) => h < startHour ? h + 24 : h;

  // Build 10-min cell map: cellMap[hour][slotIdx] = events in that 10-min
  const cellMap: Record<number, Record<number, ActivityEvent[]>> = {};
  for (let h = startHour; h <= endHour; h++) {
    cellMap[h] = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [] };
  }
  for (const ev of events) {
    const startMin = kstTotalMinutes(ev.started_at);
    const dur = ev.duration_minutes || 1;
    const gridStartMin = startMin < startHour * 60 ? startMin + 24 * 60 : startMin;
    // Fill each 10-min slot this event touches
    for (let m = gridStartMin; m < gridStartMin + dur; m += 10) {
      const h = Math.floor(m / 60);
      const s = Math.floor((m % 60) / 10);
      if (h >= startHour && h <= endHour && cellMap[h]?.[s]) {
        if (!cellMap[h][s].some(e => e.id === ev.id)) {
          cellMap[h][s].push(ev);
        }
      }
    }
  }

  // Dominant category for a cell
  const cellCategory = (evs: ActivityEvent[]): string | null => {
    if (evs.length === 0) return null;
    const cats: Record<string, number> = {};
    for (const e of evs) cats[e.category] = (cats[e.category] || 0) + (e.duration_minutes || 1);
    return Object.entries(cats).sort(([, a], [, b]) => b - a)[0][0];
  };

  // Place plan blocks (vertical, left side)
  const placedPlans = planBlocks.map(pb => {
    const [sh, sm] = pb.start_time.split(":").map(Number);
    const [eh, em] = pb.end_time.split(":").map(Number);
    const startGridH = toGridHour(sh);
    const endGridH = toGridHour(eh);
    const startOff = (startGridH - startHour) + sm / 60;
    const endOff = (endGridH - startHour) + em / 60;
    const top = startOff * ROW_H;
    const height = Math.max(ROW_H * 0.4, (endOff - startOff) * ROW_H);
    const color = CAT_COLORS[pb.category] || "#00E676";
    return { pb, top, height, color };
  });

  // Current time
  const now = new Date();
  const nowKST = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const nowH = toGridHour(nowKST.getUTCHours());
  const nowM = nowKST.getUTCMinutes();
  const nowRowOff = (nowH - startHour) + nowM / 60;
  const nowY = nowRowOff * ROW_H;
  const isToday = date === todayKST();

  const hours = Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i);
  const gridH = hours.length * ROW_H;

  // Detail for selected cell
  const selectedEvents = selectedCell ? (cellMap[selectedCell.hour]?.[selectedCell.slot] || []) : [];
  const selectedTime = selectedCell ? `${selectedCell.hour % 24}:${String(selectedCell.slot * 10).padStart(2, "0")}` : "";

  // Plan block lookup by hour
  const planByHour: Record<number, typeof placedPlans> = {};
  for (const pp of placedPlans) {
    const startH = Math.floor(pp.top / ROW_H) + startHour;
    const endH = Math.ceil((pp.top + pp.height) / ROW_H) + startHour;
    for (let h = startH; h < endH; h++) {
      if (!planByHour[h]) planByHour[h] = [];
      if (!planByHour[h].includes(pp)) planByHour[h].push(pp);
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Add Plan Modal */}
      {showAddPlan && <AddPlanModal date={date} onAdd={async (b) => { await onPlanAdd(b); setShowAddPlan(false); }} onClose={() => setShowAddPlan(false)} />}

      {/* Selected cell detail popover */}
      {selectedCell && selectedEvents.length > 0 && (
        <div className="border-b border-[#2a2a2a] bg-[#111] px-4 py-3 relative">
          <button onClick={() => setSelectedCell(null)} className="absolute top-2 right-2 text-[#666] hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
          <div className="text-xs text-[#888] mb-2 font-mono">{selectedTime} ~ {selectedCell.hour % 24}:{String(selectedCell.slot * 10 + 10).padStart(2, "0")}</div>
          <div className="space-y-1.5">
            {selectedEvents.map((ev, i) => {
              const project = ev.metadata ? String((ev.metadata as Record<string, unknown>).project || "") : "";
              return (
                <div key={ev.id || i} className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: CAT_COLORS[ev.category] || "#666" }} />
                  <div className="min-w-0">
                    <div className="text-[12px] text-white">{CAT_LABELS[ev.category] || ev.category}{project ? ` · ${project}` : ""}</div>
                    <div className="text-[11px] text-[#888] truncate">{truncTitle(ev.title)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Table grid: Plan | T | Do — column order is FIXED */}
      <table className="w-full" style={{ tableLayout: "fixed", borderCollapse: "collapse", borderSpacing: 0 }}>
        <colgroup>
          <col style={{ width: "38%" }} />   {/* Plan */}
          <col style={{ width: "24px" }} />  {/* T - time label */}
          <col />                            {/* Do - remaining ~62% */}
        </colgroup>
        <thead>
          <tr style={{ borderBottom: "1px solid #2a2a2a" }}>
            <th className="py-1.5 text-left px-2">
              <div className="flex items-center gap-1.5">
                <span className="text-[13px] font-semibold text-[#888] uppercase tracking-wide">Plan</span>
                <button onClick={() => setShowAddPlan(true)} className="w-4 h-4 rounded bg-[#222] hover:bg-[#00E676]/20 flex items-center justify-center transition-colors">
                  <Plus className="w-2.5 h-2.5 text-[#666] hover:text-[#00E676]" />
                </button>
              </div>
            </th>
            <th className="py-1.5 text-[11px] text-[#555] font-normal">T</th>
            <th className="py-1.5 px-1">
              <div className="flex items-center">
                <span className="text-[13px] font-semibold text-[#00E676] uppercase tracking-wide mr-1.5">Do</span>
                <div className="flex-1 grid grid-cols-6 text-center">
                  {[":00", ":10", ":20", ":30", ":40", ":50"].map(l => (
                    <span key={l} className="text-[11px] text-[#555] font-mono">{l}</span>
                  ))}
                </div>
              </div>
            </th>
          </tr>
        </thead>
        <tbody>
          {hours.map(h => {
            const isNowHour = isToday && nowH === h;
            const nowSlot = isNowHour ? Math.floor(nowM / 10) : -1;
            const plans = planByHour[h] || [];
            return (
              <tr key={h} className={isNowHour ? "bg-[#ff4757]/[0.03]" : ""}
                style={{ height: `${ROW_H}px`, borderTop: "1px solid #1a1a1a" }}>
                {/* Plan — FIRST column */}
                <td className="align-top px-1.5 py-0.5" style={{ borderRight: "1px solid #222" }}>
                  {plans.map(({ pb, color }) => (
                    <div key={pb.id} className="flex items-center gap-1 group leading-tight">
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                      <span className="text-[13px] text-[#bbb] truncate flex-1">{pb.title}</span>
                      <button onClick={() => onPlanDelete(pb.id)}
                        className="opacity-0 group-hover:opacity-100 shrink-0 transition-opacity">
                        <X className="w-2.5 h-2.5 text-[#555] hover:text-[#ff4757]" />
                      </button>
                    </div>
                  ))}
                  {plans.length === 0 && h === startHour + 9 && placedPlans.length === 0 && (
                    <button onClick={() => setShowAddPlan(true)} className="text-[11px] text-[#444] hover:text-[#888]">+ 추가</button>
                  )}
                </td>
                {/* T — time label — SECOND column */}
                <td className="text-center align-top pt-0.5" style={{ borderRight: "1px solid #222" }}>
                  <span className="text-[12px] text-[#555] font-mono leading-none">{h % 24}</span>
                </td>
                {/* Do — 6 cells — THIRD column */}
                <td className="p-0">
                  <div className="grid grid-cols-6 h-full">
                    {[0, 1, 2, 3, 4, 5].map(s => {
                      const evs = cellMap[h]?.[s] || [];
                      const cat = cellCategory(evs);
                      const color = cat ? (CAT_COLORS[cat] || "#666") : "transparent";
                      const label = cat ? (CAT_LABELS[cat] || cat) : "";
                      const isSelected = selectedCell?.hour === h && selectedCell?.slot === s;
                      const isNowCell = isNowHour && nowSlot === s;
                      const multiSession = evs.length > 1;
                      return (
                        <div key={s}
                          onClick={() => evs.length > 0 ? setSelectedCell(isSelected ? null : { hour: h, slot: s }) : undefined}
                          className={`relative flex items-center justify-center transition-all ${
                            evs.length > 0 ? "cursor-pointer hover:brightness-150" : ""
                          } ${isSelected ? "ring-1 ring-[#00E676] z-10" : ""} ${isNowCell ? "ring-1 ring-[#ff4757]/40" : ""}`}
                          style={{
                            backgroundColor: cat ? `${color}18` : "transparent",
                            height: `${ROW_H}px`,
                            borderRight: s < 5 ? "1px solid #1a1a1a" : "none",
                          }}>
                          {label && (
                            <span className="text-[11px] leading-none truncate px-0.5" style={{ color }}>
                              {label}
                            </span>
                          )}
                          {multiSession && (
                            <span className="absolute top-0 right-0.5 text-[9px] text-[#666]">{evs.length}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Add Plan Modal ──
function AddPlanModal({ date, onAdd, onClose }: {
  date: string;
  onAdd: (b: Omit<PlanBlock, "id">) => Promise<void>;
  onClose: () => void;
}) {
  const [title, setTitle] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [category, setCategory] = useState("coding");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!title.trim() || startTime >= endTime) return;
    setSaving(true);
    try {
      await onAdd({ date, start_time: startTime, end_time: endTime, title: title.trim(), category, color: null });
    } finally { setSaving(false); }
  };

  return (
    <div className="border-b border-[#2a2a2a] bg-[#111] px-6 py-4">
      <div className="flex items-center gap-3 flex-wrap">
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="할 일"
          className="bg-[#1a1a1a] border border-[#333] rounded-lg px-3 py-2 text-sm text-white flex-1 min-w-[150px] focus:border-[#00E676] outline-none" />
        <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)}
          className="bg-[#1a1a1a] border border-[#333] rounded-lg px-3 py-2 text-sm text-white w-[110px] outline-none" />
        <span className="text-[#555]">~</span>
        <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)}
          className="bg-[#1a1a1a] border border-[#333] rounded-lg px-3 py-2 text-sm text-white w-[110px] outline-none" />
        <select value={category} onChange={e => setCategory(e.target.value)}
          className="bg-[#1a1a1a] border border-[#333] rounded-lg px-3 py-2 text-sm text-white outline-none">
          {Object.entries(CAT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button onClick={handleSubmit} disabled={saving || !title.trim()}
          className="bg-[#00E676] text-black text-sm font-semibold px-4 py-2 rounded-lg hover:bg-[#00C853] disabled:opacity-40 transition-colors">
          {saving ? "..." : "추가"}
        </button>
        <button onClick={onClose} className="text-[#666] hover:text-white transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ── Top Priorities (Checklist from Brain Dump or manual) ──
function TopPrioritiesChecklist({ priorities, onUpdate, brainDump, date }: {
  priorities: Priority[];
  onUpdate: (ps: Priority[]) => void;
  brainDump: string;
  date: string;
}) {
  const [generating, setGenerating] = useState(false);

  const toggleDone = (idx: number) => {
    const next = [...priorities];
    next[idx] = { ...next[idx], done: !next[idx].done };
    onUpdate(next);
  };

  const removePriority = (idx: number) => {
    onUpdate(priorities.filter((_, i) => i !== idx));
  };

  const generateFromDump = async () => {
    if (!brainDump.trim()) return;
    setGenerating(true);
    try {
      const res = await apiFetch("/api/time/priorities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, brain_dump: brainDump }),
      });
      const data = await res.json();
      if (data.priorities?.length) onUpdate(data.priorities);
    } catch { /* ignore */ }
    setGenerating(false);
  };

  return (
    <div className="space-y-2">
      {priorities.length === 0 ? (
        <div className="text-sm text-[#555] py-2">
          {brainDump.trim() ? (
            <button onClick={generateFromDump} disabled={generating}
              className="text-[#00E676] hover:text-[#00C853] transition-colors disabled:opacity-50">
              {generating ? "AI 분석 중..." : "Brain Dump에서 우선순위 추출 →"}
            </button>
          ) : (
            "Brain Dump에 오늘 할 일을 적으면 AI가 우선순위를 추출합니다"
          )}
        </div>
      ) : (
        <>
          {priorities.map((p, i) => (
            <div key={i} className="flex items-center gap-2.5 p-2.5 rounded-lg bg-[#1a1a1a] hover:bg-[#1e1e1e] transition-colors group">
              <button onClick={() => toggleDone(i)}
                className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-all ${
                  p.done ? "bg-[#00E676] border-[#00E676]" : "border-[#444] hover:border-[#00E676]"
                }`}>
                {p.done && <svg className="w-3 h-3 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
              </button>
              <span className={`text-sm flex-1 ${p.done ? "text-[#555] line-through" : "text-white"}`}>{p.text}</span>
              <button onClick={() => removePriority(i)}
                className="opacity-0 group-hover:opacity-100 text-[#666] hover:text-[#ff4757] transition-all">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          {brainDump.trim() && (
            <button onClick={generateFromDump} disabled={generating}
              className="text-xs text-[#555] hover:text-[#00E676] transition-colors mt-1 disabled:opacity-50">
              {generating ? "분석 중..." : "다시 추출"}
            </button>
          )}
        </>
      )}
    </div>
  );
}

// ── Hourly Summary (시간대별 활동) ──
function HourlySummary({ events }: { events: ActivityEvent[] }) {
  // Group events by KST hour
  const hourMap: Record<number, { titles: string[]; cats: Set<string> }> = {};
  for (const e of events) {
    const h = (new Date(e.started_at).getUTCHours() + 9) % 24;
    if (!hourMap[h]) hourMap[h] = { titles: [], cats: new Set() };
    hourMap[h].cats.add(e.category);
    const t = e.title?.replace(/^\[.*?\]\s*/, "").slice(0, 40) || "";
    if (t) hourMap[h].titles.push(t);
  }
  const hours = Object.keys(hourMap).map(Number).sort((a, b) => a - b);
  if (!hours.length) return <div className="text-xs text-[#555]">활동 없음</div>;

  return (
    <div className="space-y-1.5">
      {hours.map(h => {
        const { titles, cats } = hourMap[h];
        const catLabel = [...cats].map(c => CAT_LABELS[c] || c).join("/");
        return (
          <div key={h} className="flex gap-3 text-[14px] leading-relaxed">
            <span className="text-[#555] font-mono w-6 shrink-0">{h}</span>
            <span className="text-[#00E676] w-12 shrink-0">{catLabel}</span>
            <span className="text-[#999] truncate">{titles.join(" · ")}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Project Summary (건별 작업 내역) ──
function ProjectSummary({ events }: { events: ActivityEvent[] }) {
  const projMap: Record<string, string[]> = {};
  for (const e of events) {
    const p = String((e.metadata as Record<string, unknown>)?.project || "기타");
    if (!projMap[p]) projMap[p] = [];
    const t = e.title?.replace(/^\[.*?\]\s*/, "") || "";
    if (t && !projMap[p].includes(t)) projMap[p].push(t);
  }
  const projects = Object.entries(projMap).sort(([, a], [, b]) => b.length - a.length);
  if (!projects.length) return null;

  return (
    <div className="space-y-3">
      {projects.map(([proj, titles]) => (
        <div key={proj}>
          <div className="text-[14px] font-semibold text-white mb-0.5">{proj} <span className="text-[#555] font-normal">({titles.length}건)</span></div>
          <div className="space-y-0.5 pl-3">
            {titles.slice(0, 5).map((t, i) => (
              <div key={i} className="text-[13px] text-[#888] truncate">· {t}</div>
            ))}
            {titles.length > 5 && <div className="text-[12px] text-[#555]">+{titles.length - 5}건 더</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── AI Insight (lazy-loaded) ──
function AiInsight({ date, eventCount }: { date: string; eventCount: number }) {
  const [insight, setInsight] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (eventCount === 0) { setInsight(null); return; }
    let cancelled = false;
    setLoading(true);
    apiFetch(`/api/time/insight?date=${date}`)
      .then(r => r.json())
      .then(d => { if (!cancelled) setInsight(d.insight || null); })
      .catch(() => { if (!cancelled) setInsight(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [date, eventCount]);

  if (!insight && !loading) return null;

  return (
    <div className="bg-[#141414] border border-[#1e1e1e] rounded-lg px-4 py-3">
      <div className="flex items-start gap-2.5">
        <Star className="w-3.5 h-3.5 text-[#FFD740] mt-0.5 shrink-0" />
        {loading ? (
          <div className="text-[14px] text-[#555] italic">AI 분석 중...</div>
        ) : (
          <p className="text-[14px] text-[#999] leading-relaxed whitespace-pre-wrap line-clamp-3 italic">{insight}</p>
        )}
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════
// Weekly View
// ═══════════════════════════════════════════════════════
function WeeklyView({ data }: { data: TimeViewWeekly | null }) {
  if (!data) return <Empty />;
  const max = Math.max(...data.days.map(d => d.total_minutes), 1);

  return (
    <div className="space-y-6">
      <Card title="주간 리듬">
        <div className="flex items-end gap-3 h-48 pt-4">
          {data.days.map(day => {
            const pct = (day.total_minutes / max) * 100;
            const d = new Date(day.date + "T00:00:00+09:00");
            const dn = WEEKDAYS[(d.getDay() + 6) % 7];
            const weekend = d.getDay() === 0 || d.getDay() === 6;
            return (
              <div key={day.date} className="flex-1 flex flex-col items-center gap-2">
                <span className="text-sm text-[#888] font-mono">{day.total_minutes > 0 ? `${Math.floor(day.total_minutes/60)}h` : ""}</span>
                <div className="w-full rounded-lg transition-all duration-500" style={{
                  height: `${Math.max(pct, 4)}%`,
                  backgroundColor: day.total_minutes > 0 ? (weekend ? "#7C4DFF" : "#00E676") : "#1e1e1e",
                }} />
                <span className={`text-sm font-medium ${weekend ? "text-[#7C4DFF]" : "text-[#888]"}`}>{dn}</span>
                <span className="text-xs text-[#666]">{day.date.slice(5)}</span>
              </div>
            );
          })}
        </div>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <BigStat label="총 활동" value={fmtDur(data.totals.total_minutes)} />
        <BigStat label="세션" value={`${data.totals.total_sessions}개`} />
        <BigStat label="일 평균" value={fmtDur(data.totals.avg_minutes_per_day)} />
        <BigStat label="TOP" value={data.totals.top_projects[0]?.name || "-"} />
      </div>

      {data.totals.top_projects.length > 0 && (
        <Card title="프로젝트별">
          <div className="space-y-3">
            {data.totals.top_projects.map(p => {
              const pct = (p.minutes / data.totals.total_minutes) * 100;
              return (
                <div key={p.name}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-white">{p.name}</span>
                    <span className="text-[#888] font-mono">{fmtDur(p.minutes)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-[#1a1a1a]">
                    <div className="h-full rounded-full bg-[#00E676] transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// Monthly View
// ═══════════════════════════════════════════════════════
function MonthlyView({ data }: { data: TimeViewMonthly | null }) {
  if (!data) return <Empty />;
  const max = Math.max(...data.days.map(d => d.total_minutes), 1);
  const first = new Date(`${data.year}-${String(data.month).padStart(2,"0")}-01T00:00:00+09:00`);
  const offset = (first.getDay() + 6) % 7;

  return (
    <div className="space-y-6">
      <Card title={`${data.year}년 ${data.month}월`}>
        <div className="grid grid-cols-7 gap-2 mb-2">
          {WEEKDAYS.map(d => <div key={d} className="text-center text-xs font-semibold text-[#666] py-1">{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-2">
          {Array.from({ length: offset }).map((_, i) => <div key={`e${i}`} />)}
          {data.days.map(day => {
            const intensity = day.total_minutes / max;
            const num = parseInt(day.date.split("-")[2]);
            return (
              <div key={day.date}
                className="aspect-square rounded-xl flex flex-col items-center justify-center gap-1 cursor-default transition-all hover:scale-105"
                style={{ backgroundColor: day.total_minutes > 0 ? `rgba(0, 230, 118, ${0.08 + intensity * 0.6})` : "#141414" }}
                title={`${day.date}: ${fmtDur(day.total_minutes)} / ${day.session_count}세션`}>
                <span className="text-sm text-[#888]">{num}</span>
                {day.total_minutes > 0 && <span className="text-xs text-[#00E676] font-mono font-semibold">{Math.floor(day.total_minutes/60)}h</span>}
              </div>
            );
          })}
        </div>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <BigStat label="총 활동" value={fmtDur(data.totals.total_minutes)} />
        <BigStat label="세션" value={`${data.totals.total_sessions}개`} />
        <BigStat label="활동일" value={`${data.totals.active_days}/${data.days.length}일`} />
        <BigStat label="TOP" value={data.totals.top_projects[0]?.name || "-"} />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// Yearly View (GitHub Grass)
// ═══════════════════════════════════════════════════════
function YearlyView({ data }: { data: TimeViewYearly | null }) {
  if (!data) return <Empty />;
  const max = Math.max(...data.days.map(d => d.total_minutes), 1);
  const dayMap: Record<string, number> = {};
  for (const d of data.days) dayMap[d.date] = d.total_minutes;

  const yearStart = new Date(`${data.year}-01-01T00:00:00+09:00`);
  const startOff = (yearStart.getDay() + 6) % 7;
  const cur = new Date(yearStart);
  cur.setDate(cur.getDate() - startOff);

  const weeks: { date: string; mins: number }[][] = [];
  while (cur.getFullYear() <= data.year || (cur.getFullYear() === data.year + 1 && cur.getMonth() === 0 && cur.getDate() <= 7)) {
    const week: { date: string; mins: number }[] = [];
    for (let d = 0; d < 7; d++) {
      const ds = fmtDate(cur);
      week.push({ date: ds, mins: dayMap[ds] || 0 });
      cur.setDate(cur.getDate() + 1);
    }
    weeks.push(week);
    if (weeks.length >= 54) break;
  }

  return (
    <div className="space-y-6">
      <Card title={`${data.year}년 활동 잔디`}>
        <div className="overflow-x-auto pb-2">
          <div className="flex gap-[3px] min-w-[720px]">
            <div className="flex flex-col gap-[3px] shrink-0 mr-1 pt-5">
              {["","화","","목","","토",""].map((d,i) => (
                <div key={i} className="h-[14px] text-[10px] text-[#666] flex items-center">{d}</div>
              ))}
            </div>
            {weeks.map((week, wi) => (
              <div key={wi} className="flex flex-col gap-[3px]">
                {wi % 4 === 0 && week[0].date.startsWith(String(data.year)) ? (
                  <div className="h-4 text-[10px] text-[#666] text-center">{MONTHS[parseInt(week[0].date.split("-")[1]) - 1]}</div>
                ) : <div className="h-4" />}
                {week.map(day => {
                  const inYear = day.date.startsWith(String(data.year));
                  const intensity = day.mins / max;
                  return (
                    <div key={day.date} className="w-[14px] h-[14px] rounded-[3px] transition-colors cursor-default"
                      style={{ backgroundColor: !inYear ? "transparent" : day.mins > 0 ? `rgba(0, 230, 118, ${0.12 + intensity * 0.78})` : "#1a1a1a" }}
                      title={inYear ? `${day.date}: ${fmtDur(day.mins)}` : ""} />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
        {/* Legend */}
        <div className="flex items-center gap-2 mt-4 text-xs text-[#666]">
          <span>적음</span>
          {[0.12, 0.3, 0.5, 0.7, 0.9].map(o => (
            <div key={o} className="w-[14px] h-[14px] rounded-[3px]" style={{ backgroundColor: `rgba(0, 230, 118, ${o})` }} />
          ))}
          <span>많음</span>
        </div>
      </Card>

      {/* Monthly breakdown */}
      <Card title="월별 요약">
        <div className="grid grid-cols-3 lg:grid-cols-6 gap-3">
          {data.totals.monthly_breakdown.map(m => (
            <div key={m.month} className="text-center p-4 rounded-xl bg-[#1a1a1a]">
              <div className="text-xs text-[#666] mb-1">{m.month}월</div>
              <div className="text-xl font-bold text-white">{m.minutes > 0 ? `${Math.floor(m.minutes/60)}h` : "-"}</div>
              <div className="text-xs text-[#666] mt-1">{m.sessions > 0 ? `${m.sessions}세션` : ""}</div>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <BigStat label="총 활동" value={fmtDur(data.totals.total_minutes)} />
        <BigStat label="총 세션" value={`${data.totals.total_sessions}개`} />
        <BigStat label="활동일" value={`${data.totals.active_days}일`} />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// Shared Components
// ═══════════════════════════════════════════════════════
function Card({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-[#141414] border border-[#1e1e1e] rounded-lg p-4 ${className}`}>
      {title && <div className="text-[13px] font-semibold text-[#555] uppercase tracking-wide mb-3">{title}</div>}
      {children}
    </div>
  );
}


function BigStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[#141414] border border-[#1e1e1e] rounded-lg p-4 text-center">
      <div className="text-[10px] text-[#555] uppercase tracking-wide mb-1.5">{label}</div>
      <div className="text-xl font-bold text-white">{value}</div>
    </div>
  );
}

function Skeleton({ view }: { view: View }) {
  if (view === "daily") {
    return (
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_2fr] gap-6">
        <div className="space-y-4">
          <div className="h-40 rounded-2xl bg-[#141414] animate-pulse" />
          <div className="h-[320px] rounded-2xl bg-[#141414] animate-pulse" />
        </div>
        <div className="h-[500px] rounded-2xl bg-[#141414] animate-pulse" />
      </div>
    );
  }
  return <div className="h-96 rounded-2xl bg-[#141414] animate-pulse" />;
}

function Empty() {
  return <div className="flex items-center justify-center h-64 text-[#666] text-lg">데이터가 없습니다</div>;
}

// ═══════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════

function fmtHour(h: number): string { return `${h % 24}`; }

function fmtTime(iso: string): string {
  const d = new Date(iso);
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return `${String(kst.getUTCHours()).padStart(2, "0")}:${String(kst.getUTCMinutes()).padStart(2, "0")}`;
}


function kstTotalMinutes(iso: string): number {
  const d = new Date(iso);
  const h = (d.getUTCHours() + 9) % 24;
  return h * 60 + d.getUTCMinutes();
}

function truncTitle(raw: string | null): string {
  if (!raw) return "코딩 세션";
  // Strip [project] prefix
  let t = raw.replace(/^\[.*?\]\s*/, "");
  // Strip AGENTS.md / system preamble noise
  t = t.replace(/^(AGENTS\.md|README\.md|CLAUDE\.md)\s*(instructions?|contents?|:)?\s*/i, "").trim();
  // If too short or meaningless, fallback
  if (t.length <= 3 || /^(안녕|say hi|hello|hi|test|ㅎㅇ|ㅎㅎ|hey)$/i.test(t)) return "코딩 세션";
  // Truncate long titles
  if (t.length > 50) t = t.slice(0, 50) + "…";
  return t;
}
