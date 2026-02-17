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
import { Plus, Trash2, CheckCircle, Circle } from "lucide-react";
import type { Todo, Category } from "@/types";

const priorityLabels: Record<number, { label: string; color: string }> = {
  0: { label: "보통", color: "secondary" },
  1: { label: "중요", color: "default" },
  2: { label: "긴급", color: "destructive" },
  3: { label: "매우긴급", color: "destructive" },
};

export default function TodosPage() {
  const [todos, setTodos] = useState<(Todo & { category?: Category })[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState("");

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

  useEffect(() => {
    fetchTodos();
  }, [fetchTodos]);

  const addTodo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    await fetch("/api/todos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newTitle.trim() }),
    });
    setNewTitle("");
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

      {/* Add Todo */}
      <form onSubmit={addTodo} className="flex gap-2 mb-6">
        <Input
          placeholder="새 할일 추가..."
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          className="max-w-md"
        />
        <Button type="submit" size="sm">
          <Plus className="w-4 h-4" />
          추가
        </Button>
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
                    onToggle={toggleTodo}
                    onDelete={deleteTodo}
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
                    onToggle={toggleTodo}
                    onDelete={deleteTodo}
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
  onToggle,
  onDelete,
}: {
  todo: Todo & { category?: Category };
  onToggle: (id: string, isDone: boolean) => void;
  onDelete: (id: string) => void;
}) {
  const priority = priorityLabels[todo.priority] || priorityLabels[0];

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
          <div className="flex items-center gap-2 mt-1">
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
            {todo.source !== "web" && (
              <Badge variant="outline" className="text-[10px]">
                {todo.source}
              </Badge>
            )}
          </div>
        </div>
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
