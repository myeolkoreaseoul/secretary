"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { X, Send, Loader2, MessageSquare } from "lucide-react";
import ReactMarkdown from "react-markdown";

interface TutorMessage {
  role: "user" | "assistant";
  content: string;
}

interface TutorPanelProps {
  conversationId: string;
  initialText?: string;
  messageId?: string;
  onClose: () => void;
}

export function TutorPanel({
  conversationId,
  initialText,
  messageId,
  onClose,
}: TutorPanelProps) {
  const [messages, setMessages] = useState<TutorMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const initialSent = useRef(false);
  const loadingRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const messagesRef = useRef<TutorMessage[]>([]);

  // messagesRef를 항상 동기화
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // 언마운트 시 진행 중인 요청 취소
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const sendMessage = useCallback(async (text: string, isInitial = false) => {
    if (!text.trim() || loadingRef.current) return;

    loadingRef.current = true;
    setLoading(true);

    const newUserMsg: TutorMessage = { role: "user", content: text };
    const updatedMessages = [...messagesRef.current, newUserMsg];
    setMessages(updatedMessages);

    const question = isInitial
      ? `이 부분을 설명해줘: ${text.slice(0, 100)}${text.length > 100 ? "..." : ""}`
      : text;

    // 이전 요청 취소 후 새 AbortController
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    try {
      const res = await apiFetch("/api/tutor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversation_id: conversationId,
          message_id: messageId,
          selected_text: initialText,
          question,
          history: messagesRef.current, // 현재 메시지 제외 (서버가 enriched 버전 추가)
        }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        throw new Error("과외 선생님과 연결할 수 없습니다.");
      }

      const data = await res.json();
      setMessages((prev) => [...prev, { role: "assistant", content: data.answer }]);
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      const message = err instanceof Error ? err.message : "오류가 발생했습니다.";
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: message },
      ]);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [conversationId, messageId, initialText]);

  useEffect(() => {
    if (initialText && !initialSent.current) {
      initialSent.current = true;
      sendMessage(initialText, true);
    }
  }, []); // Only once on mount, guarded by ref

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!loadingRef.current && input.trim()) {
        sendMessage(input);
        setInput("");
      }
    }
  };

  return (
    <div className="fixed top-0 right-0 w-96 h-full border-l bg-background shadow-xl z-50 flex flex-col animate-in slide-in-from-right duration-300">
      <Card className="h-full border-none rounded-none flex flex-col">
        <CardHeader className="py-3 px-4 border-b flex flex-row items-center justify-between shrink-0">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-primary" />
            AI 과외 선생님
          </CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
            <X className="w-4 h-4" />
          </Button>
        </CardHeader>

        <CardContent className="flex-1 overflow-y-auto p-4 space-y-4 scroll-thin" ref={scrollRef}>
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[90%] rounded-lg px-3 py-2 text-sm ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted"
                }`}
              >
                {msg.role === "assistant" ? (
                  <div className="prose prose-sm dark:prose-invert prose-p:my-1 prose-ul:my-1 max-w-none prose-pre:bg-black/50 prose-pre:p-2">
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
              <div className="bg-muted rounded-lg px-3 py-2">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              </div>
            </div>
          )}
        </CardContent>

        <div className="p-4 border-t shrink-0">
          <div className="flex gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="질문을 입력하세요..."
              rows={2}
              className="flex-1 resize-none bg-muted rounded-md px-3 py-2 text-sm outline-none placeholder:text-muted-foreground"
            />
            <Button
              size="icon"
              className="h-full px-3"
              disabled={!input.trim() || loading}
              onClick={() => {
                if (!loadingRef.current && input.trim()) {
                  sendMessage(input);
                  setInput("");
                }
              }}
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
