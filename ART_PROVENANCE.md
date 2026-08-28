# Artwork provenance

The twelve lots in this game (`src/game/pixelart.ts`) are original, hand-placed
low-resolution pixel-art pieces created for this project. None of them
reproduce the composition, layout, or any image data of an existing artwork.
Each artist's three pieces take a loose, general thematic cue from one broad,
publicly documented motif associated with a real painter — nothing more
specific than "a swirling night sky" or "a lily pond" — solely so the game's
four fictional in-game "artists" read as distinct visual identities rather than
interchangeable abstract generators.

The four real works referenced for thematic inspiration only:

- Vincent van Gogh, *The Starry Night* (1889) — Museum of Modern Art, New York.
  https://www.moma.org/collection/works/79802
- Claude Monet, *Water Lilies* series (*Nymphéas*, various dates) — Musée de
  l'Orangerie, Paris.
  https://www.musee-orangerie.fr/en/article/water-lilies
- Wassily Kandinsky, *Composition 8* (1923) — Solomon R. Guggenheim Museum,
  New York.
  https://www.guggenheim.org/artwork/1924
- Piet Mondrian, *Broadway Boogie Woogie* (1942–43) — Museum of Modern Art,
  New York.
  https://www.moma.org/collection/works/78682

No image files from these sources, or from any other external source, are
loaded, embedded, or copied anywhere in this repository. All twelve pieces are
plain TypeScript source (colour grids drawn with simple geometric primitives)
authored directly in `src/game/pixelart.ts`, and are rendered locally onto a
`<canvas>` element with no runtime network fetch.
