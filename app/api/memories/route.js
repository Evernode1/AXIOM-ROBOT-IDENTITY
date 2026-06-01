/**
 * app/api/memories/route.js
 *
 * GET  /api/memories          → returns global memory list (onchain + index fields)
 * POST /api/memories          → commits a new memory entry
 *                               enforces MEMORY_CAP per robot (oldest pruned)
 *
 * Each stored entry shape:
 *   ONCHAIN DIGEST  task_id | telemetry_hash | popw_score | block_number
 *   OFFCHAIN REF    ipfs_cid
 *   INDEX           robotId | robotName | taskType | timestamp | outcome | duration
 */
import { storeGet, storePrependMemory } from '@/lib/kvStore';
import { SAMPLE_MEMORIES, MEMORY_CAP }  from '@/lib/data';

const GLOBAL_KEY = 'axiom:memories';

export async function GET() {
  try {
    const stored = await storeGet(GLOBAL_KEY, []);
    const all    = [...stored, ...SAMPLE_MEMORIES]
      .sort((a, b) => b.timestamp - a.timestamp);

    return Response.json(all, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('[API /memories GET]', err);
    return Response.json(SAMPLE_MEMORIES, { status: 200 });
  }
}

export async function POST(req) {
  try {
    const entry = await req.json();

    // ── Validate required onchain fields ──
    const required = ['task_id', 'telemetry_hash', 'popw_score', 'block_number',
                      'ipfs_cid', 'robotId', 'taskType', 'timestamp'];
    const missing  = required.filter(f => entry[f] == null);
    if (missing.length) {
      return Response.json(
        { error: 'Missing fields', missing },
        { status: 400 }
      );
    }

    // ── Enforce memory cap (per-robot, oldest pruned) ──
    const result = await storePrependMemory(entry);

    return Response.json(
      {
        success:      true,
        entry:        result.entry,
        robotMemCount:result.robotMemCount,
        atCap:        result.atCap,
        pruned:       result.pruned,
        memoryCap:    MEMORY_CAP,
        onchainBytes: 96,               // fixed per entry
        message:      result.pruned
          ? `Memory cap reached — oldest entry pruned (cap: ${MEMORY_CAP})`
          : `Memory committed (${result.robotMemCount}/${MEMORY_CAP})`,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error('[API /memories POST]', err);
    return Response.json({ error: 'Storage error' }, { status: 500 });
  }
}
