# Process overview

A reading-guide to how "GOING, GOING&hellip;" — a Dutch-auction card game about
four historical painters — actually came together.

## What I built

A live-nerve Dutch auction: a price falls continuously on the current lot until
someone claims it, three AI collectors compete for the same 12 lots I do, and
the four artists' market values move with every sale. I built the deterministic
rules engine first, then a played-and-corrected sequence of playtests exposed
that the interface didn't communicate identity, timing, or ownership clearly
enough for a stranger to read the state of the game at a glance — so most of
the work after the MVP was legibility, not new mechanics: making who owns what,
who is about to buy, and why the market moved, all readable without an
instruction screen. Two modes ship: HOUSE, where the bank always sells, and
AUCTIONEER, where the four collectors — including me — take turns selling from
their own hand.

## The moments that mattered

1. **The MVP had to be a deterministic engine before it was a UI.**
   [`bc367c8`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-shuyangyuzu-cmd/commit/bc367c8)
   built the pure rules engine (rng/pricing/market/npc/engine) with focused
   tests for claim exclusivity, single-price deduction, and a tied top rank not
   counting as a win, before any DOM existed —
   [`133d569`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-shuyangyuzu-cmd/commit/133d569)
   then wired that already-tested engine into a live-falling price and a
   WIN/LOSS screen. I verified correctness against the engine's own test suite
   rather than by eyeballing the UI, and confirmed the responsive pass in
   [`2e8bcd5`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-shuyangyuzu-cmd/commit/2e8bcd5)
   against both the 23/23 test count and a real 390x844 viewport, not just the
   typecheck.

2. **Playing a full 12-lot HOUSE game to the end, not reading the code, is
   what actually surfaced the market and legibility problems.**
   After completing a full 12-lot HOUSE game, I observed that the four
   artists' final values felt too uniform regardless of how each lot had
   actually sold, that I couldn't tell at a glance which artist the current
   lot belonged to, and that I couldn't read where an NPC's claim on a lot
   would land in time to react to it. That finished-game observation is what
   led directly to two commits, not a single one:
   [`49ac9b6`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-shuyangyuzu-cmd/commit/49ac9b6)
   replaced the fixed-growth-rate market — every sale bumped a value the same
   amount regardless of outcome, which is exactly what had read as "too
   uniform" — with outcome-driven appreciation: a lot sold above its pre-sale
   value is a PREMIUM, below is a DISCOUNT, and a lot nobody claims is
   genuinely UNSOLD instead of being forced through at a floor price. The same
   commit replaced four generic abstract "Modern Art" artists with four
   historical painters (van Gogh, Monet, Kandinsky, Mondrian).
   [`aacab1b`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-shuyangyuzu-cmd/commit/aacab1b)
   then answered the identity and timing half of the same observation — later
   confirmed by other playtesters hitting the identical confusion — by adding
   `src/game/view.ts`: `buildPublicView()` is the single presentation boundary
   between game state and the DOM, and it structurally omits rival
   cash/collectionValue/netWorth (the object has no such key) until the game
   reaches `finished`, closing every leak path — text, DOM, titles, animation
   — at once instead of finding the next one by hand. I verified the market
   change with focused tests isolating PREMIUM/DISCOUNT/UNSOLD, the market
   floor clamp, and that a tied top rank still doesn't count as a strict win,
   and I verified the privacy fix with a test asserting rival financial
   privacy holds mid-game and is lifted for every collector once the game
   finishes — not by reading the render code and asserting it looked fine.
   The artist identity work continued in
   [`04228e2`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-shuyangyuzu-cmd/commit/04228e2)
   (hand-placed pixel-art lots replacing generated shapes) and
   [`b76a792`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-shuyangyuzu-cmd/commit/b76a792)
   (12 specific, museum-referenced paintings — three per artist — with
   provenance recorded in `ART_PROVENANCE.md` and each acquired lot keeping its
   exact title, year, and price rather than collapsing into a generic artist
   count).

