export type ArtistId = "vantablack" | "halcyon" | "ferrous";

export interface Artist {
  id: ArtistId;
  name: string;
  color: string;
  symbol: "triangle" | "circle" | "square";
}

export const BASE_MARKET_VALUE = 100;

export const ARTISTS: Artist[] = [
  { id: "vantablack", name: "Nyx Vantablack", color: "#8b5cf6", symbol: "triangle" },
  { id: "halcyon", name: "Rue Halcyon", color: "#14b8a6", symbol: "circle" },
  { id: "ferrous", name: "Otto Ferrous", color: "#f97316", symbol: "square" },
];
