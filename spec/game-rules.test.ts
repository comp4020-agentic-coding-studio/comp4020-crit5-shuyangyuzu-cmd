import { describe, expect, it } from "vitest";
import {
  attemptPlayerClaim,
  computeResults,
  createGame,
  isPlayerWinner,
  selectLotCard,
  tick,
  type GameState,
} from "../src/game/engine";
import { LOT_COUNT } from "../src/game/lots";
import { createMarket, resolveSale, resolveUnsold } from "../src/game/market";
import { applyPayment, paymentDestination } from "../src/game/payments";
import { COLLECTOR_IDS, NPC_IDS, type Collector, type CollectorId, type GameMode } from "../src/game/types";
import { buildPublicView } from "../src/game/view";

// This week's contract tests answer the C5 playtest revision: outcome-driven
// market movement (no fixed growth rate, no forced floor sale), the payment
// rules for both HOUSE and AUCTIONEER mode, and the structural privacy
// guarantee that hides rival finances until the game ends.

function baseCollectors(): Record<CollectorId, Collector> {
  const collectors = {} as Record<CollectorId, Collector>;
  for (const id of COLLECTOR_IDS) {
    collectors[id] = { id, name: id, cash: 500, holdings: {} };
  }
  return collectors;
}

// Drives a game to completion by always claiming a hand card immediately
// (when the player is auctioneer) and otherwise advancing the clock in fixed
// steps. This never leans on any NPC choosing to bid — an auction with no
// claimant at all still resolves, via UNSOLD, once its duration elapses.
function playToFinish(seed: number, mode: GameMode): GameState {
  let state = createGame(seed, mode);
  let clock = 0;
  let guard = 0;
  while (state.phase !== "finished" && guard < 20_000) {
    guard++;
    if (state.phase === "selecting") {
      state = selectLotCard(state, 0, clock);
      continue;
    }
    clock += 25;
    state = tick(state, clock);
  }
  return state;
}

describe("a lot belongs to its first successful claimant only", () => {
  it("sells to whichever bidder's claim is due first, and rejects every later claim on that lot", () => {
    const base = createGame(42, "house");
    const lot = base.currentLot!;
    // Override the triggers directly so this test is deterministic
    // regardless of whether seed 42 happens to produce an interested NPC.
    const game: GameState = { ...base, npcTriggers: { trend: 4000, value: null, momentum: null } };

    const sold = tick(game, 4000);

    expect(sold.phase).toBe("sold-pause");
    expect(sold.outcomes).toHaveLength(1);
    expect(sold.outcomes[0].winner).toBe("trend");
    expect(sold.outcomes[0].lotIndex).toBe(lot.index);

    const price = sold.outcomes[0].price;
    const winnerCashBefore = game.collectors.trend.cash;
    expect(sold.collectors.trend.cash).toBe(winnerCashBefore - price);
    expect(sold.collectors.trend.holdings[lot.artistId]).toBe(1);

    for (const id of COLLECTOR_IDS) {
      if (id === "trend") continue;
      expect(sold.collectors[id].cash).toBe(game.collectors[id].cash);
      expect(sold.collectors[id].holdings[lot.artistId] ?? 0).toBe(0);
    }

    // The player clicking after the lot is already gone cannot acquire it,
    // and does not touch their cash — the price is deducted exactly once.
    const tooLate = attemptPlayerClaim(sold, 4500);
    expect(tooLate.outcomes).toHaveLength(1);
    expect(tooLate.collectors.player.cash).toBe(sold.collectors.player.cash);
    expect(tooLate.collectors.trend.cash).toBe(sold.collectors.trend.cash);

    // A further tick, still inside the sold-pause window, doesn't resell it.
    const stillPaused = tick(tooLate, 4900);
    expect(stillPaused.outcomes).toHaveLength(1);
  });
});

