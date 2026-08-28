import { describe, expect, it } from "vitest";
import { createGame, tick, type GameState } from "../src/game/engine";
import { computeNpcTrigger, generateNpcProfiles } from "../src/game/npc";
import { createMarket } from "../src/game/market";
import { createRng } from "../src/game/rng";
import { NPC_IDS, type Lot } from "../src/game/types";

// This week's playtest finding #7: NPCs need stable personalities within one
// game and controlled variation between games. These tests answer the design
// decision recorded in npc.ts's header (75% core / 15% session profile / 10%
// per-lot jitter blend) rather than any published spec line, since the spec
// for this deliverable is the playtest findings themselves.

function sampleLot(): Lot {
  return {
    index: 0,
    artistId: "vangogh",
    artwork: { background: "#000", shapes: [] },
    ceiling: 200,
    floor: 40,
    durationMs: 12_000,
    preSaleValue: 80,
  };
}

describe("generateNpcProfiles", () => {
  it("is deterministic for a fixed seed", () => {
    const a = generateNpcProfiles(createRng(42));
    const b = generateNpcProfiles(createRng(42));
    expect(a.value).toEqual(b.value);
  });

  it("can differ across seeds", () => {
    const a = generateNpcProfiles(createRng(1));
    const b = generateNpcProfiles(createRng(2));
    expect(a.value).not.toEqual(b.value);
  });

  it("draws every field within its documented bounds for every NPC", () => {
    const { value: profiles } = generateNpcProfiles(createRng(7));
    for (const npcId of NPC_IDS) {
      const profile = profiles[npcId];
      expect(profile.riskTolerance).toBeGreaterThanOrEqual(0);
      expect(profile.riskTolerance).toBeLessThanOrEqual(1);
      expect(profile.patience).toBeGreaterThanOrEqual(0);
      expect(profile.patience).toBeLessThanOrEqual(1);
      expect(profile.aggression).toBeGreaterThanOrEqual(0);
      expect(profile.aggression).toBeLessThanOrEqual(1);
      expect(profile.marketSensitivity).toBeGreaterThanOrEqual(0);
      expect(profile.marketSensitivity).toBeLessThanOrEqual(1);
      expect(profile.discountRequirement).toBeGreaterThanOrEqual(0.12);
      expect(profile.discountRequirement).toBeLessThanOrEqual(0.28);
      expect(profile.mood).toBeGreaterThanOrEqual(-1);
      expect(profile.mood).toBeLessThanOrEqual(1);
    }
  });
});

describe("createGame's NPC profiles", () => {
  it("stay fixed for the entire game once generated", () => {
    let state: GameState = createGame(99, "house");
    const initialProfiles = state.npcProfiles;

    // Drive the game through several lots — nothing along this path should
    // ever touch npcProfiles, since it is only ever carried forward by
    // spread in engine.ts.
    let guard = 0;
    while (state.outcomes.length < 4 && guard < 5000) {
      guard++;
      state = tick(state, guard * 50);
    }

    expect(state.npcProfiles).toBe(initialProfiles);
  });

  it("reproduces the same profiles for the same seed", () => {
    const a = createGame(1234, "house");
    const b = createGame(1234, "house");
    expect(a.npcProfiles).toEqual(b.npcProfiles);
  });

  it("gets fresh profiles for a fresh seed, as PLAY AGAIN would", () => {
    const a = createGame(1, "house");
    const b = createGame(2, "house");
    expect(a.npcProfiles).not.toEqual(b.npcProfiles);
  });
});

describe("computeNpcTrigger", () => {
  const market = createMarket();
  const lot = sampleLot();

  it("is deterministic for the same npc, lot, market, cash, holdings, profile and rng state", () => {
    const { value: profiles } = generateNpcProfiles(createRng(5));
    const rngState = createRng(321);
    const outcomes: GameState["outcomes"] = [];

    const first = computeNpcTrigger("trend", lot, market, 500, 0, profiles.trend, outcomes, rngState);
    const second = computeNpcTrigger("trend", lot, market, 500, 0, profiles.trend, outcomes, rngState);

    expect(first.value).toBe(second.value);
  });

  it("keeps every NPC's trigger within the lot's duration when it does bid", () => {
    const { value: profiles } = generateNpcProfiles(createRng(11));
    let rngState = createRng(555);
    for (const npcId of NPC_IDS) {
      for (let holdings = 0; holdings < 5; holdings++) {
        const result = computeNpcTrigger(npcId, lot, market, 500, holdings, profiles[npcId], [], rngState);
        rngState = result.state;
        if (result.value !== null) {
          expect(result.value).toBeGreaterThanOrEqual(0);
          expect(result.value).toBeLessThanOrEqual(lot.durationMs);
        }
      }
    }
  });

  it("keeps a fixed session profile's influence bounded: two profiles differing only in the jittered layers stay in the same personality regime", () => {
    // Two different seeds' worth of session profiles, same core personality
    // (npcId) and same lot/market: the 15%+10% profile/jitter layers should
    // narrow the trigger time, not flip a fast personality into a slow one
    // or vice versa. Vivienne Hart (trend) always resolves near the front of
    // the auction regardless of session profile.
    const outcomes: GameState["outcomes"] = [];
    const triggers: number[] = [];
    for (let seed = 0; seed < 20; seed++) {
      const { value: profiles } = generateNpcProfiles(createRng(seed));
      const result = computeNpcTrigger("trend", lot, market, 500, 0, profiles.trend, outcomes, createRng(seed * 7 + 1));
      if (result.value !== null) triggers.push(result.value);
    }
    expect(triggers.length).toBeGreaterThan(0);
    for (const t of triggers) {
      // Vivienne's core fraction never exceeds 0.7 of the lot duration; the
      // 15%+10% layers are bounded well short of pushing a trigger past
      // roughly the auction's back half.
      expect(t).toBeLessThanOrEqual(lot.durationMs * 0.85);
    }
  });
});
