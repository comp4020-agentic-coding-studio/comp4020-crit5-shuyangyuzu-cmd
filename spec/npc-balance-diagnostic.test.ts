import { describe, expect, it } from "vitest";
import { createGame, selectLotCard, tick, type GameState } from "../src/game/engine";
import { computeNpcTrigger, generateNpcProfiles } from "../src/game/npc";
import { createMarket } from "../src/game/market";
import { createRng } from "../src/game/rng";
import { SOLD_PAUSE_MS } from "../src/game/lots";
import { NPC_IDS, type Lot } from "../src/game/types";

// Not a spec-line test: a deterministic multi-seed diagnostic, run once
// before finalising src/game/npc.ts's Celeste ("momentum") constants, and
// kept here so the numbers it reports stay reproducible and re-runnable.
// It prints a report to the console when run directly:
//   pnpm exec vitest run spec/npc-balance-diagnostic.test.ts
// The assertions below are loose sanity bounds on the reported numbers, not
// the exhaustive proof of the fix — spec/npc-celeste.test.ts carries that.

function sampleLot(artistId: Lot["artistId"]): Lot {
  return {
    index: 0,
    artistId,
    artwork: { id: "diag", title: "Diagnostic Lot", year: 1900, sourceUrl: "https://example.org/diag", grid: [["#000"]] },
    ceiling: 200,
    floor: 40,
    durationMs: 12_000,
    preSaleValue: 80,
  };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length === 0 ? NaN : sorted[Math.floor(sorted.length / 2)];
}

// Drives a full game to "finished" with the human making no purchases at
// all (never calling attemptPlayerClaim), so only NPC triggers and the
// engine's own AUCTIONEER-mode auto-pick decide every lot's winner.
function simulateGameNoPlayer(seed: number, mode: "house" | "auctioneer" = "house"): GameState {
  let state: GameState = createGame(seed, mode);
  let elapsed = state.phaseChangedAt;
  let guard = 0;

  while (state.phase !== "finished" && guard < 500) {
    guard++;
    if (state.phase === "auction" && state.currentLot) {
      elapsed = state.currentLotStartAt + state.currentLot.durationMs + 1;
      state = tick(state, elapsed);
    } else if (state.phase === "sold-pause") {
      elapsed = state.phaseChangedAt + SOLD_PAUSE_MS + 1;
      state = tick(state, elapsed);
    } else if (state.phase === "selecting") {
      // Only reachable in auctioneer mode when it's the human's turn to put
      // up a card; the human "does nothing" by always offering their first
      // remaining card so the game can keep moving.
      state = selectLotCard(state, 0, elapsed);
    } else {
      break;
    }
  }

  return state;
}

