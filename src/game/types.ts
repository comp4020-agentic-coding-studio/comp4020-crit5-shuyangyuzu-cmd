import type { ArtistId } from "./artists";

export type NpcId = "trend" | "value" | "momentum";
export type CollectorId = "player" | NpcId;

export const NPC_IDS: NpcId[] = ["trend", "value", "momentum"];
export const COLLECTOR_IDS: CollectorId[] = ["player", ...NPC_IDS];

export type GameMode = "house" | "auctioneer";

export interface Collector {
  id: CollectorId;
  name: string;
  cash: number;
  holdings: Partial<Record<ArtistId, number>>;
}

// A fixed, hand-placed low-resolution pixel grid — one hex colour per cell,
// square (grid.length rows of grid.length cells) — rendered at native size
// onto a canvas and scaled up with image-rendering: pixelated. See
// pixelart.ts for how the twelve pieces are built and ART_PROVENANCE.md for
// the real paintings they take loose inspiration from.
export interface ArtworkSpec {
  title: string;
  grid: string[][];
}

// Fixed at game creation: which artist, which artwork. Pricing is deliberately
// not fixed here, because it has to reflect the artist's market value at the
// moment this lot actually goes up, not at game start.
export interface LotBlueprint {
  index: number;
  artistId: ArtistId;
  artwork: ArtworkSpec;
}

export interface Lot extends LotBlueprint {
  ceiling: number;
  floor: number;
  durationMs: number;
  // The artist's market value captured the instant this auction opened —
  // the reference point PREMIUM/DISCOUNT resolution compares the sale
  // price against, independent of anything that happens after.
  preSaleValue: number;
}

export type SaleKind = "premium" | "discount" | "unsold";

export interface LotOutcome {
  lotIndex: number;
  artistId: ArtistId;
  winner: CollectorId | null;
  auctioneer: CollectorId | "house";
  paymentTo: CollectorId | "bank";
  price: number;
  saleKind: SaleKind;
  saleAtMs: number | null;
}

// Generated once per game and held fixed for its entire 12-lot duration —
// this is what makes an NPC recognisably consistent within one game while
// still varying, seed to seed, between different games. See npc.ts for how
// each personality actually uses these fields; a field a personality
// ignores is simply inert for it (e.g. discountRequirement only matters to
// the value buyer).
export interface NpcSessionProfile {
  riskTolerance: number; // 0..1 — willingness to pay closer to the ceiling
  patience: number; // 0..1 — willingness to wait longer before acting
  aggression: number; // 0..1 — general eagerness to bid at all
  marketSensitivity: number; // 0..1 — how strongly recent outcomes sway interest
  preferredArtistId: ArtistId; // a mild, session-fixed lean toward one artist
  discountRequirement: number; // 0.12..0.28 — the value buyer's fixed bar
  mood: number; // -1..1 — a small overall session-wide shift
}

export type GamePhase = "auction" | "sold-pause" | "selecting" | "finished";

export interface RankedResult {
  id: CollectorId;
  name: string;
  cash: number;
  portfolioValue: number;
  wealth: number;
  rank: number;
}
