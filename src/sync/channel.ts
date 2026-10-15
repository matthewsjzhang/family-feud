// Link between the host console and the game board window (same browser).

import type { BoardEvent, BoardSnapshot } from "../app/boardSnapshot";

export type SyncMessage =
  /** snapshot null = no game in progress (setup screen). */
  | { type: "snapshot"; snapshot: BoardSnapshot | null; events: BoardEvent[] }
  /** Sent by a board window when it opens, asking the host for the current state. */
  | { type: "hello" };

export interface SyncChannel {
  post(message: SyncMessage): void;
  subscribe(listener: (message: SyncMessage) => void): () => void;
  close(): void;
}

export const CHANNEL_NAME = "family-feud";

export function createSyncChannel(name = CHANNEL_NAME): SyncChannel {
  if (typeof BroadcastChannel === "undefined") {
    return { post() {}, subscribe: () => () => {}, close() {} };
  }
  const channel = new BroadcastChannel(name);
  return {
    post: (message) => channel.postMessage(message),
    subscribe(listener) {
      const handler = (e: MessageEvent<SyncMessage>) => listener(e.data);
      channel.addEventListener("message", handler);
      return () => channel.removeEventListener("message", handler);
    },
    close: () => channel.close(),
  };
}
