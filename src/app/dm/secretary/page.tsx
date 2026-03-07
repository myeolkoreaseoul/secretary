"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api-client";
import { useRealtimeInsert } from "@/hooks/useRealtime";
import { Send, Loader2, MessageSquare } from "lucide-react";
import ReactMarkdown from "react-markdown";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  id?: string;
}

export default function SecretaryChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const seenIds = useRef<Set<string>>(new Set());

  const ownerChatId = process.env.NEXT_PUBLIC_OWNER_CHAT_ID;

  // Load chat history on mount
  const loadHistory = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/history?chat_id=${ownerChatId}&page=1`);
      const data = await res.json();
      const msgs: ChatMessage[] = (data.messages || [])
        .slice()
        .reverse()
        .map((m: { role: string; content: string; id?: string }) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
          id: m.id,
        }));
      msgs.forEach(m => { if (m.id) seenIds.current.add(m.id); });
      setMessages(prev => prev.length > 0 ? [...msgs, ...prev.filter(m => !m.id)] : msgs);
    } catch {
      // ignore
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!historyLoading) inputRef.current?.focus();
  }, [historyLoading]);

  useRealtimeInsert({
    table: 'telegram_messages',
    filter: `chat_id=eq.${ownerChatId}`,
    onInsert: useCallback((row: Record<string, unknown>) => {
      if (row.role !== 'assistant') return;
      const id = row.id as string | undefined;
      if (id && seenIds.current.has(id)) return;
      if (id) seenIds.current.add(id);
      const content = row.content as string;
      setMessages((prev) => [...prev, { role: 'assistant', content, id }]);
      setLoading(false);
    }, []),
  });

  const send = async () => {
    const msg = input.trim();
    if (!msg || loading || historyLoading) return;

    setMessages((prev) => [...prev, { role: "user", content: msg }]);
    setInput("");
    setLoading(true);

    try {
      const res = await apiFetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setMessages((prev) => [...prev, { role: "assistant", content: data.error || "오류가 발생했습니다." }]);
        setLoading(false);
        return;
      }

      const data = await res.json();

      // 슬래시 명령어는 동기 응답 (reply 필드 있음)
      if (data.reply) {
        setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
        setLoading(false);
      }
      // 일반 대화(queued=true)는 Realtime onInsert가 setLoading(false) 처리
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "네트워크 오류가 발생했습니다." },
      ]);
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="chat-fullpage flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto scroll-thin p-6">
        {historyLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center text-muted-foreground text-sm py-12 space-y-2">
            <MessageSquare className="w-10 h-10 mx-auto opacity-30" />
            <p className="text-base">AI 비서에게 질문하세요</p>
            <div className="text-xs space-y-1">
              <p>
                <code className="px-1 py-0.5 bg-muted rounded">/todo 장보기</code>{" "}
                할일 추가
              </p>
              <p>
                <code className="px-1 py-0.5 bg-muted rounded">/time 2h 코딩</code>{" "}
                시간 기록
              </p>
              <p>
                <code className="px-1 py-0.5 bg-muted rounded">/search 회의</code>{" "}
                대화 검색
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4 max-w-3xl mx-auto">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg px-4 py-3 text-sm ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  }`}
                >
                  {msg.role === "assistant" ? (
                    <div className="prose prose-sm dark:prose-invert prose-p:my-1 prose-ul:my-1 max-w-none">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <span className="whitespace-pre-wrap">{msg.content}</span>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-lg px-4 py-3">
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-border p-4 shrink-0">
        <div className="max-w-3xl mx-auto flex gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="메시지 입력... (Shift+Enter: 줄바꿈)"
            rows={1}
            className="flex-1 resize-none bg-muted rounded-md px-4 py-3 text-sm outline-none placeholder:text-muted-foreground"
          />
          <button
            onClick={send}
            disabled={!input.trim() || loading}
            className="p-3 rounded-md bg-primary text-primary-foreground disabled:opacity-50 hover:opacity-90"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
