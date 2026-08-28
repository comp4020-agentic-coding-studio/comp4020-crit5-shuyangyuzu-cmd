import {
  ARTISTS,
  attemptPlayerClaim,
  computeResults,
  createGame,
  isPlayerWinner,
  selectLotCard,
  tick,
  type GameState,
} from "../game/engine";
import { LOT_COUNT } from "../game/lots";
import { portfolioValue } from "../game/market";
import { NPC_NAMES } from "../game/npc";
import { allArtworks } from "../game/pixelart";
import { priceAtTime } from "../game/pricing";
import { NPC_IDS, type CollectorId, type GameMode, type LotOutcome, type NpcId } from "../game/types";
import { buildPublicView } from "../game/view";

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
if (reduceMotion) document.body.classList.add("reduce-motion");

const COLLECTOR_LABELS: Record<CollectorId, string> = {
  player: "YOU",
  ...NPC_NAMES,
};

// A restrained collector palette, distinct from the artist palette (which
// uses gold/blue/purple/red) so a collector's identity colour never gets
// mistaken for an artist's.
const NPC_MONOGRAM: Record<NpcId, string> = { trend: "VH", value: "JV", momentum: "CM" };
const NPC_COLOR: Record<NpcId, string> = { trend: "#8a3648", value: "#274766", momentum: "#3a5443" };

function auctioneerLabel(auctioneer: CollectorId | "house"): string {
  return auctioneer === "house" ? "HOUSE" : COLLECTOR_LABELS[auctioneer];
}

const els = {
  modeHouse: document.getElementById("mode-house")! as HTMLButtonElement,
  modeAuctioneer: document.getElementById("mode-auctioneer")! as HTMLButtonElement,
  readyScreen: document.getElementById("ready-screen")! as HTMLElement,
  gameScreen: document.getElementById("game-screen")! as HTMLElement,
  enterAuction: document.getElementById("enter-auction")! as HTMLButtonElement,
  auctioneerBanner: document.getElementById("auctioneer-banner")!,
  auctioneerLabel: document.getElementById("auctioneer-label")!,
  netWorthFormula: document.getElementById("net-worth-formula")!,
  cash: document.getElementById("player-cash")!,
  marketBoard: document.getElementById("market-board")!,
  lotCounter: document.getElementById("lot-counter")!,
  panelRivals: document.getElementById("panel-rivals")!,
  rivalsBoard: document.getElementById("rivals-board")!,
  selectingPanel: document.getElementById("selecting-panel")!,
  handCards: document.getElementById("hand-cards")!,
  lotCaption: document.getElementById("lot-caption")!,
  artistSwatch: document.getElementById("artist-swatch")!,
  artistName: document.getElementById("artist-name")!,
  artworkTitle: document.getElementById("artwork-title")!,
  artworkButton: document.getElementById("artwork-button")! as HTMLButtonElement,
  artworkCanvas: document.getElementById("artwork-canvas")! as HTMLCanvasElement,
  outcomeTag: document.getElementById("outcome-tag")!,
  soldBanner: document.getElementById("sold-banner")!,
  bidOverlay: document.getElementById("bid-overlay")!,
  bidOverlayLabel: document.getElementById("bid-overlay-label")!,
  bidMarketCompare: document.getElementById("bid-market-compare")! as HTMLElement,
  bidCompareValue: document.getElementById("bid-compare-value")!,
  marketCompareValue: document.getElementById("market-compare-value")!,
  bidMarketIndicator: document.getElementById("bid-market-indicator")!,
  bidMarketArrow: document.getElementById("bid-market-arrow")!,
  bidMarketLabel: document.getElementById("bid-market-label")!,
  priceTag: document.getElementById("price-tag")!,
  paymentFlow: document.getElementById("payment-flow")!,
  collectionBoard: document.getElementById("collection-board")!,
  stage: document.getElementById("stage")! as HTMLElement,
  endScreen: document.getElementById("end-screen")!,
  endResult: document.getElementById("end-result")!,
  rankingList: document.getElementById("ranking-list")!,
  playAgain: document.getElementById("play-again")! as HTMLButtonElement,
  readyArtworkCanvas: document.getElementById("ready-artwork-canvas")! as HTMLCanvasElement,
  npcDock: document.getElementById("npc-dock")! as HTMLElement,
  gameLayout: document.getElementById("game-layout")! as HTMLElement,
};

