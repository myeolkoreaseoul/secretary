"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { GeneratedPrompt } from "@/lib/phonk-generator";
import { GENRE_COLORS } from "@/lib/phonk-generator";

interface PromptCardProps {
  prompt: GeneratedPrompt;
  index: number;
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // textarea fallback
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  }
}

export function PromptCard({ prompt, index }: PromptCardProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const ok = await copyToClipboard(prompt.prompt);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  const colorClass = GENRE_COLORS[prompt.genre] || "bg-zinc-500/20 text-zinc-400 border-zinc-500/30";

  return (
    <Card className="bg-[#1a1d21] border-[#383a3f] p-4 hover:border-[#565856] transition-colors group">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-zinc-500 font-mono">#{index + 1}</span>
          <Badge variant="outline" className={`text-[11px] border ${colorClass}`}>
            {prompt.genre}
          </Badge>
          <span className="text-xs text-zinc-500">{prompt.bpm} BPM</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCopy}
          className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
        >
          {copied ? (
            <Check className="w-3.5 h-3.5 text-green-400" />
          ) : (
            <Copy className="w-3.5 h-3.5 text-zinc-400" />
          )}
        </Button>
      </div>
      <p className="text-sm text-zinc-300 leading-relaxed">{prompt.prompt}</p>
    </Card>
  );
}

export { copyToClipboard };
