"use client";

import { useState, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Trash2, CheckCircle, Circle, Pencil, Save, X, ChevronDown } from "lucide-react";
import type { Todo, Category } from "@/types";

const priorityLabels: Record<number, { label: string; color: string }> = {
  0: { label: "P0 보통", color: "secondary" },
  1: { label: "P1 중요", color: "default" },
  2: { label: "P2 긴급", color: "destructive" },
  3: { label: "P3 매우긴급", color: "destructive" },
};

const CATEGORIES_FALLBACK = [
  "업무",
  "개발",
  "건강",
  "가족",
  "소개팅비즈니스",
  "온라인판매",
  "기타",
];

export default function TodosPage() {
  const [todos, setTodos] = useState<(Todo & { category?: Category })[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState("");
  const [newPriority, setNewPriority] = useState(0);
  const [newDueDate, setNewDueDate] = useState("");
  const [newCategoryId, setNewCategoryId] = useState("");
  const [showForm, setShowForm] = useState(false);

  const fetchTodos = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/todos");
      const json = await res.json();
      setTodos(json.todos || []);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchCategories = useCallback(async () => {
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/categories?select=*&order=name`,
        {
          headers: {
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
          },
        }
      );
      const json = await res.json();
      setCategories(json || []);
    } catch {
      // Fallback
    }
  }, []);

  useEffect(() => {
    fetchTodos();
    fetchCategories();
  }, [fetchTodos, fetchCategories]);

  const addTodo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    await fetch("/api/todos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: newTitle.trim(),
        priority: newPriority,
        due_date: newDueDate || null,
        category_id: newCategoryId || null,
      }),
    });
    setNewTitle("");
    setNewPriority(0);
    setNewDueDate("");
    setNewCategoryId("");
    setShowForm(false);
    fetchTodos();
  };

  const toggleTodo = async (id: string, isDone: boolean) => {
    await fetch("/api/todos", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, is_done: !isDone }),
    });
    fetchTodos();
  };

  const deleteTodo = async (id: string) => {
    await fetch(`/api/todos?id=${id}`, { method: "DELETE" });
    fetchTodos();
  };

  const updateTodo = async (id: string, updates: Record<string, unknown>) => {
    await fetch("/api/todos", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...updates }),
    });
    fetchTodos();
  };

  const activeTodos = todos.filter((t) => !t.is_done);
  const doneTodos = todos.filter((t) => t.is_done);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">할일</h1>
        <p className="text-muted-foreground text-sm mt-1">
          AI 비서가 추가한 할일과 직접 추가한 할일을 관리합니다
        </p>
      </div>

      {/* Quick Add */}
      <form onSubmit={addTodo} className="mb-4">
        <div className="flex gap-2">
          <Input
            placeholder="새 할일 추가..."
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            className="max-w-md"
          />
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setShowForm(!showForm)}
          >
            <ChevronDown className={`w-4 h-4 transition-transform ${showForm ? "rotate-180" : ""}`} />
          </Button>
          <Button type="submit" size="sm">
            <Plus className="w-4 h-4" />
            추가
          </Button>
        </div>

        {/* Expanded form */}
        {showForm && (
          <div className="flex gap-2 mt-2 flex-wrap">
            <select
              value={newPriority}
              onChange={(e) => setNewPriority(Number(e.target.value))}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value={0}>P0 보통</option>
              <option value={1}>P1 중요</option>
              <option value={2}>P2 긴급</option>
              <option value={3}>P3 매우긴급</option>
            </select>
            <Input
              type="date"
              value={newDueDate}
              onChange={(e) => setNewDueDate(e.target.value)}
              className="w-auto"
              placeholder="마감일"
            />
            <select
              value={newCategoryId}
              onChange={(e) => setNewCategoryId(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">카테고리 없음</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </form>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Active */}
          <div>
            <h2 className="text-sm font-semibold text-muted-foreground mb-3">
              진행중 ({activeTodos.length})
            </h2>
            {activeTodos.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                모든 할일을 완료했습니다
              </p>
            ) : (
              <div className="space-y-2">
                {activeTodos.map((todo) => (
                  <TodoItem
                    key={todo.id}
                    todo={todo}
                    categories={categories}
                    onToggle={toggleTodo}
                    onDelete={deleteTodo}
                    onUpdate={updateTodo}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Done */}
          {doneTodos.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground mb-3">
                완료 ({doneTodos.length})
              </h2>
              <div className="space-y-2">
                {doneTodos.map((todo) => (
                  <TodoItem
                    key={todo.id}
                    todo={todo}
                    categories={categories}
                    onToggle={toggleTodo}
                    onDelete={deleteTodo}
                    onUpdate={updateTodo}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TodoItem({
  todo,
  categories,
  onToggle,
  onDelete,
  onUpdate,
}: {
  todo: Todo & { category?: Category };
  categories: Category[];
  onToggle: (id: string, isDone: boolean) => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, updates: Record<string, unknown>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(todo.title);
  const [editPriority, setEditPriority] = useState(todo.priority);
  const [editDueDate, setEditDueDate] = useState(todo.due_date || "");
  const [editCategoryId, setEditCategoryId] = useState(todo.category_id || "");
  const priority = priorityLabels[todo.priority] || priorityLabels[0];

  const save = () => {
    onUpdate(todo.id, {
      title: editTitle,
      priority: editPriority,
      due_date: editDueDate || null,
      category_id: editCategoryId || null,
    });
    setEditing(false);
  };

  if (editing) {
    return (
      <Card>
        <CardContent className="py-3 space-y-2">
          <Input
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") setEditing(false);
            }}
            autoFocus
          />
          <div className="flex gap-2 flex-wrap">
            <select
              value={editPriority}
              onChange={(e) => setEditPriority(Number(e.target.value))}
              className="h-8 rounded-md border border-input bg-background px-2 text-xs"
            >
              <option value={0}>P0 보통</option>
              <option value={1}>P1 중요</option>
              <option value={2}>P2 긴급</option>
              <option value={3}>P3 매우긴급</option>
            </select>
            <Input
              type="date"
              value={editDueDate}
              onChange={(e) => setEditDueDate(e.target.value)}
              className="w-auto h-8 text-xs"
            />
            <select
              value={editCategoryId}
              onChange={(e) => setEditCategoryId(e.target.value)}
              className="h-8 rounded-md border border-input bg-background px-2 text-xs"
            >
              <option value="">카테고리 없음</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
            <Button size="sm" variant="ghost" onClick={save} className="h-8">
              <Save className="w-3 h-3" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setEditing(false)}
              className="h-8"
            >
              <X className="w-3 h-3" />
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={todo.is_done ? "opacity-60" : ""}>
      <CardHeader className="py-3 flex-row items-center gap-3 space-y-0">
        <button
          onClick={() => onToggle(todo.id, todo.is_done)}
          className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
        >
          {todo.is_done ? (
            <CheckCircle className="w-5 h-5 text-primary" />
          ) : (
            <Circle className="w-5 h-5" />
          )}
        </button>
        <div className="flex-1 min-w-0">
          <CardTitle
            className={`text-sm ${
              todo.is_done ? "line-through text-muted-foreground" : ""
            }`}
          >
            {todo.title}
          </CardTitle>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {todo.priority > 0 && (
              <Badge
                variant={
                  priority.color as "default" | "secondary" | "destructive"
                }
                className="text-[10px]"
              >
                {priority.label}
              </Badge>
            )}
            {todo.due_date && (
              <span className="text-xs text-muted-foreground">
                {todo.due_date}
              </span>
            )}
            {todo.category && (
              <Badge variant="outline" className="text-[10px]">
                {todo.category.name}
              </Badge>
            )}
            {todo.source !== "web" && (
              <Badge variant="outline" className="text-[10px]">
                {todo.source}
              </Badge>
            )}
          </div>
        </div>
        <button
          onClick={() => setEditing(true)}
          className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => onDelete(todo.id)}
          className="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </CardHeader>
      {todo.description && (
        <CardContent className="pt-0 pb-3">
          <p className="text-xs text-muted-foreground">{todo.description}</p>
        </CardContent>
      )}
    </Card>
  );
}
