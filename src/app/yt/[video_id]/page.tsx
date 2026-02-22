"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api-client";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";

interface Bullet {
  keyword: string;
  text: string;
  timestamp?: string;
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
  summary_json: SummaryJson | null;
  created_at: string;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  if (mins === 0) return `${seconds}초`;
  return `${mins}분`;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return `${date.getFullYear()}. ${date.getMonth() + 1}. ${date.getDate()}.`;
}

function TimestampPill({ ts }: { ts: string }) {
  return (
    <span className="inline-block bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded px-2 py-0.5 text-xs font-mono ml-2 align-middle">
      {ts}
    </span>
  );
}

function tsToSeconds(ts: string): number {
  const parts = ts.split(":").map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
}

function TimestampBadge({ ts, videoId }: { ts: string; videoId: string }) {
  const seconds = tsToSeconds(ts);
  const label = ts.startsWith("00:") ? ts.slice(3) : ts;
  return (
    <a
      href={`https://www.youtube.com/watch?v=${videoId}&t=${seconds}s`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-block bg-gray-100 dark:bg-gray-800 text-blue-500 hover:text-blue-600 rounded px-1.5 py-0.5 text-xs font-mono ml-1 align-middle"
    >
      {label}
    </a>
  );
}

function parseBold(text: string): string {
  return text.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="w-full h-64 rounded-xl" />
      <div className="space-y-2">
        <Skeleton className="h-7 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-32 rounded-xl" />
      </div>
      <Skeleton className="h-24 rounded-xl" />
      <div className="space-y-4">
        <Skeleton className="h-6 w-1/3" />
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
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

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <LoadingSkeleton />
      </div>
    );
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
    <div className="max-w-3xl mx-auto space-y-6 pb-12">
      {/* Back link */}
      <Link
        href="/yt"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        목록으로
      </Link>

      {/* Thumbnail hero */}
      {video.thumbnail_url && (
        <div className="w-full max-h-64 overflow-hidden rounded-xl bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={video.thumbnail_url}
            alt={video.title}
            className="w-full max-h-64 object-cover"
          />
        </div>
      )}

      {/* Title / meta */}
      <div className="space-y-1">
        <h1 className="text-2xl font-bold leading-snug break-keep">{video.title}</h1>
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground/80">{video.channel}</span>
          {video.duration > 0 && (
            <> &middot; {formatDuration(video.duration)}</>
          )}
          {" "}
          <span className="text-muted-foreground/60">&middot; {formatDate(video.created_at)}</span>
        </p>
      </div>

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
                {section.timestamp && <TimestampPill ts={section.timestamp} />}
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
                        {sub.timestamp && <TimestampPill ts={sub.timestamp} />}
                      </h3>

                      {sub.bullets && sub.bullets.length > 0 && (
                        <ul className="space-y-1.5 ml-2">
                          {sub.bullets.map((bullet, bi) => (
                            <li key={bi} className="flex items-start gap-2 text-sm">
                              <span className="text-muted-foreground mt-0.5 shrink-0">•</span>
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
                                {bullet.timestamp && (
                                  <TimestampBadge ts={bullet.timestamp} videoId={video.video_id} />
                                )}
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
  );
}
