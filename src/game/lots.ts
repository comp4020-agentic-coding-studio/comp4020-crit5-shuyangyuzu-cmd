import { ARTISTS } from "./artists";
import { generateArtwork } from "./artwork";
import { shuffle, type RngState } from "./rng";
import { COLLECTOR_IDS, type CollectorId, type LotBlueprint } from "./types";

export const LOT_COUNT = 12;
export const AUCTION_DURATION_MS = 12_000;
export const SOLD_PAUSE_MS = 3_000;
export const CEILING_MULTIPLIER = 1.6;
export const FLOOR_MULTIPLIER = 0.35;

// Three works per artist, shuffled into a single running order. The artist
// assignment and running order are fixed at game start; each lot's price
// range is computed later, from whatever the market looks like when it comes
// up, so a mid-game price move on an artist is visible in their next lot.
export function generateLotBlueprints(state: RngState): { value: LotBlueprint[]; state: RngState } {
  const perArtist = LOT_COUNT / ARTISTS.length;
  const artistSequence = ARTISTS.flatMap((artist) => Array(perArtist).fill(artist));

  const shuffled = shuffle(artistSequence, state);
  let s = shuffled.state;

  const blueprints: LotBlueprint[] = [];
  for (let i = 0; i < shuffled.value.length; i++) {
    const artist = shuffled.value[i];
    const artwork = generateArtwork(artist, s);
    s = artwork.state;
    blueprints.push({ index: i, artistId: artist.id, artwork: artwork.value });
  }

  return { value: blueprints, state: s };
}

// AUCTIONEER mode: each collector's starting hand of lot cards, dealt
// round-robin from the same shuffled sequence so artist variety is spread
// evenly across every hand. A card in a hand is separate from that
// collector's scored collection until someone actually buys it.
export function dealHands(blueprints: LotBlueprint[]): Partial<Record<CollectorId, LotBlueprint[]>> {
  const hands: Partial<Record<CollectorId, LotBlueprint[]>> = {};
  for (const id of COLLECTOR_IDS) hands[id] = [];
  blueprints.forEach((blueprint, i) => {
    hands[COLLECTOR_IDS[i % COLLECTOR_IDS.length]]!.push(blueprint);
  });
  return hands;
}

// Fixed, visible rotation: YOU, TREND, VALUE, MOMENTUM repeated until every
// collector has auctioneered exactly LOT_COUNT / COLLECTOR_IDS.length times.
export function buildAuctioneerOrder(): CollectorId[] {
  const order: CollectorId[] = [];
  for (let round = 0; round < LOT_COUNT / COLLECTOR_IDS.length; round++) {
    order.push(...COLLECTOR_IDS);
  }
  return order;
}