interface CollectorPanelEls {
  root: HTMLElement;
  auctioneerFlag: HTMLElement;
  tileCounts: Partial<Record<string, HTMLElement>>;
  meter: HTMLElement;
  meterFill: HTMLElement;
}

const rivalPanels = {} as Record<NpcId, CollectorPanelEls>;

// Built once — the NPC roster (id, name, monogram, colour) never changes
// across a restart, only the session profile behind each one does. Rebuilding
// this structure every animation frame was exactly the bug that made
// AUCTIONEER hand cards unclickable, so per-frame updates below only ever
// touch text/attributes on these already-built nodes.
function buildRivalPanels() {
  els.rivalsBoard.replaceChildren();
  for (const npcId of NPC_IDS) {
    const root = document.createElement("div");
    root.className = "collector-panel";
    root.style.setProperty("--collector-color", NPC_COLOR[npcId]);

    const identity = document.createElement("div");
    identity.className = "collector-identity";

    const avatar = document.createElement("span");
    avatar.className = "collector-avatar";
    avatar.textContent = NPC_MONOGRAM[npcId];
    avatar.setAttribute("aria-hidden", "true");
    identity.appendChild(avatar);

    const nameWrap = document.createElement("span");
    nameWrap.className = "collector-name-wrap";
    const name = document.createElement("span");
    name.className = "collector-name";
    name.textContent = NPC_NAMES[npcId];
    nameWrap.appendChild(name);
    const auctioneerFlag = document.createElement("span");
    auctioneerFlag.className = "collector-auctioneer-flag";
    auctioneerFlag.textContent = "AUCTIONEER";
    auctioneerFlag.hidden = true;
    nameWrap.appendChild(auctioneerFlag);
    identity.appendChild(nameWrap);
    root.appendChild(identity);

    const collectionWrap = document.createElement("div");
    collectionWrap.className = "collector-collection";
    const tileCounts: Partial<Record<string, HTMLElement>> = {};
    for (const artist of ARTISTS) {
      const tile = document.createElement("span");
      tile.className = "collector-tile";
      tile.style.setProperty("--artist-color", artist.color);
      const swatch = document.createElement("span");
      swatch.className = `swatch swatch-${artist.symbol}`;
      tile.appendChild(swatch);
      const count = document.createElement("span");
      count.textContent = "0";
      tile.appendChild(count);
      collectionWrap.appendChild(tile);
      tileCounts[artist.id] = count;
    }
    root.appendChild(collectionWrap);

    const meterWrap = document.createElement("div");
    meterWrap.className = "collector-meter-wrap";
    const meterLabel = document.createElement("span");
    meterLabel.className = "collector-meter-label";
    meterLabel.textContent = "INTEREST";
    meterWrap.appendChild(meterLabel);
    const meter = document.createElement("span");
    meter.className = "collector-meter collector-meter-inactive";
    meter.setAttribute("aria-hidden", "true");
    const meterFill = document.createElement("span");
    meterFill.className = "collector-meter-fill";
    meter.appendChild(meterFill);
    meterWrap.appendChild(meter);
    root.appendChild(meterWrap);

    els.rivalsBoard.appendChild(root);
    rivalPanels[npcId] = { root, auctioneerFlag, tileCounts, meter, meterFill };
  }
}

buildRivalPanels();

const dockPanels = {} as Record<NpcId, CollectorPanelEls>;

