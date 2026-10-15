// The host console during Fast Money: the clock and total up top, then the controls
// for the current step. Every change goes through the GameHost (which also runs the clock).

import { useRef, type ReactNode } from "react";
import type { GameHost } from "../../../app/useGameHost";
import type { FastMoneyAction } from "../../../engine/fastMoney";
import { AnsweringPanel } from "./AnsweringPanel";
import { FastMoneyHeader } from "./FastMoneyHeader";
import { nextToJudge, nextToShow } from "./fastMoneyView";
import { JudgingPanel } from "./JudgingPanel";
import { AnswerSummary, DonePanel, HandoffPanel } from "./ResultPanels";
import { FAST_MONEY_SHORTCUTS, useFastMoneyShortcuts } from "./useFastMoneyShortcuts";
import "../hostGame.css";
import "./hostFastMoney.css";

export interface HostFastMoneyProps {
  host: GameHost;
}

export function HostFastMoney({ host }: HostFastMoneyProps) {
  const fm = host.fastMoney;
  const inputRef = useRef<HTMLInputElement>(null);

  const run = (action: FastMoneyAction) => {
    if (host.canFastMoney(action)) host.applyFastMoney(action);
  };
  const undo = () => {
    if (!host.canUndo) return;
    host.undo();
    // Mid-turn, go straight back to typing.
    inputRef.current?.focus();
  };

  useFastMoneyShortcuts({
    toggleClock: () => fm && run(fm.clockRunning ? { type: "pauseClock" } : { type: "startClock" }),
    undo,
    showNext() {
      const q = fm && nextToShow(fm);
      if (q != null) run({ type: "showAnswer", question: q });
    },
    judgeNext(answer) {
      const q = fm && nextToJudge(fm);
      if (q != null) run({ type: "judge", question: q, answer });
    },
    notOnBoard() {
      const q = fm && nextToJudge(fm);
      if (q != null) run({ type: "judge", question: q, answer: null });
    },
  });

  if (!fm) return null;
  const winner = host.state?.winner;
  const familyName = winner != null ? (host.state?.families[winner].name ?? "") : "";

  let panel: ReactNode;
  switch (fm.phase) {
    case "ready":
    case "answering":
      // Keyed by player so player 2 starts with a clean answer box and notices.
      panel = <AnsweringPanel key={fm.turn} host={host} fm={fm} inputRef={inputRef} />;
      break;
    case "judging":
      panel = <JudgingPanel host={host} fm={fm} />;
      break;
    case "handoff":
      panel = <HandoffPanel host={host} fm={fm} />;
      break;
    case "done":
      panel = <DonePanel host={host} fm={fm} />;
      break;
  }

  return (
    <div className="hfm">
      <FastMoneyHeader fm={fm} familyName={familyName} canUndo={host.canUndo} onUndo={undo} />

      {host.lastError && (
        <p role="alert" className="hg-error">
          {host.lastError}
        </p>
      )}

      <div className="hfm-main">
        <section className="hfm-stage" aria-label="Fast Money">
          {panel}
        </section>
        <aside className="hfm-side">
          {fm.turn === 1 && fm.phase === "judging" && (
            <>
              <h3 className="hfm-side__title">Both players</h3>
              <AnswerSummary fm={fm} />
            </>
          )}
          <details className="hg-legend" open>
            <summary>Keyboard shortcuts</summary>
            <dl>
              {FAST_MONEY_SHORTCUTS.map((s) => (
                <div key={s.keys}>
                  <dt>{s.keys}</dt>
                  <dd>{s.does}</dd>
                </div>
              ))}
            </dl>
            <p className="hfm-legend__note">Letter keys only work outside the answer box.</p>
          </details>
        </aside>
      </div>
    </div>
  );
}
