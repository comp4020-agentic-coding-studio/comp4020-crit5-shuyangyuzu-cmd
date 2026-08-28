import { describe, expect, it } from "vitest";
import { attemptPlayerClaim, computeResults, createGame, isPlayerWinner, tick, type GameState } from "../src/game/engine";
import { createMarket, resolveSale, resolveUnsold } from "../src/game/market";
import { COLLECTOR_IDS } from "../src/game/types";

// This week's contract tests answer the C5 playtest revision: outcome-driven
// market movement replaces the old fixed growth rate, and there is no forced
// floor sale — an auction can now genuinely go UNSOLD.

describe("a lot belongs to its first successful claimant only", () => {
  it("sells to whichever bidder's claim is due first, and rejects every later claim on that lot", () => {
    const base = createGame(42);
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
    const base = createGame(5);
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