// Playtest finding #7: on mobile the NPC INTEREST meters used to live only
// inside the COLLECTORS panel at the bottom of the page, below the fold
// during the exact moment a player is deciding whether to bid. This builds
// a second, compact copy of the same three panels as a fixed-position dock
// (CSS hides it above the 900px breakpoint, where the full COLLECTORS panel
// is already on-screen) — built once, for the same reason buildRivalPanels()
// is built once above.
function buildNpcDock() {
  els.npcDock.replaceChildren();
  for (const npcId of NPC_IDS) {
    const root = document.createElement("div");
    root.className = "npc-dock-column";
    root.style.setProperty("--collector-color", NPC_COLOR[npcId]);

    const name = document.createElement("span");
    name.className = "npc-dock-name";
    name.textContent = NPC_NAMES[npcId].split(" ")[0];
    root.appendChild(name);

    const auctioneerFlag = document.createElement("span");
    auctioneerFlag.className = "npc-dock-auctioneer-flag";
    auctioneerFlag.textContent = "AUC";
    auctioneerFlag.hidden = true;
    root.appendChild(auctioneerFlag);

    const meter = document.createElement("span");
    meter.className = "npc-dock-meter collector-meter-inactive";
    meter.setAttribute("aria-hidden", "true");
    const meterFill = document.createElement("span");
    meterFill.className = "collector-meter-fill";
    meter.appendChild(meterFill);
    root.appendChild(meter);

    const holdings = document.createElement("div");
    holdings.className = "npc-dock-holdings";
    const tileCounts: Partial<Record<string, HTMLElement>> = {};
    for (const artist of ARTISTS) {
      const tile = document.createElement("span");
      tile.className = "npc-dock-tile";
      tile.style.setProperty("--artist-color", artist.color);
      const swatch = document.createElement("span");
      swatch.className = `swatch swatch-${artist.symbol}`;
      tile.appendChild(swatch);
      const count = document.createElement("span");
      count.textContent = "0";
      tile.appendChild(count);
      holdings.appendChild(tile);
      tileCounts[artist.id] = count;
    }
    root.appendChild(holdings);

    els.npcDock.appendChild(root);
    dockPanels[npcId] = { root, auctioneerFlag, tileCounts, meter, meterFill };
  }
}

buildNpcDock();

function collectorPanelsFor(npcId: NpcId): CollectorPanelEls[] {
  return [rivalPanels[npcId], dockPanels[npcId]];
}

function seedFromClock(): number {
  return Math.floor(performance.now() * 1000 + Date.now()) % 2147483647;
}

const sessionStart = performance.now();
const elapsed = () => performance.now() - sessionStart;

let mode: GameMode = "house";
// No GameState exists, and no rAF loop runs, until ENTER AUCTION is clicked
// (see enterAuction() below) — this is what keeps the auction clock, NPC
// triggers and price countdown from starting before the player is ready.
// TypeScript's definite-assignment analysis is intraprocedural, so an
// uninitialised module-scope `let` read only from inside functions that are
// never called before enterAuction() assigns it is not flagged; every read
// of `state` below happens inside such a function.
let state: GameState;
let running = false;
let renderedLotIndex = -1;
const lastMarketValues = new Map<string, number>();

// Every pixel-art piece (the current lot, a hand card, a collection
// thumbnail, or the landing screen) is drawn through this one helper — a
// fixed, hand-placed low-resolution colour grid (see pixelart.ts) painted at
// its native size, then scaled up purely in CSS with image-rendering:
// pixelated so the browser never smooths or blurs the pixels regardless of
// the element's display size.
function paintPixelGrid(canvas: HTMLCanvasElement, grid: string[][]) {
  // getContext("2d") is null under the project's jsdom-based tests (jsdom
  // only draws when the optional native "canvas" addon is installed, which
  // this repo deliberately doesn't add just for a unit-test dependency) —
  // every real browser always returns a context, so this guard only ever
  // skips the fill in that one test environment, never in production.
  const size = grid.length;
  if (canvas.width !== size) canvas.width = size;
  if (canvas.height !== size) canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      ctx.fillStyle = grid[y][x];
      ctx.fillRect(x, y, 1, 1);
    }
  }
}

