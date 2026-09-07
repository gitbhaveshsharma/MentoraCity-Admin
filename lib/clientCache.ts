const DEFAULT_TTL_MS = 60_000;
type Entry<T> = { savedAt: number; value: T; ttlMs?: number };

export function readClientCache<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(`mentoracity:${key}`);
    if (!raw) return null;
    const entry = JSON.parse(raw) as Entry<T>;
    const ttl = entry.ttlMs ?? DEFAULT_TTL_MS;
    if (Date.now() - entry.savedAt > ttl) {
      sessionStorage.removeItem(`mentoracity:${key}`);
      return null;
    }
    return entry.value;
  } catch {
    return null;
  }
}

export function writeClientCache<T>(
  key: string,
  value: T,
  ttlMs = DEFAULT_TTL_MS,
) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(
      `mentoracity:${key}`,
      JSON.stringify({ savedAt: Date.now(), value, ttlMs } satisfies Entry<T>),
    );
  } catch {
    /* storage may be disabled */
  }
}

export function clearClientCache(key: string) {
  if (typeof window !== "undefined") {
    sessionStorage.removeItem(`mentoracity:${key}`);
  }
}
