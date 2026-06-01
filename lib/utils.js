// ─── Core Hash ───────────────────────────────────────────────────────────────

export function simpleHash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) ^ str.charCodeAt(i);
    h = h >>> 0;
  }
  return h.toString(16).padStart(8, '0').toUpperCase();
}

// ─── Robot Identity ───────────────────────────────────────────────────────────

export function generateRobotId(name, type, wallet) {
  const ts   = Date.now().toString(36).toUpperCase();
  const seed = `${name}-${type}-${wallet}-${ts}`;
  return `AXM-${simpleHash(seed)}-${simpleHash(seed.split('').reverse().join(''))}`;
}

// ─── Onchain Memory Digest ────────────────────────────────────────────────────

/**
 * 32-byte telemetry hash (64 hex chars + 0x prefix).
 * This is the ONLY thing stored onchain per memory entry.
 * Full telemetry lives on IPFS, referenced by this hash.
 */
export function generateTelemetryHash(robotId, taskType, ts, evidence = '') {
  const seed = `${robotId}::${taskType}::${ts}::${evidence}`;
  const h1   = simpleHash(seed);
  const h2   = simpleHash(seed.split('').reverse().join(''));
  const h3   = simpleHash(h1 + h2);
  const h4   = simpleHash(h2 + h1);
  // 0x + 64 hex chars = 32 bytes
  return `0x${h1}${h2}${h3}${h4}`.toLowerCase();
}

/**
 * Simulated IPFS CIDv0 (Qm... base58, 46 chars).
 * In production: actual IPFS upload of full telemetry payload.
 * The CID is committed onchain as proof the data exists and is immutable.
 */
export function generateIPFSCID(telemetryHash) {
  const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let seed   = parseInt(simpleHash(telemetryHash), 16);
  let cid    = 'Qm';
  for (let i = 0; i < 44; i++) {
    seed  = (seed * 1664525 + 1013904223) >>> 0; // LCG
    cid  += B58[seed % 58];
  }
  return cid;
}

/**
 * Unique task ID: AXT-{timestamp_b36}-{hash}
 */
export function generateTaskId(robotId, ts) {
  const base = ts.toString(36).toUpperCase();
  const hash = simpleHash(`${robotId}:${ts}`).slice(0, 6);
  return `AXT-${base}-${hash}`;
}

/**
 * PoPW score 0–100 derived from task metrics.
 *   - Duration quality  → up to 35 pts
 *   - Evidence present  → 25 pts
 *   - Base validity     → 40 pts
 */
export function calcPoPWScore(duration = '', hasEvidence = false) {
  const mins  = parseFloat(duration.replace(/[^\d.]/g, '')) || 1;
  const durPt = Math.min(mins / 20, 1) * 35;
  const evPt  = hasEvidence ? 25 : 0;
  return Math.round(40 + durPt + evPt);
}

// ─── Legacy PoPW Hash (kept for sample data compat) ──────────────────────────

export function generatePoPWHash(robotId, taskType, ts) {
  return generateTelemetryHash(robotId, taskType, ts);
}

// ─── Reputation ───────────────────────────────────────────────────────────────

export function reputationScore(robot) {
  const taskPt    = Math.min((robot.tasks || 0) * 0.5, 40);
  const successPt = ((robot.successRate || 0) / 100) * 40;
  const ageDays   = (Date.now() - (robot.registeredAt || Date.now())) / 86400000;
  const agePt     = Math.min(ageDays * 0.5, 20);
  return Math.round(taskPt + successPt + agePt);
}

// ─── Formatting ───────────────────────────────────────────────────────────────

export function timeAgo(ts) {
  const d = Date.now() - ts;
  const m = Math.floor(d / 60000);
  const h = Math.floor(d / 3600000);
  const day = Math.floor(d / 86400000);
  if (m < 1)   return 'just now';
  if (m < 60)  return `${m}m ago`;
  if (h < 24)  return `${h}h ago`;
  return `${day}d ago`;
}

