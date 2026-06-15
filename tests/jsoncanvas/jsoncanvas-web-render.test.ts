// @vitest-environment jsdom
import { createElement } from "react";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { JsonCanvasNodeCard } from "../../src/web/canvases/jsoncanvas/JsonCanvasApp.js";

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
});
