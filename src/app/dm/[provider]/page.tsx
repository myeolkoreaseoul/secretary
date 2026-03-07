"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api-client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  FolderOpen,
  Clock,
} from "lucide-react";

interface AIConversation {
  id: string;
  provider: string;
  external_id: string | null;
  project_path: string | null;
  title: string | null;
  model: string | null;
  started_at: string;
  ended_at: string | null;
  message_count: number;
  metadata: Record<string, unknown>;
  created_at: string;
}

interface ConversationsResponse {
  conversations: AIConversation[];
  total: number;
  page: number;
  totalPages: number;
}

const providerMap: Record<string, { apiValue: string; label: string; color: string }> = {
  claude: { apiValue: "claude_code", label: "Claude Code", color: "bg-orange-500/15 text-orange-400 border-orange-500/30" },
  codex: { apiValue: "codex", label: "Codex CLI", color: "bg-green-500/15 text-green-400 border-green-500/30" },
  gemini: { apiValue: "gemini_cli", label: "Gemini CLI", color: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
};

function formatDateTime(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(start: string, end: string | null) {
  if (!end) return "";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const mins = Math.round(ms / 60000);
  if (mins < 1) return "<1분";
  if (mins < 60) return `${mins}분`;
  const hours = Math.floor(mins / 60);
  const remainMins = mins % 60;
  return remainMins > 0 ? `${hours}시간 ${remainMins}분` : `${hours}시간`;
}

function shortenPath(path: string | null) {
  if (!path) return null;
  const parts = path.replace(/^\/home\/\w+\//, "~/").split("/");
  return parts[parts.length - 1] || parts[parts.length - 2];
}

export default function ProviderDMPage() {
  const params = useParams();
  const providerSlug = params.provider as string;
  const info = providerMap[providerSlug];

  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ConversationsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchConversations = useCallback(async () => {
    if (!info) return;
    setLoading(true);
    try {
      const p = new URLSearchParams({ page: String(page), provider: info.apiValue });
      if (query) p.set("q", query);
      const res = await apiFetch(`/api/conversations?${p}`);
      const json = await res.json();
      setData(json);
    } finally {
      setLoading(false);
    }
  }, [query, page, info]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchConversations();
  };

  if (!info) {
    return (
      <div className="text-center text-muted-foreground py-12">
        알 수 없는 프로바이더입니다.
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{info.label} 대화</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {info.label} 대화 기록
          {data && (
            <span className="ml-2 text-xs">
              (총 {data.total.toLocaleString()}개)
            </span>
          )}
        </p>
      </div>

      <form onSubmit={handleSearch} className="flex gap-2 mb-6">
        <Input
          placeholder="대화 제목 검색..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="max-w-sm"
        />
        <Button type="submit" size="sm" variant="secondary">
          <Search className="w-4 h-4" />
          검색
        </Button>
      </form>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {data?.conversations.map((conv) => (
            <Link key={conv.id} href={`/conversations/${conv.id}`}>
              <Card className="hover:bg-accent/50 transition-colors cursor-pointer">
                <CardHeader className="py-3 pb-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <Badge
                        variant="outline"
                        className={`text-[10px] shrink-0 ${info.color}`}
                      >
                        {info.label.split(" ")[0]}
                      </Badge>
                      {conv.model && (
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          {conv.model}
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {formatDateTime(conv.started_at)}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="py-2 pb-3">
                  <p className="text-sm font-medium truncate mb-1">
                    {conv.title || "제목 없음"}
                  </p>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    {conv.project_path && (
                      <span className="flex items-center gap-1">
                        <FolderOpen className="w-3 h-3" />
                        {shortenPath(conv.project_path)}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <MessageSquare className="w-3 h-3" />
                      {conv.message_count}개 메시지
                    </span>
                    {conv.ended_at && (
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDuration(conv.started_at, conv.ended_at)}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}

          {data && data.conversations.length === 0 && (
            <p className="text-center text-muted-foreground py-12">
              {query
                ? `"${query}"에 대한 결과가 없습니다`
                : `아직 수집된 ${info.label} 대화가 없습니다`}
            </p>
          )}
        </div>
      )}

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
