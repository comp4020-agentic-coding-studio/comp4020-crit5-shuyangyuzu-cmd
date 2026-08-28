import type { ArtistId } from "./artists";
import type { ArtworkSpec } from "./types";

// Every lot's artwork is a small, hand-placed pixel grid — fixed at build
// time, not sampled from noise — so each piece reads as an intentional
// composition rather than generic abstract texture. Three original pieces
// per artist, each only a loose nod to one broad, publicly documented motif
// associated with that artist (a swirling night sky, a lily pond, bold
// geometric abstraction, a coloured traffic grid): no specific painting's
// exact layout is reproduced, and no external image asset is loaded or
// copied. See ART_PROVENANCE.md for the four real works these are inspired
// by, with their canonical titles and museum URLs.
const SIZE = 20;

type Grid = string[][];

function blankGrid(bg: string): Grid {
  return Array.from({ length: SIZE }, () => Array<string>(SIZE).fill(bg));
}

function set(g: Grid, x: number, y: number, color: string) {
  if (y >= 0 && y < g.length && x >= 0 && x < g[0].length) g[y][x] = color;
}

function rect(g: Grid, x0: number, y0: number, x1: number, y1: number, color: string) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(g, x, y, color);
}

function circle(g: Grid, cx: number, cy: number, r: number, color: string) {
  const r2 = r * r;
  for (let y = cy - r; y <= cy + r; y++) {
    for (let x = cx - r; x <= cx + r; x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= r2) set(g, x, y, color);
    }
  }
}

function line(g: Grid, x0: number, y0: number, x1: number, y1: number, color: string) {
  let cx = x0;
  let cy = y0;
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    set(g, cx, cy, color);
    if (cx === x1 && cy === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      cx += sx;
    }
    if (e2 <= dx) {
      err += dx;
      cy += sy;
    }
  }
}

// --- Vincent van Gogh: a swirling night sky over a cypress and a hillside
// village, evoking Starry Night's motif without copying its composition. ---

function vanGoghPiece(title: string, moon: [number, number], cypressX: number, swirlBands: number): ArtworkSpec {
  const SKY_DEEP = "#0b1a3a";
  const SKY_MID = "#14275c";
  const SKY_LIGHT = "#3a5aa0";
  const SWIRL = "#f2c94c";
  const SWIRL_SOFT = "#f7dc6f";
  const CYPRESS = "#0d1a12";
  const ROOF = "#a45a35";
  const WALL = "#2a2118";
  const WINDOW = "#ffe9a8";

  const g = blankGrid(SKY_DEEP);
  rect(g, 0, 0, 19, 13, SKY_MID);

  for (let band = 0; band < swirlBands; band++) {
    const cx = 6 + band * 4;
    const cy = 4 + (band % 2) * 3;
    for (let r = 1; r <= 3; r++) {
      const steps = 10 + r * 2;
      for (let i = 0; i < steps; i++) {
        const angle = (i / steps) * Math.PI * 2 + band;
        const x = Math.round(cx + Math.cos(angle) * r * 1.3);
        const y = Math.round(cy + Math.sin(angle) * r);
        set(g, x, y, r === 3 ? SWIRL_SOFT : SWIRL);
      }
    }
  }
  circle(g, moon[0], moon[1], 2, SWIRL_SOFT);
  circle(g, moon[0], moon[1], 1, "#fff6d8");

  rect(g, 0, 12, 19, 13, SKY_LIGHT);
  rect(g, cypressX, 6, cypressX + 1, 14, CYPRESS);
  for (let y = 6; y <= 13; y += 2) rect(g, cypressX - 1, y, cypressX + 2, y, CYPRESS);

  rect(g, 0, 14, 19, 19, "#111b2e");
  for (const houseX of [2, 6, 10, 14, 17]) {
    rect(g, houseX, 15, houseX + 2, 17, WALL);
    rect(g, houseX, 13, houseX + 2, 14, ROOF);
    set(g, houseX + 1, 16, WINDOW);
  }

  return { title, grid: g };
}

// --- Claude Monet: a lily pond with floating pads and soft horizontal
// reflection, evoking Water Lilies without copying its exact arrangement. ---

function monetPiece(
  title: string,
  waterTone: string,
  padSpots: Array<[number, number, number]>,
  flowerSpots: Array<[number, number]>,
): ArtworkSpec {
  const DEEP = "#234a4e";
  const MID = waterTone;
  const LIGHT = "#8fc0b2";
  const PAD = "#1f3d2b";
  const PAD_EDGE = "#2f5d3f";
  const FLOWER = "#e8a0b0";
  const FLOWER_CORE = "#f2ece3";

  const g = blankGrid(DEEP);
  for (let y = 0; y < SIZE; y++) {
    const shade = y % 4 === 0 ? LIGHT : y % 2 === 0 ? MID : DEEP;
    rect(g, 0, y, 19, y, shade);
  }

  for (const [cx, cy, r] of padSpots) {
    circle(g, cx, cy, r, PAD_EDGE);
    circle(g, cx, cy, Math.max(1, r - 1), PAD);
  }
  for (const [x, y] of flowerSpots) {
    circle(g, x, y, 1, FLOWER);
    set(g, x, y, FLOWER_CORE);
  }

  return { title, grid: g };
}

// --- Wassily Kandinsky: bold circles, triangles and crossing lines on a
// pale ground, evoking Composition 8's geometric abstraction. ---

