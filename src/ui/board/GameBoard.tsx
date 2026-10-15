// PLACEHOLDER - replaced in Phase 5 (board agent).
import type { BoardEvent, BoardSnapshot } from "../../app/boardSnapshot";

export interface EventBatch {
  /** Increases with every batch so effects can tell batches apart. */
  id: number;
  events: BoardEvent[];
}

export interface GameBoardProps {
  /** Null when no game is in progress. */
  snapshot: BoardSnapshot | null;
  /** The most recent things that happened, for animations. */
  eventBatch: EventBatch | null;
}

export function GameBoard({ snapshot }: GameBoardProps) {
  return <pre>{JSON.stringify(snapshot, null, 2)}</pre>;
}
