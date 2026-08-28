import type { Artist } from "./artists";
import { nextInt, nextRange, type RngState } from "./rng";
import type { ArtworkShape, ArtworkSpec } from "./types";

const BACKGROUNDS = ["#0b0b12", "#111018", "#0f1410", "#141018"];

// Every lot gets its own small abstract composition, generated from the seed
// thread rather than any external asset, so the same seed always reproduces
// the same painting.
export function generateArtwork(
  artist: Artist,
  state: RngState,
): { value: ArtworkSpec; state: RngState } {
  let s = state;
  const bgPick = nextInt(s, 0, BACKGROUNDS.length - 1);
  s = bgPick.state;
  const background = BACKGROUNDS[bgPick.value];

  const countPick = nextInt(s, 5, 9);
  s = countPick.state;
  const shapes: ArtworkShape[] = [];
  for (let i = 0; i < countPick.value; i++) {
    const x = nextRange(s, 15, 85);
    s = x.state;
    const y = nextRange(s, 15, 85);
    s = y.state;
    const size = nextRange(s, 10, 40);
    s = size.state;
    const rotation = nextRange(s, 0, 360);
    s = rotation.state;
    const opacity = nextRange(s, 0.35, 0.95);
    s = opacity.state;
    const toneShift = nextRange(s, -24, 24);
    s = toneShift.state;
    shapes.push({
      kind: artist.symbol,
      x: x.value,
      y: y.value,
      size: size.value,
      rotation: rotation.value,
      opacity: opacity.value,
      toneShift: toneShift.value,
    });
  }

  return { value: { background, shapes }, state: s };
}

export function shiftColor(hex: string, amount: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, n));
  const num = parseInt(hex.slice(1), 16);
  const r = clamp(((num >> 16) & 0xff) + amount);
  const g = clamp(((num >> 8) & 0xff) + amount);
  const b = clamp((num & 0xff) + amount);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}
