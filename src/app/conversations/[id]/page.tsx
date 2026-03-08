"use client";

import { useState, useEffect, useCallback, use, useRef } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft,
  FolderOpen,
  MessageSquare,
  Clock,
  ChevronDown,
  User,
  Bot,
  Wrench,
  Settings,
} from "lucide-react";
import { useTextSelection } from "@/hooks/useTextSelection";
import { SelectionPopup } from "@/components/SelectionPopup";
import { TutorPanel } from "@/components/TutorPanel";

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

interface AIMessage {
  id: string;
  role: string;
  content: string | null;
  token_count: number | null;
  model: string | null;
  message_at: string;
}

interface DetailResponse {
  conversation: AIConversation;
  messages: AIMessage[];
  totalMessages: number;
}

const providerColors: Record<string, string> = {
  claude_code: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  codex: "bg-green-500/15 text-green-400 border-green-500/30",
  gemini_cli: "bg-blue-500/15 text-blue-400 border-blue-500/30",
};

const roleConfig: Record<string, { icon: typeof User; label: string; color: string }> = {
  user: { icon: User, label: "사용자", color: "default" },
  assistant: { icon: Bot, label: "AI", color: "secondary" },
  tool: { icon: Wrench, label: "도구", color: "outline" },
  system: { icon: Settings, label: "시스템", color: "outline" },
};

function formatFullDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(start: string, end: string | null) {
  if (!end) return "진행 중";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const mins = Math.round(ms / 60000);
  if (mins < 1) return "<1분";
  if (mins < 60) return `${mins}분`;
  const hours = Math.floor(mins / 60);
  const remainMins = mins % 60;
  return remainMins > 0 ? `${hours}시간 ${remainMins}분` : `${hours}시간`;
}

function providerLabel(provider: string) {
  switch (provider) {
    case "claude_code": return "Claude Code";
    case "codex": return "Codex";
    case "gemini_cli": return "Gemini CLI";
    default: return provider;
  }
}

export default function ConversationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [data, setData] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const selection = useTextSelection(containerRef);
  const [tutorState, setTutorState] = useState<{
    open: boolean;
    text?: string;
    messageId?: string;
  }>({ open: false });

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/conversations/${id}?limit=50`);
      if (!res.ok) {
        setError("대화를 찾을 수 없습니다");
        return;
      }
      const json = await res.json();
      setData(json);
    } catch {
      setError("데이터를 불러오는 중 오류가 발생했습니다");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  const loadMore = async () => {
    if (!data) return;
    setLoadingMore(true);
    try {
      const offset = data.messages.length;
      const res = await apiFetch(
        `/api/conversations/${id}?limit=50&offset=${offset}`
      );
      const json: DetailResponse = await res.json();
      setData({
        ...json,
        messages: [...data.messages, ...json.messages],
      });
    } finally {
      setLoadingMore(false);
    }
  };

  const handleAsk = (text: string, messageId: string) => {
    setTutorState({ open: true, text, messageId });
    // Clear selection
    window.getSelection()?.removeAllRanges();
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground mb-4">{error}</p>
        <Link href="/conversations">
          <Button variant="outline" size="sm">
            <ArrowLeft className="w-4 h-4 mr-1" />
            목록으로
          </Button>
        </Link>
      </div>
    );
  }

  const { conversation: conv, messages, totalMessages } = data;
  const hasMore = messages.length < totalMessages;

  return (
    <div className="flex flex-col h-full">
      <div className={`flex-1 overflow-y-auto ${tutorState.open ? "max-h-[55vh]" : ""}`}>
        {/* Header */}
        <div className="mb-6">
          <Link
            href="/conversations"
            className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 mb-3"
          >
            <ArrowLeft className="w-4 h-4" />
            AI 대화 목록
          </Link>
          <h1 className="text-xl font-bold">{conv.title || "제목 없음"}</h1>
          <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-muted-foreground">
            <Badge
              variant="outline"
              className={providerColors[conv.provider] || ""}
            >
              {providerLabel(conv.provider)}
            </Badge>
            {conv.model && (
              <span className="text-xs">{conv.model}</span>
            )}
            {conv.project_path && (
              <span className="flex items-center gap-1">
                <FolderOpen className="w-3 h-3" />
                {conv.project_path.replace(/^\/home\/\w+\//, "~/")}
              </span>
            )}
            <span className="flex items-center gap-1">
              <MessageSquare className="w-3 h-3" />
              {conv.message_count}개
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatDuration(conv.started_at, conv.ended_at)}
            </span>
            <span>{formatFullDate(conv.started_at)}</span>
          </div>
        </div>

        {/* Messages */}
        <div className="space-y-2" ref={containerRef}>
          {messages.map((msg) => {
            const config = roleConfig[msg.role] || roleConfig.system;
            const Icon = config.icon;

            return (
              <Card
                key={msg.id}
                data-message-id={msg.id}
                className={
                  msg.role === "assistant"
                    ? "border-l-2 border-l-primary/50"
                    : msg.role === "tool"
                      ? "border-l-2 border-l-yellow-500/50"
                      : ""
                }
              >
                <CardHeader className="py-2 pb-0">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                      <Badge
                        variant={config.color as "default" | "secondary" | "outline"}
                        className="text-[10px]"
                      >
                        {config.label}
                      </Badge>
                      {msg.model && msg.model !== conv.model && (
                        <span className="text-[10px] text-muted-foreground">
                          {msg.model}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {msg.token_count != null && msg.token_count > 0 && (
                        <span className="text-[10px] text-muted-foreground">
                          {msg.token_count.toLocaleString()} tokens
                        </span>
                      )}
                      <span className="text-[10px] text-muted-foreground">
                        {formatTime(msg.message_at)}
                      </span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="py-2 pb-3">
                  {msg.content ? (
                    <pre className="text-sm whitespace-pre-wrap break-words font-[inherit] max-h-96 overflow-y-auto">
                      {msg.content}
                    </pre>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">
                      (내용 없음)
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Load more */}
        {hasMore && (
          <div className="flex justify-center mt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={loadMore}
              disabled={loadingMore}
            >
              {loadingMore ? (
                "불러오는 중..."
              ) : (
                <>
                  <ChevronDown className="w-4 h-4 mr-1" />
                  더 보기 ({messages.length}/{totalMessages})
                </>
              )}
            </Button>
          </div>
        )}
      </div>

      {selection && !tutorState.open && (
        <SelectionPopup selection={selection} onAsk={handleAsk} />
      )}

      {tutorState.open && (
        <TutorPanel
          key={`${tutorState.messageId}-${tutorState.text}`}
          conversationId={id}
          initialText={tutorState.text}
          messageId={tutorState.messageId}
          onClose={() => setTutorState({ open: false })}
        />
      )}
    </div>
  );
}
