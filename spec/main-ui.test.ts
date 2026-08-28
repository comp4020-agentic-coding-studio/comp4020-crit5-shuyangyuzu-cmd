// @vitest-environment jsdom
//
// Reproduces the actual reported bug at the DOM level, not just in the
// engine: main.ts's render loop used to call replaceChildren() on the hand
// card container every single animation frame, destroying and recreating
// the interactive <button> elements while the player was still deciding.
// A click event needs its target node to still exist when the click
// completes, so this test drives many frames — with real event dispatch,
// against the real script — before clicking, exactly like a human pausing
// to choose a card.
//
// No browser-automation dependency was added for this: the project ships
// no Playwright/e2e tooling, and jsdom is already a devDependency. This is
// as close to "click it in a browser" as that constraint allows; a manual
// pnpm dev walkthrough covered the rest and is reported separately.
import { beforeEach, describe, expect, it, vi } from "vitest";

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

describe("AUCTIONEER hand-card buttons survive many render frames before a click", () => {
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

  it("keeps the same button node across frames and still accepts the click", async () => {
    // requestAnimationFrame is stubbed so the module's own render loop never
    // free-runs in real time; the test drives frames explicitly instead.
    const frame: { callback: FrameRequestCallback | null } = { callback: null };
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      frame.callback = cb;
      return 1;
    });

    await import("../src/scripts/main.ts");

    // Switch into AUCTIONEER mode, as a player would from the mode switch,
    // then press ENTER AUCTION as a player would from the ready screen —
    // no game exists, and no render loop runs, until that click.
    document.getElementById("mode-auctioneer")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    document.getElementById("enter-auction")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    const handCards = document.getElementById("hand-cards")!;
    expect(handCards.children).toHaveLength(3);
    const firstButtonBeforeFrames = handCards.children[0];

    // Simulate many animation frames elapsing while the player is still
    // choosing — this is exactly the window during which the old code
    // destroyed and recreated the buttons underneath the player's cursor.
    for (let i = 0; i < 120; i++) {
      frame.callback?.(performance.now());
    }

    expect(handCards.children).toHaveLength(3);
    expect(handCards.children[0]).toBe(firstButtonBeforeFrames);

    firstButtonBeforeFrames.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    // A successful click opens the auction: the selecting panel hides and
    // the auction stage becomes the visible surface.
    expect(document.getElementById("selecting-panel")!.hidden).toBe(true);
    expect(document.getElementById("stage")!.hidden).toBe(false);
  });
});

// This week's playtest finding #5: the auction must not start — clock,
// timers, NPC triggers — before the player is ready. These tests check the
// gating mechanism itself (no GameState/loop before ENTER AUCTION; a mode
// switch drops back to a fresh ready state) rather than just the visible
// screen, since a hidden-but-still-ticking loop would satisfy a purely
// visual check while still violating the finding.
describe("the ready screen gates the auction clock", () => {
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

  it("creates no game and starts no render loop until ENTER AUCTION is clicked", async () => {
    const frame: { callback: FrameRequestCallback | null } = { callback: null };
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      frame.callback = cb;
      return 1;
    });

    await import("../src/scripts/main.ts");

    expect(frame.callback).toBeNull();
    expect(document.getElementById("ready-screen")!.hidden).toBe(false);
    expect(document.getElementById("game-screen")!.hidden).toBe(true);

    // Switching mode before entering must not start a timed auction either.
    document.getElementById("mode-auctioneer")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(frame.callback).toBeNull();
    expect(document.getElementById("game-screen")!.hidden).toBe(true);

    document.getElementById("enter-auction")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(frame.callback).not.toBeNull();
    expect(document.getElementById("ready-screen")!.hidden).toBe(true);
    expect(document.getElementById("game-screen")!.hidden).toBe(false);
  });

  it("returns to the ready screen on a mode switch and stops the loop rather than starting a new timed auction immediately", async () => {
    const frame: { callback: FrameRequestCallback | null } = { callback: null };
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      frame.callback = cb;
      return 1;
    });

    await import("../src/scripts/main.ts");
    document.getElementById("enter-auction")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(document.getElementById("game-screen")!.hidden).toBe(false);

    const inFlightFrame = frame.callback;
    frame.callback = null;

    document.getElementById("mode-auctioneer")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(document.getElementById("game-screen")!.hidden).toBe(true);
    expect(document.getElementById("ready-screen")!.hidden).toBe(false);

    // The frame already scheduled before the switch must not reschedule
    // itself once it fires — the loop stops, it doesn't keep ticking a
    // hidden game.
    inFlightFrame?.(performance.now());
    expect(frame.callback).toBeNull();
  });
});