function kandinskyPiece(
  title: string,
  bigCircle: [number, number, number, string],
  triangle: [number, number, number],
  lines: Array<[number, number, number, number]>,
  smallDots: Array<[number, number, string]>,
): ArtworkSpec {
  const BG = "#f2ead9";
  const BLACK = "#171310";
  const RED = "#c0392b";
  const BLUE = "#2a6fa8";
  const YELLOW = "#e8b93a";
  const PLUM = "#7a4a8a";

  const g = blankGrid(BG);
  for (const [x0, y0, x1, y1] of lines) line(g, x0, y0, x1, y1, BLACK);

  const [cx, cy, r, ccolor] = bigCircle;
  circle(g, cx, cy, r, ccolor);
  circle(g, cx, cy, Math.max(1, r - 2), BG);
  circle(g, cx, cy, 1, BLACK);

  const [tx, ty, ts] = triangle;
  for (let i = 0; i <= ts; i++) {
    rect(g, tx - i, ty + i, tx + i, ty + i, i % 3 === 0 ? RED : YELLOW);
  }

  for (const [x, y, color] of smallDots) circle(g, x, y, 1, color);
  set(g, 3, 16, PLUM);
  set(g, 16, 3, BLUE);

  return { title, grid: g };
}

// --- Piet Mondrian: a yellow traffic grid dotted with small colour
// blocks, evoking Broadway Boogie Woogie rather than the black-line grids
// of Mondrian's earlier neoplastic work. ---

function mondrianPiece(title: string, verticals: number[], horizontals: number[], blocks: Array<[number, number, string]>): ArtworkSpec {
  const BG = "#f4efe4";
  const YELLOW = "#e8c94a";
  const RED = "#c0392b";
  const BLUE = "#2a5fa0";
  const GRAY = "#8a8478";

  const g = blankGrid(BG);
  for (const x of verticals) rect(g, x, 0, x, 19, YELLOW);
  for (const y of horizontals) rect(g, 0, y, 19, y, YELLOW);
  for (const [x, y, tone] of blocks) {
    const color = tone === "r" ? RED : tone === "b" ? BLUE : GRAY;
    rect(g, x, y, x + 1, y + 1, color);
  }

  return { title, grid: g };
}

const PIECES: Record<ArtistId, ArtworkSpec[]> = {
  vangogh: [
    vanGoghPiece("Swirling Night", [15, 3], 2, 4),
    vanGoghPiece("Cypress Watch", [16, 2], 4, 3),
    vanGoghPiece("Village Under Stars", [3, 2], 16, 5),
  ],
  monet: [
    monetPiece(
      "Lily Pond",
      "#3f7a74",
      [
        [4, 6, 2],
        [10, 10, 2],
        [15, 5, 2],
        [7, 14, 2],
      ],
      [
        [4, 6],
        [15, 5],
      ],
    ),
    monetPiece(
      "Morning Reflection",
      "#2f5d62",
      [
        [5, 4, 2],
        [13, 8, 2],
        [9, 15, 2],
      ],
      [[13, 8]],
    ),
    monetPiece(
      "Water Garden",
      "#4a8378",
      [
        [3, 9, 2],
        [8, 13, 3],
        [14, 15, 2],
        [16, 9, 1],
      ],
      [
        [8, 13],
        [16, 9],
        [3, 9],
      ],
    ),
  ],
  kandinsky: [
    kandinskyPiece(
      "Circles and Lines",
      [5, 5, 3, "#c0392b"],
      [14, 12, 4],
      [
        [0, 0, 19, 19],
        [0, 19, 19, 0],
        [0, 10, 19, 10],
      ],
      [
        [10, 4, "#e8b93a"],
        [3, 15, "#2a6fa8"],
      ],
    ),
    kandinskyPiece(
      "Grid and Arc",
      [15, 6, 4, "#2a6fa8"],
      [4, 14, 3],
      [
        [0, 4, 19, 4],
        [0, 8, 19, 8],
        [0, 12, 19, 12],
        [4, 0, 4, 19],
        [12, 0, 12, 19],
      ],
      [
        [8, 16, "#c0392b"],
        [17, 17, "#e8b93a"],
        [2, 2, "#c0392b"],
      ],
    ),
    kandinskyPiece(
      "Points of Tension",
      [9, 9, 5, "#e8b93a"],
      [16, 4, 3],
      [
        [0, 15, 19, 3],
        [0, 3, 19, 15],
      ],
      [
        [3, 3, "#c0392b"],
        [16, 16, "#2a6fa8"],
        [3, 16, "#c0392b"],
        [16, 6, "#e8b93a"],
      ],
    ),
  ],
  mondrian: [
    mondrianPiece(
      "Grid Lights",
      [5, 10, 15],
      [6, 13],
      [
        [5, 6, "r"],
        [15, 13, "b"],
        [10, 13, "g"],
        [5, 13, "b"],
      ],
    ),
    mondrianPiece(
      "City Pulse",
      [4, 9, 13, 17],
      [5, 11, 16],
      [
        [13, 16, "r"],
        [17, 16, "b"],
        [13, 11, "g"],
        [17, 11, "r"],
        [4, 5, "b"],
      ],
    ),
    mondrianPiece(
      "Avenue Flow",
      [7, 14],
      [3, 9, 15],
      [
        [7, 3, "r"],
        [14, 9, "b"],
        [7, 15, "g"],
        [14, 3, "g"],
        [0, 9, "r"],
      ],
    ),
  ],
};

export function pickArtwork(artistId: ArtistId, variant: number): ArtworkSpec {
  const pieces = PIECES[artistId];
  return pieces[variant % pieces.length];
}

export function allArtworkTitles(): Array<{ artistId: ArtistId; title: string }> {
  return (Object.keys(PIECES) as ArtistId[]).flatMap((artistId) =>
    PIECES[artistId].map((piece) => ({ artistId, title: piece.title })),
  );
}
