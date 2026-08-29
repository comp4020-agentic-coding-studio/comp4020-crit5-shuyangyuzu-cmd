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

// Celeste Moreau (npc id "momentum"): a concentrated-collection specialist.
// With zero holdings in a non-preferred artist she stays cautious (unchanged
// from the original model). With zero holdings in her *preferred* artist,
// she instead makes a deliberate "conviction entry" attempt — high interest,
// early trigger — so she has a real shot at winning the first work that
// starts her concentration strategy, rather than only winning when both
// rivals decline. From her first holding onward, both artists share one
// continuous, monotonic concentration curve anchored at the bootstrap
// values, so there is no cliff-edge regression right after that first win.
const CELESTE_PREFERRED_BOOTSTRAP_INTEREST = 0.7; // 0 holdings, preferred artist
const CELESTE_PREFERRED_MAX_INTEREST = 0.85; // >=4 holdings, preferred artist
const CELESTE_PREFERRED_BOOTSTRAP_FRACTION = 0.22; // 0 holdings, preferred artist
const CELESTE_PREFERRED_MIN_FRACTION = 0.1; // >=4 holdings, preferred artist
const CELESTE_BASE_INTEREST = 0.35; // 0 holdings, non-preferred artist (unchanged)
const CELESTE_MAX_INTEREST = 0.8; // >=4 holdings, non-preferred artist (unchanged)
const CELESTE_BASE_FRACTION = 0.65; // 0 holdings, non-preferred artist (unchanged)
const CELESTE_MIN_FRACTION = 0.2; // >=4 holdings, non-preferred artist (unchanged)

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
function coreDecision(
  npcId: NpcId,
  lot: Lot,
  market: Market,
  holdingsCount: number,
  outcomes: LotOutcome[],
  profile: NpcSessionProfile,
): CoreDecision {
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

  // Celeste Moreau builds concentrated positions. Her preferred artist gets
  // a genuine bootstrap: a strong, early conviction entry at 0 holdings,
  // strengthening further (never weakening) as she accumulates holdings.
  // Any other artist she holds none of stays neutral-to-cautious, as before.
  const concentration = Math.min(holdingsCount, 4) / 4;
  const isPreferred = lot.artistId === profile.preferredArtistId;
  if (isPreferred) {
    return {
      interest: clamp01(
        CELESTE_PREFERRED_BOOTSTRAP_INTEREST +
          concentration * (CELESTE_PREFERRED_MAX_INTEREST - CELESTE_PREFERRED_BOOTSTRAP_INTEREST),
      ),
      fraction: Math.max(
        CELESTE_PREFERRED_MIN_FRACTION,
        Math.min(
          CELESTE_PREFERRED_BOOTSTRAP_FRACTION,
          CELESTE_PREFERRED_BOOTSTRAP_FRACTION -
            concentration * (CELESTE_PREFERRED_BOOTSTRAP_FRACTION - CELESTE_PREFERRED_MIN_FRACTION),
        ),
      ),
    };
  }

  return {
    interest: clamp01(CELESTE_BASE_INTEREST + concentration * (CELESTE_MAX_INTEREST - CELESTE_BASE_INTEREST)),
    fraction: Math.max(
      CELESTE_MIN_FRACTION,
      Math.min(CELESTE_BASE_FRACTION, CELESTE_BASE_FRACTION - concentration * (CELESTE_BASE_FRACTION - CELESTE_MIN_FRACTION)),
    ),
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
  const core = coreDecision(npcId, lot, market, holdingsCount, outcomes, profile);
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
