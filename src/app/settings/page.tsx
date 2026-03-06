"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { Settings, Tag, Cpu, Shield, Plus, Trash2 } from "lucide-react";

interface Category { id: string; name: string; color: string; description: string; }

export default function SettingsPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeTab, setActiveTab] = useState('categories');

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    const res = await apiFetch("/api/categories");
    if (res.ok) setCategories((await res.json()).categories || []);
  };

  const addCategory = async () => {
    const name = prompt("Category Name:");
    if (!name) return;
    const color = prompt("Color (hex):", "#00f2ff") || "#00f2ff";
    await apiFetch("/api/categories", { method: "POST", body: JSON.stringify({ name, color }) });
    fetchCategories();
  };

  const deleteCategory = async (id: string) => {
    if(!confirm("Delete?")) return;
    await apiFetch(`/api/categories/${id}`, { method: "DELETE" });
    fetchCategories();
  };

  return (
    <div className="max-w-4xl mx-auto flex flex-col md:flex-row gap-8">
      <aside className="w-full md:w-64 space-y-2 shrink-0">
        <h1 className="text-2xl font-extrabold tracking-tight mb-6">Settings</h1>
        {[
          { id: 'categories', label: 'Categories & Tags', icon: Tag },
          { id: 'system', label: 'System Info', icon: Cpu },
          { id: 'security', label: 'Security', icon: Shield },
        ].map(tab => (
          <button 
            key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all text-left ${activeTab === tab.id ? 'bg-zinc-800 text-white border border-zinc-700' : 'text-zinc-400 hover:bg-zinc-900/50 hover:text-slate-200'}`}
          >
            <tab.icon size={18} />
            {tab.label}
          </button>
        ))}
      </aside>

      <main className="flex-1">
        {activeTab === 'categories' && (
          <div className="rounded-[24px] p-6 border border-zinc-800 bg-zinc-900/40 glass-effect space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold">Categories</h2>
                <p className="text-xs text-zinc-500 mt-1">Manage tags used across tasks and time tracking.</p>
              </div>
              <button onClick={addCategory} className="flex items-center gap-1 px-3 py-1.5 bg-primary-neon/10 text-primary-neon text-sm font-bold rounded-lg border border-primary-neon/20 hover:bg-primary-neon hover:text-dark-bg transition-colors">
                <Plus size={16}/> Add
              </button>
            </div>
            
            <div className="space-y-3">
              {categories.map(cat => (
                <div key={cat.id} className="flex items-center justify-between p-4 rounded-xl bg-zinc-900/80 border border-zinc-800">
                  <div className="flex items-center gap-3">
                    <div className="size-4 rounded-full border border-black/50" style={{ backgroundColor: cat.color }} />
                    <span className="font-semibold text-sm">{cat.name}</span>
                  </div>
                  <button onClick={() => deleteCategory(cat.id)} className="p-2 text-zinc-500 hover:text-red-500 rounded-lg hover:bg-zinc-800">
                    <Trash2 size={16}/>
                  </button>
                </div>
              ))}
              {categories.length === 0 && <p className="text-sm text-zinc-500 italic">No categories created.</p>}
            </div>
          </div>
        )}

        {activeTab === 'system' && (
          <div className="rounded-[24px] p-6 border border-zinc-800 bg-zinc-900/40 glass-effect space-y-6">
            <h2 className="text-lg font-bold mb-4">System Information</h2>
            <div className="grid grid-cols-2 gap-4">
               <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800">
                 <p className="text-xs text-zinc-500 uppercase tracking-widest font-bold mb-1">Version</p>
                 <p className="font-mono text-sm text-primary-neon">v2.0.0-beta</p>
               </div>
               <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800">
                 <p className="text-xs text-zinc-500 uppercase tracking-widest font-bold mb-1">Environment</p>
                 <p className="font-mono text-sm text-accent-purple">Production</p>
               </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
