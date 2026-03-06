"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api-client";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Search } from "lucide-react";

interface YtVideo {
  id: string;
  video_id: string;
  title: string;
  channel: string;
  duration: number;
  thumbnail_url: string | null;
  created_at: string;
  summary_json: Record<string, unknown> | null;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  if (mins === 0) return `${seconds}초`;
  return `${mins}분`;
}

function formatRelativeDate(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  const diffMonth = Math.floor(diffDay / 30);
  const diffYear = Math.floor(diffDay / 365);

  if (diffSec < 60) return "방금 전";
  if (diffMin < 60) return `${diffMin}분 전`;
  if (diffHour < 24) return `${diffHour}시간 전`;
  if (diffDay < 30) return `${diffDay}일 전`;
  if (diffMonth < 12) return `${diffMonth}개월 전`;
  return `${diffYear}년 전`;
}

function VideoCardSkeleton() {
  return (
    <div className="rounded-xl overflow-hidden border border-border bg-card">
      <Skeleton className="w-full aspect-video" />
      <div className="p-3 space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </div>
  );
}

function VideoCard({ video, onClick }: { video: YtVideo; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className="rounded-xl overflow-hidden border border-border bg-card hover:bg-accent/50 transition-colors cursor-pointer group"
    >
      <div className="w-full aspect-video bg-muted relative overflow-hidden">
        {video.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={video.thumbnail_url}
            alt={video.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">
            썸네일 없음
          </div>
        )}
        {video.duration > 0 && (
          <span className="absolute bottom-1.5 right-1.5 bg-black/80 text-white text-xs px-1.5 py-0.5 rounded">
            {formatDuration(video.duration)}
          </span>
        )}
      </div>
      <div className="p-3 space-y-1">
        <h3 className="text-sm font-semibold leading-snug line-clamp-2 break-keep">
          {video.title}
        </h3>
        <p className="text-xs text-muted-foreground truncate">{video.channel}</p>
        <p className="text-xs text-muted-foreground/60">
          {formatRelativeDate(video.created_at)}
        </p>
      </div>
    </div>
  );
}

export default function YtPage() {
  const router = useRouter();
  const [videos, setVideos] = useState<YtVideo[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchVideos = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const url = q ? `/api/yt?q=${encodeURIComponent(q)}` : "/api/yt";
      const res = await apiFetch(url);
      const json = await res.json();
      setVideos(json.videos || []);
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchVideos(query);
    }, 300);
    return () => clearTimeout(timer);
  }, [query, fetchVideos]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">유튜브 요약</h1>
        <p className="text-muted-foreground text-sm mt-1">AI가 요약한 유튜브 영상 모음</p>
      </div>

      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="제목 또는 채널명으로 검색..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <VideoCardSkeleton key={i} />
          ))}
        </div>
      ) : videos.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <p className="text-muted-foreground text-sm">요약된 영상이 없습니다</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {videos.map((video) => (
            <VideoCard
              key={video.id}
              video={video}
              onClick={() => router.push(`/yt/${video.video_id}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
