import { ARTISTS } from "./artists";
import type { Market } from "./market";
import { priceAtTime, timeForPrice } from "./pricing";
import { nextRandom, nextRange, type RngState } from "./rng";
import type { Lot, NpcId } from "./types";

// Three simple, explainable rules rather than any learned or lookahead
// strategy: each NPC has a preferred fraction of the auction's fall it's
// willing to wait out before buying, once it has decided to bid at all.
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

function heatOf(market: Market, artistId: Lot["artistId"]): number {
  const artist = ARTISTS.find((a) => a.id === artistId)!;
  return (market[artistId] - artist.initialValue) / artist.initialValue;
}

// How interested this personality is in the lot right now, expressed as a
// 0..1 chance of bidding at all: "trend" chases an artist whose price has
// already run up, "value" hunts the opposite (a market that has cooled
// below its opening value), and "momentum" additionally cools off once it
// already holds several works by the same hand. This is what makes a
// genuine decline — and a genuinely UNSOLD lot — possible without any
// artificial forced-floor fallback.
function interestScore(npcId: NpcId, heat: number, holdingsCount: number): number {
  const clampedHeat = Math.max(-1, Math.min(1, heat));
  let score: number;
  if (npcId === "trend") score = 0.55 + clampedHeat * 0.35;
  else if (npcId === "value") score = 0.55 - clampedHeat * 0.35;
  else score = 0.6 + clampedHeat * 0.2 - Math.min(holdingsCount, 4) * 0.08;
  return Math.max(0.08, Math.min(0.92, score));
}

// Returns the exact elapsed time (ms into the lot) at which this NPC will
// attempt to buy, or null if it declines the lot entirely — either because
// it can't afford even the floor price, or because the interest roll says
// this isn't a lot worth its cash. Computed once, up front, from the
// closed-form price curve — not discovered by polling the price each frame.
export function computeNpcTrigger(
  npcId: NpcId,
  lot: Lot,
  market: Market,
  cash: number,
  holdingsCount: number,
  state: RngState,
): { value: number | null; state: RngState } {
  const heat = heatOf(market, lot.artistId);
  const score = interestScore(npcId, heat, holdingsCount);

  const interestRoll = nextRandom(state);
  let s = interestRoll.state;

  if (cash < lot.floor || interestRoll.value > score) {
    return { value: null, state: s };
  }

  const jitter = nextRange(s, -0.12, 0.12);
  s = jitter.state;
  let fraction = BASE_FRACTION[npcId] + jitter.value;
  if (npcId === "momentum") fraction -= Math.max(0, heat) * 0.4;
  fraction = Math.max(0.05, Math.min(0.95, fraction));

  let triggerMs = fraction * lot.durationMs;
  const intendedPrice = priceAtTime(lot, triggerMs);
  if (intendedPrice > cash) {
    triggerMs = timeForPrice(lot, cash);
  }

  return { value: Math.max(0, Math.min(lot.durationMs, triggerMs)), state: s };
}
