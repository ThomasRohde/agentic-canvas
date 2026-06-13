const NAMED_COLORS = new Set([
  "black",
  "white",
  "red",
  "green",
  "blue",
  "yellow",
  "orange",
  "purple",
  "pink",
  "brown",
  "gray",
  "grey",
  "cyan",
  "magenta",
  "lime",
  "navy",
  "teal",
  "transparent",
]);

export function isCanvasColor(value: string): boolean {
  const color = value.trim().toLowerCase();
  if (NAMED_COLORS.has(color)) {
    return true;
  }
  if (/^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(color)) {
    return true;
  }
  if (
    /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/i.test(color)
  ) {
    return true;
  }
  if (
    /^hsla?\(\s*-?\d+(?:deg)?\s*,\s*\d{1,3}%\s*,\s*\d{1,3}%(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/i.test(
      color,
    )
  ) {
    return true;
  }
  return false;
}
