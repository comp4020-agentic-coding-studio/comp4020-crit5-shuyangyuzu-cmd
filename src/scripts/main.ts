import { shiftColor } from "../game/artwork";
import {
  ARTISTS,
  attemptPlayerClaim,
  computeResults,
  createGame,
  isPlayerWinner,
  tick,
  type GameState,
} from "../game/engine";
import { LOT_COUNT } from "../game/lots";
import { NPC_NAMES } from "../game/npc";
import { priceAtTime } from "../game/pricing";
import { NPC_IDS, type ArtworkShape, type NpcId } from "../game/types";

const SVG_NS = "http://www.w3.org/2000/svg";
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
if (reduceMotion) document.body.classList.add("reduce-motion");

const els = {
  cash: document.getElementById("player-cash")!,
  marketBoard: document.getElementById("market-board")!,
  lotCounter: document.getElementById("lot-counter")!,
  artworkButton: document.getElementById("artwork-button")! as HTMLButtonElement,
  artworkSvg: document.getElementById("artwork-svg")! as unknown as SVGSVGElement,
  soldBanner: document.getElementById("sold-banner")!,
  priceTag: document.getElementById("price-tag")!,
  collectionBoard: document.getElementById("collection-board")!,
  stage: document.querySelector(".stage")! as HTMLElement,
  endScreen: document.getElementById("end-screen")!,
  endResult: document.getElementById("end-result")!,
  rankingList: document.getElementById("ranking-list")!,
  playAgain: document.getElementById("play-again")! as HTMLButtonElement,
};

const bidderEls: Record<NpcId, HTMLElement> = {
  trend: document.querySelector('[data-npc="trend"]')!,
  value: document.querySelector('[data-npc="value"]')!,
  momentum: document.querySelector('[data-npc="momentum"]')!,
};

function seedFromClock(): number {
  return Math.floor(performance.now() * 1000 + Date.now()) % 2147483647;
}

const sessionStart = performance.now();
const elapsed = () => performance.now() - sessionStart;

let state: GameState = createGame(seedFromClock(), elapsed());
let renderedLotIndex = -1;
let renderedOutcomeCount = 0;
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

function renderMarketBoard() {
  els.marketBoard.replaceChildren();
  for (const artist of ARTISTS) {
    const value = state.market[artist.id];
    const previous = lastMarketValues.get(artist.id);
    const chip = document.createElement("span");
    chip.className = "market-chip";
    if (previous !== undefined && value > previous) chip.classList.add("market-chip-up");
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

function renderBidders(relativeMs: number) {
  for (const npcId of NPC_IDS) {
    const el = bidderEls[npcId];
    const triggerMs = state.npcTriggers[npcId];
    if (triggerMs == null) {
      el.style.setProperty("--progress", "0");
      el.classList.add("bidder-sitting-out");
      continue;
    }
    el.classList.remove("bidder-sitting-out");
    const progress = Math.max(0, Math.min(1, relativeMs / Math.max(1, triggerMs)));
    el.style.setProperty("--progress", String(progress));
    el.classList.toggle("bidder-arrived", progress >= 1);
  }
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
    item.textContent = `${entry.rank}. ${entry.name} — $${entry.wealth}`;
    els.rankingList.appendChild(item);
  }
  els.endScreen.hidden = false;
  els.stage.hidden = true;
}

function render() {
  els.cash.textContent = `$${state.collectors.player.cash}`;
  els.lotCounter.textContent = `${Math.min(state.currentLotIndex + 1, LOT_COUNT)} / ${LOT_COUNT}`;
  renderMarketBoard();
  renderCollection();

  if (state.phase === "finished") {
    renderEndScreen();
    return;
  }

  els.endScreen.hidden = true;
  els.stage.hidden = false;

  const lot = state.currentLot;
  if (lot && lot.index !== renderedLotIndex) {
    renderArtwork(lot);
    renderedLotIndex = lot.index;
  }

  const relativeMs = lot ? elapsed() - state.currentLotStartAt : 0;

  if (state.phase === "auction" && lot) {
    els.soldBanner.hidden = true;
    els.artworkButton.disabled = false;
    els.artworkButton.classList.remove("artwork-sold");
    const price = priceAtTime(lot, relativeMs);
    els.priceTag.textContent = `$${Math.round(price)}`;
    renderBidders(relativeMs);
  } else if (state.phase === "sold-pause") {
    els.artworkButton.disabled = true;
    els.artworkButton.classList.add("artwork-sold");
    if (state.outcomes.length !== renderedOutcomeCount) {
      renderedOutcomeCount = state.outcomes.length;
    }
    const outcome = state.outcomes[state.outcomes.length - 1];
    if (outcome) {
      const name =
        outcome.winner === null
          ? "PASSED"
          : outcome.winner === "player"
            ? "SOLD — You"
            : `SOLD — ${NPC_NAMES[outcome.winner]}`;
      els.soldBanner.textContent = outcome.winner === null ? name : `${name} $${outcome.price}`;
      els.priceTag.textContent = outcome.winner === null ? "—" : `$${outcome.price}`;
    }
    els.soldBanner.hidden = false;
    renderBidders(lot ? lot.durationMs : 0);
  }
}

function loop() {
  state = tick(state, elapsed());
  render();
  requestAnimationFrame(loop);
}

els.artworkButton.addEventListener("click", () => {
  state = attemptPlayerClaim(state, elapsed());
  render();
});

els.playAgain.addEventListener("click", () => {
  state = createGame(seedFromClock(), elapsed());
  renderedLotIndex = -1;
  renderedOutcomeCount = 0;
  lastMarketValues.clear();
  render();
});

render();
requestAnimationFrame(loop);
