import { describe, expect, it } from "vitest";
import { computeNpcTrigger, generateNpcProfiles } from "../src/game/npc";
import { createMarket } from "../src/game/market";
import { createRng } from "../src/game/rng";
import { NPC_IDS, type Lot, type NpcSessionProfile } from "../src/game/types";

// Playtest finding: with zero holdings, Celeste Moreau ("momentum") almost
// never wins the first lot of her preferred artist, because her core
// interest starts neutral (0.35) and her trigger starts late (fraction
// 0.65) regardless of whether the lot is the one she's actually building
// towards. These tests pin down the fix in src/game/npc.ts: a genuine
// bootstrap for her preferred artist at 0 holdings, and a monotonic
// concentration curve from there on.

function sampleLot(artistId: Lot["artistId"] = "vangogh"): Lot {
  return {
    index: 0,
    artistId,
    artwork: { id: "test-piece", title: "Test Piece", year: 1900, sourceUrl: "https://example.org/test-piece", grid: [["#000"]] },
    ceiling: 200,
    floor: 40,
    durationMs: 12_000,
    preSaleValue: 80,
  };
}

function profileWithPreference(seed: number, preferredArtistId: Lot["artistId"]): NpcSessionProfile {
  const { value: profiles } = generateNpcProfiles(createRng(seed));
  return { ...profiles.momentum, preferredArtistId };
}

describe("Celeste Moreau's preferred-artist bootstrap", () => {
  const market = createMarket();
  const outcomes: never[] = [];

  it("gives a stronger, earlier trigger for the preferred artist at 0 holdings than for a non-preferred artist at 0 holdings", () => {
    const trials = 200;
    let preferredHits = 0;
    let nonPreferredHits = 0;
    const preferredTriggers: number[] = [];
    const nonPreferredTriggers: number[] = [];

    for (let seed = 0; seed < trials; seed++) {
      const profile = profileWithPreference(seed, "vangogh");

      const preferredResult = computeNpcTrigger(
        "momentum",
        sampleLot("vangogh"),
        market,
        500,
        0,
        profile,
        outcomes,
        createRng(seed * 13 + 1),
      );
      if (preferredResult.value !== null) {
        preferredHits++;
        preferredTriggers.push(preferredResult.value);
      }

      const nonPreferredResult = computeNpcTrigger(
        "momentum",
        sampleLot("monet"),
        market,
        500,
        0,
        profile,
        outcomes,
        createRng(seed * 13 + 1),
      );
      if (nonPreferredResult.value !== null) {
        nonPreferredHits++;
        nonPreferredTriggers.push(nonPreferredResult.value);
      }
    }

    // Bootstrap must be a real advantage, not a marginal nudge.
    expect(preferredHits / trials).toBeGreaterThan(nonPreferredHits / trials);
    expect(preferredHits / trials).toBeGreaterThan(0.5);

    const median = (values: number[]) => {
      const sorted = [...values].sort((a, b) => a - b);
      return sorted[Math.floor(sorted.length / 2)];
    };
    expect(median(preferredTriggers)).toBeLessThan(median(nonPreferredTriggers));
  });

  it("can be the earliest interested NPC in at least some fixed-seed contested scenarios", () => {
    const lot = sampleLot("vangogh");
    let contestedWins = 0;

    for (let seed = 0; seed < 300; seed++) {
      const { value: profiles } = generateNpcProfiles(createRng(seed));
      const momentumProfile = { ...profiles.momentum, preferredArtistId: "vangogh" as const };
      let rng = createRng(seed * 97 + 3);

      const triggers: Partial<Record<(typeof NPC_IDS)[number], number | null>> = {};
      for (const npcId of NPC_IDS) {
        const profile = npcId === "momentum" ? momentumProfile : profiles[npcId];
        const result = computeNpcTrigger(npcId, lot, market, 500, 0, profile, outcomes, rng);
        rng = result.state;
        triggers[npcId] = result.value;
      }

      const interested = NPC_IDS.filter((id) => triggers[id] !== null);
      if (interested.length < 2 || triggers.momentum === null) continue;

      const earliest = interested.reduce((best, id) =>
        (triggers[id] as number) < (triggers[best] as number) ? id : best,
      );
      if (earliest === "momentum") contestedWins++;
    }

    expect(contestedWins).toBeGreaterThan(0);
  });

  it("is deterministic: the same seed reproduces the same bootstrap trigger", () => {
    const lot = sampleLot("vangogh");
    const profile = profileWithPreference(42, "vangogh");

    const a = computeNpcTrigger("momentum", lot, market, 500, 0, profile, outcomes, createRng(999));
    const b = computeNpcTrigger("momentum", lot, market, 500, 0, profile, outcomes, createRng(999));

    expect(a.value).toBe(b.value);
  });
});

describe("Celeste Moreau's concentration is monotonic", () => {
  const market = createMarket();
  const outcomes: never[] = [];

  it("never becomes less interested or later-triggering as holdings of the preferred artist increase, with no regression after the bootstrap purchase", () => {
    // Use the *same* rng seed (hence identical jitter/interest-roll draws)
    // at every holdings level for a given trial, so any change in outcome
    // is attributable only to holdingsCount, not to sampling noise.
    const lot = sampleLot("vangogh");
    const profile = profileWithPreference(7, "vangogh");
    const trials = 300;

    for (let seed = 0; seed < trials; seed++) {
      let previousInterestHeld: boolean | null = null;
      let previousTrigger = -Infinity;

      for (let holdings = 0; holdings <= 4; holdings++) {
        const result = computeNpcTrigger("momentum", lot, market, 500, holdings, profile, outcomes, createRng(seed * 31 + 1));

        if (previousInterestHeld === true) {
          // Once interested at a lower holdings count under this exact
          // draw, she must stay interested at every higher holdings count.
          expect(result.value).not.toBeNull();
        }
        if (result.value !== null && previousTrigger !== -Infinity) {
          expect(result.value).toBeLessThanOrEqual(previousTrigger + 1e-9);
        }

        previousInterestHeld = result.value !== null;
        if (result.value !== null) previousTrigger = result.value;
      }
    }
  });

  it("stays cautious and relatively late for a zero-holding, non-preferred artist", () => {
    const lot = sampleLot("monet");
    const profile = profileWithPreference(3, "vangogh");

    let hits = 0;
    const triggers: number[] = [];
    const trials = 300;
    for (let seed = 0; seed < trials; seed++) {
      const result = computeNpcTrigger("momentum", lot, market, 500, 0, profile, outcomes, createRng(seed * 17 + 5));
      if (result.value !== null) {
        hits++;
        triggers.push(result.value);
      }
    }
    triggers.sort((a, b) => a - b);
    const median = triggers[Math.floor(triggers.length / 2)];

    expect(hits / trials).toBeLessThan(0.6);
    expect(median).toBeGreaterThan(lot.durationMs * 0.45);
  });
});
