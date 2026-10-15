// The audience window (#/board): listens to the host and renders the board.

import { useEffect, useState } from "react";
import type { BoardSnapshot } from "../../app/boardSnapshot";
import { createSyncChannel, type SyncChannel } from "../../sync/channel";
import { GameBoard, type EventBatch } from "./GameBoard";

export function BoardApp({ channelFactory = createSyncChannel }: { channelFactory?: () => SyncChannel }) {
  const [snapshot, setSnapshot] = useState<BoardSnapshot | null>(null);
  const [eventBatch, setEventBatch] = useState<EventBatch | null>(null);

  useEffect(() => {
    const channel = channelFactory();
    const unsubscribe = channel.subscribe((message) => {
      if (message.type !== "snapshot") return;
      setSnapshot(message.snapshot);
      if (message.events.length) {
        setEventBatch((prev) => ({ id: (prev?.id ?? 0) + 1, events: message.events }));
      }
    });
    channel.post({ type: "hello" });
    return () => {
      unsubscribe();
      channel.close();
    };
  }, [channelFactory]);

  useEffect(() => {
    document.title = "Family Feud - Board";
  }, []);

  return <GameBoard snapshot={snapshot} eventBatch={eventBatch} />;
}