function renderArtwork(lot: GameState["currentLot"]) {
  if (!lot) {
    const ctx = els.artworkCanvas.getContext("2d");
    ctx?.clearRect(0, 0, els.artworkCanvas.width, els.artworkCanvas.height);
    return;
  }
  const artist = ARTISTS.find((a) => a.id === lot.artistId)!;
  els.artworkButton.style.setProperty("--artist-color", artist.color);
  paintPixelGrid(els.artworkCanvas, lot.artwork.grid);
}

// Purely decorative — rendered once at module load, well before ENTER
// AUCTION exists as a button to click, so this never starts any clock or
// touches game state. Playtest finding #5: the landing screen's frame must
// show the most recognisable selected artwork rather than stay empty.
function renderReadyArtwork() {
  const starryNight = allArtworks().find((work) => work.id === "vangogh-starry-night")!;
  paintPixelGrid(els.readyArtworkCanvas, starryNight.grid);
}
renderReadyArtwork();

function renderLotCaption(lot: GameState["currentLot"]) {
  if (!lot) {
    els.lotCaption.hidden = true;
    return;
  }
  const artist = ARTISTS.find((a) => a.id === lot.artistId)!;
  els.lotCaption.hidden = false;
  els.lotCaption.style.setProperty("--artist-color", artist.color);
  els.artistSwatch.className = `swatch swatch-${artist.symbol}`;
  els.artistName.textContent = artist.name;
  els.artworkTitle.textContent = lot.artwork.title;
}

// Playtest findings #6/#8: the current bid is compared against the artist's
// live market value on every frame, with a text+icon state (never colour
// alone), and the artwork button's accessible name is kept in sync with the
// same number so the bid affordance is explicit for keyboard/AT users too.
function updateBidAffordance(lot: NonNullable<GameState["currentLot"]>, price: number, biddable: boolean) {
  const marketValue = state.market[lot.artistId];
  els.bidMarketCompare.hidden = false;
  els.bidCompareValue.textContent = `$${Math.round(price)}`;
  els.marketCompareValue.textContent = `$${marketValue}`;

  els.bidMarketIndicator.classList.remove("bid-market-below-market", "bid-market-above-market", "bid-market-at-market");
  if (price < marketValue) {
    els.bidMarketIndicator.classList.add("bid-market-below-market");
    els.bidMarketArrow.textContent = "↓";
    els.bidMarketLabel.textContent = "BELOW MARKET";
  } else if (price > marketValue) {
    els.bidMarketIndicator.classList.add("bid-market-above-market");
    els.bidMarketArrow.textContent = "↑";
    els.bidMarketLabel.textContent = "ABOVE MARKET";
  } else {
    els.bidMarketIndicator.classList.add("bid-market-at-market");
    els.bidMarketArrow.textContent = "=";
    els.bidMarketLabel.textContent = "AT MARKET";
  }

  // The overlay/accessible-name only ever promises a live bid while the lot
  // is still biddable — once sold, the sold banner is the source of truth.
  const artist = ARTISTS.find((a) => a.id === lot.artistId)!;
  if (!biddable) {
    els.artworkButton.setAttribute("aria-label", `${lot.artwork.title} by ${artist.name} — sold`);
    return;
  }
  const roundedPrice = Math.round(price);
  els.bidOverlayLabel.textContent = `BID $${roundedPrice}`;
  els.artworkButton.setAttribute("aria-label", `Bid $${roundedPrice} for ${lot.artwork.title} by ${artist.name}`);
}

function hideBidAffordance() {
  els.bidMarketCompare.hidden = true;
}

// Playtest finding #7: the mobile NPC-interest dock must be hidden on the
// landing and finished screens and visible for every other phase, per
// Section 6 of the spec.
function setNpcDockVisible(visible: boolean) {
  els.npcDock.hidden = !visible;
  document.body.classList.toggle("has-npc-dock", visible);
}

// Correction: hiding the desktop COLLECTORS panel with just the `hidden`
// attribute left its named grid row (and the row gap around it) reserved as
// blank space, since removing a hidden item from an explicit
// grid-template-areas row doesn't collapse that row on its own. This class
// drives a matching CSS rule (see .game-layout.phase-finished in global.css)
// that drops the "rivals" row from the grid template entirely once the game
// is finished, so no gap is left behind.
function setFinishedLayout(finished: boolean) {
  els.gameLayout.classList.toggle("phase-finished", finished);
}

