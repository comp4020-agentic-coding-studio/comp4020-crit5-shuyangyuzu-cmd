import { ARTISTS } from "./artists";
import {
  AUCTION_DURATION_MS,
  CEILING_MULTIPLIER,
  FLOOR_MULTIPLIER,
  LOT_COUNT,
  SOLD_PAUSE_MS,
  buildAuctioneerOrder,
  dealHands,
  generateLotBlueprints,
} from "./lots";
import { createMarket, portfolioValue, resolveSale, resolveUnsold, type Market } from "./market";
import { computeNpcTrigger, NPC_NAMES, pickAuctioneerCard } from "./npc";
import { applyPayment, paymentDestination } from "./payments";
import { priceAtTime } from "./pricing";
import { createRng, nextRange, type RngState } from "./rng";
import {
  COLLECTOR_IDS,
  NPC_IDS,
  type Collector,
  type CollectorId,
  type GameMode,
  type GamePhase,
  type Lot,
  type LotBlueprint,
  type LotOutcome,
  type NpcId,
  type RankedResult,
} from "./types";

export const STARTING_CASH = 500;
const LOT_PRICE_JITTER: [number, number] = [0.92, 1.08];

export interface GameState {
  seed: RngState;
  mode: GameMode;
  market: Market;
  collectors: Record<CollectorId, Collector>;
  blueprints: LotBlueprint[];
  hands: Partial<Record<CollectorId, LotBlueprint[]>>;
  turnOrder: (CollectorId | "house")[];
  currentTurnIndex: number;
  currentAuctioneer: CollectorId | "house";
  currentLot: Lot | null;
  currentLotStartAt: number;
  npcTriggers: Partial<Record<NpcId, number | null>>;
  outcomes: LotOutcome[];
  phase: GamePhase;
  phaseChangedAt: number;
}

const COLLECTOR_NAMES: Record<CollectorId, string> = {
  player: "You",
  ...NPC_NAMES,
};

function createCollectors(): Record<CollectorId, Collector> {
  const collectors = {} as Record<CollectorId, Collector>;
  for (const id of COLLECTOR_IDS) {
    collectors[id] = { id, name: COLLECTOR_NAMES[id], cash: STARTING_CASH, holdings: {} };
  }
  return collectors;
}

// Builds the priced, timed Lot for a blueprint the instant its auction opens,
// capturing the artist's market value right now as `preSaleValue` — the fixed
// reference point PREMIUM/DISCOUNT resolution will compare the eventual sale
// price against, independent of anything that happens later in the auction.
function beginLot(
  state: GameState,
  blueprint: LotBlueprint,
  auctioneer: CollectorId | "house",
  elapsedMs: number,
): GameState {
  const base = state.market[blueprint.artistId];

  let s = state.seed;
  const ceilingJitter = nextRange(s, LOT_PRICE_JITTER[0], LOT_PRICE_JITTER[1]);
  s = ceilingJitter.state;
  const floorJitter = nextRange(s, LOT_PRICE_JITTER[0], LOT_PRICE_JITTER[1]);
  s = floorJitter.state;

  const lot: Lot = {
    ...blueprint,
    ceiling: Math.round(base * CEILING_MULTIPLIER * ceilingJitter.value),
    floor: Math.round(base * FLOOR_MULTIPLIER * floorJitter.value),
    durationMs: AUCTION_DURATION_MS,
    preSaleValue: base,
  };

  const npcTriggers: Partial<Record<NpcId, number | null>> = {};
  for (const npcId of NPC_IDS) {
    const holdingsCount = state.collectors[npcId].holdings[blueprint.artistId] ?? 0;
    const result = computeNpcTrigger(npcId, lot, state.market, state.collectors[npcId].cash, holdingsCount, s);
    npcTriggers[npcId] = result.value;
    s = result.state;
  }

  return {
    ...state,
    seed: s,
    currentAuctioneer: auctioneer,
    currentLot: lot,
    currentLotStartAt: elapsedMs,
    npcTriggers,
    phase: "auction",
    phaseChangedAt: elapsedMs,
  };
}