export function fmtTime(ts) {
  return new Date(ts).toLocaleString('en-US', {
    month: 'short', day: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

export function trunc(str = '', s = 8, e = 6) {
  if (!str || str.length <= s + e) return str;
  return `${str.slice(0, s)}...${str.slice(-e)}`;
}

export function typeColor(type = '') {
  const map = {
    'Drone': 'blue', 'Mobile Manipulator': 'gold',
    'Fixed Arm (Roboarm)': 'green', 'Humanoid': 'red',
    'Swarm Unit': 'blue', 'SLAM Navigator': 'green',
    'Sensor Fusion Node': 'gold', 'Custom': 'blue',
  };
  return map[type] || 'blue';
}

export function outcomeColor(outcome) {
  return { SUCCESS: 'green', PARTIAL: 'gold', FAILED: 'red' }[outcome] || 'blue';
}

// Onchain byte estimate per memory entry (task_id + telemetry_hash + popw_score + block_number)
// task_id: ~16 bytes, hash: 32 bytes, score: 1 byte, block: 4 bytes = ~96 bytes
export const ONCHAIN_BYTES_PER_ENTRY = 96;

// ─── Validator Selection & Consensus ─────────────────────────────────────────

/**
 * Select 3–5 validators randomly, weighted by reputation.
 * Suspended validators are excluded.
 * Higher reputation = higher probability of selection.
 */
export function selectValidators(pool, count = null) {
  const active = pool.filter(v => v.status === 'active');
  const n      = count ?? (3 + Math.floor(Math.random() * 3)); // 3–5

  // Weighted shuffle by reputation
  const weighted = active.map(v => ({ v, w: v.reputation + Math.random() * 20 }));
  weighted.sort((a, b) => b.w - a.w);
  return weighted.slice(0, Math.min(n, active.length)).map(x => x.v);
}

/**
 * Assign random IPFS sections to each validator (random sampling).
 * Each validator only downloads & checks a subset — not the full payload.
 */
export function assignSections(validators, allSections) {
  return validators.map(v => {
    const count    = 2 + Math.floor(Math.random() * 2); // 2–3 sections each
    const shuffled = [...allSections].sort(() => Math.random() - 0.5);
    return { ...v, sections: shuffled.slice(0, count) };
  });
}

/**
 * Compute validator scores. Each deviates slightly from base.
 * Returns { scores, consensus, passed, challengeTriggered }
 *
 * 70% consensus rule:
 *   - Compute median score
 *   - Validators within ±15 pts of median = "agreeing"
 *   - If agreeing / total < 0.70 → challenge round triggered
 */
export function computeConsensus(validators, baseScore) {
  const scores = validators.map(v => {
    const variance = Math.round((Math.random() - 0.5) * 20);
    // Lazy/low-rep validators deviate more
    const lazyFactor = v.reputation < 70 ? Math.round((Math.random() - 0.3) * 30) : 0;
    return {
      ...v,
      score:    Math.max(0, Math.min(100, baseScore + variance + lazyFactor)),
      variance: variance + lazyFactor,
    };
  });

  const sorted  = [...scores].sort((a, b) => a.score - b.score);
  const median  = sorted[Math.floor(sorted.length / 2)].score;
  const agreeing = scores.filter(s => Math.abs(s.score - median) <= 15);
  const ratio    = agreeing.length / scores.length;
  const passed   = ratio >= 0.70;

  const consensusScore = Math.round(
    agreeing.reduce((sum, s) => sum + s.score, 0) / agreeing.length
  );

  return {
    scores,
    consensusScore,
    median,
    agreeingCount: agreeing.length,
    totalCount:    scores.length,
    ratio:         parseFloat((ratio * 100).toFixed(1)),
    passed,
    challengeTriggered: !passed,
    deviants: scores.filter(s => Math.abs(s.score - median) > 15),
  };
}

/**
 * Simulate a challenge round — bring in 2 extra validators.
 * Challenge round always reaches consensus (simplified).
 */
export function runChallengeRound(pool, usedIds, baseScore) {
  const fresh = pool
    .filter(v => v.status === 'active' && !usedIds.includes(v.id))
    .sort(() => Math.random() - 0.5)
    .slice(0, 2);

  return fresh.map(v => ({
    ...v,
    score:     Math.max(0, Math.min(100, baseScore + Math.round((Math.random() - 0.5) * 10))),
    isChallenge: true,
  }));
}

// Challenge window remaining
export function challengeTimeLeft(timestamp) {
  const expiresAt = timestamp + 24 * 3600 * 1000;
  const left      = expiresAt - Date.now();
  if (left <= 0) return 'Expired';
  const h = Math.floor(left / 3600000);
  const m = Math.floor((left % 3600000) / 60000);
  return `${h}h ${m}m`;
}
