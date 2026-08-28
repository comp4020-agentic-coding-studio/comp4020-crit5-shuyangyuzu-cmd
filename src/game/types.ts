import type { ArtistId } from "./artists";

export type NpcId = "trend" | "value" | "momentum";
export type CollectorId = "player" | NpcId;

export const NPC_IDS: NpcId[] = ["trend", "value", "momentum"];
export const COLLECTOR_IDS: CollectorId[] = ["player", ...NPC_IDS];

export type GameMode = "house" | "auctioneer";

// One purchased lot's exact identity, preserved for as long as the buyer
// holds it — this is what lets the UI show "Vincent van Gogh / The Starry
// Night" instead of collapsing every purchase into an artist headcount.
// `assetId` doubles as the "local asset path" the spec asks for: the pixel
// art lives as TS source in pixelart.ts rather than a separate binary file,
// so the artwork's own id (matched 1:1 with a PIECES entry) is that path.
export interface AcquiredLot {
  lotId: number;
  artistId: ArtistId;
  title: string;
  year: number;
  assetId: string;
  price: number;
  buyer: CollectorId;
}

export interface Collector {
  id: CollectorId;
  name: string;
  cash: number;
  // Kept in sync with acquiredLots through exactly one code path
  // (engine.ts's recordAcquisition) rather than two independently maintained
  // sources of truth — this field is what npc.ts, market.ts and the market
  // board read; acquiredLots is what the UI reads to show a specific title.
  holdings: Partial<Record<ArtistId, number>>;
  acquiredLots: AcquiredLot[];
}

// A fixed, hand-placed low-resolution pixel grid — one hex colour per cell,
// square (grid.length rows of grid.length cells) — rendered at native size
// onto a canvas and scaled up with image-rendering: pixelated. See
// pixelart.ts for how the twelve pieces are built and ART_PROVENANCE.md for
// the real paintings and museum references each one interprets.
export interface ArtworkSpec {
  id: string;
  title: string;
  year: number;
  sourceUrl: string;
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
