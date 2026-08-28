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
import { priceAtTime } from "../game/pricing";
import { NPC_IDS, type ArtworkShape, type CollectorId, type GameMode, type LotOutcome, type NpcId } from "../game/types";
import { buildPublicView } from "../game/view";

const SVG_NS = "http://www.w3.org/2000/svg";
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
if (reduceMotion) document.body.classList.add("reduce-motion");

const COLLECTOR_LABELS: Record<CollectorId, string> = {
  player: "YOU",
  trend: "TREND",
  value: "VALUE",
  momentum: "MOMENTUM",
};

function auctioneerLabel(auctioneer: CollectorId | "house"): string {
  return auctioneer === "house" ? "HOUSE" : COLLECTOR_LABELS[auctioneer];
}

const els = {
  modeHouse: document.getElementById("mode-house")! as HTMLButtonElement,
  modeAuctioneer: document.getElementById("mode-auctioneer")! as HTMLButtonElement,
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

const trackEls: Record<NpcId, HTMLElement> = {
  trend: document.querySelector('[data-npc="trend"]')!,
  value: document.querySelector('[data-npc="value"]')!,
  momentum: document.querySelector('[data-npc="momentum"]')!,
};

const railEls: Record<NpcId, HTMLElement> = {
  trend: document.querySelector(".claim-rail-trend")!,
  value: document.querySelector(".claim-rail-value")!,
  momentum: document.querySelector(".claim-rail-momentum")!,
};

function seedFromClock(): number {
  return Math.floor(performance.now() * 1000 + Date.now()) % 2147483647;
}

const sessionStart = performance.now();
const elapsed = () => performance.now() - sessionStart;

let mode: GameMode = "house";
let state: GameState = createGame(seedFromClock(), mode, elapsed());
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
// function has nothing to accidentally leak even if it tried.
function renderRivalsBoard() {
  const view = buildPublicView(state);
  els.rivalsBoard.replaceChildren();
  for (const entry of view.collectors) {
    if (entry.id === "player") continue;
    const row = document.createElement("div");
    row.className = "rival-row";
    const isAuctioneer = entry.id === state.currentAuctioneer;
    row.classList.toggle("rival-row-auctioneer", isAuctioneer);

    const name = document.createElement("span");
    name.className = "rival-name";
    name.textContent = isAuctioneer ? `\u{1F528} ${entry.name}` : entry.name;
    row.appendChild(name);

    const holdingsWrap = document.createElement("span");
    holdingsWrap.className = "rival-holdings";
    for (const artist of ARTISTS) {
      const count = entry.holdings[artist.id] ?? 0;
      const tile = document.createElement("span");
      tile.className = "rival-tile";
      tile.style.setProperty("--artist-color", artist.color);
      const swatch = document.createElement("span");
      swatch.className = `swatch swatch-${artist.symbol}`;
      tile.appendChild(swatch);
      const countEl = document.createElement("span");
      countEl.textContent = String(count);
      tile.appendChild(countEl);
      holdingsWrap.appendChild(tile);
    }
    row.appendChild(holdingsWrap);
    els.rivalsBoard.appendChild(row);
  }
}

function renderClaimTracks(relativeMs: number) {
  for (const npcId of NPC_IDS) {
    const trackEl = trackEls[npcId];
    const railEl = railEls[npcId];
    const triggerMs = state.npcTriggers[npcId];
    if (triggerMs == null) {
      trackEl.style.setProperty("--progress", "0");
      trackEl.classList.add("claim-track-sitting-out");
      trackEl.classList.remove("claim-track-arrived");
      railEl.classList.add("claim-rail-inactive");
      continue;
    }
    trackEl.classList.remove("claim-track-sitting-out");
    railEl.classList.remove("claim-rail-inactive");
    const progress = Math.max(0, Math.min(1, relativeMs / Math.max(1, triggerMs)));
    trackEl.style.setProperty("--progress", String(progress));
    trackEl.classList.toggle("claim-track-arrived", progress >= 1);
  }
}

function renderHandCards() {
  els.handCards.replaceChildren();
  const hand = state.hands.player ?? [];
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
  els.modeHouse.setAttribute("aria-pressed", String(mode === "house"));
  els.modeAuctioneer.setAttribute("aria-pressed", String(mode === "auctioneer"));

  els.auctioneerLabel.textContent = `AUCTIONEER: ${auctioneerLabel(state.currentAuctioneer)}`;
  renderNetWorth();
  renderRivalsBoard();

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
    renderHandCards();
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
    renderClaimTracks(relativeMs);
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
    renderClaimTracks(lot ? lot.durationMs : 0);
  }
}

function loop() {
  state = tick(state, elapsed());
  render();
  requestAnimationFrame(loop);
}

function restart(nextMode: GameMode) {
  mode = nextMode;
  state = createGame(seedFromClock(), nextMode, elapsed());
  renderedLotIndex = -1;
  lastMarketValues.clear();
  render();
}

els.artworkButton.addEventListener("click", () => {
  state = attemptPlayerClaim(state, elapsed());
  render();
});

els.playAgain.addEventListener("click", () => restart(mode));
els.modeHouse.addEventListener("click", () => {
  if (mode !== "house") restart("house");
});
els.modeAuctioneer.addEventListener("click", () => {
  if (mode !== "auctioneer") restart("auctioneer");
});

render();
requestAnimationFrame(loop);
