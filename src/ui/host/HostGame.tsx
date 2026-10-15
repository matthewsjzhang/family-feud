// PLACEHOLDER - replaced in Phase 5 (host agent).
import type { GameHost } from "../../app/useGameHost";

export interface HostGameProps {
  host: GameHost;
}

export function HostGame({ host }: HostGameProps) {
  return <pre>{JSON.stringify(host.state?.round?.phase)}</pre>;
}
