import type { Collector, CollectorId } from "./types";

// The single money-transfer rule shared by both modes: the buyer always pays
// first. If a specific collector is auctioning this lot and isn't the buyer,
// the price flows to them instead of leaving the economy; a HOUSE-mode sale
// or a self-purchase (the auctioneer buying their own lot) pays the bank,
// i.e. the price simply disappears rather than round-tripping back to them.
export function applyPayment(
  collectors: Record<CollectorId, Collector>,
  buyerId: CollectorId,
  auctioneerId: CollectorId | "house",
  price: number,
): Record<CollectorId, Collector> {
  const next: Record<CollectorId, Collector> = {
    ...collectors,
    [buyerId]: { ...collectors[buyerId], cash: collectors[buyerId].cash - price },
  };
  if (auctioneerId !== "house" && auctioneerId !== buyerId) {
    next[auctioneerId] = { ...next[auctioneerId], cash: next[auctioneerId].cash + price };
  }
  return next;
}

export function paymentDestination(
  buyerId: CollectorId,
  auctioneerId: CollectorId | "house",
): CollectorId | "bank" {
  if (auctioneerId === "house" || auctioneerId === buyerId) return "bank";
  return auctioneerId;
}
