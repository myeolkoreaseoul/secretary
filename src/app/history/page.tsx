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
import {
  Search,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Trash2,
  Save,
  X,
} from "lucide-react";
import type { TelegramMessage, Category, MessageClassification } from "@/types";

interface HistoryResponse {
  messages: (TelegramMessage & { category: Category | null })[];
  total: number;
  page: number;
  totalPages: number;
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function HistoryPage() {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page) });
      if (query) params.set("q", query);
      const res = await fetch(`/api/history?${params}`);
      const json = await res.json();
      setData(json);
    } finally {
      setLoading(false);
    }
  }, [query, page]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchHistory();
  };

  const deleteMessage = async (id: string) => {
    await fetch(`/api/history?id=${id}`, { method: "DELETE" });
    fetchHistory();
  };

  const editMessage = async (id: string, content: string) => {
    await fetch("/api/history", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, content }),
    });
    fetchHistory();
  };

  // Group messages by date
  const groupedByDate: Record<string, HistoryResponse["messages"]> = {};
  for (const msg of data?.messages || []) {
    const dateKey = formatDate(msg.created_at);
    if (!groupedByDate[dateKey]) groupedByDate[dateKey] = [];
    groupedByDate[dateKey].push(msg);
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">대화 히스토리</h1>
        <p className="text-muted-foreground text-sm mt-1">
          텔레그램 대화를 날짜별로 확인하고 편집합니다
        </p>
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="flex gap-2 mb-6">
        <Input
          placeholder="메시지 검색..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="max-w-sm"
        />
        <Button type="submit" size="sm" variant="secondary">
          <Search className="w-4 h-4" />
          검색
        </Button>
      </form>

      {/* Messages */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedByDate).map(([dateStr, msgs]) => (
            <div key={dateStr}>
              <h2 className="text-sm font-semibold text-muted-foreground mb-3">
                {dateStr}
              </h2>
              <div className="space-y-2">
                {msgs.map((msg) => (
                  <MessageItem
                    key={msg.id}
                    message={msg}
                    onDelete={deleteMessage}
                    onEdit={editMessage}
                  />
                ))}
              </div>
            </div>
          ))}

          {data && data.messages.length === 0 && (
            <p className="text-center text-muted-foreground py-12">
              {query
                ? `"${query}"에 대한 결과가 없습니다`
                : "아직 대화가 없습니다"}
            </p>
          )}
        </div>
      )}

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm text-muted-foreground">
            {page} / {data.totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= data.totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

function MessageItem({
  message,
  onDelete,
  onEdit,
}: {
  message: TelegramMessage & { category: Category | null };
  onDelete: (id: string) => void;
  onEdit: (id: string, content: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const cls = message.classification as MessageClassification | null;

  const save = () => {
    if (editContent.trim() !== message.content) {
      onEdit(message.id, editContent.trim());
    }
    setEditing(false);
  };

  return (
    <Card
      className={
        message.role === "assistant"
          ? "border-l-2 border-l-primary/50"
          : ""
      }
    >
      <CardHeader className="py-3 pb-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge
              variant={message.role === "user" ? "default" : "secondary"}
              className="text-[10px]"
            >
              {message.role === "user" ? "나" : "비서"}
            </Badge>
            {message.category && (
              <Badge variant="outline" className="text-[10px]">
                {(message.category as Category).name}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground mr-2">
              {formatTime(message.created_at)}
            </span>
            {message.role === "user" && (
              <>
                <button
                  onClick={() => {
                    setEditContent(message.content);
                    setEditing(!editing);
                  }}
                  className="text-muted-foreground hover:text-foreground p-1"
                >
                  <Pencil className="w-3 h-3" />
                </button>
                <button
                  onClick={() => onDelete(message.id)}
                  className="text-muted-foreground hover:text-destructive p-1"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </>
            )}
          </div>
        </div>
        {cls?.title && (
          <CardTitle className="text-xs mt-1">{cls.title}</CardTitle>
        )}
      </CardHeader>
      <CardContent className="py-2">
        {editing ? (
          <div className="space-y-2">
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="w-full min-h-[60px] bg-muted rounded-md px-3 py-2 text-sm outline-none resize-y"
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setEditing(false)}
              >
                <X className="w-3 h-3 mr-1" />
                취소
              </Button>
              <Button size="sm" onClick={save}>
                <Save className="w-3 h-3 mr-1" />
                저장
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm whitespace-pre-wrap line-clamp-4">
            {message.content}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
