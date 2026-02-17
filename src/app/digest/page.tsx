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
  const [digests, setDigests] = useState<Digest[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("morning");

  const fetchDigests = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/digest?date=${date}`);
      const json = await res.json();
      setDigests(json.digests || []);
      // Auto-select tab based on available data
      if (json.digests?.length > 0) {
        const hasEvening = json.digests.some(
          (d: Digest) => d.mode === "evening"
        );
        const hasMorning = json.digests.some(
          (d: Digest) => d.mode === "morning"
        );
        if (hasEvening && !hasMorning) setActiveTab("evening");
        else setActiveTab("morning");
      }
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    fetchDigests();
  }, [fetchDigests]);

  const changeDate = (offset: number) => {
    const d = new Date(date);
    d.setDate(d.getDate() + offset);
    setDate(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
    );
  };

  const morningDigest = digests.find((d) => d.mode === "morning");
  const eveningDigest = digests.find((d) => d.mode === "evening");

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">AI 다이제스트</h1>
          <p className="text-muted-foreground text-sm mt-1">
            매일 아침/저녁 AI 관련 유튜브 영상 요약
          </p>
        </div>
        <div className="flex items-center gap-2">
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
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="morning" className="text-xs">
              <Sunrise className="w-3.5 h-3.5 mr-1" />
              모닝
              {morningDigest && (
                <Badge variant="secondary" className="ml-1 text-[10px] px-1.5">
                  {morningDigest.video_count}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="evening" className="text-xs">
              <Moon className="w-3.5 h-3.5 mr-1" />
              이브닝
              {eveningDigest && (
                <Badge variant="secondary" className="ml-1 text-[10px] px-1.5">
                  {eveningDigest.video_count}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="morning">
            <DigestContent digest={morningDigest} />
          </TabsContent>
          <TabsContent value="evening">
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
    <div className="space-y-3">
      {digest.header && (
        <p className="text-sm text-muted-foreground">{digest.header}</p>
      )}
      {digest.videos.map((video, i) => (
        <Card key={video.video_id}>
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <CardTitle className="text-sm">
                  <span className="text-muted-foreground mr-2">{i + 1}.</span>
                  {video.title}
                </CardTitle>
                <CardDescription className="flex items-center gap-3 mt-1 flex-wrap">
                  <span>{video.channel}</span>
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
              <a
                href={`https://www.youtube.com/watch?v=${video.video_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 text-muted-foreground hover:text-foreground p-1"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          </CardHeader>
          {video.summary && (
            <CardContent>
              <p className="text-sm whitespace-pre-wrap text-muted-foreground">
                {video.summary}
              </p>
            </CardContent>
          )}
        </Card>
      ))}
    </div>
  );
}
