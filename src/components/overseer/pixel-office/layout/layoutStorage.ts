import type { OfficeLayout } from '../types';
import { createDefaultLayout, serializeLayout, deserializeLayout } from './layoutSerializer';

const STORAGE_KEY = 'pixel-office-layout-v2';

export function loadLayout(): OfficeLayout {
  if (typeof window === 'undefined') return createDefaultLayout();
  try {
    const json = localStorage.getItem(STORAGE_KEY);
    if (json) {
      const layout = deserializeLayout(json);
      if (layout) return layout;
    }
  } catch {}
  return createDefaultLayout();
}

export function saveLayout(layout: OfficeLayout): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, serializeLayout(layout));
  } catch {}
}

export function resetLayout(): OfficeLayout {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(STORAGE_KEY);
  }
  return createDefaultLayout();
}
