import type { SpriteFrame } from "../types";

type Rgb = { r: number; g: number; b: number };
type Hsl = { h: number; s: number; l: number };

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function hexToRgb(hex: string): Rgb {
  const normalized = hex.startsWith("#") ? hex.slice(1) : hex;
  const raw = normalized.length === 3
    ? normalized.split("").map((c) => c + c).join("")
    : normalized;

  const r = Number.parseInt(raw.slice(0, 2), 16);
  const g = Number.parseInt(raw.slice(2, 4), 16);
  const b = Number.parseInt(raw.slice(4, 6), 16);

  return { r: clampByte(r), g: clampByte(g), b: clampByte(b) };
}

export function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (value: number): string => clampByte(value).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function rgbToHsl(r: number, g: number, b: number): Hsl {
  const nr = clampByte(r) / 255;
  const ng = clampByte(g) / 255;
  const nb = clampByte(b) / 255;

  const max = Math.max(nr, ng, nb);
  const min = Math.min(nr, ng, nb);
  const delta = max - min;

  let h = 0;
  const l = (max + min) / 2;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));

  if (delta !== 0) {
    if (max === nr) {
      h = 60 * (((ng - nb) / delta) % 6);
    } else if (max === ng) {
      h = 60 * ((nb - nr) / delta + 2);
    } else {
      h = 60 * ((nr - ng) / delta + 4);
    }
  }

  if (h < 0) h += 360;

  return { h, s, l };
}

export function hslToRgb(h: number, s: number, l: number): Rgb {
  const hue = ((h % 360) + 360) % 360;
  const sat = clampUnit(s);
  const lig = clampUnit(l);

  const c = (1 - Math.abs(2 * lig - 1)) * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = lig - c / 2;

  let rr = 0;
  let gg = 0;
  let bb = 0;

  if (hue < 60) {
    rr = c;
    gg = x;
  } else if (hue < 120) {
    rr = x;
    gg = c;
  } else if (hue < 180) {
    gg = c;
    bb = x;
  } else if (hue < 240) {
    gg = x;
    bb = c;
  } else if (hue < 300) {
    rr = x;
    bb = c;
  } else {
    rr = c;
    bb = x;
  }

  return {
    r: clampByte((rr + m) * 255),
    g: clampByte((gg + m) * 255),
    b: clampByte((bb + m) * 255),
  };
}

export function desaturateFrame(frame: SpriteFrame, factor: number, grayOffset: number): SpriteFrame {
  const satFactor = clampUnit(factor);
  const gray = clampByte(grayOffset);

  return frame.map((row) =>
    row.map((pixel) => {
      if (!pixel) return null;
      const { r, g, b } = hexToRgb(pixel);
      const baseGray = r * 0.299 + g * 0.587 + b * 0.114;
      const nr = r * satFactor + gray * (1 - satFactor);
      const ng = g * satFactor + gray * (1 - satFactor);
      const nb = b * satFactor + gray * (1 - satFactor);
      const fr = nr * 0.5 + baseGray * 0.5;
      const fg = ng * 0.5 + baseGray * 0.5;
      const fb = nb * 0.5 + baseGray * 0.5;
      return rgbToHex(fr, fg, fb);
    }),
  );
}

export function hueShiftFrame(frame: SpriteFrame, degrees: number): SpriteFrame {
  return frame.map((row) =>
    row.map((pixel) => {
      if (!pixel) return null;
      const { r, g, b } = hexToRgb(pixel);
      const hsl = rgbToHsl(r, g, b);
      const shifted = hslToRgb(hsl.h + degrees, hsl.s, hsl.l);
      return rgbToHex(shifted.r, shifted.g, shifted.b);
    }),
  );
}
