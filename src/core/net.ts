import type { FetchFn } from './resolve/itunes';

const RETRYABLE = new Set([408, 425, 429, 500, 502, 503, 504]);

/** Wraps fetch with one delayed retry for network errors, rate limits and 5xx. */
export function withRetry(fetchFn: FetchFn, delayMs = 600): FetchFn {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    try {
      const res = await fetchFn(input, init);
      if (!RETRYABLE.has(res.status)) return res;
    } catch {
      // fall through to retry
    }
    await new Promise((r) => setTimeout(r, delayMs));
    return fetchFn(input, init);
  }) as FetchFn;
}
