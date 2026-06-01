/**
 * lib/kvStore.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Server-side storage — Vercel KV (Redis) with in-memory fallback.
 *
 * Memory cap enforcement:
 *   Each robot's MemoryStore is capped at MEMORY_CAP (100) entries.
 *   When the cap is reached, oldest entries (by timestamp) are pruned,
 *   keeping per-robot onchain storage O(1).
 *
 *   This mirrors the onchain MemoryStore contract behaviour:
 *   new entries push out the oldest once capacity is full.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { MEMORY_CAP } from './data.js';

// ── In-memory fallback (dev / cold start) ────────────────────────────────────
const mem = new Map();

async function memGet(key)        { return mem.get(key) ?? null; }
async function memSet(key, value) { mem.set(key, value); }

// ── Vercel KV loader ─────────────────────────────────────────────────────────
async function kvClient() {
  if (!process.env.KV_REST_API_URL) return null;
  try {
    const { kv } = await import('@vercel/kv');
    return kv;
  } catch {
    return null;
  }
}

// ── Public read/write ────────────────────────────────────────────────────────

export async function storeGet(key, fallback = null) {
  const kv = await kvClient();
  try {
    const val = kv ? await kv.get(key) : await memGet(key);
    return val ?? fallback;
  } catch (err) {
    console.warn('[kvStore] GET fallback to mem:', err?.message);
    return (await memGet(key)) ?? fallback;
  }
}

export async function storeSet(key, value) {
  await memSet(key, value);           // always mirror locally
  const kv = await kvClient();
  if (!kv) return;
  try { await kv.set(key, value); }
  catch (err) { console.warn('[kvStore] SET error (mem saved):', err?.message); }
}

// ── Global memory list (all robots) ──────────────────────────────────────────

/**
 * Prepend a memory entry to the global list (max 1000 entries).
 * Also enforces per-robot MEMORY_CAP by pruning the oldest entry
 * for that specific robot when its count exceeds the cap.
 */
export async function storePrependMemory(entry) {
  const GLOBAL_KEY = 'axiom:memories';
  const ROBOT_KEY  = `axiom:robot-memories:${entry.robotId}`;

  // ── 1. Per-robot memory store (enforces MEMORY_CAP) ──
  const robotMems = (await storeGet(ROBOT_KEY, []));

  let updatedRobot;
  if (robotMems.length >= MEMORY_CAP) {
    // Sort ascending by timestamp, drop oldest
    const sorted = [...robotMems].sort((a, b) => a.timestamp - b.timestamp);
    sorted.shift();                        // prune oldest
    updatedRobot = [entry, ...sorted];     // prepend new
    console.info(`[kvStore] Robot ${entry.robotId} at cap — pruned oldest memory`);
  } else {
    updatedRobot = [entry, ...robotMems];
  }
  await storeSet(ROBOT_KEY, updatedRobot);

  // ── 2. Global memory list (capped at 1000 for browsing) ──
  const global = (await storeGet(GLOBAL_KEY, []));
  const updatedGlobal = [entry, ...global].slice(0, 1000);
  await storeSet(GLOBAL_KEY, updatedGlobal);

  return {
    entry,
    robotMemCount: updatedRobot.length,
    pruned: robotMems.length >= MEMORY_CAP,
    atCap: updatedRobot.length >= MEMORY_CAP,
  };
}

/** Get per-robot memories (respects cap). */
export async function storeGetRobotMemories(robotId) {
  return storeGet(`axiom:robot-memories:${robotId}`, []);
}

// ── Robots ───────────────────────────────────────────────────────────────────

export async function storePrepend(key, item, maxLen = 500) {
  const existing = await storeGet(key, []);
  const updated  = [item, ...existing].slice(0, maxLen);
  await storeSet(key, updated);
  return updated;
}
