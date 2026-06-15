import { type Server, createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { createJsonCanvasPlugin } from "../../src/plugins/jsoncanvas/index.js";
import { CanvasController } from "../../src/server/canvasController.js";
import { WsBridge } from "../../src/server/wsBridge.js";

describe("JSON Canvas WebSocket roundtrip", () => {
  let server: Server;
  let bridge: WsBridge;
  let controller: CanvasController;
  let url: string;

  beforeEach(async () => {
    controller = new CanvasController(createJsonCanvasPlugin());
    bridge = new WsBridge(controller);
    controller.setChangeListener((snapshot, origin) => bridge.broadcastScene(snapshot, origin));
    server = createServer();
    bridge.attach(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address() as AddressInfo;
    url = `ws://127.0.0.1:${address.port}/ws`;
  });

  afterEach(async () => {
    bridge.close();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  it("accepts valid browser JSON Canvas scenes", async () => {
    const socket = await openSocket(url);
    const hello = readUntil(socket, "scene:set");
    socket.send(JSON.stringify({ type: "hello", capabilities: { selectionSet: true } }));
    await hello;

    socket.send(
      JSON.stringify({
        type: "scene:changed",
        canvas: "jsoncanvas",
        baseVersion: controller.currentVersion(),
        scene: {
          nodes: [
            {
              id: "a",
              type: "text",
              x: 12,
              y: 24,
              width: 360,
              height: 180,
              text: "A",
            },
          ],
          edges: [],
        },
        appState: { selectedIds: ["a"] },
      }),
    );

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(controller.getObject("a")).toMatchObject({ id: "a", x: 12, y: 24 });
    socket.close();
  });

  it("rejects invalid browser JSON Canvas scenes and resyncs the client", async () => {
    const socket = await openSocket(url);
    const hello = readUntil(socket, "scene:set");
    socket.send(JSON.stringify({ type: "hello" }));
    await hello;

    const resync = readUntil(socket, "scene:set");
    socket.send(
      JSON.stringify({
        type: "scene:changed",
        canvas: "jsoncanvas",
        baseVersion: controller.currentVersion(),
        scene: {
          nodes: [{ id: "a", type: "text", x: 0, y: 0, width: 0, height: 180, text: "A" }],
          edges: [],
        },
      }),
    );

    const message = await resync;
    expect(controller.listObjects()).toEqual([]);
    expect(message.canvas).toBe("jsoncanvas");
    socket.close();
  });
});

function openSocket(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    socket.once("open", () => resolve(socket));
    socket.once("error", reject);
  });
}

function readUntil(socket: WebSocket, type: string): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    const handler = (data: Buffer) => {
      const message = JSON.parse(data.toString()) as Record<string, unknown>;
      if (message.type === type) {
        socket.off("message", handler);
        resolve(message);
      }
    };
    socket.on("message", handler);
  });
}