// Advances to the next turn in the fixed rotation. In HOUSE mode every turn's
// lot and auctioneer are fixed in advance (the house always sells, in
// shuffled blueprint order). In AUCTIONEER mode the rotation instead names a
// collector; an NPC auctioneer picks its own card immediately, but the
// player is paused into a `"selecting"` phase so the UI can offer their hand
// as the obvious next action.
function startTurn(state: GameState, turnIndex: number, elapsedMs: number): GameState {
  if (turnIndex >= state.turnOrder.length) {
    return { ...state, phase: "finished", phaseChangedAt: elapsedMs, currentLot: null };
  }

  const auctioneer = state.turnOrder[turnIndex];
  const advanced = { ...state, currentTurnIndex: turnIndex };

  if (state.mode === "house") {
    return beginLot(advanced, state.blueprints[turnIndex], "house", elapsedMs);
  }

  if (auctioneer === "player") {
    return {
      ...advanced,
      currentAuctioneer: "player",
      currentLot: null,
      phase: "selecting",
      phaseChangedAt: elapsedMs,
    };
  }

  if (auctioneer === "house") {
    throw new Error("unreachable: house never holds a hand in auctioneer mode");
  }

  const hand = state.hands[auctioneer] ?? [];
  const card = pickAuctioneerCard(hand, state.market);
  const nextHands = { ...state.hands, [auctioneer]: hand.filter((b: LotBlueprint) => b.index !== card.index) };
  return beginLot({ ...advanced, hands: nextHands }, card, auctioneer, elapsedMs);
}

export function createGame(seedValue: number, mode: GameMode = "house", elapsedMs = 0): GameState {
  const s0 = createRng(seedValue);
  const { value: blueprints, state: s1 } = generateLotBlueprints(s0);

  const turnOrder: (CollectorId | "house")[] =
    mode === "auctioneer" ? buildAuctioneerOrder() : Array(LOT_COUNT).fill("house");
  const hands = mode === "auctioneer" ? dealHands(blueprints) : {};

  const initial: GameState = {
    seed: s1,
    mode,
    market: createMarket(),
    collectors: createCollectors(),
    blueprints,
    hands,
    turnOrder,
    currentTurnIndex: -1,
    currentAuctioneer: "house",
    currentLot: null,
    currentLotStartAt: 0,
    npcTriggers: {},
    outcomes: [],
    phase: "auction",
    phaseChangedAt: elapsedMs,
  };

  return startTurn(initial, 0, elapsedMs);
}

// The player, as auctioneer, chooses which remaining hand card goes up next.
function selectLotCard(state: GameState, cardIndex: number, elapsedMs: number): GameState {
  if (state.phase !== "selecting" || state.currentAuctioneer !== "player") return state;
  const hand = state.hands.player ?? [];
  if (cardIndex < 0 || cardIndex >= hand.length) return state;

  const card = hand[cardIndex];
  const nextHands = { ...state.hands, player: hand.filter((_, i) => i !== cardIndex) };
  return beginLot({ ...state, hands: nextHands }, card, "player", elapsedMs);
}

function settleSale(
  state: GameState,
  winner: CollectorId,
  price: number,
  elapsedMs: number,
): GameState {
  const lot = state.currentLot;
  if (!lot) return state;

  const auctioneer = state.currentAuctioneer;
  const { market: nextMarket, kind } = resolveSale(state.market, lot.artistId, price, lot.preSaleValue);

  let collectors = applyPayment(state.collectors, winner, auctioneer, price);
  collectors = {
    ...collectors,
    [winner]: {
      ...collectors[winner],
      holdings: {
        ...collectors[winner].holdings,
        [lot.artistId]: (collectors[winner].holdings[lot.artistId] ?? 0) + 1,
      },
    },
  };

  const outcome: LotOutcome = {
    lotIndex: lot.index,
    artistId: lot.artistId,
    winner,
    auctioneer,
    paymentTo: paymentDestination(winner, auctioneer),
    price,
    saleKind: kind,
    saleAtMs: elapsedMs,
  };

  return {
    ...state,
    market: nextMarket,
    collectors,
    outcomes: [...state.outcomes, outcome],
    phase: "sold-pause",
    phaseChangedAt: elapsedMs,
  };
}

