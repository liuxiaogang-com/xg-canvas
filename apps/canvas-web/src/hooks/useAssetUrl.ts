import { useEffect, useState } from 'react';

import { assetApi, type AssetUrlVariant } from '../api/asset';

interface CachedUrl {
  url: string;
  expires_at: number;
}

const cache = new Map<string, CachedUrl>();
const inflight = new Map<string, { epoch: number; promise: Promise<CachedUrl> }>();
const clearListeners = new Set<() => void>();
const MAX_CACHE_ENTRIES = 256;
let cacheEpoch = 0;

function cacheKey(assetId: string, variant: AssetUrlVariant): string {
  return `${variant}:${assetId}`;
}

/** Fetches, deduplicates and refreshes a presigned asset URL before expiry. */
export function useAssetUrl(
  assetId: string | null | undefined,
  ttlSec = 3600,
  variant: AssetUrlVariant = 'full',
  /** Bump to force refetch (e.g. after ensureVideoThumb attaches a poster). */
  revision = 0,
): string | null {
  const [url, setUrl] = useState<string | null>(() => readFresh(assetId, variant)?.url ?? null);

  useEffect(() => {
    if (!assetId) {
      setUrl(null);
      return;
    }
    const key = cacheKey(assetId, variant);
    const initial = revision === 0 ? readFresh(assetId, variant) : null;
    setUrl(initial?.url ?? null);
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onCacheClear = () => {
      if (timer) clearTimeout(timer);
      timer = null;
      setUrl(null);
    };
    clearListeners.add(onCacheClear);

    const schedule = (entry: CachedUrl) => {
      if (timer) clearTimeout(timer);
      const remaining = entry.expires_at - Date.now();
      const refreshLead = Math.min(5 * 60_000, Math.max(10_000, remaining / 5));
      timer = setTimeout(() => void load(true), Math.max(1_000, remaining - refreshLead));
    };

    const load = async (force: boolean) => {
      if (!force && revision === 0) {
        const cached = readFresh(assetId, variant);
        if (cached) {
          setUrl(cached.url);
          schedule(cached);
          return;
        }
      }
      try {
        const entry = await fetchUrl(key, assetId, ttlSec, variant, force);
        if (cancelled) return;
        setUrl(entry.url);
        schedule(entry);
      } catch {
        if (!cancelled) setUrl(null);
      }
    };

    void load(revision > 0);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      clearListeners.delete(onCacheClear);
    };
  }, [assetId, ttlSec, variant, revision]);

  return url;
}

/** Drop cached URLs for an asset (both variants) after metadata changes. */
export function invalidateAssetUrlCache(assetId: string): void {
  cache.delete(cacheKey(assetId, 'full'));
  cache.delete(cacheKey(assetId, 'thumb'));
}

/** Clear every signed URL when the authenticated workspace/session changes. */
export function clearAssetUrlCache(): void {
  cacheEpoch += 1;
  cache.clear();
  inflight.clear();
  clearListeners.forEach((listener) => listener());
}

function readFresh(assetId: string | null | undefined, variant: AssetUrlVariant): CachedUrl | null {
  if (!assetId) return null;
  const key = cacheKey(assetId, variant);
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expires_at <= Date.now() + 5_000) {
    cache.delete(key);
    return null;
  }
  // Map insertion order doubles as a small LRU queue.
  cache.delete(key);
  cache.set(key, entry);
  return entry;
}

function fetchUrl(
  key: string,
  assetId: string,
  ttlSec: number,
  variant: AssetUrlVariant,
  force: boolean,
): Promise<CachedUrl> {
  if (!force) {
    const cached = readFresh(assetId, variant);
    if (cached) return Promise.resolve(cached);
  }
  const epoch = cacheEpoch;
  const pending = inflight.get(key);
  if (pending?.epoch === epoch) return pending.promise;
  let request: Promise<CachedUrl>;
  request = assetApi
    .url(assetId, ttlSec, variant)
    .then((response) => {
      // A request started under a previous user/workspace must never repopulate
      // the cache or update a still-mounted consumer after session reset.
      if (epoch !== cacheEpoch) throw new Error('asset URL session changed');
      const entry = { url: response.url, expires_at: Date.now() + response.expires_in * 1000 };
      writeCache(key, entry);
      return entry;
    })
    .finally(() => {
      if (inflight.get(key)?.promise === request) inflight.delete(key);
    });
  inflight.set(key, { epoch, promise: request });
  return request;
}

function writeCache(key: string, entry: CachedUrl): void {
  cache.delete(key);
  cache.set(key, entry);
  while (cache.size > MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value as string | undefined;
    if (!oldest) break;
    cache.delete(oldest);
  }
}
