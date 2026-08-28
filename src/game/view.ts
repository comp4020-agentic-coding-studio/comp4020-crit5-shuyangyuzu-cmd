import type { ArtistId } from "./artists";
import type { GameState } from "./engine";
import { portfolioValue } from "./market";
import { COLLECTOR_IDS, type CollectorId } from "./types";

export interface PublicCollectorView {
  id: CollectorId;
  name: string;
  holdings: Partial<Record<ArtistId, number>>;
  // Present only for the player, and for every collector once the game has
  // finished. Absent (not merely undefined) for a hidden rival — the key
  // itself does not exist on the object, so no accessor, DOM attribute, or
  // serialisation of this view can leak a number that isn't supposed to be
  // there yet.
  cash?: number;
  collectionValue?: number;
  netWorth?: number;
}

export interface PublicView {
  finished: boolean;
  collectors: PublicCollectorView[];
}

// The single presentation-layer privacy boundary: game rules keep every
// collector's real cash and holdings at all times (NPC decisions and final
// scoring both need it), but this is the only thing the UI is allowed to
// read from. Holdings are always public; cash, collection value and net
// worth are structurally omitted for rivals until the game reaches
// `"finished"`, at which point every collector's figures are included.
export function buildPublicView(state: GameState): PublicView {
  const finished = state.phase === "finished";

  const collectors = COLLECTOR_IDS.map((id): PublicCollectorView => {
    const collector = state.collectors[id];
    const reveal = finished || id === "player";

    if (!reveal) {
      return { id, name: collector.name, holdings: collector.holdings };
    }

    const collectionValue = portfolioValue(collector.holdings, state.market);
    return {
      id,
      name: collector.name,
      holdings: collector.holdings,
      cash: collector.cash,
      collectionValue,
      netWorth: collector.cash + collectionValue,
    };
  });

  return { finished, collectors };
}
