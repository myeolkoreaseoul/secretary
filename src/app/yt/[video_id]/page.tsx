"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api-client";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";

interface YTPlayer {
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  playVideo(): void;
  destroy(): void;
}

interface YTPlayerConstructor {
  new (
    element: HTMLElement,
    options: {
      videoId: string;
      playerVars?: Record<string, number>;
      height?: string;
      width?: string;
    }
  ): YTPlayer;
}

interface YTNamespace {
  Player: YTPlayerConstructor;
}

declare global {
  interface Window {
    YT: YTNamespace;
    onYouTubeIframeAPIReady: () => void;
  }
}

interface Sentence {
  num: number;
  text: string;
  start_sec: number;
  timestamp: string;
}

interface Bullet {
  keyword: string;
  text: string;
  timestamp?: string;
  sentence_numbers?: number[];
}

interface Subsection {
  number: string;
  title: string;
  source_idx?: number;
  timestamp?: string;
  duration_str?: string;
  bullets?: Bullet[];
}

interface Section {
  number: string;
  title: string;
  source_idx?: number;
  timestamp?: string;
  duration_str?: string;
  intro?: string;
  subsections?: Subsection[];
}

interface TocEntry {
  number: string;
  title: string;
  subsections?: { number: string; title: string }[];
}

interface KeyQuestion {
  emoji: string;
  question: string;
  answer: string;
  bullets?: string[];
}

interface SummaryJson {
  key_questions?: KeyQuestion[];
  intro?: string;
  toc?: TocEntry[];
  sections?: Section[];
  tags?: string[];
}

interface ChatMsg {
  role: "user" | "ai";
  content: string;
}

interface YtVideo {
  id: string;
  video_id: string;
  url: string;
  title: string;
  channel: string;
  duration: number;
  thumbnail_url: string | null;
  lang: string;
  transcript: string | null;
  sentences: Sentence[] | null;
  summary_json: SummaryJson | null;
  created_at: string;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  if (mins === 0) return `${seconds}초`;
  return `${mins}분`;
}

function tsToSeconds(ts: string): number {
  const parts = ts.split(":").map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
}

function TimestampPill({ ts, onSeek }: { ts: string; onSeek?: (s: number) => void }) {
  if (onSeek) {
    return (
      <button
        onClick={() => onSeek(tsToSeconds(ts))}
        className="inline-block bg-gray-100 dark:bg-gray-800 text-blue-500 hover:text-blue-600 rounded px-2 py-0.5 text-xs font-mono ml-2 align-middle cursor-pointer"
      >
        {ts}
      </button>
    );
  }
  return (
    <span className="inline-block bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded px-2 py-0.5 text-xs font-mono ml-2 align-middle">
      {ts}
    </span>
  );
}

function SentenceBadge({
  sentenceNumbers,
  highlighted,
  onClick,
}: {
  sentenceNumbers: number[];
  highlighted: boolean;
  onClick: () => void;
}) {
  const label =
    sentenceNumbers.length === 1
      ? `${sentenceNumbers[0]}`
      : `${sentenceNumbers[0]}~${sentenceNumbers[sentenceNumbers.length - 1]}`;
  return (
    <button
      onClick={onClick}
      className={`inline-block rounded px-1.5 py-0.5 text-xs font-mono ml-1 align-middle transition-colors cursor-pointer ${
        highlighted
          ? "bg-blue-500 text-white"
          : "bg-gray-100 dark:bg-gray-800 text-blue-500 hover:bg-blue-100 dark:hover:bg-blue-900 dark:hover:text-blue-400"
      }`}
    >
      [{label}]
    </button>
  );
}

function parseBold(text: string): string {
  return text.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
}

const FIXED_STYLE: React.CSSProperties = {
  position: "fixed",
  top: "56px",
  left: "14rem",
  right: 0,
  bottom: 0,
  zIndex: 10,
};

function LoadingSkeleton() {
  return (
    <div className="flex flex-col bg-background" style={FIXED_STYLE}>
      <div className="shrink-0 h-12 flex items-center px-4 border-b border-border gap-3">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 flex-1 max-w-md" />
      </div>
      <div className="flex flex-1 min-h-0">
        <div className="w-96 shrink-0 border-r border-border flex flex-col">
          <Skeleton className="w-full aspect-video shrink-0" />
          <div className="flex-1 p-3 space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        </div>
        <div className="flex-1 p-6 space-y-4">
          <Skeleton className="h-6 w-1/3" />
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
        </div>
      </div>
    </div>
  );
}

