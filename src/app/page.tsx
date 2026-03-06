"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { CheckCircle2, Clock, MessageSquare, Circle } from "lucide-react";

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
      body: JSON.stringify({ date: today, planText: dailyPlanText })
    });
    alert("Saved!");
  };

  const doneCount = todos.filter(t => t.is_done).length;
  const totalCount = todos.length;

  return (
    <div className="max-w-[800px] mx-auto space-y-5">
      {/* Summary Cards */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Pending Tasks */}
        <div className="rounded-lg p-4 bg-bg-level1 border border-hairline">
          <div className="flex items-center gap-2 text-grey-600 mb-2">
            <CheckCircle2 size={14} />
            <span className="text-[12px] font-semibold">Pending Tasks</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-[36px] font-bold text-grey-900 leading-none">{todos.length}</span>
            <span className="text-[12px] text-grey-500 font-medium">items</span>
          </div>
        </div>

        {/* PC Time */}
        <div className="rounded-lg p-4 bg-bg-level1 border border-hairline">
          <div className="flex items-center gap-2 text-grey-600 mb-2">
            <Clock size={14} />
            <span className="text-[12px] font-semibold">PC Time Today</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-[36px] font-bold text-grey-900 leading-none">{Math.floor(pcActiveMinutes/60)}h {pcActiveMinutes%60}m</span>
          </div>
        </div>

        {/* Recent Chats */}
        <div className="rounded-lg p-4 bg-bg-level1 border border-hairline">
          <div className="flex items-center gap-2 text-grey-600 mb-2">
            <MessageSquare size={14} />
            <span className="text-[12px] font-semibold">Recent Chats</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-[36px] font-bold text-grey-900 leading-none">{history.length}</span>
            <span className="text-[12px] text-grey-500 font-medium">messages</span>
          </div>
        </div>
      </section>

      {/* Daily Plan */}
      <section className="rounded-lg p-4 bg-bg-level1 border border-hairline">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[15px] font-semibold text-grey-900 flex items-center gap-2">
            <Clock size={16} className="text-blue-500" /> Daily Plan
          </h2>
          <div className="flex gap-2">
            <button className="px-3 py-1.5 rounded-lg text-[12px] font-semibold text-grey-600 bg-bg-level2 hover:bg-bg-level3 transition-colors">
              AI Generate
            </button>
            <button onClick={saveDailyPlan} className="px-3 py-1.5 rounded-lg text-[12px] font-semibold text-white bg-blue-500 hover:bg-blue-600 transition-colors">
              Save
            </button>
          </div>
        </div>
        <textarea
          value={dailyPlanText}
          onChange={(e) => setDailyPlanText(e.target.value)}
          placeholder="09:00 - 10:00 Morning Check&#10;10:00 - 12:00 Deep Work"
          className="w-full bg-bg-base border border-hairline rounded-lg p-3 text-[14px] text-grey-800 placeholder:text-grey-400 focus:outline-none focus:shadow-[0_0_0_2px_rgba(49,130,246,0.3)] min-h-[120px] resize-y font-mono"
        />
      </section>

      {/* Tasks + Chat Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top Tasks */}
        <section className="rounded-lg p-4 bg-bg-level1 border border-hairline">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[15px] font-semibold text-grey-900">Top Tasks</h2>
            <a href="/todos" className="text-[12px] text-blue-500 font-semibold hover:text-blue-600">View All</a>
          </div>
          <div className="space-y-1">
            {todos.slice(0, 5).map(todo => (
              <div key={todo.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-[rgba(217,217,255,0.11)] transition-colors">
                <Circle size={16} className="text-grey-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] text-grey-800 truncate">{todo.title}</p>
                </div>
                <span className={`text-[11px] px-1.5 py-0.5 rounded font-semibold ${
                  todo.priority === 0 ? 'bg-red-500/10 text-red-500' : 'bg-bg-level2 text-grey-500'
                }`}>
                  P{todo.priority}
                </span>
              </div>
            ))}
            {todos.length === 0 && <p className="text-[14px] text-grey-500 text-center py-6">No pending tasks</p>}
          </div>
        </section>

        {/* Recent Chat */}
        <section className="rounded-lg p-4 bg-bg-level1 border border-hairline">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[15px] font-semibold text-grey-900">Recent Chat</h2>
            <a href="/history" className="text-[12px] text-blue-500 font-semibold hover:text-blue-600">View All</a>
          </div>
          <div className="space-y-3">
            {history.map(msg => (
              <div key={msg.id} className={`flex gap-2.5 ${msg.role === 'assistant' ? '' : 'flex-row-reverse'}`}>
                <div className={`size-7 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold ${
                  msg.role === 'assistant' ? 'bg-blue-500/10 text-blue-500' : 'bg-bg-level2 text-grey-600'
                }`}>
                  {msg.role === 'assistant' ? 'AI' : 'ME'}
                </div>
                <div className={`px-3 py-2 rounded-lg max-w-[80%] text-[13px] leading-relaxed ${
                  msg.role === 'assistant'
                    ? 'bg-bg-level2 text-grey-800 rounded-tl-sm'
                    : 'bg-blue-500/10 text-blue-500 rounded-tr-sm'
                }`}>
                  <p className="line-clamp-2">{msg.content}</p>
                </div>
              </div>
            ))}
            {history.length === 0 && <p className="text-[14px] text-grey-500 text-center py-6">No recent history</p>}
          </div>
        </section>
      </div>

      {/* Activity Heatmap */}
      <section className="rounded-lg p-4 bg-bg-level1 border border-hairline overflow-x-auto">
        <h2 className="text-[15px] font-semibold text-grey-900 mb-3">Activity Heatmap</h2>
        <div className="flex gap-1 min-w-[600px]">
          {Array.from({length: 24}).map((_, i) => (
            <div key={i} className="flex-1 flex flex-col gap-1 items-center">
              <div className="w-full h-7 rounded bg-bg-level2 hover:bg-blue-500/20 transition-colors" title={`${i}:00`} />
              <span className="text-[10px] text-grey-500">{i}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