describe("Celeste Moreau balance diagnostic (before/after report)", () => {
  it("reports zero-holding participation/trigger for preferred vs non-preferred artists", () => {
    const market = createMarket();
    const outcomes: never[] = [];
    const trials = 500;

    const preferredTriggers: number[] = [];
    const nonPreferredTriggers: number[] = [];
    let preferredHits = 0;
    let nonPreferredHits = 0;

    for (let seed = 0; seed < trials; seed++) {
      const { value: profiles } = generateNpcProfiles(createRng(seed));
      const profile = { ...profiles.momentum, preferredArtistId: "vangogh" as const };

      const preferred = computeNpcTrigger("momentum", sampleLot("vangogh"), market, 500, 0, profile, outcomes, createRng(seed * 13 + 1));
      if (preferred.value !== null) {
        preferredHits++;
        preferredTriggers.push(preferred.value);
      }

      const nonPreferred = computeNpcTrigger("momentum", sampleLot("monet"), market, 500, 0, profile, outcomes, createRng(seed * 13 + 1));
      if (nonPreferred.value !== null) {
        nonPreferredHits++;
        nonPreferredTriggers.push(nonPreferred.value);
      }
    }

    // eslint-disable-next-line no-console
    console.log(
      [
        "\n=== Celeste Moreau (momentum) — 0-holding diagnostic ===",
        `preferred artist:     participation ${(preferredHits / trials * 100).toFixed(1)}%, median trigger ${median(preferredTriggers).toFixed(0)}ms / 12000ms`,
        `non-preferred artist: participation ${(nonPreferredHits / trials * 100).toFixed(1)}%, median trigger ${median(nonPreferredTriggers).toFixed(0)}ms / 12000ms`,
      ].join("\n"),
    );

    expect(preferredHits / trials).toBeGreaterThan(nonPreferredHits / trials);
  });

  it("reports participation/trigger at 0, 1 and 2 holdings for the preferred artist", () => {
    const market = createMarket();
    const outcomes: never[] = [];
    const trials = 500;
    const lot = sampleLot("vangogh");

    const rows: string[] = ["\n=== Celeste Moreau (momentum) — holdings 0/1/2 diagnostic (preferred artist) ==="];
    for (const holdings of [0, 1, 2]) {
      const triggers: number[] = [];
      let hits = 0;
      for (let seed = 0; seed < trials; seed++) {
        const { value: profiles } = generateNpcProfiles(createRng(seed));
        const profile = { ...profiles.momentum, preferredArtistId: "vangogh" as const };
        const result = computeNpcTrigger("momentum", lot, market, 500, holdings, profile, outcomes, createRng(seed * 13 + 1));
        if (result.value !== null) {
          hits++;
          triggers.push(result.value);
        }
      }
      rows.push(`holdings=${holdings}: participation ${(hits / trials * 100).toFixed(1)}%, median trigger ${median(triggers).toFixed(0)}ms`);
    }
    // eslint-disable-next-line no-console
    console.log(rows.join("\n"));
    expect(rows.length).toBe(4);
  });

  it("reports average lots won per NPC, Celeste-zero-win rate, and contested-win rate across many complete no-purchase games", () => {
    const gamesPerMode = 300;
    const wins: Record<string, number> = { player: 0, trend: 0, value: 0, momentum: 0, unsold: 0 };
    let celesteZeroWinGames = 0;
    let celesteTotalWins = 0;

    for (let seed = 0; seed < gamesPerMode; seed++) {
      const finalState = simulateGameNoPlayer(seed, "house");
      let celesteWinsThisGame = 0;

      for (const outcome of finalState.outcomes) {
        const key = outcome.winner ?? "unsold";
        wins[key] = (wins[key] ?? 0) + 1;
        if (outcome.winner === "momentum") {
          celesteWinsThisGame++;
          celesteTotalWins++;
        }
      }
      if (celesteWinsThisGame === 0) celesteZeroWinGames++;
    }

    const avgWins = (id: string) => (wins[id] ?? 0) / gamesPerMode;
    // eslint-disable-next-line no-console
    console.log(
      [
        "\n=== No-purchase full-game diagnostic (HOUSE mode, 300 seeds) ===",
        `avg lots won — Vivienne (trend): ${avgWins("trend").toFixed(2)}, Julian (value): ${avgWins("value").toFixed(2)}, Celeste (momentum): ${avgWins("momentum").toFixed(2)}, unsold: ${avgWins("unsold").toFixed(2)}`,
        `Celeste wins zero lots in ${(celesteZeroWinGames / gamesPerMode * 100).toFixed(1)}% of games`,
        `Celeste total wins across all games: ${celesteTotalWins}`,
      ].join("\n"),
    );

    expect(wins.momentum).toBeGreaterThan(0);
    expect(celesteZeroWinGames).toBeLessThan(gamesPerMode);
  });

  it("reports the contested-win rate directly from resolved triggers (both other NPCs' interest known at resolution time)", () => {
    // Re-simulate lot-by-lot (rather than reading finished outcomes) so we
    // can inspect state.npcTriggers at the exact moment a lot resolves,
    // which is the only place "was someone else also interested" is
    // available without re-deriving it from private NPC state.
    const gamesPerMode = 300;
    let celesteTotalWins = 0;
    let celesteContestedWins = 0;

    for (let seed = 0; seed < gamesPerMode; seed++) {
      let state: GameState = createGame(seed, "house");
      let elapsed = state.phaseChangedAt;
      let guard = 0;

      while (state.phase !== "finished" && guard < 500) {
        guard++;
        if (state.phase === "auction" && state.currentLot) {
          const triggersBefore = state.npcTriggers;
          elapsed = state.currentLotStartAt + state.currentLot.durationMs + 1;
          const next = tick(state, elapsed);
          const outcome = next.outcomes[next.outcomes.length - 1];
          if (outcome && outcome.winner === "momentum" && next.outcomes.length > state.outcomes.length) {
            celesteTotalWins++;
            const othersInterested = NPC_IDS.filter((id) => id !== "momentum").some(
              (id) => triggersBefore[id] !== null && triggersBefore[id] !== undefined,
            );
            if (othersInterested) celesteContestedWins++;
          }
          state = next;
        } else if (state.phase === "sold-pause") {
          elapsed = state.phaseChangedAt + SOLD_PAUSE_MS + 1;
          state = tick(state, elapsed);
        } else {
          break;
        }
      }
    }

    const contestedShare = celesteTotalWins === 0 ? 0 : (celesteContestedWins / celesteTotalWins) * 100;
    // eslint-disable-next-line no-console
    console.log(
      [
        "\n=== Contested-win diagnostic (HOUSE mode, 300 seeds) ===",
        `Celeste total wins: ${celesteTotalWins}`,
        `Celeste wins while at least one other NPC was also interested: ${celesteContestedWins} (${contestedShare.toFixed(1)}%)`,
      ].join("\n"),
    );

    expect(celesteTotalWins).toBeGreaterThan(0);
  });

  it("confirms both HOUSE and AUCTIONEER modes still finish a full 12-lot game with no player purchases", () => {
    for (const mode of ["house", "auctioneer"] as const) {
      for (const seed of [1, 2, 3]) {
        const finalState = simulateGameNoPlayer(seed, mode);
        expect(finalState.phase).toBe("finished");
        expect(finalState.outcomes.length).toBe(12);
      }
    }
  });
});
