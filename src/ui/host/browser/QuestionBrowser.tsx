// PLACEHOLDER - replaced in Phase 7 (question browser agent).
import type { GameHost } from "../../../app/useGameHost";

export interface QuestionBrowserProps {
  host: GameHost;
  onClose(): void;
}

export function QuestionBrowser({ host, onClose }: QuestionBrowserProps) {
  return (
    <section aria-label="Question bank">
      <p>{host.banks?.main.length ?? 0} surveys</p>
      <button type="button" onClick={onClose}>
        Close
      </button>
    </section>
  );
}