function renderMarketBoard() {
  els.marketBoard.replaceChildren();
  for (const artist of ARTISTS) {
    const value = state.market[artist.id];
    const previous = lastMarketValues.get(artist.id);
    const chip = document.createElement("span");
    chip.className = "market-chip";
    chip.title = artist.name;
    if (previous !== undefined && value > previous) chip.classList.add("market-chip-up");
    if (previous !== undefined && value < previous) chip.classList.add("market-chip-down");
    chip.style.setProperty("--artist-color", artist.color);

    const swatch = document.createElement("span");
    swatch.className = `swatch swatch-${artist.symbol}`;
    chip.appendChild(swatch);

    // Symbol, full name and value shown together — an artist's identity in
    // the market board never depends on reading colour alone.
    const name = document.createElement("span");
    name.className = "market-name";
    name.textContent = artist.name;
    chip.appendChild(name);

    const amount = document.createElement("span");
    amount.className = "market-amount";
    amount.textContent = `$${value}`;
    chip.appendChild(amount);

    els.marketBoard.appendChild(chip);
    lastMarketValues.set(artist.id, value);
  }
}

// Ledger layout correction: showing one card per acquired artwork made the
// ledger grow taller across the game and destabilised the desktop layout, so
// this now renders a fixed four-tile artist-count summary instead — the same
// compact swatch+count style already used for NPC holdings, always in the
// same artist order (ARTISTS is already ordered van Gogh, Monet, Kandinsky,
// Mondrian), with zero counts left visible so the tile count — and the
// ledger's height — never changes. acquiredLots itself is untouched by this:
// it still carries the exact artist/title identity read by the current lot
// caption, the sold banner and the AUCTIONEER hand cards.
//
// The four tiles live in their own grid wrapper (.collection-tiles), separate
// from the COLLECTION label, so the label can stay on its own row while the
// tiles are pinned to a fixed four-column grid (see global.css) that can
// never wrap onto a second row regardless of viewport width or digit count.
function renderCollection() {
  els.collectionBoard.replaceChildren();
  const label = document.createElement("span");
  label.className = "hud-label collection-label";
  label.textContent = "COLLECTION";
  els.collectionBoard.appendChild(label);

  const tiles = document.createElement("div");
  tiles.className = "collection-tiles";

  const player = state.collectors.player;
  for (const artist of ARTISTS) {
    const count = player.holdings[artist.id] ?? 0;
    const tile = document.createElement("span");
    tile.className = "collection-tile";
    tile.style.setProperty("--artist-color", artist.color);
    tile.setAttribute("role", "img");
    tile.setAttribute("aria-label", `${artist.name}: ${count}`);

    const swatch = document.createElement("span");
    swatch.className = `swatch swatch-${artist.symbol}`;
    swatch.setAttribute("aria-hidden", "true");
    tile.appendChild(swatch);

    const countEl = document.createElement("span");
    countEl.setAttribute("aria-hidden", "true");
    countEl.textContent = `×${count}`;
    tile.appendChild(countEl);

    tiles.appendChild(tile);
  }

  els.collectionBoard.appendChild(tiles);
}

function renderNetWorth() {
  const player = state.collectors.player;
  const collectionValue = portfolioValue(player.holdings, state.market);
  const netWorth = player.cash + collectionValue;
  els.netWorthFormula.textContent = `$${netWorth} = $${player.cash} + $${collectionValue}`;
}

