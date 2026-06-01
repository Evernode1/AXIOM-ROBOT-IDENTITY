/**
 * app/api/robots/route.js
 * Vercel KV (Redis) ← source of truth
 * In-memory fallback when KV is not configured
 */
import { storeGet, storePrepend } from '@/lib/kvStore';
import { SAMPLE_ROBOTS } from '@/lib/data';

const KEY = 'axiom:robots';

export async function GET() {
  try {
    const userRobots = await storeGet(KEY, []);
    const all = [...SAMPLE_ROBOTS, ...userRobots];
    return Response.json(all, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    console.error('[API /robots GET]', err);
    return Response.json(SAMPLE_ROBOTS, { status: 200 });
  }
}

export async function POST(req) {
  try {
    const robot = await req.json();

    // Basic validation
    if (!robot?.id || !robot?.name || !robot?.type) {
      return Response.json({ error: 'Invalid robot payload' }, { status: 400 });
    }

    const updated = await storePrepend(KEY, robot, 500);

    return Response.json(
      { success: true, robot, total: updated.length },
      { status: 201 }
    );
  } catch (err) {
    console.error('[API /robots POST]', err);
    return Response.json({ error: 'Storage error' }, { status: 500 });
  }
}
