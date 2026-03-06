"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { Activity, Calendar as CalendarIcon, Clock, Target, CheckCircle2 } from "lucide-react";

export default function TimePage() {
  const [activeTab, setActiveTab] = useState('log');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [timeLogs, setTimeLogs] = useState<any[]>([]);
  const [plan, setPlan] = useState("");

  useEffect(() => {
    fetchTimeData();
  }, [date]);

  const fetchTimeData = async () => {
    const [logRes, planRes] = await Promise.all([
      apiFetch(`/api/time?date=${date}`),
      apiFetch(`/api/daily-plan?date=${date}`)
    ]);
    if(logRes.ok) setTimeLogs((await logRes.json()).summaries || []);
    if(planRes.ok) setPlan((await planRes.json()).planText || "");
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold tracking-tight">Time Management</h1>
        <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-1.5">
          <CalendarIcon size={16} className="text-zinc-400" />
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className="bg-transparent text-sm text-slate-200 outline-none" />
        </div>
      </div>

      <div className="flex gap-2 p-1 bg-zinc-900/50 border border-zinc-800/50 rounded-2xl w-fit">
        {[
          { id: 'log', label: 'Time Logs', icon: Clock },
          { id: 'plan', label: 'Plan vs Actual', icon: Target },
          { id: 'weekly', label: 'Weekly Trend', icon: Activity },
        ].map(tab => (
          <button 
            key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${activeTab === tab.id ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            <tab.icon size={16} />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'log' && (
        <div className="rounded-[24px] p-6 border border-zinc-800 bg-zinc-900/40 glass-effect">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <h3 className="text-sm font-bold text-zinc-400 mb-4 uppercase tracking-wider">Hourly Breakdown</h3>
              <div className="space-y-2">
                {Array.from({length: 24}).map((_, i) => {
                  const log = timeLogs.find(l => l.hour === i);
                  return (
                    <div key={i} className="flex gap-4 items-stretch group">
                      <div className="w-12 text-xs font-mono text-zinc-500 text-right py-2">{i}:00</div>
                      <div className="flex-1 min-h-[40px] bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-2 group-hover:border-zinc-700 transition-colors relative">
                        {log && log.top_apps.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {log.top_apps.map((app: any, idx: number) => (
                              <span key={idx} className="text-xs px-2 py-1 rounded bg-zinc-800 text-slate-300">
                                {app.app} <span className="text-zinc-500">({app.minutes}m)</span>
                              </span>
                            ))}
                          </div>
                        ) : <div className="absolute inset-0 flex items-center px-4 text-xs text-zinc-600 font-mono">No data</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div>
               <h3 className="text-sm font-bold text-zinc-400 mb-4 uppercase tracking-wider">Manual Entry</h3>
               <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-4">
                 <div className="flex gap-4">
                    <input type="time" className="bg-dark-bg border border-zinc-800 rounded-lg px-3 py-2 text-sm outline-none w-32" />
                    <input type="time" className="bg-dark-bg border border-zinc-800 rounded-lg px-3 py-2 text-sm outline-none w-32" />
                 </div>
                 <input placeholder="What did you do?" className="w-full bg-dark-bg border border-zinc-800 rounded-lg px-3 py-2 text-sm outline-none" />
                 <select className="w-full bg-dark-bg border border-zinc-800 rounded-lg px-3 py-2 text-sm outline-none text-zinc-400">
                    <option>Select Category</option>
                    <option>Deep Work</option>
                    <option>Meeting</option>
                    <option>Break</option>
                 </select>
                 <button className="w-full py-2 bg-primary-neon text-dark-bg font-bold rounded-lg hover:bg-cyan-400">Add Log</button>
               </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'plan' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="rounded-[24px] p-6 border border-zinc-800 bg-zinc-900/40 glass-effect">
            <h3 className="text-sm font-bold text-accent-purple mb-4 uppercase tracking-wider flex items-center gap-2"><Target size={16}/> Planned</h3>
            <pre className="text-sm text-slate-300 font-mono whitespace-pre-wrap">{plan || "No plan for this day."}</pre>
          </div>
          <div className="rounded-[24px] p-6 border border-zinc-800 bg-zinc-900/40 glass-effect">
            <h3 className="text-sm font-bold text-primary-neon mb-4 uppercase tracking-wider flex items-center gap-2"><CheckCircle2 size={16}/> Actual Analysis (AI)</h3>
            <p className="text-sm text-zinc-400 italic">Click generate to analyze today's performance...</p>
            <button className="mt-4 px-4 py-2 rounded-xl bg-zinc-800 text-sm font-bold hover:bg-zinc-700">Run Analysis</button>
          </div>
        </div>
      )}
    </div>
  );
}
