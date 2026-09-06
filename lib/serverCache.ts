type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

const store = new Map<string, CacheEntry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

export const PAGE_CACHE_KEYS = {
  sitemapUrls: "pages:sitemap-urls",
  gscPageMetrics: "pages:gsc-page-metrics",
  gscKeywords: "pages:gsc-keywords",
  gscSitemapList: "pages:gsc-sitemap-list",
  overview: "pages:overview",
  sitemapPayload: "pages:sitemap-payload",
} as const;

/** Default TTLs for expensive external work. */
export const PAGE_CACHE_TTL = {
  sitemapUrls: 30 * 60_000,
  gsc: 30 * 60_000,
  overview: 5 * 60_000,
  sitemapPayload: 5 * 60_000,
} as const;

export function readServerCache<T>(key: string): T | null {
  const entry = store.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return entry.value;
}

export function writeServerCache<T>(key: string, value: T, ttlMs: number): T {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
  return value;
}

export function invalidateServerCache(keys: string | string[]): void {
  const list = Array.isArray(keys) ? keys : [keys];
  for (const key of list) {
    store.delete(key);
    inflight.delete(key);
  }
}

export function invalidatePageSeoCaches(): void {
  invalidateServerCache(Object.values(PAGE_CACHE_KEYS));
}

/**
 * Returns cached value or runs `loader` once.
 * Concurrent callers with the same key share the same in-flight promise.
 */
export async function getOrSetServerCache<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
  options: { force?: boolean } = {},
): Promise<T> {
  if (!options.force) {
    const hit = readServerCache<T>(key);
    if (hit !== null) return hit;
    const pending = inflight.get(key) as Promise<T> | undefined;
    if (pending) return pending;
  } else {
    inflight.delete(key);
    store.delete(key);
  }

  const promise = loader()
    .then((value) => {
      writeServerCache(key, value, ttlMs);
      return value;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, promise);
  return promise;
}
