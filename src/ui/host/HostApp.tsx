// The host console window: setup screen, then the game controls.

import { useEffect } from "react";
import { useGameHost } from "../../app/useGameHost";
import { HostGame } from "./HostGame";
import { SetupScreen } from "./SetupScreen";
import "./hostApp.css";

export function HostApp() {
  const host = useGameHost();

  useEffect(() => {
    document.title = "Family Feud - Host";
  }, []);

  return (
    <div className="host-app">
      <header className="host-app__bar">
        <span className="host-app__title">Family Feud · Host</span>
        <span className="host-app__bank">
          {host.bankReady ? `${host.bankSize.toLocaleString()} surveys` : "Loading surveys…"}
        </span>
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
        ) : host.state ? (
          <HostGame host={host} />
        ) : (
          <SetupScreen onStart={host.newGame} />
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
