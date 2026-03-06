"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { Zap, Clock, MessageSquare, CheckCircle2, Play, Circle } from "lucide-react";

interface Todo { id: string; title: string; priority: number; is_done: boolean; }
interface TelegramMessage { id: string; role: string; content: string; created_at: string; }

export default function Dashboard() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [history, setHistory] = useState<TelegramMessage[]>([]);
  const [dailyPlanText, setDailyPlanText] = useState("");
  const [pcActiveMinutes, setPcActiveMinutes] = useState(0);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const [todosRes, historyRes, timeRes, planRes] = await Promise.all([
        apiFetch("/api/todos?status=pending"),
        apiFetch("/api/history?limit=5"),
        apiFetch(`/api/time?date=${today}`),
        apiFetch(`/api/daily-plan?date=${today}`)
      ]);
      if (todosRes.ok) setTodos((await todosRes.json()).todos || []);
      if (historyRes.ok) setHistory((await historyRes.json()).messages || []);
      if (timeRes.ok) {
        const timeData = await timeRes.json();
        const totalMin = (timeData.summaries || []).reduce((acc: number, h: any) => {
          return acc + (h.top_apps || []).reduce((a2: number, app: any) => a2 + app.minutes, 0);
        }, 0);
        setPcActiveMinutes(totalMin);
      }
      if (planRes.ok) {
        const planData = await planRes.json();
        setDailyPlanText(planData.planText || "");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const saveDailyPlan = async () => {
    const today = new Date().toISOString().split('T')[0];
    await apiFetch("/api/daily-plan", {
      method: "POST",
      body: JSON.stringify({ date: today, content: dailyPlanText })
    });
    alert("Saved!");
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="relative overflow-hidden rounded-[24px] p-6 border border-primary-neon/20 bg-primary-neon/5 neon-border-blue md:col-span-1">
          <div className="absolute -right-8 -top-8 size-32 bg-primary-neon/10 rounded-full blur-3xl"></div>
          <div className="flex flex-col gap-1 relative z-10">
            <div className="flex items-center gap-2 text-primary-neon">
              <Zap size={16} />
              <span className="text-[11px] font-bold uppercase tracking-wider">Pending Tasks</span>
            </div>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-4xl font-extrabold tracking-tight">{todos.length}</span>
              <span className="text-xs text-primary-neon font-medium">Items</span>
            </div>
          </div>
        </div>
        <div className="rounded-[24px] p-5 border border-zinc-800 bg-zinc-900/40 glass-effect flex flex-col justify-center">
          <div className="flex items-center gap-2 text-accent-purple mb-2">
            <Clock size={16} />
            <span className="text-[10px] font-bold uppercase tracking-wider">PC Time Today</span>
          </div>
          <span className="text-3xl font-bold tracking-tight">{Math.floor(pcActiveMinutes/60)}h {pcActiveMinutes%60}m</span>
        </div>
        <div className="rounded-[24px] p-5 border border-zinc-800 bg-zinc-900/40 glass-effect flex flex-col justify-center">
          <div className="flex items-center gap-2 text-blue-400 mb-2">
            <MessageSquare size={16} />
            <span className="text-[10px] font-bold uppercase tracking-wider">Recent Chats</span>
          </div>
          <span className="text-3xl font-bold tracking-tight">{history.length}</span>
        </div>
      </section>

      <section className="rounded-[24px] p-6 border border-zinc-800 bg-zinc-900/40 glass-effect">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold tracking-tight flex items-center gap-2"><Clock size={18} className="text-primary-neon"/> Daily Plan</h2>
          <div className="flex gap-2">
            <button className="px-3 py-1.5 rounded-lg bg-zinc-800 text-xs font-semibold text-zinc-300 hover:bg-zinc-700 transition">AI Generate</button>
            <button onClick={saveDailyPlan} className="px-3 py-1.5 rounded-lg bg-primary-neon text-dark-bg text-xs font-bold hover:bg-cyan-400 transition">Save</button>
          </div>
        </div>
        <textarea
          value={dailyPlanText}
          onChange={(e) => setDailyPlanText(e.target.value)}
          placeholder="09:00 - 10:00 Morning Check&#10;10:00 - 12:00 Deep Work"
          className="w-full bg-dark-bg border border-zinc-800 rounded-xl p-4 text-sm focus:border-primary-neon outline-none min-h-[120px] resize-y text-slate-300 font-mono"
        />
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="rounded-[24px] p-6 border border-zinc-800 bg-zinc-900/40 glass-effect">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold tracking-tight flex items-center gap-2"><CheckCircle2 size={18} className="text-accent-purple"/> Top Tasks</h2>
            <a href="/todos" className="text-xs text-zinc-400 hover:text-white">View All</a>
          </div>
          <div className="space-y-3">
            {todos.slice(0, 5).map(todo => (
              <div key={todo.id} className="group relative flex items-start gap-3 p-3 rounded-2xl bg-zinc-900/50 border border-zinc-800/50 hover:border-zinc-700 transition-all">
                <Circle size={18} className="text-zinc-500 mt-0.5" />
                <div className="flex-1 flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-tighter ${todo.priority === 0 ? 'bg-red-500/10 text-red-500' : 'bg-zinc-800 text-zinc-400'}`}>P{todo.priority}</span>
                  </div>
                  <p className="text-sm font-medium text-slate-200">{todo.title}</p>
                </div>
              </div>
            ))}
            {todos.length === 0 && <p className="text-sm text-zinc-500 text-center py-4">No pending tasks</p>}
          </div>
        </section>

        <section className="rounded-[24px] p-6 border border-zinc-800 bg-zinc-900/40 glass-effect">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold tracking-tight flex items-center gap-2"><MessageSquare size={18} className="text-blue-400"/> Recent Chat</h2>
            <a href="/history" className="text-xs text-zinc-400 hover:text-white">View All</a>
          </div>
          <div className="space-y-4">
            {history.map(msg => (
              <div key={msg.id} className={`flex gap-3 text-sm ${msg.role === 'assistant' ? '' : 'flex-row-reverse'}`}>
                <div className={`size-8 rounded-full flex items-center justify-center shrink-0 ${msg.role === 'assistant' ? 'bg-gradient-to-br from-primary-neon to-accent-purple text-dark-bg font-bold text-xs' : 'bg-zinc-800 text-slate-300 font-bold text-xs'}`}>
                  {msg.role === 'assistant' ? 'AI' : 'ME'}
                </div>
                <div className={`p-3 rounded-2xl max-w-[80%] ${msg.role === 'assistant' ? 'bg-zinc-900 border border-zinc-800 rounded-tl-none' : 'bg-primary-neon/10 border border-primary-neon/20 rounded-tr-none text-primary-neon'}`}>
                  <p className="line-clamp-2 leading-relaxed">{msg.content}</p>
                </div>
              </div>
            ))}
            {history.length === 0 && <p className="text-sm text-zinc-500 text-center py-4">No recent history</p>}
          </div>
        </section>
      </div>

      <section className="rounded-[24px] p-6 border border-zinc-800 bg-zinc-900/40 glass-effect overflow-x-auto">
        <h2 className="text-lg font-bold tracking-tight mb-4 flex items-center gap-2"><Play size={18} className="text-primary-neon"/> Activity Heatmap</h2>
        <div className="flex gap-1 min-w-[600px]">
          {Array.from({length: 24}).map((_, i) => (
            <div key={i} className="flex-1 flex flex-col gap-1 items-center">
              <div className="w-full h-8 rounded bg-zinc-800 hover:bg-primary-neon/40 transition-colors" title={`${i}:00`} />
              <span className="text-[10px] text-zinc-600">{i}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
