"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { Plus, CheckCircle2, Circle, Calendar, Tag, Trash2, Edit2 } from "lucide-react";

interface Todo { id: string; title: string; priority: number; is_done: boolean; due_date?: string; category_id?: string; }
interface Category { id: string; name: string; color: string; }

export default function TodosPage() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [newPriority, setNewPriority] = useState(1);
  const [newDueDate, setNewDueDate] = useState("");
  const [newCategory, setNewCategory] = useState("");

  useEffect(() => {
    fetchTodos();
    fetchCategories();
  }, []);

  const fetchTodos = async () => {
    const res = await apiFetch("/api/todos");
    if (res.ok) setTodos((await res.json()).todos || []);
  };

  const fetchCategories = async () => {
    const res = await apiFetch("/api/categories");
    if (res.ok) setCategories((await res.json()).categories || []);
  };

  const addTodo = async () => {
    if (!newTitle.trim()) return;
    const body: any = { title: newTitle, priority: newPriority, is_done: false };
    if (newDueDate) body.due_date = newDueDate;
    if (newCategory) body.category_id = newCategory;
    
    await apiFetch("/api/todos", { method: "POST", body: JSON.stringify(body) });
    setNewTitle(""); setNewDueDate(""); setNewCategory(""); setNewPriority(1);
    fetchTodos();
  };

  const toggleTodo = async (todo: Todo) => {
    await apiFetch("/api/todos", {
      method: "PATCH",
      body: JSON.stringify({ id: todo.id, is_done: !todo.is_done })
    });
    fetchTodos();
  };

  const deleteTodo = async (id: string) => {
    await apiFetch(`/api/todos?id=${id}`, { method: "DELETE" });
    fetchTodos();
  };

  const pending = todos.filter(t => !t.is_done);
  const done = todos.filter(t => t.is_done);

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold tracking-tight">Tasks</h1>
      </div>

      <div className="rounded-[24px] p-6 border border-zinc-800 bg-zinc-900/40 glass-effect space-y-4">
        <div className="flex gap-2">
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addTodo()}
            placeholder="Add a new task..."
            className="flex-1 bg-dark-bg border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:border-primary-neon outline-none"
          />
          <button onClick={addTodo} className="size-12 rounded-xl bg-primary-neon text-dark-bg flex items-center justify-center hover:bg-cyan-400 transition-colors">
            <Plus size={20} />
          </button>
        </div>
        <div className="flex flex-wrap gap-3">
          <select value={newPriority} onChange={(e) => setNewPriority(Number(e.target.value))} className="bg-dark-bg border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-300 outline-none">
            <option value={0}>P0 - Urgent</option>
            <option value={1}>P1 - High</option>
            <option value={2}>P2 - Normal</option>
            <option value={3}>P3 - Low</option>
          </select>
          <div className="flex items-center gap-2 bg-dark-bg border border-zinc-800 rounded-lg px-3 py-1.5 focus-within:border-primary-neon">
            <Calendar size={14} className="text-zinc-500" />
            <input type="date" value={newDueDate} onChange={(e) => setNewDueDate(e.target.value)} className="bg-transparent text-xs text-zinc-300 outline-none" />
          </div>
          <div className="flex items-center gap-2 bg-dark-bg border border-zinc-800 rounded-lg px-3 py-1.5 focus-within:border-primary-neon">
            <Tag size={14} className="text-zinc-500" />
            <select value={newCategory} onChange={(e) => setNewCategory(e.target.value)} className="bg-transparent text-xs text-zinc-300 outline-none">
              <option value="">No Category</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <div>
          <h2 className="text-sm font-bold text-zinc-500 mb-3 px-2">Pending ({pending.length})</h2>
          <div className="space-y-2">
            {pending.map(todo => (
              <TodoItem key={todo.id} todo={todo} categories={categories} onToggle={() => toggleTodo(todo)} onDelete={() => deleteTodo(todo.id)} />
            ))}
          </div>
        </div>

        {done.length > 0 && (
          <div>
            <h2 className="text-sm font-bold text-zinc-500 mb-3 px-2">Completed ({done.length})</h2>
            <div className="space-y-2 opacity-60">
              {done.map(todo => (
                <TodoItem key={todo.id} todo={todo} categories={categories} onToggle={() => toggleTodo(todo)} onDelete={() => deleteTodo(todo.id)} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TodoItem({ todo, categories, onToggle, onDelete }: { todo: Todo; categories: Category[]; onToggle: () => void; onDelete: () => void }) {
  const cat = categories.find(c => c.id === todo.category_id);
  return (
    <div className="group flex items-center gap-4 p-4 rounded-2xl bg-zinc-900/50 border border-zinc-800/50 hover:border-zinc-700 transition-all">
      <button onClick={onToggle} className="shrink-0 text-zinc-500 hover:text-primary-neon transition-colors">
        {todo.is_done ? <CheckCircle2 size={22} className="text-primary-neon" /> : <Circle size={22} />}
      </button>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${todo.is_done ? 'line-through text-zinc-500' : 'text-slate-200'}`}>{todo.title}</p>
        <div className="flex items-center gap-3 mt-1.5">
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-tighter ${todo.priority === 0 ? 'bg-red-500/10 text-red-500' : 'bg-zinc-800 text-zinc-400'}`}>
            P{todo.priority}
          </span>
          {todo.due_date && <span className="text-[10px] text-zinc-500 flex items-center gap-1"><Calendar size={10}/> {todo.due_date}</span>}
          {cat && <span className="text-[10px] text-zinc-500 flex items-center gap-1" style={{ color: cat.color }}><Tag size={10}/> {cat.name}</span>}
        </div>
      </div>
      <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
        <button className="p-2 text-zinc-500 hover:text-white rounded-lg hover:bg-zinc-800"><Edit2 size={16}/></button>
        <button onClick={onDelete} className="p-2 text-zinc-500 hover:text-red-500 rounded-lg hover:bg-zinc-800"><Trash2 size={16}/></button>
      </div>
    </div>
  );
}
