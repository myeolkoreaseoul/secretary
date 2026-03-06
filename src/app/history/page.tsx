"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { Search, Filter, Trash2, Calendar } from "lucide-react";

interface TelegramMessage { id: string; role: string; content: string; created_at: string; classification?: any; }

export default function HistoryPage() {
  const [messages, setMessages] = useState<TelegramMessage[]>([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    fetchHistory();
  }, [page]);

  const fetchHistory = async () => {
    const res = await apiFetch(`/api/history?page=${page}&limit=50`);
    if (res.ok) setMessages((await res.json()).messages || []);
  };

  const deleteMessage = async (id: string) => {
    if(!confirm("Delete?")) return;
    await apiFetch(`/api/history?id=${id}`, { method: "DELETE" });
    fetchHistory();
  };

  // Group by date
  const grouped = messages.reduce((acc, msg) => {
    const date = new Date(msg.created_at).toLocaleDateString();
    if(!acc[date]) acc[date] = [];
    acc[date].push(msg);
    return acc;
  }, {} as Record<string, TelegramMessage[]>);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold tracking-tight">History</h1>
      </div>

      <div className="flex gap-3">
        <div className="flex-1 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-900/50 border border-zinc-800/50 focus-within:border-primary-neon">
          <Search size={18} className="text-zinc-500" />
          <input 
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search conversations..." 
            className="flex-1 bg-transparent text-sm outline-none"
          />
        </div>
        <button className="px-4 py-2.5 rounded-xl bg-zinc-900/50 border border-zinc-800/50 text-zinc-400 flex items-center gap-2 hover:text-white">
          <Filter size={18} />
          <span className="text-sm font-semibold">Filter</span>
        </button>
      </div>

      <div className="space-y-8">
        {Object.entries(grouped).map(([date, msgs]) => (
          <div key={date} className="space-y-4">
            <div className="flex items-center gap-3 text-zinc-500 text-sm font-bold px-2">
              <Calendar size={14} />
              {date}
              <div className="flex-1 h-px bg-zinc-800/50 ml-2" />
            </div>
            
            <div className="space-y-4">
              {msgs.map(msg => (
                <div key={msg.id} className={`group flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                  <div className={`size-10 rounded-full flex items-center justify-center shrink-0 border ${msg.role === 'user' ? 'bg-zinc-900 border-zinc-700 text-slate-300' : 'bg-primary-neon/10 border-primary-neon/30 text-primary-neon neon-border-blue'}`}>
                    <span className="text-xs font-bold">{msg.role === 'user' ? 'ME' : 'AI'}</span>
                  </div>
                  <div className={`flex flex-col gap-1 max-w-[80%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-zinc-500">{new Date(msg.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                      {msg.classification?.category && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 font-bold uppercase">{msg.classification.category}</span>
                      )}
                    </div>
                    <div className={`p-4 rounded-2xl text-sm leading-relaxed ${msg.role === 'user' ? 'bg-zinc-800/80 rounded-tr-none' : 'bg-zinc-900/50 border border-zinc-800/50 rounded-tl-none glass-effect'}`}>
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    </div>
                  </div>
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-center gap-2">
                    <button onClick={() => deleteMessage(msg.id)} className="p-2 text-zinc-600 hover:text-red-500"><Trash2 size={16}/></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      
      <div className="flex justify-center pt-4">
        <button onClick={() => setPage(p => p + 1)} className="px-6 py-2 rounded-full border border-zinc-800 bg-zinc-900 text-sm font-semibold hover:bg-zinc-800">Load More</button>
      </div>
    </div>
  );
}
