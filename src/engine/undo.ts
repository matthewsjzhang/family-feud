// Undo for the host: wraps any reducer with a bounded stack of past states.

export interface History<S> {
  past: S[];
  present: S;
}

export type UndoAction = { type: "undo" };

const MAX_HISTORY = 200;

export function createHistory<S>(present: S): History<S> {
  return { past: [], present };
}

export function undoableReducer<S, A extends { type: string }>(reducer: (state: S, action: A) => S) {
  return (history: History<S>, action: A | UndoAction): History<S> => {
    if (action.type === "undo") {
      const previous = history.past.at(-1);
      return previous === undefined ? history : { past: history.past.slice(0, -1), present: previous };
    }
    const present = reducer(history.present, action as A);
    return { past: [...history.past, history.present].slice(-MAX_HISTORY), present };
  };
}
