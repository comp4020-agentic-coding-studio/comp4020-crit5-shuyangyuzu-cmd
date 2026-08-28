import type { ArtistId } from "./artists";
import type { ArtworkSpec } from "./types";

// Twelve original, hand-placed pixel-art interpretations of twelve specific,
// real, museum-referenced paintings — three per in-game artist. Each piece is
// authored directly as a colour grid with simple geometric primitives (no
// image file, no external fetch, no RNG), but the composition, palette and
// spatial arrangement are deliberately built to be recognisable as that exact
// painting rather than a generic motif. See ART_PROVENANCE.md for the full
// source list (title, year, museum reference URL) this file interprets.
const SIZE = 24;

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

function ring(g: Grid, cx: number, cy: number, r: number, thickness: number, color: string) {
  const outer = r * r;
  const inner = (r - thickness) * (r - thickness);
  for (let y = cy - r; y <= cy + r; y++) {
    for (let x = cx - r; x <= cx + r; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 <= outer && d2 >= inner) set(g, x, y, color);
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

// ============================================================================
// Vincent van Gogh
// ============================================================================

// The Starry Night (1889) — MoMA, New York.
// https://www.moma.org/collection/artists/2206
function starryNight(): ArtworkSpec {
  const SKY_DEEP = "#0b1a3a";
  const SKY_MID = "#132a63";
  const SWIRL = "#f2c94c";
  const SWIRL_SOFT = "#f7dc6f";
  const CYPRESS = "#0d1a12";
  const HILL = "#16233f";
  const WALL = "#2a2118";
  const ROOF = "#a45a35";
  const WINDOW = "#ffe9a8";
  const SPIRE = "#1a140f";

  const g = blankGrid(SKY_DEEP);
  rect(g, 0, 0, 23, 16, SKY_MID);

  // Large spiral stars, each a ring of swirling strokes around a bright core
  // — the picture's signature motif, repeated at three positions.
  const spirals: Array<[number, number, number]> = [
    [5, 4, 3],
    [13, 3, 2],
    [19, 6, 3],
  ];
  for (const [cx, cy, r] of spirals) {
    for (let ring_ = 1; ring_ <= r; ring_++) {
      const steps = 8 + ring_ * 4;
      for (let i = 0; i < steps; i++) {
        const angle = (i / steps) * Math.PI * 2 + ring_ * 0.6;
        const x = Math.round(cx + Math.cos(angle) * ring_ * 1.3);
        const y = Math.round(cy + Math.sin(angle) * ring_);
        set(g, x, y, ring_ === r ? SWIRL_SOFT : SWIRL);
      }
    }
    circle(g, cx, cy, 1, "#fff6d8");
  }

  // Crescent moon, upper right, with its own bright halo.
  circle(g, 20, 3, 2, SWIRL_SOFT);
  set(g, 19, 2, SKY_MID);
  set(g, 19, 3, SKY_MID);

  // A long swirling ribbon of cloud running across the middle sky.
  for (let x = 2; x <= 21; x++) {
    const y = 10 + Math.round(Math.sin(x * 0.6) * 2);
    set(g, x, y, SWIRL_SOFT);
    set(g, x, y + 1, SWIRL);
  }

  // Rolling hills silhouette, then the cypress rising through the whole sky.
  rect(g, 0, 16, 23, 17, HILL);
  for (let x = 0; x < 24; x++) {
    const y = 16 + Math.round(Math.sin(x * 0.5) * 1);
    line(g, x, y, x, 17, HILL);
  }
  for (let y = 5; y <= 20; y++) {
    const width = 1 + Math.round(Math.sin(y * 0.7) + 1);
    rect(g, 2, y, 2 + width, y, CYPRESS);
  }

  // Sleepy village along the base: a spired church flanked by small houses
  // with glowing windows.
  rect(g, 0, 18, 23, 23, "#12203a");
  rect(g, 12, 14, 13, 18, SPIRE);
  set(g, 12, 13, SPIRE);
  for (const houseX of [6, 9, 16, 19, 21]) {
    rect(g, houseX, 19, houseX + 2, 22, WALL);
    rect(g, houseX, 17, houseX + 2, 18, ROOF);
    set(g, houseX + 1, 20, WINDOW);
  }

  return {
    id: "vangogh-starry-night",
    title: "The Starry Night",
    year: 1889,
    sourceUrl: "https://www.moma.org/collection/artists/2206",
    grid: g,
  };
}

// Sunflowers (1888) — National Gallery, London.
// https://www.nationalgallery.org.uk/paintings/vincent-van-gogh-sunflowers
function sunflowers(): ArtworkSpec {
  const BG_TOP = "#e8b93a";
  const BG_BOTTOM = "#d9a52c";
  const VASE = "#c98a2e";
  const VASE_SHADE = "#a86f22";
  const TABLE = "#b8862e";
  const PETAL = "#f2c230";
  const PETAL_DARK = "#e0a81f";
  const CENTER = "#6b4423";
  const CENTER_DARK = "#4a2e17";
  const STEM = "#7a8a3a";

  const g = blankGrid(BG_TOP);
  rect(g, 0, 0, 23, 12, BG_TOP);
  rect(g, 0, 13, 23, 17, BG_BOTTOM);
  rect(g, 0, 18, 23, 23, TABLE);

  // Vase, centred low.
  rect(g, 9, 15, 15, 22, VASE);
  rect(g, 9, 15, 10, 22, VASE_SHADE);
  rect(g, 8, 14, 16, 15, VASE_SHADE);

  // A bouquet of sunflower heads at varying heights and sizes, some upright,
  // some tilted — the picture's rhythm of many blossoms in one vase.
  const heads: Array<[number, number, number]> = [
    [12, 5, 4],
    [6, 8, 3],
    [18, 8, 3],
    [9, 3, 3],
    [16, 4, 3],
    [4, 13, 2],
    [20, 13, 2],
    [12, 11, 3],
  ];
  for (const [cx, cy, r] of heads) {
    line(g, cx, cy + r, cx, 15, STEM);
    circle(g, cx, cy, r, PETAL);
    // Radiating petal notches.
    for (let i = 0; i < 10; i++) {
      const angle = (i / 10) * Math.PI * 2;
      const px = Math.round(cx + Math.cos(angle) * (r + 1));
      const py = Math.round(cy + Math.sin(angle) * (r + 1));
      set(g, px, py, i % 2 === 0 ? PETAL : PETAL_DARK);
    }
    circle(g, cx, cy, Math.max(1, r - 2), CENTER);
    circle(g, cx, cy, Math.max(1, r - 3), CENTER_DARK);
  }

  return {
    id: "vangogh-sunflowers",
    title: "Sunflowers",
    year: 1888,
    sourceUrl: "https://www.nationalgallery.org.uk/paintings/vincent-van-gogh-sunflowers",
    grid: g,
  };
}

// Café Terrace at Night (1888) — Kröller-Müller Museum, Otterlo.
// https://krollermuller.nl/en/vincent-van-gogh-terrace-of-a-cafe-at-night
function cafeTerraceAtNight(): ArtworkSpec {
  const SKY = "#0e2a5c";
  const STAR = "#f2ecc9";
  const AWNING = "#f2c230";
  const AWNING_SHADE = "#d9a52c";
  const WINDOW = "#ffe38a";
  const BUILDING = "#1c2a4a";
  const STREET = "#2a2e3a";
  const STREET_LIGHT = "#4a5068";
  const TABLE = "#233152";
  const FIGURE = "#12182c";

  const g = blankGrid(SKY);
  rect(g, 0, 0, 23, 9, SKY);
  for (const [x, y] of [
    [2, 2],
    [5, 1],
    [9, 3],
    [14, 1],
    [18, 2],
    [21, 4],
    [7, 5],
    [16, 5],
  ]) {
    circle(g, x, y, 1, STAR);
  }

  // The glowing yellow awning over the terrace, dominating the upper-middle.
  rect(g, 3, 8, 18, 11, AWNING);
  rect(g, 3, 11, 18, 12, AWNING_SHADE);
  for (let x = 4; x <= 17; x += 3) rect(g, x, 9, x, 11, AWNING_SHADE);

  // Warmly lit windows above the awning and building silhouettes to the right.
  for (const wx of [5, 9, 13]) rect(g, wx, 5, wx + 1, 7, WINDOW);
  rect(g, 19, 3, 23, 12, BUILDING);
  for (const wy of [4, 7]) rect(g, 20, wy, 22, wy + 1, WINDOW);

  // Cobblestone street receding toward the viewer, with tables under the
  // awning in silhouette.
  rect(g, 0, 12, 23, 23, STREET);
  for (let y = 13; y < 24; y += 2) {
    const spread = Math.round((y - 12) * 0.6);
    line(g, 11 - spread, y, 11 + spread, y, STREET_LIGHT);
  }
  for (const tx of [5, 9, 14]) {
    rect(g, tx, 15, tx + 1, 16, TABLE);
    set(g, tx, 13, FIGURE);
    set(g, tx + 1, 13, FIGURE);
  }

  return {
    id: "vangogh-cafe-terrace",
    title: "Café Terrace at Night",
    year: 1888,
    sourceUrl: "https://krollermuller.nl/en/vincent-van-gogh-terrace-of-a-cafe-at-night",
    grid: g,
  };
}

// ============================================================================
// Claude Monet
// ============================================================================

// Impression, Sunrise (1872) — Musée Marmottan Monet, Paris.
// https://www.marmottan.fr/en/notice/4014
function impressionSunrise(): ArtworkSpec {
  const SKY_HAZE = "#8a9aa8";
  const SKY_WARM = "#c9a58a";
  const WATER = "#6b8494";
  const WATER_DARK = "#4a6272";
  const SUN = "#e8703a";
  const SUN_SOFT = "#f2a05a";
  const BOAT = "#1c2430";
  const CRANE = "#2a3444";

  const g = blankGrid(SKY_HAZE);
  for (let y = 0; y < 12; y++) {
    const t = y / 12;
    set(g, 0, y, y % 2 === 0 ? SKY_WARM : SKY_HAZE);
    rect(g, 0, y, 23, y, t < 0.5 ? SKY_WARM : SKY_HAZE);
  }
  rect(g, 0, 12, 23, 23, WATER);
  for (let y = 12; y < 24; y += 2) rect(g, 0, y, 23, y, WATER_DARK);

  // The bold orange sun and its long vertical reflection — the picture's
  // single strongest focal point.
  circle(g, 12, 8, 3, SUN_SOFT);
  circle(g, 12, 8, 2, SUN);
  for (let y = 11; y < 24; y++) {
    if (y % 2 === 0) set(g, 12, y, SUN_SOFT);
    else set(g, 12, y, SUN);
  }

  // Small dark boats and harbour cranes as silhouettes, scattered low.
  for (const [x, y] of [
    [4, 15],
    [8, 17],
    [17, 16],
    [20, 14],
  ]) {
    rect(g, x, y, x + 2, y + 1, BOAT);
    set(g, x + 1, y - 1, BOAT);
  }
  rect(g, 1, 4, 1, 11, CRANE);
  rect(g, 21, 3, 21, 10, CRANE);

  return {
    id: "monet-impression-sunrise",
    title: "Impression, Sunrise",
    year: 1872,
    sourceUrl: "https://www.marmottan.fr/en/notice/4014",
    grid: g,
  };
}

// Water Lilies (1916–19) — Metropolitan Museum of Art, New York.
// https://www.metmuseum.org/art/collection/search/437137
function waterLilies(): ArtworkSpec {
  const DEEP = "#1f4a4e";
  const MID = "#3f7a74";
  const LIGHT = "#7fb0a2";
  const REFLECT = "#a8cfc4";
  const PAD = "#1c3a2a";
  const PAD_EDGE = "#2f5d3f";
  const FLOWER_PINK = "#e8a0b0";
  const FLOWER_WHITE = "#f2ece3";
  const FLOWER_CORE = "#f2d24a";

  // No sky, no horizon — the whole frame is water, exactly as the mural-scale
  // series depicts, built from soft horizontal bands rather than a single flat
  // colour.
  const g = blankGrid(DEEP);
  for (let y = 0; y < SIZE; y++) {
    const shade = y % 5 === 0 ? REFLECT : y % 3 === 0 ? LIGHT : y % 2 === 0 ? MID : DEEP;
    rect(g, 0, y, 23, y, shade);
  }

  const pads: Array<[number, number, number]> = [
    [4, 5, 2],
    [11, 9, 2],
    [18, 4, 2],
    [7, 14, 3],
    [15, 16, 2],
    [20, 12, 2],
    [3, 19, 2],
    [12, 20, 2],
  ];
  for (const [cx, cy, r] of pads) {
    circle(g, cx, cy, r, PAD_EDGE);
    circle(g, cx, cy, Math.max(1, r - 1), PAD);
  }
  const flowers: Array<[number, number, string]> = [
    [4, 5, FLOWER_PINK],
    [18, 4, FLOWER_WHITE],
    [7, 14, FLOWER_PINK],
    [20, 12, FLOWER_WHITE],
    [12, 20, FLOWER_PINK],
  ];
  for (const [x, y, color] of flowers) {
    circle(g, x, y, 1, color);
    set(g, x, y, FLOWER_CORE);
  }

  return {
    id: "monet-water-lilies",
    title: "Water Lilies",
    year: 1919,
    sourceUrl: "https://www.metmuseum.org/art/collection/search/437137",
    grid: g,
  };
}

// Woman with a Parasol — Madame Monet and Her Son (1875) — National Gallery
// of Art, Washington. https://www.nga.gov/artworks/61379
function womanWithAParasol(): ArtworkSpec {
  const SKY = "#7fb0dd";
  const CLOUD = "#f2f2ec";
  const GRASS_FAR = "#8fae5a";
  const GRASS_NEAR = "#6f9440";
  const DRESS = "#f2f2ec";
  const DRESS_SHADE = "#c9d4dc";
  const PARASOL = "#dce4a0";
  const PARASOL_SHADE = "#a8b070";
  const SKIN = "#e8b98a";
  const HAIR = "#4a2e17";
  const CHILD = "#c9a05a";

  const g = blankGrid(SKY);
  rect(g, 0, 0, 23, 12, SKY);
  // Windblown clouds.
  for (const [x, y, r] of [
    [4, 2, 2],
    [15, 3, 3],
    [20, 5, 2],
  ] as Array<[number, number, number]>) {
    circle(g, x, y, r, CLOUD);
  }
  rect(g, 0, 13, 23, 17, GRASS_FAR);
  rect(g, 0, 18, 23, 23, GRASS_NEAR);
  for (let x = 0; x < 24; x += 2) set(g, x, 13 + (x % 3), "#7fa04a");

  // The central figure: windblown white dress, parasol tilted above and
  // behind her head, small child figure at a distance to one side.
  const cx = 12;
  circle(g, cx, 6, 2, SKIN);
  set(g, cx, 5, HAIR);
  rect(g, cx - 3, 8, cx + 3, 18, DRESS);
  rect(g, cx - 3, 13, cx - 1, 18, DRESS_SHADE);
  rect(g, cx + 1, 8, cx + 4, 12, DRESS_SHADE);

  circle(g, cx + 1, 3, 5, PARASOL);
  circle(g, cx + 1, 3, 5, PARASOL_SHADE);
  circle(g, cx + 1, 4, 4, PARASOL);
  line(g, cx + 1, 4, cx + 1, 8, "#4a2e17");

  circle(g, 5, 15, 1, SKIN);
  rect(g, 4, 16, 6, 19, CHILD);

  return {
    id: "monet-woman-with-a-parasol",
    title: "Woman with a Parasol — Madame Monet and Her Son",
    year: 1875,
    sourceUrl: "https://www.nga.gov/artworks/61379",
    grid: g,
  };
}

// ============================================================================
// Wassily Kandinsky
// ============================================================================

// Composition 8 (1923) — Solomon R. Guggenheim Museum, New York.
// https://www.guggenheim.org/artwork/1924
function composition8(): ArtworkSpec {
  const BG = "#f2ead9";
  const BLACK = "#171310";
  const RED = "#c0392b";
  const BLUE = "#2a6fa8";
  const YELLOW = "#e8b93a";
  const GREEN = "#4a7a5a";
  const PLUM = "#7a4a8a";

  const g = blankGrid(BG);

  // Diagonal lines radiating from the large ringed circle, a defining
  // structural device of the painting.
  for (const [x0, y0, x1, y1] of [
    [0, 0, 23, 23],
    [0, 23, 23, 0],
    [0, 8, 23, 8],
    [8, 0, 8, 23],
  ] as Array<[number, number, number, number]>) {
    line(g, x0, y0, x1, y1, BLACK);
  }

  // The large black-ringed circle, upper-left, the picture's visual anchor.
  ring(g, 6, 6, 4, 2, BLACK);
  circle(g, 6, 6, 1, YELLOW);

  // A checkerboard block, lower-right.
  for (let y = 15; y <= 20; y++) {
    for (let x = 15; x <= 20; x++) {
      if ((x + y) % 2 === 0) set(g, x, y, BLACK);
    }
  }

  // A wedge/triangle and scattered small circles across the field.
  for (let i = 0; i <= 5; i++) rect(g, 16 - i, 5 + i, 16 + i, 5 + i, i % 2 === 0 ? RED : YELLOW);
  circle(g, 4, 17, 2, BLUE);
  circle(g, 19, 3, 1, GREEN);
  circle(g, 11, 14, 1, PLUM);
  circle(g, 2, 10, 1, RED);

  return {
    id: "kandinsky-composition-8",
    title: "Composition 8",
    year: 1923,
    sourceUrl: "https://www.guggenheim.org/artwork/1924",
    grid: g,
  };
}

// Yellow-Red-Blue (1925) — Centre Pompidou, Paris.
// https://www.centrepompidou.fr
function yellowRedBlue(): ArtworkSpec {
  const YELLOW = "#e8c020";
  const DARK = "#1c2030";
  const RED = "#c0392b";
  const BLUE = "#2a5fa0";
  const BLACK = "#171310";
  const CREAM = "#f2ead9";

  const g = blankGrid(CREAM);

  // The canvas's defining left/right split: a broad yellow field on the
  // left, a darker field on the right.
  rect(g, 0, 0, 9, 23, YELLOW);
  rect(g, 10, 0, 23, 23, DARK);

  // The large red circle straddling the divide.
  circle(g, 11, 11, 6, RED);
  circle(g, 11, 11, 4, "#d9584a");

  // A black checkerboard corner and thin diagonal lines crossing the blue
  // field, plus a small blue wedge on the yellow side.
  for (let y = 0; y <= 5; y++) {
    for (let x = 18; x <= 23; x++) {
      if ((x + y) % 2 === 0) set(g, x, y, BLACK);
    }
  }
  line(g, 10, 23, 23, 12, "#3a4560");
  line(g, 12, 0, 23, 18, "#3a4560");
  rect(g, 2, 15, 6, 19, BLUE);

  return {
    id: "kandinsky-yellow-red-blue",
    title: "Yellow-Red-Blue",
    year: 1925,
    sourceUrl: "https://www.centrepompidou.fr",
    grid: g,
  };
}

// Several Circles (1926) — Solomon R. Guggenheim Museum, New York.
// https://www.guggenheim.org
function severalCircles(): ArtworkSpec {
  const BG = "#14161e";
  const CIRCLES: Array<[number, number, number, string]> = [
    [5, 5, 4, "#2a6fa8"],
    [10, 9, 3, "#c0392b"],
    [15, 6, 5, "#7a4a8a"],
    [8, 15, 4, "#e8b93a"],
    [17, 15, 3, "#4a7a5a"],
    [3, 18, 2, "#2a6fa8"],
    [20, 20, 3, "#c0392b"],
    [12, 20, 2, "#e8ead9"],
  ];

  const g = blankGrid(BG);
  // Many overlapping circles of varying size and colour, drifting diagonally
  // across the field — later circles drawn on top of earlier ones, exactly
  // as the painting layers translucent discs.
  for (const [cx, cy, r, color] of CIRCLES) {
    ring(g, cx, cy, r, 1, color);
    circle(g, cx, cy, Math.max(1, r - 2), color);
  }

  return {
    id: "kandinsky-several-circles",
    title: "Several Circles",
    year: 1926,
    sourceUrl: "https://www.guggenheim.org",
    grid: g,
  };
}

// ============================================================================
// Piet Mondrian
// ============================================================================

// The Grey Tree (1911) — Kunstmuseum Den Haag.
// https://www.kunstmuseum.nl/en/collection/grey-tree
function theGreyTree(): ArtworkSpec {
  const BG = "#e4e0d4";
  const TRUNK_DARK = "#2a2a2a";
  const TRUNK_MID = "#5a5a54";
  const TRUNK_LIGHT = "#8a8a80";

  const g = blankGrid(BG);

  // An organic, curving trunk and branch structure — deliberately unlike the
  // two grid-based Mondrian pieces below, since this is his pre-neoplastic,
  // representational period.
  line(g, 12, 23, 12, 14, TRUNK_DARK);
  line(g, 12, 18, 6, 10, TRUNK_MID);
  line(g, 12, 16, 18, 8, TRUNK_MID);
  line(g, 12, 14, 10, 5, TRUNK_LIGHT);
  line(g, 12, 14, 15, 4, TRUNK_LIGHT);
  line(g, 6, 10, 2, 6, TRUNK_LIGHT);
  line(g, 6, 10, 3, 14, TRUNK_LIGHT);
  line(g, 18, 8, 21, 5, TRUNK_LIGHT);
  line(g, 18, 8, 21, 12, TRUNK_LIGHT);
  line(g, 10, 5, 8, 1, TRUNK_LIGHT);
  line(g, 15, 4, 17, 0, TRUNK_LIGHT);

  for (const [x, y] of [
    [8, 1],
    [17, 0],
    [2, 6],
    [21, 5],
    [3, 14],
    [21, 12],
  ]) {
    set(g, x, y, TRUNK_DARK);
  }

  return {
    id: "mondrian-the-grey-tree",
    title: "The Grey Tree",
    year: 1911,
    sourceUrl: "https://www.kunstmuseum.nl/en/collection/grey-tree",
    grid: g,
  };
}

// Composition with Red, Blue, Black, Yellow, and Gray (1921) — MoMA, New York.
// https://www.moma.org/collection/works/79002
function compositionRedBlueYellow(): ArtworkSpec {
  const BG = "#f2efe6";
  const BLACK = "#171310";
  const RED = "#c0392b";
  const BLUE = "#2a5fa0";
  const YELLOW = "#e8c94a";
  const GRAY = "#c9c4b8";

  const g = blankGrid(BG);

  // Thick, unevenly spaced black grid lines — classic neoplastic structure —
  // dividing the canvas into a handful of large, mostly-white rectangles
  // plus a few coloured ones.
  const verticals = [6, 15, 19];
  const horizontals = [8, 17];
  for (const x of verticals) rect(g, x, 0, x + 1, 23, BLACK);
  for (const y of horizontals) rect(g, 0, y, 23, y + 1, BLACK);

  rect(g, 16, 0, 22, 7, RED);
  rect(g, 0, 9, 5, 16, GRAY);
  rect(g, 7, 18, 14, 23, BLUE);
  rect(g, 16, 18, 22, 23, YELLOW);

  return {
    id: "mondrian-composition-red-blue-yellow",
    title: "Composition with Red, Blue, Black, Yellow, and Gray",
    year: 1921,
    sourceUrl: "https://www.moma.org/collection/works/79002",
    grid: g,
  };
}

// Broadway Boogie Woogie (1942–43) — MoMA, New York.
// https://www.moma.org/collection/works/78682
function broadwayBoogieWoogie(): ArtworkSpec {
  const BG = "#f4efe4";
  const YELLOW = "#e8c94a";
  const RED = "#c0392b";
  const BLUE = "#2a5fa0";
  const GRAY = "#8a8478";

  const g = blankGrid(BG);

  // Yellow lines rather than black — the picture's key departure from his
  // earlier neoplastic grids — running in a dense, city-block rhythm, with
  // small coloured squares dotting the lines like traffic lights.
  const verticals = [3, 7, 11, 15, 19];
  const horizontals = [4, 9, 14, 19];
  for (const x of verticals) rect(g, x, 0, x, 23, YELLOW);
  for (const y of horizontals) rect(g, 0, y, 23, y, YELLOW);

  const blocks: Array<[number, number, string]> = [
    [3, 4, "r"],
    [7, 9, "b"],
    [11, 4, "g"],
    [15, 14, "r"],
    [19, 9, "b"],
    [3, 14, "b"],
    [11, 19, "r"],
    [19, 19, "g"],
    [7, 14, "r"],
    [15, 4, "b"],
  ];
  for (const [x, y, tone] of blocks) {
    const color = tone === "r" ? RED : tone === "b" ? BLUE : GRAY;
    rect(g, x - 1, y - 1, x + 1, y + 1, color);
  }

  return {
    id: "mondrian-broadway-boogie-woogie",
    title: "Broadway Boogie Woogie",
    year: 1943,
    sourceUrl: "https://www.moma.org/collection/works/78682",
    grid: g,
  };
}

const PIECES: Record<ArtistId, ArtworkSpec[]> = {
  vangogh: [starryNight(), sunflowers(), cafeTerraceAtNight()],
  monet: [impressionSunrise(), waterLilies(), womanWithAParasol()],
  kandinsky: [composition8(), yellowRedBlue(), severalCircles()],
  mondrian: [theGreyTree(), compositionRedBlueYellow(), broadwayBoogieWoogie()],
};

export function pickArtwork(artistId: ArtistId, variant: number): ArtworkSpec {
  const pieces = PIECES[artistId];
  return pieces[variant % pieces.length];
}

export function allArtworks(): Array<{ artistId: ArtistId } & ArtworkSpec> {
  return (Object.keys(PIECES) as ArtistId[]).flatMap((artistId) =>
    PIECES[artistId].map((piece) => ({ artistId, ...piece })),
  );
}
