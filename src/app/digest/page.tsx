"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api-client";
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
      const res = await apiFetch(`/api/digest?date=${date}`);
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
    <div className="max-w-md mx-auto px-4 py-6 w-full overflow-x-hidden">
      <div className="mb-6 space-y-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">AI 다이제스트</h1>
          <p className="text-muted-foreground text-sm mt-1">
            매일 아침/저녁 AI 유튜브 요약
          </p>
        </div>
        
        <div className="flex items-center justify-between bg-muted/30 p-1 rounded-lg">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => changeDate(-1)}
            className="h-8 w-8 p-0"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-auto h-8 text-sm bg-transparent border-none focus-visible:ring-0 text-center"
          />
          <Button
            size="sm"
            variant="ghost"
            onClick={() => changeDate(1)}
            className="h-8 w-8 p-0"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      ) : digests.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground text-sm">
              이 날짜의 다이제스트가 없습니다
            </p>
          </CardContent>
        </Card>
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-6 h-9">
            <TabsTrigger value="morning" className="text-sm">
              <Sunrise className="w-3.5 h-3.5 mr-1.5" />
              모닝
              {morningDigest && (
                <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 text-[10px] min-w-[1.25rem] justify-center">
                  {morningDigest.video_count}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="evening" className="text-sm">
              <Moon className="w-3.5 h-3.5 mr-1.5" />
              이브닝
              {eveningDigest && (
                <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 text-[10px] min-w-[1.25rem] justify-center">
                  {eveningDigest.video_count}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="morning" className="mt-0 focus-visible:ring-0">
            <DigestContent digest={morningDigest} />
          </TabsContent>
          <TabsContent value="evening" className="mt-0 focus-visible:ring-0">
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
      <Card className="border-dashed shadow-none">
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
        <p className="text-xs font-medium text-muted-foreground px-1 uppercase tracking-wider">
          {digest.header}
        </p>
      )}
      {digest.videos.map((video, i) => (
        <Card key={video.video_id} className="overflow-hidden border shadow-sm">
          <div className="p-4">
            <div className="flex gap-3">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary mt-0.5">
                {i + 1}
              </span>
              <div className="flex-1 min-w-0 space-y-1.5">
                <h3 className="text-base font-semibold leading-snug break-keep">
                  <a
                    href={`https://www.youtube.com/watch?v=${video.video_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-primary transition-colors line-clamp-2"
                  >
                    {video.title}
                  </a>
                </h3>
                
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground/80 truncate max-w-[120px]">
                    {video.channel}
                  </span>
                  {(video.view_count > 0 || video.duration) && (
                    <span className="w-0.5 h-0.5 rounded-full bg-muted-foreground/40" />
                  )}
                  {video.view_count > 0 && (
                    <span>{formatViewCount(video.view_count)}</span>
                  )}
                  {video.duration && (
                    <span>{formatDuration(video.duration)}</span>
                  )}
                </div>
              </div>
            </div>
            
            {video.summary && (
              <div className="mt-3 pl-8">
                <div className="text-sm text-muted-foreground leading-relaxed bg-muted/30 rounded-md p-3">
                  {video.summary}
                </div>
              </div>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}
