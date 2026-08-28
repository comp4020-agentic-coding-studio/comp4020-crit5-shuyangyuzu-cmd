import type { Artist, ArtistId } from "./artists";
import { nextInt, nextRange, type RngState } from "./rng";
import type { ArtworkShape, ArtworkSpec } from "./types";

const BACKGROUNDS: Record<ArtistId, string[]> = {
  vangogh: ["#0e1a2b", "#111d33", "#0c1626"],
  monet: ["#0f1c1a", "#101e22", "#0d1a1f"],
  kandinsky: ["#141018", "#17111f", "#120e19"],
  mondrian: ["#eee8dd", "#f1ece2", "#e9e3d6"],
};

// Broad motif: short thick strokes swept along a spiral, evoking van Gogh's
// swirling brushwork without reproducing any specific canvas.
function vanGoghShapes(state: RngState): { value: ArtworkShape[]; state: RngState } {
  let s = state;
  const shapes: ArtworkShape[] = [];
  const count = 20;
  for (let i = 0; i < count; i++) {
    const angle = i * 0.85;
    const radius = Math.min(40, 6 + i * 1.7);
    const x = 50 + Math.cos(angle) * radius * 0.95;
    const y = 50 + Math.sin(angle) * radius * 0.95;
    const lengthPick = nextRange(s, 14, 24);
    s = lengthPick.state;
    const thicknessPick = nextRange(s, 3, 6);
    s = thicknessPick.state;
    const opacityPick = nextRange(s, 0.55, 0.92);
    s = opacityPick.state;
    const tonePick = nextRange(s, -20, 24);
    s = tonePick.state;
    shapes.push({
      kind: "stroke",
      x,
      y,
      size: thicknessPick.value,
      length: lengthPick.value,
      rotation: (angle * 180) / Math.PI + 90,
      opacity: opacityPick.value,
      toneShift: tonePick.value,
    });
  }
  return { value: shapes, state: s };
}

// Broad motif: soft, overlapping translucent dabs, evoking Impressionist
// colour blur rather than a hard-edged drawing.
function monetShapes(state: RngState): { value: ArtworkShape[]; state: RngState } {
  let s = state;
  const countPick = nextInt(s, 11, 16);
  s = countPick.state;
  const shapes: ArtworkShape[] = [];
  for (let i = 0; i < countPick.value; i++) {
    const x = nextRange(s, 10, 90);
    s = x.state;
    const y = nextRange(s, 10, 90);
    s = y.state;
    const size = nextRange(s, 16, 34);
    s = size.state;
    const opacity = nextRange(s, 0.22, 0.5);
    s = opacity.state;
    const toneShift = nextRange(s, -16, 16);
    s = toneShift.state;
    shapes.push({ kind: "circle", x: x.value, y: y.value, size: size.value, rotation: 0, opacity: opacity.value, toneShift: toneShift.value });
  }
  return { value: shapes, state: s };
}

// Broad motif: a burst of bold geometric forms radiating from a centre,
// evoking Kandinsky's abstract geometric compositions.
function kandinskyShapes(state: RngState): { value: ArtworkShape[]; state: RngState } {
  let s = state;
  const shapes: ArtworkShape[] = [];
  const kinds: ArtworkShape["kind"][] = ["triangle", "circle", "square", "stroke"];
  const count = 12;
  for (let i = 0; i < count; i++) {
    const kindPick = nextInt(s, 0, kinds.length - 1);
    s = kindPick.state;
    const angle = (i / count) * Math.PI * 2;
    const radiusPick = nextRange(s, 10, 36);
    s = radiusPick.state;
    const x = 50 + Math.cos(angle) * radiusPick.value;
    const y = 50 + Math.sin(angle) * radiusPick.value;
    const size = nextRange(s, 10, 24);
    s = size.state;
    const length = nextRange(s, 16, 28);
    s = length.state;
    const rotation = nextRange(s, 0, 360);
    s = rotation.state;
    const opacity = nextRange(s, 0.55, 0.95);
    s = opacity.state;
    const toneShift = nextRange(s, -24, 24);
    s = toneShift.state;
    shapes.push({
      kind: kinds[kindPick.value],
      x,
      y,
      size: size.value,
      length: length.value,
      rotation: rotation.value,
      opacity: opacity.value,
      toneShift: toneShift.value,
    });
  }
  return { value: shapes, state: s };
}

// Broad motif: a grid of bold rectilinear blocks separated by thick lines,
// evoking De Stijl neoplasticism rather than any single named painting.
function mondrianShapes(state: RngState): { value: ArtworkShape[]; state: RngState } {
  let s = state;
  const shapes: ArtworkShape[] = [];
  for (const lx of [22, 46, 68]) {
    shapes.push({ kind: "stroke", x: lx, y: 50, size: 3, length: 100, rotation: 90, opacity: 0.9, toneShift: -180 });
  }
  for (const ly of [30, 55, 78]) {
    shapes.push({ kind: "stroke", x: 50, y: ly, size: 3, length: 100, rotation: 0, opacity: 0.9, toneShift: -180 });
  }
  const blockCountPick = nextInt(s, 3, 5);
  s = blockCountPick.state;
  for (let i = 0; i < blockCountPick.value; i++) {
    const x = nextRange(s, 15, 85);
    s = x.state;
    const y = nextRange(s, 15, 85);
    s = y.state;
    const size = nextRange(s, 16, 28);
    s = size.state;
    const toneShift = nextRange(s, -30, 30);
    s = toneShift.state;
    shapes.push({ kind: "square", x: x.value, y: y.value, size: size.value, rotation: 0, opacity: 0.85, toneShift: toneShift.value });
  }
  return { value: shapes, state: s };
}

// Every lot gets its own small abstract composition, generated from the seed
// thread rather than any external asset, so the same seed always reproduces
// the same painting. The composition is only ever a loose, generic nod to a
// broad visual motif associated with the artist — identity itself is carried
// by the name, colour and symbol shown alongside it, never by the art alone.
export function generateArtwork(artist: Artist, state: RngState): { value: ArtworkSpec; state: RngState } {
  const bgOptions = BACKGROUNDS[artist.id];
  const bgPick = nextInt(state, 0, bgOptions.length - 1);
  const background = bgOptions[bgPick.value];

  let shapesResult: { value: ArtworkShape[]; state: RngState };
  if (artist.id === "vangogh") shapesResult = vanGoghShapes(bgPick.state);
  else if (artist.id === "monet") shapesResult = monetShapes(bgPick.state);
  else if (artist.id === "kandinsky") shapesResult = kandinskyShapes(bgPick.state);
  else shapesResult = mondrianShapes(bgPick.state);

  return { value: { background, shapes: shapesResult.value }, state: shapesResult.state };
}

export function shiftColor(hex: string, amount: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, n));
  const num = parseInt(hex.slice(1), 16);
  const r = clamp(((num >> 16) & 0xff) + amount);
  const g = clamp(((num >> 8) & 0xff) + amount);
  const b = clamp((num & 0xff) + amount);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}
