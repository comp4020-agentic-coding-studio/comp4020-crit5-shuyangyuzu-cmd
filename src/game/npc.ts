import { ARTISTS, type ArtistId } from "./artists";
import type { Market } from "./market";
import { priceAtTime, timeForPrice } from "./pricing";
import { nextRandom, nextRange, type RngState } from "./rng";
import { NPC_IDS, type Lot, type LotBlueprint, type LotOutcome, type NpcId, type NpcSessionProfile } from "./types";

// Three simple, explainable personalities rather than any learned or
// lookahead strategy. Each decision blends three layers, in this fixed
// proportion, so a personality stays recognisable across a game while still
// varying lot to lot and game to game:
//   - 75% core strategy: the personality's defining rule, from lot/market
//     state only (heat, holdings, recent outcomes) — no randomness.
//   - 15% session profile: the fixed-for-this-game profile drawn at
//     createGame() (see generateNpcProfiles below).
//   - 10% per-lot variation: a small random nudge, redrawn every lot.
const CORE_WEIGHT = 0.75;
const PROFILE_WEIGHT = 0.15;
const LOT_WEIGHT = 0.1;
const LOT_JITTER_RANGE = 0.05; // ±5%, within the requested ~4-6%

export const NPC_NAMES: Record<NpcId, string> = {
  trend: "Vivienne Hart",
  value: "Julian Vale",
  momentum: "Celeste Moreau",
};

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function heatOf(market: Market, artistId: Lot["artistId"]): number {
  const artist = ARTISTS.find((a) => a.id === artistId)!;
  return (market[artistId] - artist.initialValue) / artist.initialValue;
}

// A read of "how has the room been feeling lately", from the outcomes the
// engine has already recorded — no separate tracker to keep in sync. +1 for
// a premium sale, -1 for an unsold lot, -0.6 for a discount sale, averaged
// over the last few lots and clamped to [-1, 1].
function recentMomentum(outcomes: LotOutcome[], lookback = 3): number {
  const recent = outcomes.slice(-lookback);
  if (recent.length === 0) return 0;
  const total = recent.reduce((sum, outcome) => {
    if (outcome.saleKind === "premium") return sum + 1;
    if (outcome.saleKind === "unsold") return sum - 1;
    return sum - 0.6;
  }, 0);
  return Math.max(-1, Math.min(1, total / recent.length));
}

interface CoreDecision {
  // 0..1 chance this personality even considers bidding on this lot.
  interest: number;
  // 0..1 fraction of the price fall it would wait for, once it does bid.
  fraction: number;
}

// The defining rule for each personality, in terms of lot/market state
// alone. See the file header for how this feeds into the final decision.
function coreDecision(npcId: NpcId, lot: Lot, market: Market, holdingsCount: number, outcomes: LotOutcome[]): CoreDecision {
  const heat = heatOf(market, lot.artistId);
  const momentum = recentMomentum(outcomes);

  if (npcId === "trend") {
    // Vivienne Hart chases what's already moving: hot artists and a hot
    // room pull her interest up and her trigger earlier (a smaller
    // fraction means buying closer to the ceiling).
    return {
      interest: clamp01(0.5 + heat * 0.3 + momentum * 0.25),
      fraction: Math.max(0.05, Math.min(0.7, 0.3 - heat * 0.2 - momentum * 0.12)),
    };
  }

  if (npcId === "value") {
    // Julian Vale doesn't chase a fraction of the clock at all — he waits
    // for a specific price. His "fraction" is simply whichever elapsed
    // time the closed-form curve reaches that price at, so it's still an
    // exact analytical trigger rather than a rate sampled from frames.
    const targetPrice = market[lot.artistId] * 0.85; // a plain 15% discount, before any profile/session skew
    const maxAchievableDiscount = 1 - lot.floor / market[lot.artistId];
    return {
      interest: clamp01(0.55 + Math.min(0, heat) * -0.2 + maxAchievableDiscount * 0.3),
      fraction: Math.max(0.05, Math.min(0.97, timeForPrice(lot, targetPrice) / lot.durationMs)),
    };
  }

  // Celeste Moreau builds concentrated positions: neutral with no holding
  // in this artist yet, increasingly willing — including paying closer to
  // the ceiling — the more of this artist she already owns.
  const concentration = Math.min(holdingsCount, 4) / 4;
  return {
    interest: clamp01(0.35 + concentration * 0.45),
    fraction: Math.max(0.05, Math.min(0.85, 0.65 - concentration * 0.45)),
  };
}

