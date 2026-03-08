"use client";

import { useState, useEffect, useRef, RefObject } from "react";

export interface SelectionInfo {
  text: string;
  rect: DOMRect;
  messageId: string;
}

export function useTextSelection(containerRef: RefObject<HTMLElement | null>) {
  const [selection, setSelection] = useState<SelectionInfo | null>(null);
  const skipNextSelectionChange = useRef(false);

  useEffect(() => {
    const handleMouseUp = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !containerRef.current) {
        setSelection(null);
        return;
      }

      const text = sel.toString().trim();
      if (!text) {
        setSelection(null);
        return;
      }

      if (sel.rangeCount === 0) {
        setSelection(null);
        return;
      }

      const range = sel.getRangeAt(0);
      if (!containerRef.current.contains(range.commonAncestorContainer)) {
        setSelection(null);
        return;
      }

      const rect = range.getBoundingClientRect();

      // Find the closest [data-message-id]
      let node: Node | null = range.commonAncestorContainer;
      let messageId = "";

      while (node && node !== containerRef.current) {
        if (node instanceof HTMLElement && node.hasAttribute("data-message-id")) {
          messageId = node.getAttribute("data-message-id") || "";
          break;
        }
        node = node.parentNode;
      }

      if (messageId) {
        setSelection({ text, rect, messageId });
      } else {
        setSelection(null);
      }
    };

    const handleSelectionChange = () => {
      // 팝업 클릭 시 selectionchange가 click보다 먼저 발생 → 건너뛰기
      if (skipNextSelectionChange.current) {
        skipNextSelectionChange.current = false;
        return;
      }
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) {
        // setTimeout으로 click 이벤트에 양보
        setTimeout(() => {
          const currentSel = window.getSelection();
          if (!currentSel || currentSel.isCollapsed) {
            setSelection(null);
          }
        }, 0);
      }
    };

    // 팝업의 onMouseDown에서 호출할 수 있도록 전역 플래그 설정
    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("[data-selection-popup]")) {
        skipNextSelectionChange.current = true;
      }
    };

    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("mouseup", handleMouseUp);
    document.addEventListener("selectionchange", handleSelectionChange);

    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("selectionchange", handleSelectionChange);
    };
  }, [containerRef]);

  return selection;
}
