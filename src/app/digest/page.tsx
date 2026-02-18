"use client";

import { useState, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ExternalLink,
  Eye,
  Clock,
  Sunrise,
  Moon,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

interface DigestVideo {
  video_id: string;
  title: string;
  channel: string;
  view_count: number;
  duration: string;
  summary: string | null;
  published_at?: string;
}

interface Digest {
  id: string;
  digest_date: string;
  mode: "morning" | "evening";
  videos: DigestVideo[];
  header: string | null;
  video_count: number;
  created_at: string;
}

function formatViewCount(count: number): string {
  if (count >= 10000) return `${(count / 10000).toFixed(1)}만회`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}천회`;
  return `${count}회`;
}

function formatDuration(iso: string): string {
  if (!iso) return "";
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return "";
  const [, h, mi, s] = m;
  const parts: string[] = [];
  if (h) parts.push(`${h}시간`);
  if (mi) parts.push(`${mi}분`);
  if (s && !h) parts.push(`${s}초`);
  return parts.join(" ");
}

export default function DigestPage() {
  const [date, setDate] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  });
  // ... state ...

  // ... fetchDigests ...

  // ... changeDate ...

  // ... morningDigest / eveningDigest ...

  return (
    <div className="container max-w-2xl mx-auto px-4 py-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold">AI 다이제스트</h1>
          <p className="text-muted-foreground text-sm mt-1">
            매일 아침/저녁 AI 관련 유튜브 영상 요약
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <Button
            size="icon"
            variant="outline"
            onClick={() => changeDate(-1)}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-auto"
          />
          <Button
            size="icon"
            variant="outline"
            onClick={() => changeDate(1)}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : digests.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              이 날짜의 다이제스트가 없습니다
            </p>
          </CardContent>
        </Card>
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="morning">
              <Sunrise className="w-4 h-4 mr-2" />
              모닝
              {morningDigest && (
                <Badge variant="secondary" className="ml-2">
                  {morningDigest.video_count}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="evening">
              <Moon className="w-4 h-4 mr-2" />
              이브닝
              {eveningDigest && (
                <Badge variant="secondary" className="ml-2">
                  {eveningDigest.video_count}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="morning" className="mt-0">
            <DigestContent digest={morningDigest} />
          </TabsContent>
          <TabsContent value="evening" className="mt-0">
            <DigestContent digest={eveningDigest} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function DigestContent({ digest }: { digest: Digest | undefined }) {
  if (!digest) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-muted-foreground text-sm">
            이 시간대의 다이제스트가 없습니다
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {digest.header && (
        <p className="text-sm font-medium text-muted-foreground px-1">
          {digest.header}
        </p>
      )}
      {digest.videos.map((video, i) => (
        <Card key={video.video_id} className="overflow-hidden">
          <CardHeader className="p-4 pb-2">
            <div className="flex items-start gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                {i + 1}
              </span>
              <div className="flex-1 min-w-0 space-y-1">
                <CardTitle className="text-base font-semibold leading-tight">
                  <a
                    href={`https://www.youtube.com/watch?v=${video.video_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline hover:text-primary transition-colors block"
                  >
                    {video.title}
                  </a>
                </CardTitle>
                <CardDescription className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:text-sm">
                  <span className="font-medium text-foreground/80">
                    {video.channel}
                  </span>
                  {video.view_count > 0 && (
                    <span className="flex items-center gap-1">
                      <Eye className="w-3 h-3" />
                      {formatViewCount(video.view_count)}
                    </span>
                  )}
                  {video.duration && (
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatDuration(video.duration)}
                    </span>
                  )}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          {video.summary && (
            <CardContent className="p-4 pt-2">
              <div className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                {video.summary}
              </div>
            </CardContent>
          )}
        </Card>
      ))}
    </div>
  );
}
