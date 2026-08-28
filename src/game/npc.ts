import { BASE_MARKET_VALUE } from "./artists";
import type { Market } from "./market";
import { priceAtTime, timeForPrice } from "./pricing";
import { nextRange, type RngState } from "./rng";
import type { Lot, NpcId } from "./types";

// Three simple, explainable rules rather than any learned or lookahead
// strategy: each NPC just has a preferred fraction of the auction's fall it's
// willing to wait out before buying. "trend" buys early and often, "value"
// waits and risks losing the piece, "momentum" additionally moves earlier the
// hotter an artist's market has already run.
const BASE_FRACTION: Record<NpcId, number> = {
  trend: 0.25,
  value: 0.75,
  momentum: 0.5,
};

export const NPC_NAMES: Record<NpcId, string> = {
  trend: "Trend",
  value: "Value",
  momentum: "Momentum",
};

// Returns the exact elapsed time (ms into the lot) at which this NPC will
// attempt to buy, or null if they can't afford the piece even at the floor
// price and sit this lot out entirely. Computed once, up front, from the
// closed-form price curve — not discovered by polling the price each frame.
export function computeNpcTrigger(
  npcId: NpcId,
  lot: Lot,
  market: Market,
  cash: number,
  state: RngState,
): { value: number | null; state: RngState } {
  const jitter = nextRange(state, -0.12, 0.12);
  let fraction = BASE_FRACTION[npcId] + jitter.value;

  if (npcId === "momentum") {
    const heat = Math.max(0, market[lot.artistId] / BASE_MARKET_VALUE - 1);
    fraction -= heat * 0.4;
  }

  fraction = Math.max(0.05, Math.min(0.95, fraction));
  let triggerMs = fraction * lot.durationMs;
  const intendedPrice = priceAtTime(lot, triggerMs);

  if (intendedPrice > cash) {
    if (cash < lot.floor) {
      return { value: null, state: jitter.state };
    }
    triggerMs = timeForPrice(lot, cash);
  }

  return { value: Math.max(0, Math.min(lot.durationMs, triggerMs)), state: jitter.state };
}
