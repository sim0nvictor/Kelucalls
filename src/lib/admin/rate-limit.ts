/**
 * Fixed window rate limiter.
 *
 * KNOWN LIMITATION: the store is per process memory. On serverless each
 * instance keeps its own counter and a cold start resets it, so this raises
 * the cost of a brute force attempt without being a hard guarantee. Making it
 * authoritative requires a shared store (a Postgres table or Redis), which is
 * tracked as follow up work rather than done here.
 */

type Bucket = {
  count: number;
  resetAt: number;
};

const store = new Map<string, Bucket>();

export function checkRateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const current = store.get(key);

  if (!current || current.resetAt <= now) {
    store.set(key, {
      count: 1,
      resetAt: now + windowMs
    });

    return { allowed: true, remaining: limit - 1, resetAt: now + windowMs };
  }

  if (current.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: current.resetAt };
  }

  current.count += 1;
  store.set(key, current);

  return { allowed: true, remaining: limit - current.count, resetAt: current.resetAt };
}

/**
 * Drop a key's bucket.
 *
 * Called after a successful sign in. Without this an admin who mistypes a
 * password a few times keeps burning the same budget after they get it right,
 * and can lock themselves out on the next legitimate sign in.
 */
export function clearRateLimit(key: string) {
  store.delete(key);
}