// The fixed session profile nudges both numbers by a bounded amount — never
// enough, at its full 15% blend weight, to flip a personality's behaviour.
function profileSkew(npcId: NpcId, lot: Lot, market: Market, profile: NpcSessionProfile): CoreDecision {
  const preferredBoost = lot.artistId === profile.preferredArtistId ? 0.15 : 0;
  const interest = clamp01(0.5 + (profile.aggression - 0.5) * 0.4 + profile.mood * 0.15 + preferredBoost);

  if (npcId === "value") {
    // Julian's headline trait: a fixed session discount requirement,
    // 12-28%, set once at game start and held for the whole game.
    const targetPrice = market[lot.artistId] * (1 - profile.discountRequirement);
    return { interest, fraction: Math.max(0.05, Math.min(0.98, timeForPrice(lot, targetPrice) / lot.durationMs)) };
  }

  const fraction = clamp01(1 - profile.riskTolerance * 0.5 - (profile.patience - 0.5) * -0.3);
  return { interest, fraction };
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
  profile: NpcSessionProfile,
  outcomes: LotOutcome[],
  state: RngState,
): { value: number | null; state: RngState } {
  const core = coreDecision(npcId, lot, market, holdingsCount, outcomes);
  const withProfile = profileSkew(npcId, lot, market, profile);

  const jitterRoll = nextRange(state, -LOT_JITTER_RANGE, LOT_JITTER_RANGE);
  let s = jitterRoll.state;
  const withLot: CoreDecision = {
    interest: clamp01(withProfile.interest + jitterRoll.value),
    fraction: clamp01(withProfile.fraction + jitterRoll.value),
  };

  const interest = CORE_WEIGHT * core.interest + PROFILE_WEIGHT * withProfile.interest + LOT_WEIGHT * withLot.interest;
  const fraction = CORE_WEIGHT * core.fraction + PROFILE_WEIGHT * withProfile.fraction + LOT_WEIGHT * withLot.fraction;

  const interestRoll = nextRandom(s);
  s = interestRoll.state;

  if (cash < lot.floor || interestRoll.value > interest) {
    return { value: null, state: s };
  }

  let triggerMs = fraction * lot.durationMs;
  const intendedPrice = priceAtTime(lot, triggerMs);
  if (intendedPrice > cash) {
    triggerMs = timeForPrice(lot, cash);
  }

  return { value: Math.max(0, Math.min(lot.durationMs, triggerMs)), state: s };
}

// Generated once at game start and then held fixed for the whole game (see
// GameState.npcProfiles in engine.ts) — this is the "15% session profile"
// layer computeNpcTrigger blends in above.
export function generateNpcProfiles(state: RngState): { value: Record<NpcId, NpcSessionProfile>; state: RngState } {
  let s = state;
  const profiles = {} as Record<NpcId, NpcSessionProfile>;

  for (const npcId of NPC_IDS) {
    const riskTolerance = nextRandom(s);
    s = riskTolerance.state;
    const patience = nextRandom(s);
    s = patience.state;
    const aggression = nextRandom(s);
    s = aggression.state;
    const marketSensitivity = nextRandom(s);
    s = marketSensitivity.state;
    const artistIndex = nextRandom(s);
    s = artistIndex.state;
    const preferredArtistId: ArtistId = ARTISTS[Math.floor(artistIndex.value * ARTISTS.length) % ARTISTS.length].id;
    const discountRequirement = nextRange(s, 0.12, 0.28);
    s = discountRequirement.state;
    const mood = nextRange(s, -1, 1);
    s = mood.state;

    profiles[npcId] = {
      riskTolerance: riskTolerance.value,
      patience: patience.value,
      aggression: aggression.value,
      marketSensitivity: marketSensitivity.value,
      preferredArtistId,
      discountRequirement: discountRequirement.value,
      mood: mood.value,
    };
  }

  return { value: profiles, state: s };
}

// AUCTIONEER mode's per-personality auctioneer strategy: what a collector
// chooses to put up for auction when it's their turn to sell.
export function pickAuctioneerCard(
  npcId: NpcId,
  hand: LotBlueprint[],
  market: Market,
  holdings: Partial<Record<ArtistId, number>>,
): LotBlueprint {
  if (npcId === "momentum") {
    // Celeste Moreau offers a work she already owns, to strengthen that
    // artist's market — falling back to the highest-value card if she
    // doesn't hold any artist represented in her hand.
    const owned = hand.filter((card) => (holdings[card.artistId] ?? 0) > 0);
    const pool = owned.length > 0 ? owned : hand;
    return pool.reduce((best, candidate) => (market[candidate.artistId] > market[best.artistId] ? candidate : best));
  }

  // Vivienne Hart offers whatever is currently fashionable; Julian Vale
  // offers off whatever is highly valued but he'd rather not keep — both
  // resolve to the same highest-market-value heuristic for different
  // narrative reasons.
  return hand.reduce((best, candidate) => (market[candidate.artistId] > market[best.artistId] ? candidate : best));
}
