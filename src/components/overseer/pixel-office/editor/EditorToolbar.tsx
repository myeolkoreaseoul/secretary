"use client";

import type { FurnitureType } from "../types";

const FURNITURE_ITEMS: { type: FurnitureType; label: string; icon: string }[] = [
  { type: "desk", label: "책상", icon: "🪑" },
  { type: "chair", label: "의자", icon: "💺" },
  { type: "monitor", label: "모니터", icon: "🖥" },
  { type: "plant", label: "화분", icon: "🌿" },
  { type: "bookshelf", label: "책장", icon: "📚" },
  { type: "water_cooler", label: "정수기", icon: "💧" },
];

interface EditorToolbarProps {
  selected: FurnitureType | null;
  onSelect: (type: FurnitureType | null) => void;
  onReset: () => void;
  onSave: () => void;
}

export function EditorToolbar({ selected, onSelect, onReset, onSave }: EditorToolbarProps) {
  return (
    <div className="flex items-center gap-1 p-2 bg-zinc-900 border border-zinc-700 rounded-lg">
      {FURNITURE_ITEMS.map((item) => (
        <button
          key={item.type}
          onClick={() => onSelect(selected === item.type ? null : item.type)}
          className={`px-2 py-1 rounded text-xs transition-colors ${
            selected === item.type
              ? "bg-blue-600 text-white"
              : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
          }`}
          title={item.label}
        >
          <span className="mr-1">{item.icon}</span>
          {item.label}
        </button>
      ))}
      <div className="w-px h-6 bg-zinc-700 mx-1" />
      <button
        onClick={onSave}
        className="px-2 py-1 rounded text-xs bg-green-800 text-green-200 hover:bg-green-700 transition-colors"
      >
        저장
      </button>
      <button
        onClick={onReset}
        className="px-2 py-1 rounded text-xs bg-zinc-800 text-zinc-400 hover:bg-red-900 hover:text-red-200 transition-colors"
      >
        초기화
      </button>
    </div>
  );
}
