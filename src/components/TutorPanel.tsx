"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api-client";
import { X, Send, Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

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
  const [elapsed, setElapsed] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const initialSent = useRef(false);
  const loadingRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const messagesRef = useRef<TutorMessage[]>([]);

  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => () => { abortRef.current?.abort(); }, []);

  useEffect(() => {
    if (!loading) { setElapsed(0); return; }
    setElapsed(0);
    const interval = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, [loading]);

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
          history: messagesRef.current,
        }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) throw new Error("과외 선생님과 연결할 수 없습니다.");

      const data = await res.json();
      setMessages((prev) => [...prev, { role: "assistant", content: data.answer }]);
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      const message = err instanceof Error ? err.message : "오류가 발생했습니다.";
      setMessages((prev) => [...prev, { role: "assistant", content: message }]);
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
  }, []);

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
    <div className="border-t-2 border-[#333] bg-black flex flex-col font-mono" style={{ height: "45vh", minHeight: 200 }}>
      {/* Header - Claude Code 스타일 상단 바 */}
      <div className="flex items-center justify-between px-4 py-1.5 border-b border-[#333] shrink-0">
        <div className="flex items-center gap-2 text-xs">
          <span className="text-[#b48ead]">◆</span>
          <span className="text-white font-bold">Tutor</span>
          {initialText && (
            <span className="text-[#616e7c]">
              ─ &quot;{initialText.slice(0, 50)}{initialText.length > 50 ? "…" : ""}&quot;
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="text-[#616e7c] hover:text-white transition-colors"
          title="닫기 (ESC)"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Messages - CLI 출력 스타일 */}
      <div className="flex-1 overflow-y-auto text-[13px] leading-relaxed px-4 py-3 space-y-3" ref={scrollRef}>
        {messages.map((msg, i) => (
          <div key={i}>
            {msg.role === "user" ? (
              /* 사용자 입력: Claude Code의 ❯ 프롬프트 */
              <div className="text-white">
                <span className="text-[#b48ead] font-bold">❯ </span>
                {msg.content}
              </div>
            ) : (
              /* AI 응답: Claude Code의 마크다운 출력 */
              <div className="text-[#d8dee9] cli-markdown">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    /* 표: CLI 유니코드 보더 스타일 */
                    table: ({ children }) => (
                      <div className="my-2 overflow-x-auto">
                        <table className="border-collapse text-xs w-full">{children}</table>
                      </div>
                    ),
                    thead: ({ children }) => <thead>{children}</thead>,
                    th: ({ children }) => (
                      <th className="text-left px-2 py-1 text-white font-bold border-b border-[#555] bg-[#111]">
                        {children}
                      </th>
                    ),
                    td: ({ children }) => (
                      <td className="px-2 py-1 border-b border-[#333] text-[#d8dee9]">{children}</td>
                    ),
                    tr: ({ children }) => (
                      <tr className="hover:bg-[#111]">{children}</tr>
                    ),
                    /* 코드 블록: 어두운 배경 */
                    code: ({ className, children, ...props }) => {
                      const isBlock = className?.startsWith("language-");
                      if (isBlock) {
                        return (
                          <code
                            className="block bg-[#111] rounded px-3 py-2 my-2 overflow-x-auto text-[#a3be8c] text-xs border-l-2 border-[#555]"
                            {...props}
                          >
                            {children}
                          </code>
                        );
                      }
                      return (
                        <code className="bg-[#222] text-[#ebcb8b] px-1 rounded text-xs" {...props}>
                          {children}
                        </code>
                      );
                    },
                    pre: ({ children }) => <pre className="my-1">{children}</pre>,
                    /* 텍스트 */
                    p: ({ children }) => <p className="my-1.5">{children}</p>,
                    ul: ({ children }) => <ul className="list-disc pl-5 my-1 space-y-0.5">{children}</ul>,
                    ol: ({ children }) => <ol className="list-decimal pl-5 my-1 space-y-0.5">{children}</ol>,
                    li: ({ children }) => <li>{children}</li>,
                    /* 헤딩: CLI 볼드 스타일 */
                    h1: ({ children }) => <h1 className="text-white font-bold text-sm mt-3 mb-1">{children}</h1>,
                    h2: ({ children }) => <h2 className="text-white font-bold text-sm mt-3 mb-1">{children}</h2>,
                    h3: ({ children }) => <h3 className="text-[#88c0d0] font-bold mt-2 mb-1">{children}</h3>,
                    strong: ({ children }) => <strong className="text-white font-bold">{children}</strong>,
                    em: ({ children }) => <em className="text-[#b48ead] not-italic">{children}</em>,
                    hr: () => <hr className="border-[#333] my-2" />,
                    blockquote: ({ children }) => (
                      <blockquote className="border-l-2 border-[#b48ead] pl-3 my-2 text-[#616e7c]">
                        {children}
                      </blockquote>
                    ),
                    a: ({ href, children }) => (
                      <a href={href} className="text-[#88c0d0] underline" target="_blank" rel="noopener noreferrer">
                        {children}
                      </a>
                    ),
                  }}
                >
                  {msg.content}
                </ReactMarkdown>
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex items-center gap-2 text-[#616e7c]">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span className="text-xs">⏳ {elapsed}초</span>
          </div>
        )}
      </div>

      {/* Input - Claude Code 프롬프트 스타일 */}
      <div className="px-4 py-2 border-t border-[#333] shrink-0 bg-[#0a0a0a]">
        <div className="flex items-center gap-2">
          <span className="text-[#b48ead] font-bold shrink-0">❯</span>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="추가 질문..."
            rows={1}
            className="flex-1 bg-transparent text-[13px] text-white resize-none outline-none placeholder:text-[#444]"
          />
          <button
            disabled={!input.trim() || loading}
            onClick={() => {
              if (!loadingRef.current && input.trim()) {
                sendMessage(input);
                setInput("");
              }
            }}
            className="text-[#b48ead] disabled:text-[#333] transition-colors"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
