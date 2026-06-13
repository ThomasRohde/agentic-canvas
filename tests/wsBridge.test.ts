import { type Server, createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { createExcalidrawPlugin } from "../src/plugins/excalidraw/index.js";
import { CanvasController } from "../src/server/canvasController.js";
import { WsBridge } from "../src/server/wsBridge.js";

describe("WsBridge", () => {
  let server: Server;
  let bridge: WsBridge;
  let controller: CanvasController;
  let url: string;

  beforeEach(async () => {
    controller = new CanvasController(createExcalidrawPlugin());
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

  it("broadcasts scene changes and does not echo browser edits to their origin", async () => {
    const first = await openSocket(url);
    const second = await openSocket(url);

    const firstHello = readUntil(first, "scene:set");
    const secondHello = readUntil(second, "scene:set");
    first.send(JSON.stringify({ type: "hello" }));
    second.send(JSON.stringify({ type: "hello" }));
    await firstHello;
    await secondHello;

    const element = createExcalidrawPlugin().createObject(controller.getScene(), {
      type: "rectangle",
      x: 0,
      y: 0,
    }).raw;
    const secondScene = readUntil(second, "scene:set");
    first.send(
      JSON.stringify({
        type: "scene:changed",
        baseVersion: controller.currentVersion(),
        elements: [element],
        appState: { viewBackgroundColor: "#ffffff", collaborators: {} },
      }),
    );

    const secondMessage = await secondScene;
    expect(secondMessage.elements).toHaveLength(1);
    expect(secondMessage.appState).toEqual({ viewBackgroundColor: "#ffffff" });
    await expect(readWithTimeout(first, 100)).rejects.toThrow(/timeout/);

    first.close();
    second.close();
  });

  it("rejects stale browser scene changes and resyncs that client", async () => {
    const socket = await openSocket(url);
    const hello = readUntil(socket, "scene:set");
    socket.send(JSON.stringify({ type: "hello" }));
    await hello;

    const serverBroadcast = readUntil(socket, "scene:set");
    controller.createObject({ type: "rectangle", x: 0, y: 0 });
    await serverBroadcast;

    const resync = readUntil(socket, "scene:set");
    socket.send(
      JSON.stringify({
        type: "scene:changed",
        baseVersion: 0,
        elements: [],
        appState: { viewBackgroundColor: "#ffffff" },
      }),
    );

    const message = await resync;
    expect(controller.listObjects()).toHaveLength(1);
    expect(message.version).toBe(controller.currentVersion());
    expect(message.elements).toHaveLength(1);
    socket.close();
  });

  it("performs export request and result round-trip", async () => {
    const socket = await openSocket(url);
    const hello = readUntil(socket, "scene:set");
    socket.send(JSON.stringify({ type: "hello" }));
    await hello;

    const requestPromise = readUntil(socket, "export:request");
    const exportPromise = bridge.requestExport({ exportPadding: 4, timeoutMs: 1000 });
    const request = await requestPromise;
    expect(request.exportPadding).toBe(4);

    socket.send(
      JSON.stringify({
        type: "export:result",
        id: request.id,
        mimeType: "image/png",
        base64: "aGVsbG8=",
      }),
    );

    await expect(exportPromise).resolves.toEqual({ mimeType: "image/png", base64: "aGVsbG8=" });
    socket.close();
  });

  it("performs selection request and result round-trip", async () => {
    const socket = await openSocket(url);
    const hello = readUntil(socket, "scene:set");
    socket.send(JSON.stringify({ type: "hello" }));
    await hello;

    const requestPromise = readUntil(socket, "selection:request");
    const selectionPromise = bridge.requestSelection({ timeoutMs: 1000 });
    const request = await requestPromise;

    socket.send(
      JSON.stringify({
        type: "selection:result",
        id: request.id,
        selectedIds: ["one", "two"],
      }),
    );

    await expect(selectionPromise).resolves.toEqual({ selectedIds: ["one", "two"] });
    socket.close();
  });

  it("rejects selection requests when the browser reports an error", async () => {
    const socket = await openSocket(url);
    const hello = readUntil(socket, "scene:set");
    socket.send(JSON.stringify({ type: "hello" }));
    await hello;

    const requestPromise = readUntil(socket, "selection:request");
    const selectionPromise = bridge.requestSelection({ timeoutMs: 1000 });
    const request = await requestPromise;

    socket.send(
      JSON.stringify({
        type: "selection:error",
        id: request.id,
        message: "selection unavailable",
      }),
    );

    await expect(selectionPromise).rejects.toThrow(/selection unavailable/);
    socket.close();
  });

  it("times out selection requests when the browser does not respond", async () => {
    const socket = await openSocket(url);
    const hello = readUntil(socket, "scene:set");
    socket.send(JSON.stringify({ type: "hello" }));
    await hello;

    const requestPromise = readUntil(socket, "selection:request");
    const selectionPromise = bridge.requestSelection({ timeoutMs: 10 });
    await requestPromise;

    await expect(selectionPromise).rejects.toThrow(/Selection request timed out/);
    socket.close();
  });

  it("sends export requests to the most recently synced browser client", async () => {
    const first = await openSocket(url);
    const firstHello = readUntil(first, "scene:set");
    first.send(JSON.stringify({ type: "hello" }));
    await firstHello;

    const firstBroadcast = readUntil(first, "scene:set");
    controller.createObject({ type: "rectangle", x: 0, y: 0 });
    await firstBroadcast;
    const second = await openSocket(url);
    const secondHello = readUntil(second, "scene:set");
    second.send(JSON.stringify({ type: "hello" }));
    await secondHello;

    const firstUnexpectedRequest = readWithTimeout(first, 100);
    const secondRequest = readUntil(second, "export:request");
    const exportPromise = bridge.requestExport({ timeoutMs: 1000 });
    const request = await secondRequest;

    second.send(
      JSON.stringify({
        type: "export:result",
        id: request.id,
        mimeType: "image/png",
        base64: "aGVsbG8=",
      }),
    );

    await expect(firstUnexpectedRequest).rejects.toThrow(/timeout/);
    await expect(exportPromise).resolves.toEqual({ mimeType: "image/png", base64: "aGVsbG8=" });
    first.close();
    second.close();
  });

  it("sends selection requests to the most recently synced browser client", async () => {
    const first = await openSocket(url);
    const firstHello = readUntil(first, "scene:set");
    first.send(JSON.stringify({ type: "hello" }));
    await firstHello;

    const firstBroadcast = readUntil(first, "scene:set");
    controller.createObject({ type: "rectangle", x: 0, y: 0 });
    await firstBroadcast;
    const second = await openSocket(url);
    const secondHello = readUntil(second, "scene:set");
    second.send(JSON.stringify({ type: "hello" }));
    await secondHello;

    const firstUnexpectedRequest = readWithTimeout(first, 100);
    const secondRequest = readUntil(second, "selection:request");
    const selectionPromise = bridge.requestSelection({ timeoutMs: 1000 });
    const request = await secondRequest;

    second.send(
      JSON.stringify({
        type: "selection:result",
        id: request.id,
        selectedIds: ["latest"],
      }),
    );

    await expect(firstUnexpectedRequest).rejects.toThrow(/timeout/);
    await expect(selectionPromise).resolves.toEqual({ selectedIds: ["latest"] });
    first.close();
    second.close();
  });

  it("rejects export when no browser is connected", async () => {
    await expect(bridge.requestExport({ timeoutMs: 10 })).rejects.toThrow(
      /No browser canvas client/,
    );
  });

  it("rejects selection when no browser is connected", async () => {
    await expect(bridge.requestSelection({ timeoutMs: 10 })).rejects.toThrow(
      /No browser canvas client/,
    );
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

function readWithTimeout(socket: WebSocket, timeoutMs: number): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off("message", handler);
      reject(new Error("timeout"));
    }, timeoutMs);
    const handler = (data: Buffer) => {
      clearTimeout(timer);
      resolve(data);
    };
    socket.on("message", handler);
  });
}
