// PLACEHOLDER - replaced in Phase 6 (Fast Money board agent).
import type { FastMoneyView } from "../../../app/boardSnapshot";
import type { EventBatch } from "../GameBoard";

export interface FastMoneyBoardProps {
  view: FastMoneyView;
  /** The most recent things that happened (fm* events), for animations. */
  eventBatch: EventBatch | null;
}

export function FastMoneyBoard({ view }: FastMoneyBoardProps) {
  return <pre>{JSON.stringify(view, null, 2)}</pre>;
}
