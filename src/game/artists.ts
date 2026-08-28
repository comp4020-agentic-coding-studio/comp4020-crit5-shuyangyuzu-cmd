export type ArtistId = "vangogh" | "monet" | "kandinsky" | "mondrian";

export type ArtistSymbol = "diamond" | "circle" | "triangle" | "square";

export interface Artist {
  id: ArtistId;
  name: string;
  color: string;
  symbol: ArtistSymbol;
  initialValue: number;
}

// Four real historical artists, each with its own starting market value and a
// persistent colour + symbol pair used everywhere the artist appears (artwork
// frame, market board row, collection tiles) so identity never depends on
// recognising the generated painting style itself.
export const ARTISTS: Artist[] = [
  { id: "vangogh", name: "Vincent van Gogh", color: "#f2b134", symbol: "diamond", initialValue: 80 },
  { id: "monet", name: "Claude Monet", color: "#4fa3d1", symbol: "circle", initialValue: 65 },
  { id: "kandinsky", name: "Wassily Kandinsky", color: "#9c5aa8", symbol: "triangle", initialValue: 50 },
  { id: "mondrian", name: "Piet Mondrian", color: "#e6453c", symbol: "square", initialValue: 35 },
];