3. **AUCTIONEER mode made ownership confusing, and a separate hands-on
   interaction bug showed the limits of reading the render loop instead of
   clicking through it.**
   [`b32bee9`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-shuyangyuzu-cmd/commit/b32bee9)
   added the rotating AUCTIONEER mode requested during playtesting — a fixed
   YOU/TREND/VALUE/MOMENTUM rotation where each collector auctions from their
   own hand — and routed payments through the acting auctioneer instead of
   always to an implicit bank, since who was actually receiving money had
   become unclear once collectors could sell to each other. That same feature
   then broke interactively in a way no static read of the render function
   would have caught:
   [`e40614a`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-shuyangyuzu-cmd/commit/e40614a)
   fixes a bug where `render()` ran on every animation frame and
   unconditionally rebuilt the AUCTIONEER hand-card buttons whenever the phase
   was "selecting" — destroying and recreating the very DOM node under the
   player's cursor before a click on it could resolve. I only found this by
   actually clicking a hand card during play, not by reading the render loop
   in isolation, so it's a real example of hands-on interaction testing and
   diagnosis. It is not, though, the "finished game" playtest evidence above:
   the bug itself prevented an AUCTIONEER game from progressing normally, so
   it was caught mid-game rather than by completing one. I verified the fix
   with a DOM-level test in `spec/main-ui.test.ts` that dispatches a real
   click after many simulated animation frames — reproducing the original
   failure against the pre-fix code before confirming the fix — and with a
   manual `pnpm dev` walkthrough, since this project has no browser automation
   to record that walkthrough as a test.

4. **NPCs needed to feel like people, not random-number generators, and their
   intentions needed a visible readout.**
   [`a6148d4`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-shuyangyuzu-cmd/commit/a6148d4)
   addressed playtest finding #7 by giving each of the three NPC collectors a
   fixed per-game personality profile (risk tolerance, patience, a named
   discount requirement) held for the whole 12-lot game, rather than a fresh
   random roll on every decision, and named them (Vivienne Hart, Julian Vale,
   Celeste Moreau) so a pattern in their behaviour has a face attached to it.
   [`f2c42c5`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-shuyangyuzu-cmd/commit/f2c42c5)
   then answered playtest finding #1 — that the old horizontal claim tracks
   didn't communicate purchase timing — by replacing them with vertical
   INTEREST meters driven by the exact same `npcTriggers` value the engine
   already uses to decide claims, never a separate visual estimate, so the
   meter can't drift from what the engine will actually do.

5. **The room itself, and the ending, needed the same playtesting discipline
   applied to the whole screen, not just individual widgets.**
   [`bd78557`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-shuyangyuzu-cmd/commit/bd78557)
   is a direct playtest finding — the dark neon interface read as a financial
   dashboard, not an auction room — and rebuilt the palette and layout around
   that without touching game logic or element ids, so I could verify it was a
   pure presentation change against the existing test suite.
   [`5d60a2e`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-shuyangyuzu-cmd/commit/5d60a2e)
   answered playtest finding #5 (the clock started ticking before the player
   was ready) by gating the render loop behind an explicit ENTER AUCTION
   screen, and
   [`0a03977`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-shuyangyuzu-cmd/commit/0a03977)
   answered playtest finding #7 on mobile specifically — the collector
   interest meters sat below the fold and were unreachable while a bid
   decision was live — with a persistent bottom dock below 900px. Finally,
   [`b07bf47...04460e6`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-shuyangyuzu-cmd/compare/b07bf47...04460e6)
   fixed the finished screen leaving live-auction chrome and a growing,
   layout-destabilising collection list on screen after the game ended,
   replacing it with a fixed four-tile artist summary and a `.phase-finished`
   class that actually drops the now-empty COLLECTORS grid row. I verified
   this with a new fake-clock-driven test (`spec/finished-layout.test.ts`)
   that plays a full 12-lot game in both modes through to the finished phase
   and inspects the resulting DOM, rather than relying on a source-code read
   alone; the exact pixel width of the four-column tile row, by contrast, was
   only checked by hand against the CSS values, since this project has no
   browser automation to confirm rendered dimensions directly.
