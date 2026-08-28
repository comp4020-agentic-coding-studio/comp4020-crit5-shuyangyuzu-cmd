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
    <button id="mode-house" aria-pressed="true"></button>
    <button id="mode-auctioneer" aria-pressed="false"></button>
    <div id="auctioneer-label"></div>
    <div id="net-worth-formula"></div>
    <div id="player-cash"></div>
    <div id="market-board"></div>
    <div id="lot-counter"></div>
    <div id="rivals-board"></div>
    <div id="selecting-panel" hidden>
      <div id="hand-cards"></div>
    </div>
    <div id="lot-caption" hidden>
      <span id="artist-swatch"></span>
      <span id="artist-name"></span>
    </div>
    <div class="stage" id="stage" hidden>
      <span class="claim-rail claim-rail-trend"></span>
      <span class="claim-rail claim-rail-value"></span>
      <span class="claim-rail claim-rail-momentum"></span>
      <div class="claim-track claim-track-trend" data-npc="trend"><span class="claim-track-mark"></span></div>
      <div class="claim-track claim-track-value" data-npc="value"><span class="claim-track-mark"></span></div>
      <div class="claim-track claim-track-momentum" data-npc="momentum"><span class="claim-track-mark"></span></div>
      <button type="button" id="artwork-button">
        <svg id="artwork-svg" viewBox="0 0 100 100"></svg>
        <span id="outcome-tag" hidden></span>
        <span id="sold-banner" hidden></span>
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

    // Switch into AUCTIONEER mode, as a player would from the mode switch.
    document.getElementById("mode-auctioneer")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));

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
