import { ARTISTS } from "./artists";
import {
  AUCTION_DURATION_MS,
  CEILING_MULTIPLIER,
  FLOOR_MULTIPLIER,
  SOLD_PAUSE_MS,
  generateLotBlueprints,
} from "./lots";
import { createMarket, portfolioValue, recordSale, type Market } from "./market";
import { computeNpcTrigger, NPC_NAMES } from "./npc";
import { priceAtTime } from "./pricing";
import { createRng, nextRange, type RngState } from "./rng";
import {
  COLLECTOR_IDS,
  NPC_IDS,
  type Collector,
  type CollectorId,
  type GamePhase,
  type Lot,
  type LotBlueprint,
  type LotOutcome,
  type NpcId,
  type RankedResult,
} from "./types";

export const STARTING_CASH = 640;
const LOT_PRICE_JITTER: [number, number] = [0.92, 1.08];

export interface GameState {
  seed: RngState;
  market: Market;
  collectors: Record<CollectorId, Collector>;
  blueprints: LotBlueprint[];
  currentLotIndex: number;
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

function startLot(state: GameState, lotIndex: number, elapsedMs: number): GameState {
  if (lotIndex >= state.blueprints.length) {
    return { ...state, phase: "finished", phaseChangedAt: elapsedMs, currentLot: null };
  }

  const blueprint = state.blueprints[lotIndex];
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
  };

  const npcTriggers: Partial<Record<NpcId, number | null>> = {};
  for (const npcId of NPC_IDS) {
    const result = computeNpcTrigger(npcId, lot, state.market, state.collectors[npcId].cash, s);
    npcTriggers[npcId] = result.value;
    s = result.state;
  }

  return {
    ...state,
    seed: s,
    currentLotIndex: lotIndex,
    currentLot: lot,
    currentLotStartAt: elapsedMs,
    npcTriggers,
    phase: "auction",
    phaseChangedAt: elapsedMs,
  };
}

export function createGame(seedValue: number, elapsedMs = 0): GameState {
  const s0 = createRng(seedValue);
  const { value: blueprints, state: s1 } = generateLotBlueprints(s0);

  const initial: GameState = {
    seed: s1,
    market: createMarket(),
    collectors: createCollectors(),
    blueprints,
    currentLotIndex: -1,
    currentLot: null,
    currentLotStartAt: 0,
    npcTriggers: {},
    outcomes: [],
    phase: "auction",
    phaseChangedAt: elapsedMs,
  };

  return startLot(initial, 0, elapsedMs);
}

function settleSale(
  state: GameState,
  winner: CollectorId,
  price: number,
  elapsedMs: number,
): GameState {
  const lot = state.currentLot;
  if (!lot) return state;

  const buyer = state.collectors[winner];
  const updatedBuyer: Collector = {
    ...buyer,
    cash: buyer.cash - price,
    holdings: {
      ...buyer.holdings,
      [lot.artistId]: (buyer.holdings[lot.artistId] ?? 0) + 1,
    },
  };

  const outcome: LotOutcome = {
    lotIndex: lot.index,
    artistId: lot.artistId,
    winner,
    price,
    saleAtMs: elapsedMs,
  };

  return {
    ...state,
    market: recordSale(state.market, lot.artistId),
    collectors: { ...state.collectors, [winner]: updatedBuyer },
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
    price: 0,
    saleAtMs: elapsedMs,
  };
  return {
    ...state,
    outcomes: [...state.outcomes, outcome],
    phase: "sold-pause",
    phaseChangedAt: elapsedMs,
  };
}

// Resolves any claim that has become due by `elapsedMs`: an NPC whose trigger
// time has passed, or (past the lot's duration) a forced floor-price sale.
// Called every animation frame and, in between frames, at the exact instant
// of a player click — so a claim is settled at real elapsed time, not
// rounded to whichever frame happened to render it.
export function tick(state: GameState, elapsedMs: number): GameState {
  if (state.phase === "sold-pause") {
    if (elapsedMs - state.phaseChangedAt >= SOLD_PAUSE_MS) {
      return startLot(state, state.currentLotIndex + 1, elapsedMs);
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
    const price = priceAtTime(lot, dueAt);
    return settleSale(state, dueNpc, price, elapsedMs);
  }

  if (relativeMs >= lot.durationMs) {
    const affordable = NPC_IDS.filter((id) => state.collectors[id].cash >= lot.floor);
    if (affordable.length === 0) return settleUnsold(state, elapsedMs);
    const weakest = affordable.reduce((a, b) =>
      state.collectors[a].cash <= state.collectors[b].cash ? a : b,
    );
    return settleSale(state, weakest, lot.floor, elapsedMs);
  }

  return state;
}

// The single player action: claim the current lot right now. Resolves any
// NPC claim due at this exact instant first, so a click that loses to an NPC
// by a whisker is genuinely too late, not an artefact of check ordering.
export function attemptPlayerClaim(state: GameState, elapsedMs: number): GameState {
  if (state.phase !== "auction" || !state.currentLot) return state;

  const afterNpcCheck = tick(state, elapsedMs);
  if (afterNpcCheck.phase !== "auction") return afterNpcCheck;

  const lot = afterNpcCheck.currentLot!;
  const relativeMs = elapsedMs - afterNpcCheck.currentLotStartAt;
  const price = priceAtTime(lot, relativeMs);

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

export { ARTISTS };
