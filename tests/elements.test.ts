// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { buildElement } from "../src/plugins/excalidraw/elements.js";

describe("Excalidraw element builder", () => {
  it("builds structural Excalidraw elements without importing Excalidraw in Node code", async () => {
    const rectangle = buildElement({
      type: "rectangle",
      x: 10,
      y: 20,
      width: 100,
      height: 80,
      text: "Hello",
    });
    const arrow = buildElement({
      type: "arrow",
      x: 0,
      y: 0,
      points: [
        [0, 0],
        [100, 40],
      ],
    });

    expect(rectangle).toMatchObject({
      type: "rectangle",
      x: 10,
      y: 20,
      width: 100,
      height: 80,
      angle: 0,
      groupIds: [],
      isDeleted: false,
      locked: false,
    });
    expect(arrow.points).toEqual([
      [0, 0],
      [100, 40],
    ]);

    expect(isIntegerOrderKey(rectangle.index)).toBe(true);
    expect(isIntegerOrderKey(arrow.index)).toBe(true);
  });
});

function isIntegerOrderKey(key: string): boolean {
  const head = key[0];
  if (!head || head < "a" || head > "z") {
    return false;
  }

  const digitCount = head.charCodeAt(0) - "a".charCodeAt(0) + 1;
  if (key.length !== digitCount + 1) {
    return false;
  }

  return [...key.slice(1)].every((digit) =>
    "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz".includes(digit),
  );
}
