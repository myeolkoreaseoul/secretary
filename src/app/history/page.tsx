"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { Search, Trash2, Calendar } from "lucide-react";

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

  const grouped = messages.reduce((acc, msg) => {
    const date = new Date(msg.created_at).toLocaleDateString();
    if(!acc[date]) acc[date] = [];
    acc[date].push(msg);
    return acc;
  }, {} as Record<string, TelegramMessage[]>);

  return (
    <div className="max-w-[800px] mx-auto space-y-5">
      <h1 className="text-[20px] font-bold text-grey-900">History</h1>

      {/* Search */}
      <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-bg-level1 border border-hairline focus-within:shadow-[0_0_0_2px_rgba(49,130,246,0.3)]">
        <Search size={16} className="text-grey-500" />
        <input
          value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search conversations..."
          className="flex-1 bg-transparent text-[14px] text-grey-800 placeholder:text-grey-400 outline-none"
        />
      </div>

      {/* Messages */}
      <div className="space-y-6">
        {Object.entries(grouped).map(([date, msgs]) => (
          <div key={date} className="space-y-3">
            <div className="flex items-center gap-2 text-grey-500 text-[12px] font-semibold px-1">
              <Calendar size={12} />
              {date}
              <div className="flex-1 h-px bg-hairline ml-2" />
            </div>

            <div className="space-y-3">
              {msgs.map(msg => (
                <div key={msg.id} className={`group flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                  <div className={`size-8 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold ${
                    msg.role === 'user' ? 'bg-bg-level2 text-grey-600' : 'bg-blue-500/10 text-blue-500'
                  }`}>
                    {msg.role === 'user' ? 'ME' : 'AI'}
                  </div>
                  <div className={`flex flex-col gap-1 max-w-[75%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-grey-500">{new Date(msg.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                      {msg.classification?.category && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-bg-level2 text-grey-500 font-semibold">{msg.classification.category}</span>
                      )}
                    </div>
                    <div className={`px-3 py-2.5 rounded-lg text-[13px] leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-bg-level2 text-grey-800 rounded-tr-sm'
                        : 'bg-bg-level1 border border-hairline text-grey-800 rounded-tl-sm'
                    }`}>
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    </div>
                  </div>
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-center">
                    <button onClick={() => deleteMessage(msg.id)} className="p-1.5 text-grey-500 hover:text-red-500 rounded-lg"><Trash2 size={14}/></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Load More */}
      <div className="flex justify-center pt-2">
        <button onClick={() => setPage(p => p + 1)} className="px-5 py-2 rounded-lg border border-hairline bg-bg-level1 text-[13px] font-semibold text-grey-600 hover:bg-bg-level2 transition-colors">Load More</button>
      </div>
    </div>
  );
}
