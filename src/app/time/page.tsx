"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { Calendar as CalendarIcon, Clock, Target, CheckCircle2 } from "lucide-react";

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

  const tabs = [
    { id: 'log', label: 'Time Logs' },
    { id: 'plan', label: 'Plan vs Actual' },
    { id: 'weekly', label: 'Weekly Trend' },
  ];

  return (
    <div className="max-w-[800px] mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-[20px] font-bold text-grey-900">Time Management</h1>
        <div className="flex items-center gap-2 bg-bg-level1 border border-hairline rounded-lg px-3 py-1.5">
          <CalendarIcon size={14} className="text-grey-500" />
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className="bg-transparent text-[13px] text-grey-800 outline-none" />
        </div>
      </div>

      {/* L2: Sub Tabs */}
      <div className="flex gap-0 border-b border-hairline">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`relative px-4 py-2.5 text-[14px] font-semibold transition-colors ${
              activeTab === tab.id ? "text-grey-900" : "text-grey-500 hover:text-grey-700"
            }`}
          >
            {tab.label}
            {activeTab === tab.id && (
              <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-6 h-[2px] bg-blue-500 rounded-full" />
            )}
          </button>
        ))}
      </div>

      {activeTab === 'log' && (
        <div className="rounded-lg p-4 bg-bg-level1 border border-hairline">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-[12px] font-semibold text-grey-500 mb-3">Hourly Breakdown</h3>
              <div className="space-y-1">
                {Array.from({length: 24}).map((_, i) => {
                  const log = timeLogs.find(l => l.hour === i);
                  return (
                    <div key={i} className="flex gap-3 items-center group">
                      <div className="w-10 text-[12px] font-mono text-grey-500 text-right">{i}:00</div>
                      <div className="flex-1 min-h-[32px] bg-bg-base border border-hairline rounded-lg px-2 py-1.5 group-hover:bg-bg-level2 transition-colors flex items-center">
                        {log && log.top_apps.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {log.top_apps.map((app: any, idx: number) => (
                              <span key={idx} className="text-[11px] px-1.5 py-0.5 rounded bg-bg-level2 text-grey-700">
                                {app.app} <span className="text-grey-500">({app.minutes}m)</span>
                              </span>
                            ))}
                          </div>
                        ) : <span className="text-[11px] text-grey-400">No data</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div>
              <h3 className="text-[12px] font-semibold text-grey-500 mb-3">Manual Entry</h3>
              <div className="bg-bg-base border border-hairline rounded-lg p-3 space-y-3">
                <div className="flex gap-3">
                  <input type="time" className="bg-bg-level1 border border-hairline rounded-lg px-3 py-2 text-[13px] text-grey-800 outline-none w-28" />
                  <input type="time" className="bg-bg-level1 border border-hairline rounded-lg px-3 py-2 text-[13px] text-grey-800 outline-none w-28" />
                </div>
                <input placeholder="What did you do?" className="w-full bg-bg-level1 border border-hairline rounded-lg px-3 py-2 text-[13px] text-grey-800 placeholder:text-grey-400 outline-none" />
                <select className="w-full bg-bg-level1 border border-hairline rounded-lg px-3 py-2 text-[13px] text-grey-600 outline-none">
                  <option>Select Category</option>
                  <option>Deep Work</option>
                  <option>Meeting</option>
                  <option>Break</option>
                </select>
                <button className="w-full py-2 bg-blue-500 text-white font-semibold text-[13px] rounded-lg hover:bg-blue-600 transition-colors">Add Log</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'plan' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-lg p-4 bg-bg-level1 border border-hairline">
            <h3 className="text-[12px] font-semibold text-grey-500 mb-3 flex items-center gap-2"><Target size={14} className="text-blue-500"/> Planned</h3>
            <pre className="text-[13px] text-grey-700 font-mono whitespace-pre-wrap">{plan || "No plan for this day."}</pre>
          </div>
          <div className="rounded-lg p-4 bg-bg-level1 border border-hairline">
            <h3 className="text-[12px] font-semibold text-grey-500 mb-3 flex items-center gap-2"><CheckCircle2 size={14} className="text-green-500"/> Actual Analysis (AI)</h3>
            <p className="text-[13px] text-grey-500">Click generate to analyze today&apos;s performance...</p>
            <button className="mt-3 px-3 py-1.5 rounded-lg bg-bg-level2 text-[12px] font-semibold text-grey-700 hover:bg-bg-level3 transition-colors">Run Analysis</button>
          </div>
        </div>
      )}

      {activeTab === 'weekly' && (
        <div className="rounded-lg p-4 bg-bg-level1 border border-hairline">
          <p className="text-[14px] text-grey-500 text-center py-8">Weekly trend chart coming soon.</p>
        </div>
      )}
    </div>
  );
}
