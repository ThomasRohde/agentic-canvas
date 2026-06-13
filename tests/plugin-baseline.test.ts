import { describe, expect, it } from "vitest";
import { createExcalidrawPlugin } from "../src/plugins/excalidraw/index.js";

describe("Excalidraw plugin baseline ops", () => {
  it("creates, lists, gets, updates, deletes, clears, and serializes objects", () => {
    const plugin = createExcalidrawPlugin();
    const scene = plugin.createInitialScene();
    const created = plugin.createObject(scene, {
      type: "rectangle",
      x: 10,
      y: 20,
      width: 120,
      height: 60,
      text: "Box",
    });

    expect(plugin.listObjects(scene).map((object) => object.type)).toEqual(["rectangle", "text"]);
    expect(plugin.getObject(scene, created.id)?.text).toBeUndefined();
    const label = plugin.listObjects(scene, "text")[0];
    expect(label?.text).toBe("Box");
    expect(plugin.getObject(scene, label?.id ?? "")?.raw.textAlign).toBe("center");
    expect(plugin.getObject(scene, label?.id ?? "")?.raw.verticalAlign).toBe("middle");
    expect(plugin.getObject(scene, label?.id ?? "")?.raw.autoResize).toBe(false);
    expect(plugin.getObject(scene, label?.id ?? "")?.raw.y).toBeCloseTo(37.5);
    expect(plugin.getObject(scene, label?.id ?? "")?.containerId).toBe(created.id);
    expect(created.raw.boundElements).toContainEqual({ id: label?.id, type: "text" });

    plugin.updateObject(scene, created.id, { x: 30, text: "Updated" });
    expect(plugin.getObject(scene, created.id)?.x).toBe(30);
    expect(plugin.listObjects(scene, "text")[0]?.text).toBe("Updated");

    const serialized = plugin.serialize(scene);
    const reopened = plugin.deserialize(JSON.stringify(serialized));
    expect(plugin.listObjects(reopened).length).toBe(2);

    expect(plugin.deleteObjects(scene, [created.id])).toEqual([created.id]);
    expect(plugin.listObjects(scene).map((object) => object.type)).toEqual([]);

    plugin.createObject(scene, { type: "ellipse", x: 0, y: 0 });
    plugin.clear(scene);
    expect(plugin.listObjects(scene)).toEqual([]);
  });

  it("uses frame names without creating redundant bound text labels", () => {
    const plugin = createExcalidrawPlugin();
    const scene = plugin.createInitialScene();

    const frame = plugin.createObject(scene, {
      type: "frame",
      x: 0,
      y: 0,
      width: 200,
      height: 100,
      text: "Group",
    });

    expect(frame.raw.name).toBe("Group");
    expect(plugin.listObjects(scene).map((object) => object.type)).toEqual(["frame"]);
    expect(plugin.listObjects(scene, "text")).toEqual([]);
  });
});
