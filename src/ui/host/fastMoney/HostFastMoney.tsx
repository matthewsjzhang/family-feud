// PLACEHOLDER - replaced in Phase 6 (Fast Money host agent).
import type { GameHost } from "../../../app/useGameHost";

export interface HostFastMoneyProps {
  host: GameHost;
}

export function HostFastMoney({ host }: HostFastMoneyProps) {
  return <pre>{JSON.stringify(host.fastMoney?.phase)}</pre>;
}
