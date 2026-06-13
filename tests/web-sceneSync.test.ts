import { describe, expect, it } from "vitest";
import {
  consumeAppliedSceneEcho,
  createAppliedSceneSignatures,
  rememberAppliedScene,
} from "../src/web/sceneSync.js";

describe("web scene sync helpers", () => {
  it("remembers multiple remote scene signatures for delayed Excalidraw echoes", () => {
    const signatures = createAppliedSceneSignatures();
    const first = [{ id: "arrow", version: 1, versionNonce: 11 }];
    const second = [
      { id: "arrow", version: 1, versionNonce: 11 },
      { id: "label", version: 1, versionNonce: 12 },
    ];

    rememberAppliedScene(signatures, first);
    rememberAppliedScene(signatures, second);

    expect(consumeAppliedSceneEcho(signatures, first)).toBe(true);
    expect(consumeAppliedSceneEcho(signatures, second)).toBe(true);
  });

  it("matches delayed echoes even when Excalidraw changes local element versions", () => {
    const signatures = createAppliedSceneSignatures();
    rememberAppliedScene(signatures, [{ id: "arrow", version: 1, versionNonce: 11 }]);

    expect(
      consumeAppliedSceneEcho(signatures, [{ id: "arrow", version: 2, versionNonce: 22 }]),
    ).toBe(true);
    expect(
      consumeAppliedSceneEcho(signatures, [{ id: "arrow", version: 3, versionNonce: 33 }]),
    ).toBe(true);
  });

  it("suppresses repeated restore callbacks for the same remote element set", () => {
    const signatures = createAppliedSceneSignatures();
    rememberAppliedScene(signatures, []);

    for (let index = 0; index < 5; index += 1) {
      expect(consumeAppliedSceneEcho(signatures, [])).toBe(true);
    }
    expect(consumeAppliedSceneEcho(signatures, [])).toBe(false);
  });

  it("eventually lets same-id user edits through after remote echoes are consumed", () => {
    const signatures = createAppliedSceneSignatures();
    rememberAppliedScene(signatures, [{ id: "arrow", version: 1, versionNonce: 11 }]);

    for (let index = 0; index < 5; index += 1) {
      consumeAppliedSceneEcho(signatures, [{ id: "arrow", version: index + 2, versionNonce: 22 }]);
    }
    expect(
      consumeAppliedSceneEcho(signatures, [{ id: "arrow", version: 10, versionNonce: 33 }]),
    ).toBe(false);
  });
});
