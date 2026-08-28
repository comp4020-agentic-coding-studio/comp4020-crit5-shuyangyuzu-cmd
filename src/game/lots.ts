import { ARTISTS } from "./artists";
import { generateArtwork } from "./artwork";
import { shuffle, type RngState } from "./rng";
import type { LotBlueprint } from "./types";

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