describe("AUCTIONEER hand selection transitions selecting to auction", () => {
  it("starts the player's turn in the selecting phase with a three-card hand", () => {
    const game = createGame(11, "auctioneer");
    expect(game.phase).toBe("selecting");
    expect(game.currentAuctioneer).toBe("player");
    expect(game.hands.player).toHaveLength(3);
    expect(game.currentLot).toBeNull();
  });

  it("many ticks while selecting leave the phase and hand untouched", () => {
    // Models real time passing (many animation frames) before the player
    // clicks a hand card — the state must be stable, not decaying on its own.
    const game = createGame(11, "auctioneer");
    let state = game;
    for (let clock = 0; clock < 5000; clock += 16) {
      state = tick(state, clock);
    }
    expect(state.phase).toBe("selecting");
    expect(state.hands.player).toBe(game.hands.player);
  });

  it("selecting a hand card opens its auction and removes exactly that card from the hand", () => {
    const game = createGame(11, "auctioneer");
    const hand = game.hands.player!;
    const chosen = hand[1];

    const afterSelect = selectLotCard(game, 1, 1234);

    expect(afterSelect.phase).toBe("auction");
    expect(afterSelect.currentAuctioneer).toBe("player");
    expect(afterSelect.currentLot).not.toBeNull();
    expect(afterSelect.currentLot!.artistId).toBe(chosen.artistId);
    expect(afterSelect.currentLot!.index).toBe(chosen.index);
    expect(afterSelect.hands.player).toHaveLength(2);
    expect(afterSelect.hands.player).not.toBe(hand);
    expect(afterSelect.hands.player!.some((card) => card.index === chosen.index)).toBe(false);
  });

  it("ignores a selection once the phase has already moved past selecting", () => {
    const game = createGame(11, "auctioneer");
    const afterSelect = selectLotCard(game, 0, 100);
    const ignored = selectLotCard(afterSelect, 0, 200);
    expect(ignored).toBe(afterSelect);
  });

  it("completes a full 12-lot AUCTIONEER game, rotating the auctioneer role evenly", () => {
    const finished = playToFinish(202, "auctioneer");
    expect(finished.phase).toBe("finished");
    expect(finished.outcomes).toHaveLength(LOT_COUNT);
    const auctioneerCounts = new Map<string, number>();
    for (const outcome of finished.outcomes) {
      auctioneerCounts.set(outcome.auctioneer, (auctioneerCounts.get(outcome.auctioneer) ?? 0) + 1);
    }
    for (const id of COLLECTOR_IDS) {
      expect(auctioneerCounts.get(id)).toBe(3);
    }
  });
});

describe("market resolution", () => {
  it("PREMIUM SALE increases only the affected artist by $15", () => {
    const base = createMarket();
    const { market, kind } = resolveSale(base, "monet", base.monet, base.monet);
    expect(kind).toBe("premium");
    expect(market.monet).toBe(base.monet + 15);
    expect(market.vangogh).toBe(base.vangogh);
    expect(market.kandinsky).toBe(base.kandinsky);
    expect(market.mondrian).toBe(base.mondrian);
  });

  it("DISCOUNT SALE decreases only the affected artist by $5", () => {
    const base = createMarket();
    const { market, kind } = resolveSale(base, "monet", base.monet - 1, base.monet);
    expect(kind).toBe("discount");
    expect(market.monet).toBe(base.monet - 5);
    expect(market.vangogh).toBe(base.vangogh);
    expect(market.kandinsky).toBe(base.kandinsky);
    expect(market.mondrian).toBe(base.mondrian);
  });

  it("UNSOLD transfers no artwork or cash and decreases the artist by $15", () => {
    const base = createGame(5, "house");
    const lot = base.currentLot!;
    const game: GameState = { ...base, npcTriggers: { trend: null, value: null, momentum: null } };

    const unsold = tick(game, lot.durationMs);

    expect(unsold.phase).toBe("sold-pause");
    expect(unsold.outcomes).toHaveLength(1);
    expect(unsold.outcomes[0].winner).toBeNull();
    expect(unsold.outcomes[0].saleKind).toBe("unsold");
    expect(unsold.outcomes[0].price).toBe(0);
    expect(unsold.market[lot.artistId]).toBe(Math.max(10, game.market[lot.artistId] - 15));

    for (const id of COLLECTOR_IDS) {
      expect(unsold.collectors[id].cash).toBe(game.collectors[id].cash);
      expect(unsold.collectors[id].holdings[lot.artistId] ?? 0).toBe(0);
    }
  });

  it("never lets market value fall below $10", () => {
    const low = { vangogh: 12, monet: 12, kandinsky: 12, mondrian: 12 };
    const afterDiscount = resolveSale(low, "vangogh", 0, 100).market;
    expect(afterDiscount.vangogh).toBe(10);
    const afterUnsold = resolveUnsold(low, "monet");
    expect(afterUnsold.monet).toBe(10);
  });
});

describe("payments", () => {
  it("HOUSE purchases pay the bank", () => {
    const collectors = baseCollectors();
    const next = applyPayment(collectors, "player", "house", 50);
    expect(next.player.cash).toBe(collectors.player.cash - 50);
    for (const id of NPC_IDS) expect(next[id].cash).toBe(collectors[id].cash);
    expect(paymentDestination("player", "house")).toBe("bank");
  });

  it("in AUCTIONEER mode, a non-auctioneer buyer pays the auctioneer", () => {
    const collectors = baseCollectors();
    const next = applyPayment(collectors, "player", "trend", 50);
    expect(next.player.cash).toBe(collectors.player.cash - 50);
    expect(next.trend.cash).toBe(collectors.trend.cash + 50);
    expect(paymentDestination("player", "trend")).toBe("trend");
  });

  it("an auctioneer buying their own lot pays the bank rather than themselves", () => {
    const collectors = baseCollectors();
    const next = applyPayment(collectors, "trend", "trend", 50);
    expect(next.trend.cash).toBe(collectors.trend.cash - 50);
    expect(paymentDestination("trend", "trend")).toBe("bank");
  });
});

