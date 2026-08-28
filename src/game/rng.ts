// Explicit-state PRNG: every function takes the current state and returns the
// next state alongside any value, so a whole game is reproducible from one
// seed and no hidden mutable generator object needs mocking in tests.
export type RngState = number;

export function createRng(seed: number): RngState {
  // xorshift32 requires a non-zero seed.
  return (seed | 0) || 1;
}

export function nextRandom(state: RngState): { value: number; state: RngState } {
  let x = state | 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  x |= 0;
  const value = ((x >>> 0) % 1_000_000) / 1_000_000;
  return { value, state: x };
}

export function nextRange(
  state: RngState,
  min: number,
  max: number,
): { value: number; state: RngState } {
  const { value, state: next } = nextRandom(state);
  return { value: min + value * (max - min), state: next };
}

export function nextInt(
  state: RngState,
  min: number,
  maxInclusive: number,
): { value: number; state: RngState } {
  const { value, state: next } = nextRandom(state);
  return { value: min + Math.floor(value * (maxInclusive - min + 1)), state: next };
}

// Fisher-Yates using the explicit-state generator; returns a new array.
export function shuffle<T>(items: T[], state: RngState): { value: T[]; state: RngState } {
  const result = items.slice();
  let s = state;
  for (let i = result.length - 1; i > 0; i--) {
    const picked = nextInt(s, 0, i);
    s = picked.state;
    [result[i], result[picked.value]] = [result[picked.value], result[i]];
  }
  return { value: result, state: s };
}
