# Artwork provenance

The twelve lots in this game (`src/game/pixelart.ts`) are original, hand-placed
low-resolution pixel-art *interpretations* of twelve specific, real,
museum-held paintings — three per in-game artist. Each interpretation is
authored directly as a colour grid (`rect`/`circle`/`ring`/`line`/`set`
primitives, no image data, no RNG) and deliberately preserves that painting's
recognisable subject, palette, and major spatial arrangement. None of these
pieces copy any source image file, museum branding, or website UI; each is an
original low-resolution reading of the composition, built for visual study.

## Vincent van Gogh

- *The Starry Night* (1889) — Museum of Modern Art, New York.
  https://www.moma.org/collection/artists/2206
- *Sunflowers* (1888) — The National Gallery, London.
  https://www.nationalgallery.org.uk/paintings/vincent-van-gogh-sunflowers
- *Café Terrace at Night* (1888) — Kröller-Müller Museum, Otterlo.
  https://krollermuller.nl/en/vincent-van-gogh-terrace-of-a-cafe-at-night

## Claude Monet

- *Impression, Sunrise* (1872) — Musée Marmottan Monet, Paris.
  https://www.marmottan.fr/en/notice/4014
- *Water Lilies* (1916–19) — Metropolitan Museum of Art, New York.
  https://www.metmuseum.org/art/collection/search/437137
- *Woman with a Parasol — Madame Monet and Her Son* (1875) — National Gallery
  of Art, Washington.
  https://www.nga.gov/artworks/61379

## Wassily Kandinsky

- *Composition 8* (1923) — Solomon R. Guggenheim Museum, New York.
  https://www.guggenheim.org/artwork/1924
- *Yellow-Red-Blue* (1925) — Centre Pompidou, Paris.
  https://www.centrepompidou.fr
- *Several Circles* (1926) — Solomon R. Guggenheim Museum, New York.
  https://www.guggenheim.org

## Piet Mondrian

- *The Grey Tree* (1911) — Kunstmuseum Den Haag.
  https://www.kunstmuseum.nl/en/collection/grey-tree
- *Composition with Red, Blue, Black, Yellow, and Gray* (1921) — Museum of
  Modern Art, New York.
  https://www.moma.org/collection/works/79002
- *Broadway Boogie Woogie* (1942–43) — Museum of Modern Art, New York.
  https://www.moma.org/collection/works/78682

## What was and wasn't used

Each museum reference above was consulted only for visual study (subject
matter, palette, composition, rhythm) while authoring an original pixel grid
by hand — never fetched at runtime, never embedded, never redistributed. No
image files from these or any other external source are loaded, embedded, or
copied anywhere in this repository. All twelve pieces are plain TypeScript
source authored directly in `src/game/pixelart.ts`, rendered locally onto a
`<canvas>` element with `image-rendering: pixelated` and no runtime network
fetch. Structured metadata for every piece (`id`, `title`, `year`, `sourceUrl`)
lives alongside each grid in that same file and is surfaced through
`pickArtwork`/`allArtworks`.
