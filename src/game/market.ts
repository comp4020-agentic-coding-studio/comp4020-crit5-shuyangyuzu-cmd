import { ARTISTS, type ArtistId } from "./artists";

export type Market = Record<ArtistId, number>;

export const PREMIUM_BUMP = 15;
export const DISCOUNT_CUT = 5;
export const UNSOLD_CUT = 15;
export const MIN_MARKET_VALUE = 10;

export type SaleOutcomeKind = "premium" | "discount";

export function createMarket(): Market {
  const market = {} as Market;
  for (const artist of ARTISTS) {
    market[artist.id] = artist.initialValue;
  }
  return market;
}

// The market's reaction to a completed sale is driven by the outcome, not a
// fixed growth rate: selling at or above the pre-sale value is a premium and
// pushes the artist up; selling below it is a discount and pulls them down.
// Clamped so a cold artist can cool only so far.
export function resolveSale(
  market: Market,
  artistId: ArtistId,
  price: number,
  preSaleValue: number,
): { market: Market; kind: SaleOutcomeKind } {
  const kind: SaleOutcomeKind = price >= preSaleValue ? "premium" : "discount";
  const delta = kind === "premium" ? PREMIUM_BUMP : -DISCOUNT_CUT;
  const next = Math.max(MIN_MARKET_VALUE, market[artistId] + delta);
  return { market: { ...market, [artistId]: next }, kind };
}

// A lot that times out with no claimant at all: no money moves, nobody owns
// it, and the artist takes the steepest hit of the three outcomes.
export function resolveUnsold(market: Market, artistId: ArtistId): Market {
  const next = Math.max(MIN_MARKET_VALUE, market[artistId] - UNSOLD_CUT);
  return { ...market, [artistId]: next };
}

// A holding's worth is always today's market value, not its purchase price —
// this is how a past sale re-prices every work an artist has already sold.
export function portfolioValue(holdings: Partial<Record<ArtistId, number>>, market: Market): number {
  let total = 0;
  for (const artist of ARTISTS) {
    total += (holdings[artist.id] ?? 0) * market[artist.id];
  }
  return total;
}
