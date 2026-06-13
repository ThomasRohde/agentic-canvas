import { describe, expect, it } from "vitest";
import { selectedElementIdsForIds, selectedIdsFromAppState } from "../src/web/selection.js";

describe("selectedIdsFromAppState", () => {
  it("returns selected ids from Excalidraw app state object maps", () => {
    expect(
      selectedIdsFromAppState({
        selectedElementIds: {
          first: true,
          skipped: false,
          second: true,
        },
      }),
    ).toEqual(["first", "second"]);
  });

  it("returns an empty list when selection state is missing", () => {
    expect(selectedIdsFromAppState({ viewBackgroundColor: "#ffffff" })).toEqual([]);
    expect(selectedIdsFromAppState(undefined)).toEqual([]);
  });

  it("creates Excalidraw selectedElementIds app state from ids", () => {
    expect(selectedElementIdsForIds(["first", "second"])).toEqual({
      first: true,
      second: true,
    });
  });
});