describe("every artwork is resolved exactly once", () => {
  it("in HOUSE mode", () => {
    const finished = playToFinish(101, "house");
    expect(finished.phase).toBe("finished");
    expect(finished.outcomes).toHaveLength(LOT_COUNT);
    expect(new Set(finished.outcomes.map((o) => o.lotIndex)).size).toBe(LOT_COUNT);
  });

  it("in AUCTIONEER mode", () => {
    const finished = playToFinish(102, "auctioneer");
    expect(finished.phase).toBe("finished");
    expect(finished.outcomes).toHaveLength(LOT_COUNT);
    expect(new Set(finished.outcomes.map((o) => o.lotIndex)).size).toBe(LOT_COUNT);
  });
});

describe("rival financial privacy", () => {
  it("does not expose rival cash or net worth before the game finishes", () => {
    const game = createGame(9, "house");
    const view = buildPublicView(game);

    for (const entry of view.collectors) {
      if (entry.id === "player") continue;
      expect("cash" in entry).toBe(false);
      expect("netWorth" in entry).toBe(false);
      expect("collectionValue" in entry).toBe(false);
      expect(entry.holdings).toBeDefined();
    }

    const player = view.collectors.find((c) => c.id === "player")!;
    expect(player.cash).toBe(game.collectors.player.cash);
  });

  it("reveals every collector's finances once the game finishes", () => {
    const finished = playToFinish(21, "house");
    const view = buildPublicView(finished);

    expect(view.finished).toBe(true);
    for (const entry of view.collectors) {
      expect(entry.cash).toBeDefined();
      expect(entry.netWorth).toBeDefined();
      expect(entry.netWorth).toBe((entry.cash ?? 0) + (entry.collectionValue ?? 0));
    }
  });
});

describe("final net worth", () => {
  it("equals remaining cash plus holdings valued at final market prices", () => {
    const base = createGame(1);
    const market = { vangogh: 120, monet: 90, kandinsky: 150, mondrian: 40 };
    const state: GameState = {
      ...base,
      market,
      collectors: {
        player: { id: "player", name: "You", cash: 200, holdings: { vangogh: 2 } },
        trend: { id: "trend", name: "Trend", cash: 500, holdings: {} },
        value: { id: "value", name: "Value", cash: 50, holdings: { kandinsky: 1, monet: 1 } },
        momentum: { id: "momentum", name: "Momentum", cash: 300, holdings: { vangogh: 1 } },
      },
    };

    const results = computeResults(state);
    const player = results.find((r) => r.id === "player")!;
    const valueCollector = results.find((r) => r.id === "value")!;

    expect(player.wealth).toBe(200 + 2 * 120);
    expect(valueCollector.wealth).toBe(50 + 150 + 90);
  });
});

describe("a tie for first is not a strict player win", () => {
  it("refuses to call it a win when the player only matches the top wealth", () => {
    const base = createGame(2);
    const state: GameState = {
      ...base,
      market: { vangogh: 100, monet: 100, kandinsky: 100, mondrian: 100 },
      collectors: {
        player: { id: "player", name: "You", cash: 1000, holdings: {} },
        trend: { id: "trend", name: "Trend", cash: 1000, holdings: {} },
        value: { id: "value", name: "Value", cash: 400, holdings: {} },
        momentum: { id: "momentum", name: "Momentum", cash: 200, holdings: {} },
      },
    };

    const results = computeResults(state);
    const player = results.find((r) => r.id === "player")!;
    const trend = results.find((r) => r.id === "trend")!;

    expect(player.rank).toBe(1);
    expect(trend.rank).toBe(1);
    expect(isPlayerWinner(results)).toBe(false);
  });

  it("does call a strict, unshared top rank a win", () => {
    const base = createGame(3);
    const state: GameState = {
      ...base,
      market: { vangogh: 100, monet: 100, kandinsky: 100, mondrian: 100 },
      collectors: {
        player: { id: "player", name: "You", cash: 1200, holdings: {} },
        trend: { id: "trend", name: "Trend", cash: 1000, holdings: {} },
        value: { id: "value", name: "Value", cash: 400, holdings: {} },
        momentum: { id: "momentum", name: "Momentum", cash: 200, holdings: {} },
      },
    };

    expect(isPlayerWinner(computeResults(state))).toBe(true);
  });
});
