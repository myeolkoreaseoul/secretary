"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { Tag, Cpu, Shield, Plus, Trash2 } from "lucide-react";

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
    const color = prompt("Color (hex):", "#3182f6") || "#3182f6";
    await apiFetch("/api/categories", { method: "POST", body: JSON.stringify({ name, color }) });
    fetchCategories();
  };

  const deleteCategory = async (id: string) => {
    if(!confirm("Delete?")) return;
    await apiFetch(`/api/categories/${id}`, { method: "DELETE" });
    fetchCategories();
  };

  const tabs = [
    { id: 'categories', label: 'Categories & Tags', icon: Tag },
    { id: 'system', label: 'System Info', icon: Cpu },
    { id: 'security', label: 'Security', icon: Shield },
  ];

  return (
    <div className="max-w-[800px] mx-auto flex flex-col md:flex-row gap-6">
      <aside className="w-full md:w-52 space-y-1 shrink-0">
        <h1 className="text-[20px] font-bold text-grey-900 mb-4">Settings</h1>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] font-semibold transition-colors text-left ${
              activeTab === tab.id
                ? 'bg-bg-level2 text-grey-900'
                : 'text-grey-500 hover:bg-[rgba(217,217,255,0.11)] hover:text-grey-700'
            }`}
          >
            <tab.icon size={16} />
            {tab.label}
          </button>
        ))}
      </aside>

      <main className="flex-1">
        {activeTab === 'categories' && (
          <div className="rounded-lg p-4 bg-bg-level1 border border-hairline space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-[15px] font-semibold text-grey-900">Categories</h2>
                <p className="text-[12px] text-grey-500 mt-0.5">Manage tags used across tasks and time tracking.</p>
              </div>
              <button onClick={addCategory} className="flex items-center gap-1 px-3 py-1.5 bg-blue-500/10 text-blue-500 text-[12px] font-semibold rounded-lg hover:bg-blue-500 hover:text-white transition-colors">
                <Plus size={14}/> Add
              </button>
            </div>

            <div className="space-y-1">
              {categories.map(cat => (
                <div key={cat.id} className="flex items-center justify-between px-3 py-3 rounded-lg hover:bg-[rgba(217,217,255,0.11)] transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="size-3.5 rounded-full" style={{ backgroundColor: cat.color }} />
                    <span className="text-[14px] font-medium text-grey-800">{cat.name}</span>
                  </div>
                  <button onClick={() => deleteCategory(cat.id)} className="p-1.5 text-grey-500 hover:text-red-500 rounded-lg hover:bg-bg-level2 transition-colors">
                    <Trash2 size={14}/>
                  </button>
                </div>
              ))}
              {categories.length === 0 && <p className="text-[13px] text-grey-500 py-4 text-center">No categories created.</p>}
            </div>
          </div>
        )}

        {activeTab === 'system' && (
          <div className="rounded-lg p-4 bg-bg-level1 border border-hairline space-y-4">
            <h2 className="text-[15px] font-semibold text-grey-900">System Information</h2>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-bg-base border border-hairline">
                <p className="text-[11px] text-grey-500 font-semibold mb-1">Version</p>
                <p className="font-mono text-[13px] text-blue-500">v2.0.0-beta</p>
              </div>
              <div className="p-3 rounded-lg bg-bg-base border border-hairline">
                <p className="text-[11px] text-grey-500 font-semibold mb-1">Environment</p>
                <p className="font-mono text-[13px] text-green-500">Production</p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'security' && (
          <div className="rounded-lg p-4 bg-bg-level1 border border-hairline">
            <h2 className="text-[15px] font-semibold text-grey-900 mb-2">Security</h2>
            <p className="text-[13px] text-grey-500">Security settings coming soon.</p>
          </div>
        )}
      </main>
    </div>
  );
}
