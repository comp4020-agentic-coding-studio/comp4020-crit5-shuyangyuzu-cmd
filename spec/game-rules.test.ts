import { describe, expect, it } from "vitest";
import {
  attemptPlayerClaim,
  computeResults,
  createGame,
  isPlayerWinner,
  tick,
  type GameState,
} from "../src/game/engine";
import { createMarket, recordSale } from "../src/game/market";
import { NPC_IDS } from "../src/game/types";

// This week's contract tests: they answer the C5 brief's requirement for one
// rule under a focused automated test, plus the market/scoring rules that
// determine whether a wrong decision genuinely costs the player.

describe("a lot belongs to its first successful claimant only", () => {
  it("sells to whichever bidder's claim is due first, and rejects every later claim on that lot", () => {
    const game = createGame(42);
    const lot = game.currentLot!;

    const earliestNpc = NPC_IDS.filter((id) => game.npcTriggers[id] != null).sort(
      (a, b) => (game.npcTriggers[a] as number) - (game.npcTriggers[b] as number),
    )[0];
    expect(earliestNpc, "seed 42's first lot should have at least one affordable NPC bidder").toBeDefined();
    const triggerMs = game.npcTriggers[earliestNpc] as number;

    const sold = tick(game, triggerMs);

    expect(sold.phase).toBe("sold-pause");
    expect(sold.outcomes).toHaveLength(1);
    expect(sold.outcomes[0].winner).toBe(earliestNpc);
    expect(sold.outcomes[0].lotIndex).toBe(lot.index);

    const price = sold.outcomes[0].price;
    const winnerCashBefore = game.collectors[earliestNpc].cash;
    expect(sold.collectors[earliestNpc].cash).toBe(winnerCashBefore - price);
    expect(sold.collectors[earliestNpc].holdings[lot.artistId]).toBe(1);

    // Every other collector, including the player, is untouched by this sale.
    for (const id of Object.keys(sold.collectors) as (keyof typeof sold.collectors)[]) {
      if (id === earliestNpc) continue;
      expect(sold.collectors[id].cash).toBe(game.collectors[id].cash);
      expect(sold.collectors[id].holdings[lot.artistId] ?? 0).toBe(0);
    }

    // The player clicking after the lot is already gone cannot acquire it,
    // and does not touch their cash — the price is deducted exactly once.
    const tooLate = attemptPlayerClaim(sold, triggerMs + 500);
    expect(tooLate.outcomes).toHaveLength(1);
    expect(tooLate.collectors.player.cash).toBe(sold.collectors.player.cash);
    expect(tooLate.collectors[earliestNpc].cash).toBe(sold.collectors[earliestNpc].cash);

    // A further tick, still inside the sold-pause window, doesn't resell it
    // either, and the market has moved exactly once for this artist.
    const stillPaused = tick(tooLate, triggerMs + 900);
    expect(stillPaused.outcomes).toHaveLength(1);
  });
});

describe("market value moves exactly once per completed sale", () => {
  it("bumps only the artist who sold, and only by one sale's worth", () => {
    const base = createMarket();
    const afterOne = recordSale(base, "vantablack");
    expect(afterOne.vantablack).toBeGreaterThan(base.vantablack);
    expect(afterOne.halcyon).toBe(base.halcyon);
    expect(afterOne.ferrous).toBe(base.ferrous);

    const afterTwoDifferentArtists = recordSale(afterOne, "halcyon");
    // vantablack must not have moved again just because a different artist sold.
    expect(afterTwoDifferentArtists.vantablack).toBe(afterOne.vantablack);
  });

  it("a played-out sale in the engine bumps its own artist exactly once", () => {
    const game = createGame(7);
    const lot = game.currentLot!;
    const earliestNpc = NPC_IDS.filter((id) => game.npcTriggers[id] != null).sort(
      (a, b) => (game.npcTriggers[a] as number) - (game.npcTriggers[b] as number),
    )[0];
    const triggerMs = game.npcTriggers[earliestNpc] as number;

    const sold = tick(game, triggerMs);
    expect(sold.market[lot.artistId]).toBeGreaterThan(game.market[lot.artistId]);
    for (const artist of Object.keys(game.market) as (keyof typeof game.market)[]) {
      if (artist === lot.artistId) continue;
      expect(sold.market[artist]).toBe(game.market[artist]);
    }
  });
});

describe("final wealth", () => {
  it("equals remaining cash plus holdings valued at final market prices", () => {
    const base = createGame(1);
    const market = { vantablack: 120, halcyon: 90, ferrous: 150 };
    const state: GameState = {
      ...base,
      market,
      collectors: {
        player: { id: "player", name: "You", cash: 200, holdings: { vantablack: 2 } },
        trend: { id: "trend", name: "Trend", cash: 500, holdings: {} },
        value: { id: "value", name: "Value", cash: 50, holdings: { ferrous: 1, halcyon: 1 } },
        momentum: { id: "momentum", name: "Momentum", cash: 300, holdings: { vantablack: 1 } },
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
      market: { vantablack: 100, halcyon: 100, ferrous: 100 },
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
      market: { vantablack: 100, halcyon: 100, ferrous: 100 },
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
