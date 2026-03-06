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
    <div className="max-w-[800px] mx-auto space-y-5">
      <h1 className="text-[20px] font-bold text-grey-900">Tasks</h1>

      {/* Add Task */}
      <div className="rounded-lg p-4 bg-bg-level1 border border-hairline space-y-3">
        <div className="flex gap-2">
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addTodo()}
            placeholder="Add a new task..."
            className="flex-1 bg-bg-base border border-hairline rounded-lg px-3 py-2.5 text-[14px] text-grey-800 placeholder:text-grey-400 focus:outline-none focus:shadow-[0_0_0_2px_rgba(49,130,246,0.3)]"
          />
          <button onClick={addTodo} className="size-10 rounded-lg bg-blue-500 text-white flex items-center justify-center hover:bg-blue-600 transition-colors">
            <Plus size={18} />
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          <select value={newPriority} onChange={(e) => setNewPriority(Number(e.target.value))} className="bg-bg-base border border-hairline rounded-lg px-3 py-1.5 text-[12px] text-grey-700 outline-none">
            <option value={0}>P0 - Urgent</option>
            <option value={1}>P1 - High</option>
            <option value={2}>P2 - Normal</option>
            <option value={3}>P3 - Low</option>
          </select>
          <div className="flex items-center gap-2 bg-bg-base border border-hairline rounded-lg px-3 py-1.5">
            <Calendar size={12} className="text-grey-500" />
            <input type="date" value={newDueDate} onChange={(e) => setNewDueDate(e.target.value)} className="bg-transparent text-[12px] text-grey-700 outline-none" />
          </div>
          <div className="flex items-center gap-2 bg-bg-base border border-hairline rounded-lg px-3 py-1.5">
            <Tag size={12} className="text-grey-500" />
            <select value={newCategory} onChange={(e) => setNewCategory(e.target.value)} className="bg-transparent text-[12px] text-grey-700 outline-none">
              <option value="">No Category</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Pending */}
      <div className="space-y-4">
        <div>
          <h2 className="text-[12px] font-semibold text-grey-500 mb-2 px-1">Pending ({pending.length})</h2>
          <div className="space-y-1">
            {pending.map(todo => (
              <TodoItem key={todo.id} todo={todo} categories={categories} onToggle={() => toggleTodo(todo)} onDelete={() => deleteTodo(todo.id)} />
            ))}
          </div>
        </div>

        {done.length > 0 && (
          <div>
            <h2 className="text-[12px] font-semibold text-grey-500 mb-2 px-1">Completed ({done.length})</h2>
            <div className="space-y-1 opacity-60">
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
    <div className="group flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-[rgba(217,217,255,0.11)] transition-colors">
      <button onClick={onToggle} className="shrink-0 text-grey-400 hover:text-blue-500 transition-colors">
        {todo.is_done ? <CheckCircle2 size={18} className="text-blue-500" /> : <Circle size={18} />}
      </button>
      <div className="flex-1 min-w-0">
        <p className={`text-[14px] ${todo.is_done ? 'line-through text-grey-500' : 'text-grey-800'}`}>{todo.title}</p>
        <div className="flex items-center gap-2 mt-1">
          <span className={`text-[11px] px-1.5 py-0.5 rounded font-semibold ${
            todo.priority === 0 ? 'bg-red-500/10 text-red-500' : 'bg-bg-level2 text-grey-500'
          }`}>
            P{todo.priority}
          </span>
          {todo.due_date && <span className="text-[11px] text-grey-500 flex items-center gap-1"><Calendar size={10}/> {todo.due_date}</span>}
          {cat && <span className="text-[11px] flex items-center gap-1" style={{ color: cat.color }}><Tag size={10}/> {cat.name}</span>}
        </div>
      </div>
      <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
        <button className="p-1.5 text-grey-500 hover:text-grey-800 rounded-lg hover:bg-bg-level2"><Edit2 size={14}/></button>
        <button onClick={onDelete} className="p-1.5 text-grey-500 hover:text-red-500 rounded-lg hover:bg-bg-level2"><Trash2 size={14}/></button>
      </div>
    </div>
  );
}