function ScriptPanel({
  sentences,
  highlightedNums,
  onSeek,
}: {
  sentences: Sentence[];
  highlightedNums: number[];
  onSeek: (seconds: number) => void;
}) {
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-3 py-2 border-b border-border shrink-0">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          자막 ({sentences.length})
        </span>
      </div>
      <div className="overflow-y-auto flex-1 scroll-thin">
        {sentences.map((s) => {
          const isHighlighted = highlightedNums.includes(s.num);
          return (
            <div
              key={s.num}
              data-sentence-num={s.num}
              onClick={() => onSeek(s.start_sec)}
              className={`cursor-pointer flex gap-2 px-3 py-2 text-xs border-b border-border/40 border-l-2 transition-colors ${
                isHighlighted
                  ? "bg-blue-500/10 border-l-blue-500"
                  : "border-l-transparent hover:bg-muted/50"
              }`}
            >
              <span className="text-muted-foreground/60 font-mono shrink-0 w-5 text-right pt-0.5">
                {s.num}
              </span>
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-muted-foreground/50 font-mono text-[10px]">
                  {s.timestamp.startsWith("00:") ? s.timestamp.slice(3) : s.timestamp}
                </span>
                <span className={`text-sm leading-relaxed break-keep ${isHighlighted ? "text-foreground font-medium" : "text-foreground/80"}`}>
                  {s.text}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function YtChatPanel({
  videoId,
  keyQuestions,
}: {
  videoId: string;
  keyQuestions?: KeyQuestion[];
}) {
  const [messages, setMessages] = React.useState<ChatMsg[]>([
    { role: "ai", content: "이 영상에 대해 궁금한 것을 물어보세요." },
  ]);
  const [input, setInput] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const send = useCallback(
    async (text: string) => {
      if (!text.trim() || loading) return;
      const userMsg: ChatMsg = { role: "user", content: text };
      const history = messages.slice(1);
      // AI 메시지 자리를 미리 추가 (스트리밍 채울 위치)
      setMessages((prev) => [...prev, userMsg, { role: "ai", content: "" }]);
      setInput("");
      setLoading(true);
      try {
        const res = await apiFetch(`/api/yt/${videoId}/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text, history }),
        });

        const reader = res.body?.getReader();
        if (!reader) throw new Error("No stream");
        const decoder = new TextDecoder();
        let buf = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const payload = line.slice(6);
            if (payload === "[DONE]") break;
            try {
              const data = JSON.parse(payload);
              if (data.chunk) {
                setMessages((prev) => {
                  const updated = [...prev];
                  const last = updated[updated.length - 1];
                  updated[updated.length - 1] = { ...last, content: last.content + data.chunk };
                  return updated;
                });
              } else if (data.error) {
                setMessages((prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = { ...updated[updated.length - 1], content: data.error };
                  return updated;
                });
              }
            } catch { /* ignore malformed lines */ }
          }
        }
      } catch {
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { ...updated[updated.length - 1], content: "네트워크 오류가 발생했습니다." };
          return updated;
        });
      } finally {
        setLoading(false);
      }
    },
    [videoId, messages, loading]
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  return (
    <div className="w-72 shrink-0 flex flex-col border-l border-border overflow-hidden">
      {/* Header */}
      <div className="shrink-0 px-3 py-2 border-b border-border flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          AI 채팅
        </span>
        <button
          onClick={() =>
            setMessages([{ role: "ai", content: "이 영상에 대해 궁금한 것을 물어보세요." }])
          }
          className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
        >
          초기화
        </button>
      </div>

      {/* Quick questions */}
      {keyQuestions && keyQuestions.length > 0 && messages.length <= 1 && (
        <div className="shrink-0 px-3 py-2 border-b border-border space-y-1.5">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">빠른 질문</p>
          {keyQuestions.slice(0, 3).map((kq, i) => (
            <button
              key={i}
              onClick={() => send(kq.question)}
              className="w-full text-left text-xs px-2 py-1.5 rounded border border-border hover:bg-muted/50 transition-colors text-foreground/80 line-clamp-2"
            >
              {kq.emoji} {kq.question}
            </button>
          ))}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 scroll-thin">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[90%] rounded-xl px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap ${
                m.role === "user"
                  ? "bg-blue-500 text-white"
                  : "bg-muted text-foreground"
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-muted rounded-xl px-3 py-2 text-xs text-muted-foreground animate-pulse">
              생각 중...
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="shrink-0 border-t border-border px-3 py-2 flex items-center gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          placeholder="질문 입력..."
          className="flex-1 text-xs bg-transparent outline-none placeholder:text-muted-foreground"
          disabled={loading}
        />
        <button
          onClick={() => send(input)}
          disabled={!input.trim() || loading}
          className="text-xs text-blue-500 hover:text-blue-400 disabled:opacity-40 transition-colors shrink-0 font-medium"
        >
          전송
        </button>
      </div>
    </div>
  );
}

export default function YtVideoPage() {
  const params = useParams();
  const video_id = params.video_id as string;
  const [video, setVideo] = useState<YtVideo | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [highlightedNums, setHighlightedNums] = useState<number[]>([]);

  const playerRef = useRef<YTPlayer | null>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null);

  const sentences = video?.sentences ?? [];
  const hasSentences = sentences.length > 0;

  const seekTo = useCallback((seconds: number) => {
    playerRef.current?.seekTo(seconds, true);
    playerRef.current?.playVideo();
  }, []);

  function handleHighlight(nums: number[]) {
    setHighlightedNums(nums);
    const firstSentence = sentences.find((s) => s.num === nums[0]);
    if (firstSentence) {
      seekTo(firstSentence.start_sec);
    }
    if (nums.length > 0) {
      setTimeout(() => {
        const el = document.querySelector(`[data-sentence-num="${nums[0]}"]`);
        el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }, 50);
    }
  }

  useEffect(() => {
    async function fetchVideo() {
      setLoading(true);
      try {
        const res = await apiFetch(`/api/yt/${video_id}`);
        if (res.status === 404) {
          setNotFound(true);
          return;
        }
        const data = await res.json();
        setVideo(data);
      } finally {
        setLoading(false);
      }
    }
    fetchVideo();
  }, [video_id]);

  // YouTube IFrame API
  useEffect(() => {
    if (!video?.video_id) return;

    if (!window.YT) {
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(script);
    }

    const initPlayer = () => {
      if (playerContainerRef.current && video.video_id) {
        playerRef.current = new window.YT.Player(playerContainerRef.current, {
          videoId: video.video_id,
          playerVars: { autoplay: 0, rel: 0 },
          height: "100%",
          width: "100%",
        });
      }
    };

    if (window.YT?.Player) {
      initPlayer();
    } else {
      window.onYouTubeIframeAPIReady = initPlayer;
    }

    return () => {
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, [video?.video_id]);

  if (loading) {
    return <LoadingSkeleton />;
  }

  if (notFound || !video) {
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <Link
          href="/yt"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          목록으로
        </Link>
        <Card>
          <CardContent className="py-16 text-center">
            <p className="text-muted-foreground">영상을 찾을 수 없습니다</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const s = video.summary_json;

  return (
    <div className="flex flex-col bg-background" style={FIXED_STYLE}>
      {/* Header bar */}
      <div className="shrink-0 h-12 flex items-center px-4 border-b border-border gap-3">
        <Link
          href="/yt"
          className="shrink-0 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="hidden sm:inline">목록으로</span>
        </Link>
        <div className="w-px h-4 bg-border shrink-0" />
        <span className="text-sm font-semibold truncate text-foreground/90 flex-1 min-w-0">
          {video.title}
        </span>
        {video.channel && (
          <span className="shrink-0 text-xs text-muted-foreground hidden md:inline">
            {video.channel}
            {video.duration > 0 && <> &middot; {formatDuration(video.duration)}</>}
          </span>
        )}
      </div>

      {/* Body */}
      <div className="flex flex-1 min-h-0">
        {/* Left panel: Player + Script */}
        <div className="w-96 shrink-0 flex flex-col border-r border-border overflow-hidden">
          {/* YouTube Player (16:9) */}
          <div className="w-full aspect-video shrink-0 bg-black">
            <div ref={playerContainerRef} className="w-full h-full" />
          </div>

          {/* Script panel */}
          {hasSentences ? (
            <ScriptPanel
              sentences={sentences}
              highlightedNums={highlightedNums}
              onSeek={seekTo}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground">
              자막 없음
            </div>
          )}
        </div>

        {/* Middle panel: Summary */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6 pb-12 scroll-thin">
          {/* Key Questions */}
          {s?.key_questions && s.key_questions.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-base font-semibold text-foreground/90">핵심 질문</h2>
              <div className="grid grid-cols-1 gap-3">
                {s.key_questions.map((kq, i) => (
                  <div
                    key={i}
                    className="border border-border rounded-xl p-4 border-l-4 border-l-blue-500 dark:border-l-blue-400 bg-card"
                  >
                    <p className="font-semibold text-sm mb-1.5">
                      {kq.emoji} {kq.question}
                    </p>
                    <p className="text-sm text-muted-foreground leading-relaxed">{kq.answer}</p>
                    {kq.bullets && kq.bullets.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {kq.bullets.map((b, bi) => (
                          <li
                            key={bi}
                            className="text-xs text-muted-foreground pl-3 border-l-2 border-muted"
                            dangerouslySetInnerHTML={{ __html: parseBold(b) }}
                          />
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Intro */}
          {s?.intro && (
            <p className="text-sm italic text-muted-foreground leading-relaxed border-l-2 border-muted pl-4">
              {s.intro}
            </p>
          )}

          {/* TOC */}
          {s?.toc && s.toc.length > 0 && (
            <div className="border border-border rounded-xl p-4 bg-card space-y-2">
              <h2 className="text-sm font-semibold text-foreground/90 mb-2">목차</h2>
              <ol className="space-y-1.5">
                {s.toc.map((entry) => (
                  <li key={entry.number}>
                    <span className="text-sm font-medium">
                      {entry.number}. {entry.title}
                    </span>
                    {entry.subsections && entry.subsections.length > 0 && (
                      <ol className="ml-4 mt-1 space-y-1">
                        {entry.subsections.map((sub) => (
                          <li key={sub.number} className="text-xs text-muted-foreground">
                            {sub.number}. {sub.title}
                          </li>
                        ))}
                      </ol>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Sections */}
          {s?.sections && s.sections.length > 0 && (
            <div className="space-y-6">
              {s.sections.map((section) => (
                <div key={section.number} className="space-y-3">
                  {/* Section header */}
                  <h2 className="text-lg font-bold flex items-center flex-wrap gap-1">
                    <span>{section.number}. {section.title}</span>
                    {section.timestamp && <TimestampPill ts={section.timestamp} onSeek={seekTo} />}
                  </h2>

                  {/* Section intro */}
                  {section.intro && (
                    <p className="text-sm italic text-muted-foreground leading-relaxed">
                      {section.intro}
                    </p>
                  )}

                  {/* Subsections */}
                  {section.subsections && section.subsections.length > 0 && (
                    <div className="space-y-4 ml-1">
                      {section.subsections.map((sub) => (
                        <div key={sub.number} className="space-y-2">
                          <h3 className="text-base font-semibold flex items-center flex-wrap gap-1 text-foreground/90">
                            <span>{sub.number}. {sub.title}</span>
                            {sub.timestamp && <TimestampPill ts={sub.timestamp} onSeek={seekTo} />}
                          </h3>

                          {sub.bullets && sub.bullets.length > 0 && (
                            <ul className="space-y-1.5 ml-2">
                              {sub.bullets.map((bullet, bi) => (
                                <li key={bi} className="flex items-start gap-2 text-sm">
                                  <span className="text-muted-foreground mt-1 shrink-0 text-xs">–</span>
                                  <span className="leading-relaxed">
                                    <span
                                      dangerouslySetInnerHTML={{
                                        __html: parseBold(
                                          bullet.keyword
                                            ? `**${bullet.keyword}**: ${bullet.text}`
                                            : bullet.text
                                        ),
                                      }}
                                    />
                                    {hasSentences && bullet.sentence_numbers && bullet.sentence_numbers.length > 0 ? (
                                      <SentenceBadge
                                        sentenceNumbers={bullet.sentence_numbers}
                                        highlighted={bullet.sentence_numbers.some((n) => highlightedNums.includes(n))}
                                        onClick={() => handleHighlight(bullet.sentence_numbers!)}
                                      />
                                    ) : bullet.timestamp ? (
                                      <button
                                        onClick={() => seekTo(tsToSeconds(bullet.timestamp!))}
                                        className="inline-block bg-gray-100 dark:bg-gray-800 text-blue-500 hover:text-blue-600 rounded px-1.5 py-0.5 text-xs font-mono ml-1 align-middle cursor-pointer"
                                      >
                                        {bullet.timestamp.startsWith("00:") ? bullet.timestamp.slice(3) : bullet.timestamp}
                                      </button>
                                    ) : null}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Tags */}
          {s?.tags && s.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-2">
              {s.tags.map((tag) => (
                <span
                  key={tag}
                  className="text-xs bg-muted text-muted-foreground rounded-full px-3 py-1"
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Right panel: AI Chat */}
        <YtChatPanel videoId={video_id} keyQuestions={s?.key_questions} />
      </div>
    </div>
  );
}