function settleUnsold(state: GameState, elapsedMs: number): GameState {
  const lot = state.currentLot;
  if (!lot) return state;

  const outcome: LotOutcome = {
    lotIndex: lot.index,
    artistId: lot.artistId,
    winner: null,
    auctioneer: state.currentAuctioneer,
    paymentTo: "bank",
    price: 0,
    saleKind: "unsold",
    saleAtMs: elapsedMs,
  };

  return {
    ...state,
    market: resolveUnsold(state.market, lot.artistId),
    outcomes: [...state.outcomes, outcome],
    phase: "sold-pause",
    phaseChangedAt: elapsedMs,
  };
}

// Resolves any claim that has become due by `elapsedMs`: an NPC (auctioneer
// or not — every collector may buy the lot on offer) whose trigger time has
// passed, or, past the lot's full duration with nobody due, a genuine UNSOLD.
// There is no forced fallback sale: an artist can legitimately go unbought.
// Called every animation frame and, in between frames, at the exact instant
// of a player click — so a claim is settled at real elapsed time, not
// rounded to whichever frame happened to render it.
export function tick(state: GameState, elapsedMs: number): GameState {
  if (state.phase === "sold-pause") {
    if (elapsedMs - state.phaseChangedAt >= SOLD_PAUSE_MS) {
      return startTurn(state, state.currentTurnIndex + 1, elapsedMs);
    }
    return state;
  }

  if (state.phase !== "auction" || !state.currentLot) return state;

  const lot = state.currentLot;
  const relativeMs = elapsedMs - state.currentLotStartAt;

  let dueNpc: NpcId | null = null;
  let dueAt = Infinity;
  for (const npcId of NPC_IDS) {
    const triggerMs = state.npcTriggers[npcId];
    if (triggerMs !== null && triggerMs !== undefined && triggerMs <= relativeMs) {
      if (triggerMs < dueAt) {
        dueAt = triggerMs;
        dueNpc = npcId;
      }
    }
  }

  if (dueNpc) {
    const price = Math.round(priceAtTime(lot, dueAt));
    return settleSale(state, dueNpc, price, elapsedMs);
  }

  if (relativeMs >= lot.durationMs) {
    return settleUnsold(state, elapsedMs);
  }

  return state;
}

// The single player action during an auction: claim the current lot right
// now. Resolves any NPC claim due at this exact instant first, so a click
// that loses to an NPC by a whisker is genuinely too late, not an artefact
// of check ordering.
export function attemptPlayerClaim(state: GameState, elapsedMs: number): GameState {
  if (state.phase !== "auction" || !state.currentLot) return state;

  const afterNpcCheck = tick(state, elapsedMs);
  if (afterNpcCheck.phase !== "auction") return afterNpcCheck;

  const lot = afterNpcCheck.currentLot!;
  const relativeMs = elapsedMs - afterNpcCheck.currentLotStartAt;
  const price = Math.round(priceAtTime(lot, relativeMs));

  if (price > afterNpcCheck.collectors.player.cash) return afterNpcCheck;

  return settleSale(afterNpcCheck, "player", price, elapsedMs);
}

export function computeResults(state: GameState): RankedResult[] {
  const wealths = COLLECTOR_IDS.map((id) => {
    const collector = state.collectors[id];
    const wealth = collector.cash + portfolioValue(collector.holdings, state.market);
    return { id, name: collector.name, cash: collector.cash, portfolioValue: wealth - collector.cash, wealth };
  });

  return wealths
    .map((entry) => ({
      ...entry,
      rank: 1 + wealths.filter((other) => other.wealth > entry.wealth).length,
    }))
    .sort((a, b) => a.rank - b.rank);
}

export function isPlayerWinner(results: RankedResult[]): boolean {
  const topRank = results.filter((r) => r.rank === 1);
  return topRank.length === 1 && topRank[0].id === "player";
}

export { ARTISTS, selectLotCard };