// The only place rival finances are ever read from is this public view: it
// structurally omits rival cash/net worth until the game finishes, so this
// function has nothing to accidentally leak even if it tried. Only updates
// text/classes on the panels buildRivalPanels() already created — no node
// recreation on every animation frame.
function updateRivalPanels() {
  const view = buildPublicView(state);
  for (const entry of view.collectors) {
    if (entry.id === "player") continue;
    const npcId = entry.id;
    const isAuctioneer = entry.id === state.currentAuctioneer;
    for (const panel of collectorPanelsFor(npcId)) {
      panel.root.classList.toggle("collector-panel-auctioneer", isAuctioneer);
      panel.auctioneerFlag.hidden = !isAuctioneer;
      for (const artist of ARTISTS) {
        const count = entry.holdings[artist.id] ?? 0;
        const el = panel.tileCounts[artist.id];
        if (el) el.textContent = String(count);
      }
    }
  }
}

// Meter fill is driven by the same resolved engine trigger time
// (state.npcTriggers) used for claim resolution — never a separate visual
// estimate. An NPC that has declined the lot entirely (a null trigger) gets
// an empty, visually inactive meter rather than one that reads as "about to
// buy".
function updateRivalMeters(relativeMs: number) {
  for (const npcId of NPC_IDS) {
    const triggerMs = state.npcTriggers[npcId];
    for (const panel of collectorPanelsFor(npcId)) {
      if (triggerMs == null) {
        panel.meterFill.style.setProperty("--fill", "0");
        panel.meter.classList.add("collector-meter-inactive");
        panel.meter.classList.remove("collector-meter-near-full", "collector-meter-arrived");
        continue;
      }
      panel.meter.classList.remove("collector-meter-inactive");
      const progress = Math.max(0, Math.min(1, relativeMs / Math.max(1, triggerMs)));
      panel.meterFill.style.setProperty("--fill", String(progress));
      panel.meter.classList.toggle("collector-meter-near-full", progress >= 0.85 && progress < 1);
      panel.meter.classList.toggle("collector-meter-arrived", progress >= 1);
    }
  }
}

// No lot currently running (between turns, or the player is choosing a card
// to auction) — nothing should read as "approaching a purchase".
function resetRivalMeters() {
  for (const npcId of NPC_IDS) {
    for (const panel of collectorPanelsFor(npcId)) {
      panel.meterFill.style.setProperty("--fill", "0");
      panel.meter.classList.add("collector-meter-inactive");
      panel.meter.classList.remove("collector-meter-near-full", "collector-meter-arrived");
    }
  }
}

// Rendered only when the player's hand actually changes (by array identity —
// selectLotCard always produces a fresh array when a card is removed), never
// unconditionally every animation frame. Recreating these buttons every frame
// destroyed the click target mid-click, which is why AUCTIONEER selection
// used to be nearly unclickable: render() runs on every rAF tick, and a
// click event needs its target node to still exist when the click completes.
let renderedHand: GameState["hands"]["player"] | null = null;

function renderHandCardsIfNeeded() {
  const hand = state.hands.player ?? [];
  if (hand === renderedHand) return;
  renderedHand = hand;
  renderHandCards(hand);
}

function renderHandCards(hand: NonNullable<GameState["hands"]["player"]>) {
  els.handCards.replaceChildren();
  hand.forEach((card, i) => {
    const artist = ARTISTS.find((a) => a.id === card.artistId)!;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "hand-card";
    btn.style.setProperty("--artist-color", artist.color);

    const thumb = document.createElement("canvas");
    thumb.className = "hand-card-thumb";
    thumb.setAttribute("aria-hidden", "true");
    paintPixelGrid(thumb, card.artwork.grid);
    btn.appendChild(thumb);

    const swatch = document.createElement("span");
    swatch.className = `swatch swatch-${artist.symbol}`;
    btn.appendChild(swatch);
    // Playtest finding #4: an AUCTIONEER hand card must show both the artist
    // and the artwork title, not the artist alone.
    const name = document.createElement("span");
    name.className = "hand-card-name";
    name.textContent = artist.name;
    btn.appendChild(name);
    const title = document.createElement("span");
    title.className = "hand-card-title";
    title.textContent = card.artwork.title;
    btn.appendChild(title);
    btn.addEventListener("click", () => {
      state = selectLotCard(state, i, elapsed());
      render();
    });
    els.handCards.appendChild(btn);
  });
}

