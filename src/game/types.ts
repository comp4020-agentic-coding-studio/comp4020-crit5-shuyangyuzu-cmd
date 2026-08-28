import type { ArtistId } from "./artists";

export type NpcId = "trend" | "value" | "momentum";
export type CollectorId = "player" | NpcId;

export const NPC_IDS: NpcId[] = ["trend", "value", "momentum"];
export const COLLECTOR_IDS: CollectorId[] = ["player", ...NPC_IDS];

export interface Collector {
  id: CollectorId;
  name: string;
  cash: number;
  holdings: Partial<Record<ArtistId, number>>;
}

export interface ArtworkShape {
  kind: "triangle" | "circle" | "square";
  x: number;
  y: number;
  size: number;
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
}

export interface LotOutcome {
  lotIndex: number;
  artistId: ArtistId;
  winner: CollectorId | null;
  price: number;
  saleAtMs: number | null;
}

export type GamePhase = "auction" | "sold-pause" | "finished";

export interface RankedResult {
  id: CollectorId;
  name: string;
  cash: number;
  portfolioValue: number;
  wealth: number;
  rank: number;
}
