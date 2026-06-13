import type { CanvasStyle } from "../../core/scene.js";

export const DEFAULT_FONT_SIZE = 20;
export const EXCALIDRAW_LINE_HEIGHT = 1.25;

export interface TextBounds {
  width: number;
  height: number;
  fontSize: number;
  lineHeight: number;
}

export function measureTextBounds(text: string, style?: CanvasStyle): TextBounds {
  const fontSize = style?.fontSize ?? DEFAULT_FONT_SIZE;
  const lineHeight = fontSize * EXCALIDRAW_LINE_HEIGHT;
  const lines = splitLines(text);
  const widestLine = Math.max(...lines.map((line) => measureLineWidth(line, fontSize)), 0);

  return {
    width: Math.max(40, Math.ceil(widestLine)),
    height: Math.max(lineHeight, Math.ceil(lines.length * lineHeight)),
    fontSize,
    lineHeight: EXCALIDRAW_LINE_HEIGHT,
  };
}

function splitLines(text: string): string[] {
  return text.split(/\r\n|\r|\n/);
}

function measureLineWidth(line: string, fontSize: number): number {
  let width = 0;
  for (const character of line) {
    width += fontSize * characterWeight(character);
  }
  return width;
}

function characterWeight(character: string): number {
  if (character === " " || character === "\t") {
    return 0.35;
  }
  if (/^[ilI.,:;|!']$/.test(character)) {
    return 0.32;
  }
  if (/^[mwMW@#%&]$/.test(character)) {
    return 0.9;
  }
  if (/^[A-Z0-9]$/.test(character)) {
    return 0.68;
  }
  if ((character.codePointAt(0) ?? 0) > 0x2e80) {
    return 1;
  }
  return 0.58;
}
