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
import { Separator } from "@/components/ui/separator";
import { Pencil, Trash2, Save, X } from "lucide-react";
import type { Category } from "@/types";

export default function SettingsPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("");

  const fetchCategories = useCallback(async () => {
    setLoading(true);
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
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  const startEdit = (cat: Category) => {
    setEditingId(cat.id);
    setEditName(cat.name);
    setEditColor(cat.color || "#6b7280");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName("");
    setEditColor("");
  };

  const saveEdit = async () => {
    if (!editingId || !editName.trim()) return;
    await fetch(`/api/categories/${editingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName.trim(), color: editColor }),
    });
    cancelEdit();
    fetchCategories();
  };

  const deleteCategory = async (id: string) => {
    const res = await fetch(`/api/categories/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const json = await res.json();
      alert(json.error || "삭제에 실패했습니다");
      return;
    }
    fetchCategories();
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">설정</h1>
        <p className="text-muted-foreground text-sm mt-1">
          카테고리 관리 및 시스템 설정
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">카테고리 관리</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">로딩중...</p>
          ) : (
            <div className="space-y-2">
              {categories.map((cat) => (
                <div key={cat.id}>
                  {editingId === cat.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={editColor}
                        onChange={(e) => setEditColor(e.target.value)}
                        className="w-8 h-8 rounded border border-input cursor-pointer"
                      />
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="flex-1"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveEdit();
                          if (e.key === "Escape") cancelEdit();
                        }}
                      />
                      <Button size="icon" variant="ghost" onClick={saveEdit}>
                        <Save className="w-4 h-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={cancelEdit}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 py-1">
                      <div
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{
                          backgroundColor: cat.color || "#6b7280",
                        }}
                      />
                      <span className="text-sm flex-1">{cat.name}</span>
                      <Badge variant="outline" className="text-[10px]">
                        {cat.description || "-"}
                      </Badge>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => startEdit(cat)}
                      >
                        <Pencil className="w-3 h-3" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => deleteCategory(cat.id)}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  )}
                  <Separator />
                </div>
              ))}
              {categories.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  카테고리가 없습니다
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-sm">시스템 정보</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">버전</span>
            <span>v2.0</span>
          </div>
          <Separator />
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">아키텍처</span>
            <span>Telegram + Claude CLI + MCP</span>
          </div>
          <Separator />
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">임베딩 모델</span>
            <span>Gemini text-embedding-004</span>
          </div>
          <Separator />
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">데이터베이스</span>
            <span>Supabase (PostgreSQL + pgvector)</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
