import type { OfficeLayout } from "../types";
import { LAYOUT_STORAGE_KEY } from "../constants";
import { DEFAULT_LAYOUT } from "./defaultLayout";

export function loadLayout(): OfficeLayout {
  if (typeof window === "undefined") return DEFAULT_LAYOUT;
  try {
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (!raw) return DEFAULT_LAYOUT;
    const parsed = JSON.parse(raw) as OfficeLayout;
    if (parsed.version && parsed.tiles && parsed.furniture) {
      return parsed;
    }
    return DEFAULT_LAYOUT;
  } catch {
    return DEFAULT_LAYOUT;
  }
}

export function saveLayout(layout: OfficeLayout): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layout));
  } catch {
    // Storage full or unavailable
  }
}

export function resetLayout(): OfficeLayout {
  if (typeof window !== "undefined") {
    localStorage.removeItem(LAYOUT_STORAGE_KEY);
  }
  return DEFAULT_LAYOUT;
}
