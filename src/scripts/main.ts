import { shiftColor } from "../game/artwork";
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
import { priceAtTime } from "../game/pricing";
import { NPC_IDS, type ArtworkShape, type CollectorId, type GameMode, type LotOutcome, type NpcId } from "../game/types";
import { buildPublicView } from "../game/view";

const SVG_NS = "http://www.w3.org/2000/svg";
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
  auctioneerLabel: document.getElementById("auctioneer-label")!,
  netWorthFormula: document.getElementById("net-worth-formula")!,
  cash: document.getElementById("player-cash")!,
  marketBoard: document.getElementById("market-board")!,
  lotCounter: document.getElementById("lot-counter")!,
  rivalsBoard: document.getElementById("rivals-board")!,
  selectingPanel: document.getElementById("selecting-panel")!,
  handCards: document.getElementById("hand-cards")!,
  lotCaption: document.getElementById("lot-caption")!,
  artistSwatch: document.getElementById("artist-swatch")!,
  artistName: document.getElementById("artist-name")!,
  artworkButton: document.getElementById("artwork-button")! as HTMLButtonElement,
  artworkSvg: document.getElementById("artwork-svg")! as unknown as SVGSVGElement,
  outcomeTag: document.getElementById("outcome-tag")!,
  soldBanner: document.getElementById("sold-banner")!,
  priceTag: document.getElementById("price-tag")!,
  paymentFlow: document.getElementById("payment-flow")!,
  collectionBoard: document.getElementById("collection-board")!,
  stage: document.getElementById("stage")! as HTMLElement,
  endScreen: document.getElementById("end-screen")!,
  endResult: document.getElementById("end-result")!,
  rankingList: document.getElementById("ranking-list")!,
  playAgain: document.getElementById("play-again")! as HTMLButtonElement,
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

function createShapeNode(shape: ArtworkShape, baseColor: string): SVGElement {
  const color = shiftColor(baseColor, shape.toneShift);
  const half = shape.size / 2;
  if (shape.kind === "circle") {
    const node = document.createElementNS(SVG_NS, "circle");
    node.setAttribute("cx", String(shape.x));
    node.setAttribute("cy", String(shape.y));
    node.setAttribute("r", String(half));
    node.setAttribute("fill", color);
    node.setAttribute("fill-opacity", String(shape.opacity));
    return node;
  }
  if (shape.kind === "square") {
    const node = document.createElementNS(SVG_NS, "rect");
    node.setAttribute("x", String(shape.x - half));
    node.setAttribute("y", String(shape.y - half));
    node.setAttribute("width", String(shape.size));
    node.setAttribute("height", String(shape.size));
    node.setAttribute("fill", color);
    node.setAttribute("fill-opacity", String(shape.opacity));
    node.setAttribute("transform", `rotate(${shape.rotation} ${shape.x} ${shape.y})`);
    return node;
  }
  if (shape.kind === "stroke") {
    const length = shape.length ?? shape.size;
    const node = document.createElementNS(SVG_NS, "rect");
    node.setAttribute("x", String(shape.x - length / 2));
    node.setAttribute("y", String(shape.y - half));
    node.setAttribute("width", String(length));
    node.setAttribute("height", String(shape.size));
    node.setAttribute("rx", String(half));
    node.setAttribute("fill", color);
    node.setAttribute("fill-opacity", String(shape.opacity));
    node.setAttribute("transform", `rotate(${shape.rotation} ${shape.x} ${shape.y})`);
    return node;
  }
  const node = document.createElementNS(SVG_NS, "polygon");
  const points = [
    [shape.x, shape.y - half],
    [shape.x + half, shape.y + half],
    [shape.x - half, shape.y + half],
  ]
    .map((p) => p.join(","))
    .join(" ");
  node.setAttribute("points", points);
  node.setAttribute("fill", color);
  node.setAttribute("fill-opacity", String(shape.opacity));
  node.setAttribute("transform", `rotate(${shape.rotation} ${shape.x} ${shape.y})`);
  return node;
}

