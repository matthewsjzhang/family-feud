// The host console window: setup screen, then the game controls.

import { useEffect, useState } from "react";
import { useGameHost } from "../../app/useGameHost";
import { QuestionBrowser } from "./browser/QuestionBrowser";
import { HostFastMoney } from "./fastMoney/HostFastMoney";
import { HostGame } from "./HostGame";
import { SetupScreen } from "./SetupScreen";
import "./hostApp.css";

export function HostApp() {
  const host = useGameHost();
  // The browser replaces the main view while open, so game shortcuts don't fire while searching.
  const [browsing, setBrowsing] = useState(false);

  useEffect(() => {
    document.title = "Family Feud - Host";
  }, []);

  return (
    <div className="host-app">
      <header className="host-app__bar">
        <span className="host-app__title">Family Feud · Host</span>
        <span className="host-app__bank">
          {host.bankReady
            ? `${host.bankSize.toLocaleString()} surveys · ${host.suddenDeathBankSize.toLocaleString()} Sudden Death`
            : "Loading surveys…"}
        </span>
        {host.bankReady && (
          <button
            type="button"
            className="host-app__end-button"
            aria-pressed={browsing}
            onClick={() => setBrowsing((open) => !open)}
          >
            {browsing ? (host.state ? "Back to the game" : "Back to setup") : "Question bank"}
          </button>
        )}
        <button type="button" className="host-app__board-button" onClick={host.openBoard}>
          Open game board
        </button>
        {host.state && (
          <button
            type="button"
            className="host-app__end-button"
            onClick={() => {
              if (window.confirm("End this game and go back to setup?")) host.endGame();
            }}
          >
            End game
          </button>
        )}
      </header>
      <main className="host-app__main">
        {!host.bankReady ? (
          <p className="host-app__loading">Loading the question bank…</p>
        ) : browsing ? (
          <QuestionBrowser host={host} onClose={() => setBrowsing(false)} />
        ) : host.fastMoney ? (
          <HostFastMoney host={host} />
        ) : host.state ? (
          <HostGame host={host} />
        ) : (
          <SetupScreen
            onStart={host.newGame}
            champion={host.champion}
            retiredChampion={host.retiredChampion}
            onClearChampion={host.clearChampion}
          />
        )}
        {host.lastError && !host.state && (
          <p role="alert" className="host-app__error">
            {host.lastError}
          </p>
        )}
      </main>
    </div>
  );
}
