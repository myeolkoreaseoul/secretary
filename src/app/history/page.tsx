"use client";

import { useState, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";
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
          텔레그램 대화를 날짜별로 확인합니다
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
                {msgs.map((msg) => {
                  const cls = msg.classification as MessageClassification | null;
                  return (
                    <Card
                      key={msg.id}
                      className={
                        msg.role === "assistant"
                          ? "border-l-2 border-l-primary/50"
                          : ""
                      }
                    >
                      <CardHeader className="py-3 pb-1">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Badge
                              variant={
                                msg.role === "user" ? "default" : "secondary"
                              }
                              className="text-[10px]"
                            >
                              {msg.role === "user" ? "나" : "비서"}
                            </Badge>
                            {msg.category && (
                              <Badge variant="outline" className="text-[10px]">
                                {(msg.category as Category).name}
                              </Badge>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {formatTime(msg.created_at)}
                          </span>
                        </div>
                        {cls?.title && (
                          <CardTitle className="text-xs mt-1">
                            {cls.title}
                          </CardTitle>
                        )}
                      </CardHeader>
                      <CardContent className="py-2">
                        <p className="text-sm whitespace-pre-wrap line-clamp-4">
                          {msg.content}
                        </p>
                      </CardContent>
                    </Card>
                  );
                })}
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
