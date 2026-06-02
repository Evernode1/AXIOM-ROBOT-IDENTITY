/**
 * app/api/robots/route.js
 * Vercel KV (Redis) ← source of truth
 * Returns ONLY real registered robots — no mock/sample data.
 */
import { storeGet, storePrepend } from '@/lib/kvStore';

const KEY = 'axiom:robots';

export async function GET() {
  try {
    const userRobots = await storeGet(KEY, []);
    return Response.json(userRobots, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    console.error('[API /robots GET]', err);
    return Response.json([], { status: 200 });
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
