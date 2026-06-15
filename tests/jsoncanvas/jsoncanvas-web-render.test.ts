// @vitest-environment jsdom
import { createElement } from "react";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  JsonCanvasNodeCard,
  type JsonFlowNode,
  resolveSelectionChange,
  shouldSyncEdgeChanges,
  shouldSyncNodeChanges,
  toJsonCanvasDocument,
} from "../../src/web/canvases/jsoncanvas/JsonCanvasApp.js";

describe("JSON Canvas browser renderer", () => {
  it("renders card labels through a pre-wrap label element", () => {
    const Component = JsonCanvasNodeCard as unknown as (props: {
      data: { label: string; kind: string; raw: unknown };
    }) => ReactElement;
    const markup = renderToStaticMarkup(
      createElement(Component, {
        data: {
          label: "Line one\n\tLine two",
          kind: "text",
          raw: {
            id: "a",
            type: "text",
            x: 0,
            y: 0,
            width: 360,
            height: 180,
            text: "Line one\n\tLine two",
          },
        },
      }),
    );

    expect(markup).toContain("jsoncanvas-card-label");
    expect(markup).toContain("Line one\n\tLine two");
  });

  it("keeps programmatic selection authoritative during immediate browser callbacks", () => {
    expect(resolveSelectionChange([], ["card_a"])).toEqual({
      selectedIds: ["card_a"],
      keepProgrammaticSelection: true,
    });

    expect(resolveSelectionChange(["card_a"], ["card_a"])).toEqual({
      selectedIds: ["card_a"],
      keepProgrammaticSelection: false,
    });
  });

  it("does not sync React Flow selection or measurement-only changes", () => {
    expect(shouldSyncNodeChanges([{ type: "select", id: "card_a", selected: true }])).toBe(false);
    expect(
      shouldSyncNodeChanges([
        { type: "dimensions", id: "card_a", dimensions: { width: 358, height: 181 } },
      ]),
    ).toBe(false);
    expect(
      shouldSyncNodeChanges([{ type: "position", id: "card_a", position: { x: 20, y: 30 } }]),
    ).toBe(true);

    expect(shouldSyncEdgeChanges([{ type: "select", id: "edge_a", selected: true }])).toBe(false);
    expect(shouldSyncEdgeChanges([{ type: "remove", id: "edge_a" }])).toBe(true);
  });

  it("serializes authored card dimensions instead of browser-measured dimensions", () => {
    const document = toJsonCanvasDocument(
      [
        {
          id: "card_a",
          type: "jsonCanvasCard",
          position: { x: 10.4, y: 20.6 },
          width: 358,
          height: 181,
          data: {
            label: "A",
            kind: "text",
            raw: {
              id: "card_a",
              type: "text",
              x: 10,
              y: 20,
              width: 360,
              height: 180,
              text: "A",
            },
          },
        } satisfies JsonFlowNode,
      ],
      [],
    );

    expect(document.nodes?.[0]).toMatchObject({
      id: "card_a",
      x: 10,
      y: 21,
      width: 360,
      height: 180,
    });
  });
});
