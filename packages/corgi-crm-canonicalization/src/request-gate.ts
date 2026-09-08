export type RateLimitedResponse = {
  status(): number;
  headers(): Record<string, string>;
  dispose(): Promise<void>;
};

export const createCanonicalizationRequestGate = ({
  minimumIntervalMs = 650,
  maxAttempts = 5,
  maxRateLimitWaitMs = 5 * 60_000,
  now = Date.now,
  wait = (delay: number) =>
    new Promise<void>((resolveDelay) => setTimeout(resolveDelay, delay)),
}: {
  minimumIntervalMs?: number;
  maxAttempts?: number;
  maxRateLimitWaitMs?: number;
  now?: () => number;
  wait?: (delay: number) => Promise<void>;
} = {}) => {
  let nextRequestAt = 0;
  let queue: Promise<void> = Promise.resolve();

  return async <T extends RateLimitedResponse>(
    request: () => Promise<T>,
  ): Promise<T> => {
    let release!: () => void;
    const previous = queue;
    queue = new Promise<void>((resolveQueue) => {
      release = resolveQueue;
    });
    await previous;
    try {
      const deadline = now() + maxRateLimitWaitMs;
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const delay = Math.max(0, nextRequestAt - now());
        if (delay > 0) await wait(delay);
        const response = await request();
        nextRequestAt = now() + minimumIntervalMs;
        if (response.status() !== 429) return response;

        const responseHeaders = response.headers();
        const retryAfter = responseHeaders['retry-after'];
        const seconds = Number(retryAfter);
        const retryAt = retryAfter ? Date.parse(retryAfter) : Number.NaN;
        const resetAtSeconds = Number(responseHeaders['x-ratelimit-reset']);
        const retryDelay =
          Number.isFinite(seconds) && seconds >= 0
            ? Math.max(1_000, seconds * 1_000)
            : Number.isFinite(retryAt)
              ? Math.max(1_000, retryAt - now())
              : Number.isFinite(resetAtSeconds) && resetAtSeconds > 0
                ? Math.max(1_000, resetAtSeconds * 1_000 - now())
                : Math.min(1_000 * 2 ** (attempt - 1), 30_000);
        await response.dispose();
        if (attempt === maxAttempts || now() + retryDelay > deadline) {
          throw new Error('Canonicalization request remained rate limited');
        }
        await wait(retryDelay);
      }
      throw new Error('Canonicalization request exhausted retry attempts');
    } finally {
      release();
    }
  };
};
