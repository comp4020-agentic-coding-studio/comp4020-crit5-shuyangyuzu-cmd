// Price is a closed-form linear function of elapsed time, so any threshold
// crossing (an NPC's buy trigger, a floor-price deadline) is solved
// analytically from the formula rather than detected by sampling rendered
// frames. This is what makes the auction's outcome independent of frame rate.
export interface PriceCurve {
  ceiling: number;
  floor: number;
  durationMs: number;
}

export function priceAtTime(curve: PriceCurve, elapsedMs: number): number {
  if (elapsedMs <= 0) return curve.ceiling;
  if (elapsedMs >= curve.durationMs) return curve.floor;
  const fraction = elapsedMs / curve.durationMs;
  return curve.ceiling - (curve.ceiling - curve.floor) * fraction;
}

// Inverse of priceAtTime: the exact elapsed time at which the price reaches
// `price`, clamped to the auction's lifespan.
export function timeForPrice(curve: PriceCurve, price: number): number {
  if (price >= curve.ceiling) return 0;
  if (price <= curve.floor) return curve.durationMs;
  const fraction = (curve.ceiling - price) / (curve.ceiling - curve.floor);
  return fraction * curve.durationMs;
}
