/**
 * lib/storage.js
 * ─────────────────────────────────────────────────────────────
 * Hybrid client-side storage.
 *
 * Flow for READS:
 *   1. Fetch from server API  ← source of truth (Vercel KV)
 *   2. Cache result in localStorage
 *   3. On network error → serve stale localStorage cache
 *
 * Flow for WRITES:
 *   1. Optimistically write to localStorage → instant UI update
 *   2. POST to server API  (async, non-blocking)
 *   3. On server error → localStorage still has the data (resilient)
 *
 * Collections: 'robots' | 'memories'
 * ─────────────────────────────────────────────────────────────
 */

const PREFIX = 'axiom_';
const TTL_MS = 30_000; // 30 s — re-fetch from server after this

// ---------- localStorage helpers ---------------------------------

function lsGet(key) {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function lsSet(key, value) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
    localStorage.setItem(PREFIX + key + '__ts', Date.now().toString());
  } catch { /* storage quota exceeded – silently ignore */ }
}

function lsFresh(key) {
  if (typeof window === 'undefined') return false;
  const ts = parseInt(localStorage.getItem(PREFIX + key + '__ts') || '0', 10);
  return Date.now() - ts < TTL_MS;
}

// ---------- Server fetch helpers ---------------------------------

async function serverGet(collection) {
  const res = await fetch(`/api/${collection}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Server ${res.status}`);
  return res.json();
}

async function serverPost(collection, item) {
  const res = await fetch(`/api/${collection}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(item),
  });
  if (!res.ok) throw new Error(`Server ${res.status}`);
  return res.json();
}

// ---------- Public API -------------------------------------------

/**
 * Load a collection.
 * Returns server data (and caches it) or stale localStorage fallback.
 */
export async function loadItems(collection) {
  // If cache is fresh, skip the network call
  if (lsFresh(collection)) {
    const cached = lsGet(collection);
    if (cached) return cached;
  }

  try {
    const data = await serverGet(collection);
    lsSet(collection, data);
    return data;
  } catch (err) {
    console.warn(`[storage] Server unavailable for "${collection}", using cache:`, err.message);
    return lsGet(collection) || [];
  }
}

/**
 * Add an item to a collection.
 * Optimistic localStorage update → async server sync.
 */
export async function addItem(collection, item) {
  // 1. Optimistic local update
  const existing = lsGet(collection) || [];
  const updated  = [item, ...existing];
  lsSet(collection, updated);

  // 2. Server sync (fire-and-forget; UI already updated)
  serverPost(collection, item).catch(err => {
    console.warn(`[storage] Server sync failed for "${collection}" (localStorage saved):`, err.message);
  });

  return item;
}

/**
 * Sync status for UI indicator.
 */
export function storageStatus() {
  return {
    serverUrl: typeof window !== 'undefined' ? window.location.origin + '/api' : 'N/A',
    hasCache:  (key) => !!lsGet(key),
    cacheAge:  (key) => {
      const ts = parseInt(localStorage.getItem(PREFIX + key + '__ts') || '0', 10);
      const s  = Math.round((Date.now() - ts) / 1000);
      return ts ? (s < 60 ? `${s}s ago` : `${Math.round(s/60)}m ago`) : 'no cache';
    },
  };
}
