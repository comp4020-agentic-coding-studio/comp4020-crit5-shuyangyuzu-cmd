import { ARTISTS, BASE_MARKET_VALUE, type ArtistId } from "./artists";

export type Market = Record<ArtistId, number>;

export const SALE_VALUE_BUMP = 0.12;

export function createMarket(): Market {
  const market = {} as Market;
  for (const artist of ARTISTS) {
    market[artist.id] = BASE_MARKET_VALUE;
  }
  return market;
}

// Bumps one artist's value by a fixed fraction. Called exactly once per
// completed sale, never per attempt, so a lot that changes hands zero or one
// time moves the market at most once.
export function recordSale(market: Market, artistId: ArtistId): Market {
  return {
    ...market,
    [artistId]: Math.round(market[artistId] * (1 + SALE_VALUE_BUMP)),
  };
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
