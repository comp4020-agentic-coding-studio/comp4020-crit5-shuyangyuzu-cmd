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

export type ArtworkShapeKind = "circle" | "square" | "triangle" | "stroke";

export interface ArtworkShape {
  kind: ArtworkShapeKind;
  x: number;
  y: number;
  size: number;
  // Only meaningful for "stroke": the long dimension of an elongated rect.
  length?: number;
  rotation: number;
  opacity: number;
  toneShift: number;
}

export interface ArtworkSpec {
  background: string;
  shapes: ArtworkShape[];
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

export type GamePhase = "auction" | "sold-pause" | "selecting" | "finished";

export interface RankedResult {
  id: CollectorId;
  name: string;
  cash: number;
  portfolioValue: number;
  wealth: number;
  rank: number;
}