function outcomeTagText(kind: LotOutcome["saleKind"]): string {
  if (kind === "premium") return "PREMIUM +15";
  if (kind === "discount") return "DISCOUNT −5";
  return "UNSOLD −15";
}

// Playtest finding #4: a sale must name the exact artwork, not just its
// buyer — "SOLD TO VIVIENNE · THE STARRY NIGHT · $92".
function soldBannerText(outcome: LotOutcome, lot: GameState["currentLot"]): string {
  if (outcome.winner === null) return "UNSOLD";
  const buyer = outcome.winner === "player" ? "YOU" : COLLECTOR_LABELS[outcome.winner];
  const title = lot ? lot.artwork.title : "";
  return `SOLD TO ${buyer} · ${title} · $${outcome.price}`;
}

function paymentFlowText(outcome: LotOutcome): string {
  const buyer = outcome.winner;
  if (buyer === null) return "";
  const buyerLabel = buyer === "player" ? "YOU" : COLLECTOR_LABELS[buyer];
  const destLabel = outcome.paymentTo === "bank" ? "BANK" : outcome.paymentTo === "player" ? "YOU" : COLLECTOR_LABELS[outcome.paymentTo];
  return `PAYMENT: ${buyerLabel} → ${destLabel}`;
}

function renderEndScreen() {
  const results = computeResults(state);
  els.endResult.textContent = isPlayerWinner(results) ? "WIN" : "LOSS";
  els.endResult.classList.toggle("end-result-win", isPlayerWinner(results));
  els.endResult.classList.toggle("end-result-loss", !isPlayerWinner(results));
  els.rankingList.replaceChildren();
  for (const entry of results) {
    const item = document.createElement("li");
    item.className = "ranking-item";
    if (entry.id === "player") item.classList.add("ranking-item-player");

    const label = document.createElement("span");
    label.textContent = `${entry.rank}. ${entry.name}`;
    item.appendChild(label);

    const detail = document.createElement("span");
    detail.className = "ranking-detail";
    detail.textContent = `$${entry.wealth} = $${entry.cash} + $${entry.portfolioValue}`;
    item.appendChild(detail);

    els.rankingList.appendChild(item);
  }
  // Playtest findings #1/#2: the finished screen must not keep showing the
  // collector-interest panel or any remnant of the last live auction — the
  // scoreboard replaces the artwork/stage area rather than appearing below
  // it, so every other stage/auctioneer/rivals element is hidden here.
  els.endScreen.hidden = false;
  els.auctioneerBanner.hidden = true;
  els.panelRivals.hidden = true;
  els.stage.hidden = true;
  els.selectingPanel.hidden = true;
  els.paymentFlow.hidden = true;
  els.lotCaption.hidden = true;
  hideBidAffordance();
}

