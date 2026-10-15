// The audience window (#/board): listens to the host, renders the board, and plays the sounds.

import { useEffect, useState } from "react";
import type { BoardSnapshot } from "../../app/boardSnapshot";
import { SoundControl } from "../../audio/SoundControl";
import { useBoardSound } from "../../audio/useBoardSound";
import { createSyncChannel, type SyncChannel } from "../../sync/channel";
import { GameBoard, type EventBatch } from "./GameBoard";

export function BoardApp({ channelFactory = createSyncChannel }: { channelFactory?: () => SyncChannel }) {
  const [snapshot, setSnapshot] = useState<BoardSnapshot | null>(null);
  const [eventBatch, setEventBatch] = useState<EventBatch | null>(null);
  const sound = useBoardSound();
  const { onEvents } = sound;

  useEffect(() => {
    const channel = channelFactory();
    const unsubscribe = channel.subscribe((message) => {
      if (message.type !== "snapshot") return;
      setSnapshot(message.snapshot);
      if (message.events.length) {
        setEventBatch((prev) => ({ id: (prev?.id ?? 0) + 1, events: message.events }));
        // Sounds play here, once per message, rather than in an effect that StrictMode would run twice.
        onEvents(message.events);
      }
    });
    channel.post({ type: "hello" });
    return () => {
      unsubscribe();
      channel.close();
    };
  }, [channelFactory, onEvents]);

  useEffect(() => {
    document.title = "Family Feud - Board";
  }, []);

  return (
    <>
      <GameBoard snapshot={snapshot} eventBatch={eventBatch} />
      <SoundControl {...sound} />
    </>
  );
}
