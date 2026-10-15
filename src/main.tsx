import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { loadBank, type Survey } from "./data/bank";

// Placeholder until Phase 5 builds the host console and game board.
function App() {
  const [bank, setBank] = useState<Survey[] | null>(null);
  useEffect(() => {
    loadBank().then(setBank);
  }, []);
  return (
    <main style={{ fontFamily: "sans-serif", padding: 16 }}>
      <h1>Family Feud</h1>
      <p>{bank ? `${bank.length} playable surveys loaded.` : "Loading question bank…"}</p>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