function render() {
  els.auctioneerLabel.textContent = `AUCTIONEER: ${auctioneerLabel(state.currentAuctioneer)}`;
  renderNetWorth();
  updateRivalPanels();

  els.cash.textContent = `$${state.collectors.player.cash}`;
  els.lotCounter.textContent = `${Math.min(state.currentTurnIndex + 1, LOT_COUNT)} / ${LOT_COUNT}`;
  renderMarketBoard();
  renderCollection();

  if (state.phase === "finished") {
    setNpcDockVisible(false);
    setFinishedLayout(true);
    renderEndScreen();
    return;
  }

  setFinishedLayout(false);
  setNpcDockVisible(true);
  els.endScreen.hidden = true;
  els.auctioneerBanner.hidden = false;
  els.panelRivals.hidden = false;

  if (state.phase === "selecting") {
    els.selectingPanel.hidden = false;
    els.stage.hidden = true;
    els.paymentFlow.hidden = true;
    els.lotCaption.hidden = true;
    hideBidAffordance();
    resetRivalMeters();
    renderHandCardsIfNeeded();
    return;
  }

  els.selectingPanel.hidden = true;
  els.stage.hidden = false;

  const lot = state.currentLot;
  if (lot && lot.index !== renderedLotIndex) {
    renderArtwork(lot);
    renderLotCaption(lot);
    renderedLotIndex = lot.index;
  }

  const relativeMs = lot ? elapsed() - state.currentLotStartAt : 0;

  if (state.phase === "auction" && lot) {
    els.soldBanner.hidden = true;
    els.outcomeTag.hidden = true;
    els.paymentFlow.hidden = true;
    els.artworkButton.disabled = false;
    els.artworkButton.classList.remove("artwork-sold");
    const price = priceAtTime(lot, relativeMs);
    els.priceTag.textContent = `$${Math.round(price)}`;
    updateBidAffordance(lot, price, true);
    updateRivalMeters(relativeMs);
  } else if (state.phase === "sold-pause") {
    els.artworkButton.disabled = true;
    els.artworkButton.classList.add("artwork-sold");
    const outcome = state.outcomes[state.outcomes.length - 1];
    if (outcome) {
      els.soldBanner.textContent = soldBannerText(outcome, lot);
      els.soldBanner.hidden = false;
      els.priceTag.textContent = outcome.winner === null ? "—" : `$${outcome.price}`;
      if (lot) updateBidAffordance(lot, outcome.winner === null ? 0 : outcome.price, false);

      els.outcomeTag.textContent = outcomeTagText(outcome.saleKind);
      els.outcomeTag.className = `outcome-tag outcome-tag-${outcome.saleKind}`;
      els.outcomeTag.hidden = false;

      if (outcome.winner !== null) {
        els.paymentFlow.textContent = paymentFlowText(outcome);
        els.paymentFlow.hidden = false;
      } else {
        els.paymentFlow.hidden = true;
      }
    }
    updateRivalMeters(lot ? lot.durationMs : 0);
  }
}

function loop() {
  // `running` is cleared by returnToReady() when the player switches modes
  // mid- or post-game; returning here (instead of always rescheduling) is
  // what actually stops the auction clock rather than just hiding it.
  if (!running) return;
  state = tick(state, elapsed());
  render();
  requestAnimationFrame(loop);
}

function updateModeButtons() {
  els.modeHouse.setAttribute("aria-pressed", String(mode === "house"));
  els.modeAuctioneer.setAttribute("aria-pressed", String(mode === "auctioneer"));
}

// The one place a GameState is created for a brand-new game. Called by the
// ENTER AUCTION button (from the ready screen) and never at module load.
function enterAuction() {
  state = createGame(seedFromClock(), mode, elapsed());
  renderedLotIndex = -1;
  lastMarketValues.clear();
  els.readyScreen.hidden = true;
  els.gameScreen.hidden = false;
  running = true;
  render();
  requestAnimationFrame(loop);
}

// PLAY AGAIN: a fresh seed and fresh NPC profiles in the mode already
// chosen, starting immediately — unlike a mode switch, this does not route
// back through the ready screen. `running` is already true here, since the
// loop keeps ticking harmlessly through the finished phase.
function restart(nextMode: GameMode) {
  mode = nextMode;
  state = createGame(seedFromClock(), nextMode, elapsed());
  renderedLotIndex = -1;
  lastMarketValues.clear();
  render();
}

// Switching modes returns to a calm ready state rather than immediately
// starting a new timed auction — whether the switch happens before a game
// (still on the ready screen, nothing to stop), mid-game, or after one has
// finished (the loop is still ticking through the finished phase).
function returnToReady() {
  running = false;
  els.gameScreen.hidden = true;
  els.readyScreen.hidden = false;
  setNpcDockVisible(false);
}

function setMode(nextMode: GameMode) {
  if (mode === nextMode) return;
  mode = nextMode;
  updateModeButtons();
  if (running) returnToReady();
}

els.artworkButton.addEventListener("click", () => {
  state = attemptPlayerClaim(state, elapsed());
  render();
});

els.playAgain.addEventListener("click", () => restart(mode));
els.modeHouse.addEventListener("click", () => setMode("house"));
els.modeAuctioneer.addEventListener("click", () => setMode("auctioneer"));
els.enterAuction.addEventListener("click", () => enterAuction());

updateModeButtons();
