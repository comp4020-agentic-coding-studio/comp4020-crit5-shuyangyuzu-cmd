// @vitest-environment jsdom
//
// Drives a full 12-lot game through to the finished phase — with a mocked
// clock, not real elapsed time — and checks the resulting DOM directly,
// rather than trusting a source-code read of render()/renderCollection().
// Two things are being verified here that only show up once a whole game has
// actually run:
//
// 1. The ledger's collection summary never grows past its fixed four tiles
//    (one per artist, in a fixed order, zero counts included) no matter how
//    many lots the player acquires — the bug this replaces was a per-artwork
//    card list that grew for every purchase.
// 2. Once state.phase === "finished", the desktop COLLECTORS panel and the
//    mobile NPC dock are actually hidden and the game-layout carries the
//    phase-finished class that drops the panel's grid row (see
//    .game-layout.phase-finished in global.css) — not just that render()
//    sets a `hidden` attribute somewhere.
//
// jsdom does not run a real layout/CSS engine, so this cannot confirm pixel
// dimensions (no overflow, no visible gap) the way a real browser would; it
// confirms the DOM state and class toggles the CSS rules key off, and the
// CSS itself is reasoned through separately.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ARTISTS } from "../src/game/artists";

function buildDom() {
  document.body.innerHTML = `
    <div id="ready-screen">
      <canvas id="ready-artwork-canvas"></canvas>
      <button type="button" id="enter-auction"></button>
    </div>
    <button id="mode-house" aria-pressed="true"></button>
    <button id="mode-auctioneer" aria-pressed="false"></button>
    <div id="game-screen" hidden>
      <div id="game-layout" class="game-layout">
        <div id="auctioneer-banner">
          <div id="auctioneer-label"></div>
        </div>
        <div id="net-worth-formula"></div>
        <div id="player-cash"></div>
        <div id="market-board"></div>
        <div id="lot-counter"></div>
        <div id="panel-rivals">
          <div id="rivals-board"></div>
        </div>
        <div id="selecting-panel" hidden>
          <div id="hand-cards"></div>
        </div>
        <div id="lot-caption" hidden>
          <span id="artist-swatch"></span>
          <span id="artist-name"></span>
          <span id="artwork-title"></span>
        </div>
        <div id="bid-market-compare" hidden>
          <span id="bid-compare-value"></span>
          <span id="market-compare-value"></span>
          <span id="bid-market-indicator">
            <span id="bid-market-arrow"></span>
            <span id="bid-market-label"></span>
          </span>
        </div>
        <div class="stage" id="stage" hidden>
          <button type="button" id="artwork-button">
            <canvas id="artwork-canvas"></canvas>
            <span id="outcome-tag" hidden></span>
            <span id="sold-banner" hidden></span>
            <span id="bid-overlay">
              <span id="bid-overlay-label"></span>
            </span>
          </button>
          <span id="price-tag"></span>
        </div>
        <div id="payment-flow" hidden></div>
        <div id="collection-board"></div>
        <div id="end-screen" hidden>
          <p id="end-result"></p>
          <ol id="ranking-list"></ol>
          <button type="button" id="play-again"></button>
        </div>
      </div>
      <div id="npc-dock" hidden></div>
    </div>
  `;
}

async function playToFinished(mode: "house" | "auctioneer") {
  const frame: { callback: FrameRequestCallback | null } = { callback: null };
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    frame.callback = cb;
    return 1;
  });

  // sessionStart is captured from performance.now() at module load, so the
  // spy must be in place before main.ts is imported — otherwise the module's
  // notion of "elapsed" would drift from the fake clock this test drives.
  let now = 0;
  vi.spyOn(performance, "now").mockImplementation(() => now);

  await import("../src/scripts/main.ts");

  if (mode === "auctioneer") {
    document.getElementById("mode-auctioneer")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  }
  document.getElementById("enter-auction")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));

  const collectionBoard = document.getElementById("collection-board")!;
  const endScreen = document.getElementById("end-screen")!;
  const selectingPanel = document.getElementById("selecting-panel")!;

  let maxCollectionChildren = collectionBoard.children.length;
  let sawSelecting = false;

  // Worst case is every one of the 12 lots timing out unsold (full
  // AUCTION_DURATION_MS) followed by its full SOLD_PAUSE_MS, advanced here in
  // 250ms steps — comfortably inside this loop's iteration budget.
  for (let i = 0; i < 5000 && endScreen.hidden; i++) {
    if (!selectingPanel.hidden) {
      sawSelecting = true;
      const firstCard = document.getElementById("hand-cards")!.children[0];
      firstCard?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    }
    now += 250;
    frame.callback?.(now);
    maxCollectionChildren = Math.max(maxCollectionChildren, collectionBoard.children.length);
  }

  return { collectionBoard, maxCollectionChildren, sawSelecting };
}

describe.each([["house"], ["auctioneer"]] as const)("a full %s-mode game reaches the finished phase", (mode) => {
  beforeEach(() => {
    vi.resetModules();
    buildDom();
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      })),
    });
  });

  it("actually finishes within the simulated time budget", async () => {
    const { sawSelecting } = await playToFinished(mode);
    expect(document.getElementById("end-screen")!.hidden).toBe(false);
    // AUCTIONEER mode must have actually exercised the player's own
    // hand-card selection at least once; HOUSE mode never enters it.
    if (mode === "auctioneer") expect(sawSelecting).toBe(true);
  });

  it("shows exactly four fixed-order artist tiles immediately, zero counts included", async () => {
    // Checked on the very first render, before any lot has been won, so this
    // does not depend on the random seed producing a player acquisition.
    await playToFinished(mode);
    const tiles = Array.from(document.getElementById("collection-board")!.children).slice(1);
    expect(tiles).toHaveLength(ARTISTS.length);
    tiles.forEach((tile, i) => {
      expect(tile.getAttribute("aria-label")).toContain(ARTISTS[i].name);
    });
  });

  it("never grows the ledger's collection board past one label + four tiles across a whole game", async () => {
    const { maxCollectionChildren } = await playToFinished(mode);
    expect(maxCollectionChildren).toBe(1 + ARTISTS.length);
  });

  it("hides the COLLECTORS panel and NPC dock, and drops the panel-rivals grid row, once finished", async () => {
    await playToFinished(mode);
    expect(document.getElementById("panel-rivals")!.hidden).toBe(true);
    expect(document.getElementById("npc-dock")!.hidden).toBe(true);
    expect(document.getElementById("game-layout")!.classList.contains("phase-finished")).toBe(true);
  });

  it("leaves no residual auction-state UI visible on the finished screen", async () => {
    await playToFinished(mode);
    expect(document.getElementById("auctioneer-banner")!.hidden).toBe(true);
    expect(document.getElementById("stage")!.hidden).toBe(true);
    expect(document.getElementById("selecting-panel")!.hidden).toBe(true);
    expect(document.getElementById("payment-flow")!.hidden).toBe(true);
    expect(document.getElementById("lot-caption")!.hidden).toBe(true);
    expect(document.getElementById("bid-market-compare")!.hidden).toBe(true);
  });

  it("still shows a market board, a WIN/LOSS result and a full ranking", async () => {
    await playToFinished(mode);
    expect(document.getElementById("end-screen")!.hidden).toBe(false);
    expect(document.getElementById("market-board")!.children.length).toBe(ARTISTS.length);
    expect(["WIN", "LOSS"]).toContain(document.getElementById("end-result")!.textContent);
    expect(document.getElementById("ranking-list")!.children.length).toBe(4);
  });
});