function renderArtwork(lot: GameState["currentLot"]) {
  while (els.artworkSvg.firstChild) els.artworkSvg.removeChild(els.artworkSvg.firstChild);
  if (!lot) return;
  const artist = ARTISTS.find((a) => a.id === lot.artistId)!;
  els.artworkButton.style.setProperty("--stage-bg", lot.artwork.background);
  els.artworkButton.style.setProperty("--artist-color", artist.color);
  const bg = document.createElementNS(SVG_NS, "rect");
  bg.setAttribute("x", "0");
  bg.setAttribute("y", "0");
  bg.setAttribute("width", "100");
  bg.setAttribute("height", "100");
  bg.setAttribute("fill", lot.artwork.background);
  els.artworkSvg.appendChild(bg);
  for (const shape of lot.artwork.shapes) {
    els.artworkSvg.appendChild(createShapeNode(shape, artist.color));
  }
}

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

    const amount = document.createElement("span");
    amount.className = "market-amount";
    amount.textContent = `$${value}`;
    chip.appendChild(amount);

    els.marketBoard.appendChild(chip);
    lastMarketValues.set(artist.id, value);
  }
}

function renderCollection() {
  els.collectionBoard.replaceChildren();
  const label = document.createElement("span");
  label.className = "hud-label collection-label";
  label.textContent = "COLLECTION";
  els.collectionBoard.appendChild(label);

  const player = state.collectors.player;
  for (const artist of ARTISTS) {
    const count = player.holdings[artist.id] ?? 0;
    if (count === 0) continue;
    const tile = document.createElement("span");
    tile.className = "collection-tile";
    tile.style.setProperty("--artist-color", artist.color);
    const swatch = document.createElement("span");
    swatch.className = `swatch swatch-${artist.symbol}`;
    tile.appendChild(swatch);
    const count_ = document.createElement("span");
    count_.textContent = `×${count}`;
    tile.appendChild(count_);
    els.collectionBoard.appendChild(tile);
  }
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
    const panel = rivalPanels[npcId];
    const isAuctioneer = entry.id === state.currentAuctioneer;
    panel.root.classList.toggle("collector-panel-auctioneer", isAuctioneer);
    panel.auctioneerFlag.hidden = !isAuctioneer;
    for (const artist of ARTISTS) {
      const count = entry.holdings[artist.id] ?? 0;
      const el = panel.tileCounts[artist.id];
      if (el) el.textContent = String(count);
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
    const panel = rivalPanels[npcId];
    const triggerMs = state.npcTriggers[npcId];
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

// No lot currently running (between turns, or the player is choosing a card
// to auction) — nothing should read as "approaching a purchase".
function resetRivalMeters() {
  for (const npcId of NPC_IDS) {
    const panel = rivalPanels[npcId];
    panel.meterFill.style.setProperty("--fill", "0");
    panel.meter.classList.add("collector-meter-inactive");
    panel.meter.classList.remove("collector-meter-near-full", "collector-meter-arrived");
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
    const swatch = document.createElement("span");
    swatch.className = `swatch swatch-${artist.symbol}`;
    btn.appendChild(swatch);
    const name = document.createElement("span");
    name.className = "hand-card-name";
    name.textContent = artist.name;
    btn.appendChild(name);
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

function soldBannerText(outcome: LotOutcome): string {
  if (outcome.winner === null) return "UNSOLD";
  return `SOLD TO ${outcome.winner === "player" ? "YOU" : COLLECTOR_LABELS[outcome.winner]} · $${outcome.price}`;
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
  els.endScreen.hidden = false;
  els.stage.hidden = true;
  els.selectingPanel.hidden = true;
  els.paymentFlow.hidden = true;
  els.lotCaption.hidden = true;
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
    renderEndScreen();
    return;
  }

  els.endScreen.hidden = true;

  if (state.phase === "selecting") {
    els.selectingPanel.hidden = false;
    els.stage.hidden = true;
    els.paymentFlow.hidden = true;
    els.lotCaption.hidden = true;
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
    updateRivalMeters(relativeMs);
  } else if (state.phase === "sold-pause") {
    els.artworkButton.disabled = true;
    els.artworkButton.classList.add("artwork-sold");
    const outcome = state.outcomes[state.outcomes.length - 1];
    if (outcome) {
      els.soldBanner.textContent = soldBannerText(outcome);
      els.soldBanner.hidden = false;
      els.priceTag.textContent = outcome.winner === null ? "—" : `$${outcome.price}`;

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
