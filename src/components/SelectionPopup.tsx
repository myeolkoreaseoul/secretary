"use client";

import { SelectionInfo } from "@/hooks/useTextSelection";
import { Button } from "@/components/ui/button";

interface SelectionPopupProps {
  selection: SelectionInfo;
  onAsk: (text: string, messageId: string) => void;
}

export function SelectionPopup({ selection, onAsk }: SelectionPopupProps) {
  const { rect, text, messageId } = selection;

  // viewport 상단에서 공간 부족 시 선택 아래에 표시
  const hasSpaceAbove = rect.top > 50;
  const topPos = hasSpaceAbove ? rect.top - 45 : rect.bottom + 5;

  return (
    <div
      data-selection-popup
      className="fixed z-50 pointer-events-none"
      style={{
        top: `${topPos}px`,
        left: `${rect.left + rect.width / 2}px`,
        transform: "translateX(-50%)",
      }}
    >
      <Button
        size="sm"
        className="pointer-events-auto shadow-lg animate-in fade-in zoom-in duration-200"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => onAsk(text, messageId)}
      >
        이게 뭐야?
      </Button>
    </div>
  );
}
