"use client";

import { useState, useEffect, useCallback } from "react";
import { Disc3, Copy, Check, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PromptCard, copyToClipboard } from "@/components/phonk/PromptCard";
import {
  generatePrompts,
  getHistory,
  saveHistory,
  PROMPTS_DB,
  GENRE_COLORS,
  type GeneratedPrompt,
  type GeneratorConfig,
  type HistoryEntry,
} from "@/lib/phonk-generator";

const BPM_OPTIONS = PROMPTS_DB.bpm_range;

export default function PhonkPage() {
  // Config
  const [count, setCount] = useState(27);
  const [bpmMin, setBpmMin] = useState(125);
  const [bpmMax, setBpmMax] = useState(160);
  const [artistRef, setArtistRef] = useState(true);
  const [genreFilter, setGenreFilter] = useState<string | undefined>(undefined);

  // State
  const [prompts, setPrompts] = useState<GeneratedPrompt[]>([]);
  const [allCopied, setAllCopied] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  // Load history on mount
  useEffect(() => {
    setHistory(getHistory());
  }, []);

  // Listen for genre filter from sidebar via custom event
  useEffect(() => {
    const handler = (e: CustomEvent<string | undefined>) => {
      setGenreFilter(e.detail);
      setShowHistory(false);
    };
    const histHandler = () => setShowHistory(true);
    window.addEventListener("phonk-genre-filter", handler as EventListener);
    window.addEventListener("phonk-show-history", histHandler);
    return () => {
      window.removeEventListener("phonk-genre-filter", handler as EventListener);
      window.removeEventListener("phonk-show-history", histHandler);
    };
  }, []);

  const handleGenerate = useCallback(() => {
    const config: GeneratorConfig = {
      count,
      bpmMin,
      bpmMax,
      artistRef,
      genreFilter,
    };
    const result = generatePrompts(config);
    setPrompts(result);
    if (result.length > 0) {
      const entry = saveHistory(result);
      setHistory((prev) => [entry, ...prev].slice(0, 20));
    }
    setShowHistory(false);
  }, [count, bpmMin, bpmMax, artistRef, genreFilter]);

  const handleCopyAll = async () => {
    const text = prompts.map((p) => p.prompt).join("\n");
    const ok = await copyToClipboard(text);
    if (ok) {
      setAllCopied(true);
      setTimeout(() => setAllCopied(false), 2000);
    }
  };

  const loadHistoryEntry = (entry: HistoryEntry) => {
    setPrompts(entry.prompts);
    setShowHistory(false);
  };

  const filteredPrompts = genreFilter
    ? prompts.filter((p) => p.genre === genreFilter)
    : prompts;

  return (
    <div className="flex-1 overflow-y-auto scroll-thin">
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        {/* Control Panel */}
        <Card className="bg-[#1a1d21] border-[#383a3f] p-5">
          <div className="flex items-center gap-2 mb-4">
            <Disc3 className="w-5 h-5 text-red-400" />
            <h2 className="text-base font-semibold text-zinc-200">Phonk Prompt Generator</h2>
            {genreFilter && (
              <Badge variant="outline" className={`text-[11px] border ${GENRE_COLORS[genreFilter] || ""}`}>
                {genreFilter}
              </Badge>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Count */}
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">프롬프트 수</label>
              <Input
                type="number"
                min={1}
                max={100}
                value={count}
                onChange={(e) => setCount(Math.max(1, Math.min(100, Number(e.target.value))))}
                className="bg-[#222529] border-[#383a3f] text-zinc-200 h-9"
              />
            </div>

            {/* BPM Min */}
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">BPM 최소</label>
              <select
                value={bpmMin}
                onChange={(e) => setBpmMin(Number(e.target.value))}
                className="w-full h-9 rounded-md bg-[#222529] border border-[#383a3f] text-zinc-200 text-sm px-3"
              >
                {BPM_OPTIONS.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>

            {/* BPM Max */}
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">BPM 최대</label>
              <select
                value={bpmMax}
                onChange={(e) => setBpmMax(Number(e.target.value))}
                className="w-full h-9 rounded-md bg-[#222529] border border-[#383a3f] text-zinc-200 text-sm px-3"
              >
                {BPM_OPTIONS.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>

            {/* Artist Ref Toggle */}
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">아티스트 참조</label>
              <button
                onClick={() => setArtistRef(!artistRef)}
                className={`w-full h-9 rounded-md border text-sm transition-colors ${
                  artistRef
                    ? "bg-red-500/20 border-red-500/40 text-red-400"
                    : "bg-[#222529] border-[#383a3f] text-zinc-500"
                }`}
              >
                {artistRef ? "ON (30%)" : "OFF"}
              </button>
            </div>
          </div>
        </Card>

        {/* Action Bar */}
        <div className="flex items-center gap-3">
          <Button
            onClick={handleGenerate}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            <Disc3 className="w-4 h-4 mr-2" />
            Generate {genreFilter ? `(${genreFilter})` : ""}
          </Button>
          {prompts.length > 0 && (
            <Button
              variant="outline"
              onClick={handleCopyAll}
              className="border-[#383a3f] text-zinc-300 hover:bg-[#2a2d31]"
            >
              {allCopied ? (
                <><Check className="w-4 h-4 mr-2 text-green-400" />Copied!</>
              ) : (
                <><Copy className="w-4 h-4 mr-2" />Copy All ({filteredPrompts.length})</>
              )}
            </Button>
          )}
          {prompts.length > 0 && (
            <span className="text-xs text-zinc-500">
              {filteredPrompts.length}개 프롬프트
            </span>
          )}
        </div>

        {/* History View */}
        {showHistory && (
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-zinc-400">생성 히스토리 (최근 {history.length}개)</h3>
            {history.length === 0 ? (
              <p className="text-sm text-zinc-500">아직 기록이 없습니다.</p>
            ) : (
              history.map((entry) => (
                <Card
                  key={entry.id}
                  className="bg-[#1a1d21] border-[#383a3f] p-4 cursor-pointer hover:border-[#565856] transition-colors"
                  onClick={() => loadHistoryEntry(entry)}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm text-zinc-300">
                        {new Date(entry.date).toLocaleString("ko-KR")}
                      </span>
                      <span className="text-xs text-zinc-500 ml-3">{entry.count}개 프롬프트</span>
                    </div>
                    <div className="flex gap-1">
                      {[...new Set(entry.prompts.map((p) => p.genre))].slice(0, 3).map((g) => (
                        <Badge key={g} variant="outline" className={`text-[10px] border ${GENRE_COLORS[g] || ""}`}>
                          {g.split(" ")[0]}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </Card>
              ))
            )}
          </div>
        )}

        {/* Prompt Grid */}
        {!showHistory && filteredPrompts.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filteredPrompts.map((p, i) => (
              <PromptCard key={p.hash} prompt={p} index={i} />
            ))}
          </div>
        )}

        {/* Empty State */}
        {!showHistory && prompts.length === 0 && (
          <div className="text-center py-20">
            <Disc3 className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
            <p className="text-zinc-500">Generate를 눌러 Suno AI용 Brazilian Phonk 프롬프트를 생성하세요</p>
          </div>
        )}
      </div>
    </div>
  );
}
