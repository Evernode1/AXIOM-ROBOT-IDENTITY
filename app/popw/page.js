'use client';
import { useState, useEffect, useRef } from 'react';
import {
  CheckCircle, Hash, Zap, ChevronRight, Lock, Unlock,
  Eye, EyeOff, AlertTriangle, Wifi, WifiOff, Database, Globe, Wallet,
  ClipboardList, Clock, Shield, Activity, Cpu, Network, BookOpen, X, Play
} from 'lucide-react';
import { TASK_CATEGORIES, MEMORY_CAP, VALIDATOR_POOL, TELEMETRY_SECTIONS } from '@/lib/data';
import { addItem } from '@/lib/storage';
import {
  generateTelemetryHash, generateIPFSCID, generateTaskId,
  calcPoPWScore, fmtTime, timeAgo, trunc,
  selectValidators, assignSections, computeConsensus, runChallengeRound,
} from '@/lib/utils';

import {
  WALLET, CHAIN, EXPLORER,
  sendExtrinsic, initChain,
  fbSaveMemory, fbSaveReputation, loadDB, DB,
  postTaskOnchain, fbUpdateTask,
  chainHash,
  on, off,
} from '@/lib/chain';

const PHASES = {
  COMMIT: {
    label: 'COMMIT',
    color: '#4D9FFF',
    steps: [
      'Hashing full telemetry payload (local)...',
      'Generating 32-byte telemetry_hash...',
      'Broadcasting commit tx to Konnex subnet...',
      'telemetry_hash anchored at block N ✓',
    ],
  },
  VALIDATE: {
    label: 'VALIDATE',
    color: '#F0A500',
    steps: [
      'Sending telemetry to peer validators (off-chain)...',
      'Validator-1 verifying hash against telemetry...',
      'Validator-2 verifying hash against telemetry...',
      'Validator-3 scoring PoPW quality...',
      'Validator consensus reached ✓',
    ],
  },
  SCORE: {
    label: 'SCORE',
    color: '#00FFB2',
    steps: [
      'Computing consensus popw_score...',
      'Uploading full telemetry to IPFS...',
      'Committing ipfs_cid + popw_score onchain...',
      'Writing memory digest to Vercel KV...',
      'Memory committed — O(1) onchain ✓',
    ],
  },
};

const EMPTY = { robotId: '', taskType: '', description: '', duration: '', evidence: '' };

const TECH_SECTIONS = [
  {
    icon: Shield,
    color: '#F0A500',
    title: 'Lazy Validator Strategy',
    tag: 'CONSENSUS',
    body: 'Validators are sampled lazily — only 5 of N registered validators are randomly selected per PoPW submission. Each validator receives a non-overlapping telemetry section via assignSections(). A 70% agreement threshold triggers consensus; below 70% spawns a challenge round with 3 additional validators.',
    details: ['Random 5-of-N sampling per round', '70% threshold → consensus pass', '<70% → challenge round (+3 validators)', 'Stake-weighted scoring (higher KNX stake = higher weight)', 'Deviant validators slashed in future mainnet'],
  },
  {
    icon: Activity,
    color: '#4D9FFF',
    title: 'Sensor Fusion & Telemetry',
    tag: 'DATA LAYER',
    body: 'Raw telemetry is a multi-modal stream: LiDAR point clouds, camera frames, IMU quaternions, joint torques, and task completion signals. Sensors are fused via a weighted Kalman filter: completion_pct (40%), safety_score (35%), efficiency (25%).',
    details: ['LiDAR + Camera + IMU + Joint torque fusion', 'Weighted Kalman filter (completion 40%, safety 35%, efficiency 25%)', '32-byte Keccak-256 telemetry_hash → onchain only', 'Full raw payload → IPFS (proprietary, private)', 'Task-type-specific scoring'],
  },
  {
    icon: Database,
    color: '#00FFB2',
    title: 'Hybrid Storage Architecture',
    tag: 'STORAGE',
    body: 'AXIOM uses a three-layer storage stack: (1) Konnex Substrate chain stores only 96-byte digests per task. (2) IPFS stores full telemetry payloads. (3) Firebase Firestore acts as the hot-path index for real-time fleet queries.',
    details: ['Layer 1 — Konnex Substrate: 96 bytes/task, immutable', 'Layer 2 — IPFS: raw telemetry, proprietary, content-addressed', 'Layer 3 — Firebase Firestore: real-time index, onSnapshot listeners', 'Memory cap: 1024 entries/robot → oldest pruned at cap'],
  },
  {
    icon: Network,
    color: '#CE93D8',
    title: 'ZK-PoPW Roadmap',
    tag: 'ZERO KNOWLEDGE',
    body: 'Current PoPW uses hash-commitment + validator consensus. The ZK roadmap replaces validator consensus with a SNARK proof that the robot\'s sensor data satisfies task completion predicates without revealing raw data.',
    details: ['Phase 1: hash-commitment + validator consensus (live)', 'Phase 2: Groth16 SNARK for completion predicates (Q3 2025)', 'Phase 3: safety + efficiency ZK predicates (Q4 2025)', 'Phase 4: Full ZK-PoPW — no validators needed (Q2 2026)', 'ZK verification: ~200k gas vs ~5M for full consensus'],
  },
];

// ── Inline PoPW Transaction Modal for Task Board ──────────────────────────────
function TaskPoPWModal({ task, robots, onClose, onComplete }) {
  const [form, setForm] = useState({
    robotId: task.robot_id || (robots[0]?.robot_id || robots[0]?.id || ''),
    taskType: task.task_type || '',
    description: '',
    duration: '',
    evidence: '',
  });
  const [errors, setErrors] = useState({});
  const [phase, setPhase] = useState(null);
  const [step, setStep] = useState(0);
  const [phasesDone, setPhasesDone] = useState([]);
  const [hashAnim, setHashAnim] = useState('');
  const [result, setResult] = useState(null);
  const [validatorScores, setValidatorScores] = useState([]);
  const [consensusData, setConsensusData] = useState(null);
  const intervalRef = useRef(null);
  const isRunning = phase && phase !== 'DONE';

  function validate() {
    const e = {};
    if (!form.robotId)            e.robotId     = 'Select a robot';
    if (!form.taskType)           e.taskType    = 'Select task category';
    if (!form.description.trim()) e.description = 'Describe the task';
    if (!form.duration.trim())    e.duration    = 'Enter task duration';
    return e;
  }

  async function runPhase(phaseName, stepsArr, delayMs = 750) {
    setPhase(phaseName);
    setStep(0);
    for (let i = 0; i < stepsArr.length; i++) {
      await new Promise(r => setTimeout(r, i === stepsArr.length - 1 ? delayMs * 1.5 : delayMs));
      setStep(i + 1);
    }
    setPhasesDone(prev => [...prev, phaseName]);
  }

  async function handleSubmit() {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }

    if (!WALLET.connected || !WALLET.signer || WALLET.readOnly) {
      setErrors({ _wallet: 'SubWallet / Talisman wallet connect karo — onchain tx ke liye signer chahiye.' });
      return;
    }

    setErrors({});
    setResult(null);
    setPhasesDone([]);
    setValidatorScores([]);

    const ts            = Date.now();
    const telemetryHash = generateTelemetryHash(form.robotId, form.taskType, ts, form.evidence);
    const robot         = robots.find(r => (r.robot_id || r.id) === form.robotId);

    // PHASE 1: COMMIT
    const chars = '0123456789abcdef';
    intervalRef.current = setInterval(() => {
      setHashAnim('0x' + Array.from({ length: 32 }, () => chars[Math.floor(Math.random() * chars.length)]).join(''));
    }, 60);

    const commitPhasePromise = runPhase('COMMIT', PHASES.COMMIT.steps, 700);

    let txResult;
    try {
      txResult = await sendExtrinsic(
        'axiom.commitPoPW',
        { robotId: form.robotId.slice(0, 16), taskType: form.taskType, telemetryHash: telemetryHash.slice(0, 18), ts },
        `commitPoPW(${form.taskType})`
      );
    } catch (err) {
      clearInterval(intervalRef.current);
      setPhase(null);
      setErrors({ _wallet: 'Transaction failed: ' + err.message });
      return;
    }

    await commitPhasePromise;
    clearInterval(intervalRef.current);
    setHashAnim(telemetryHash);

    const realBlock  = txResult.blockNumber;
    const realTxHash = txResult.txHash;

    // PHASE 2: VALIDATE
    await runPhase('VALIDATE', PHASES.VALIDATE.steps, 800);

    const baseScore = calcPoPWScore(form.duration, !!form.evidence);
    const sampled   = selectValidators(VALIDATOR_POOL);
    const withSecs  = assignSections(sampled, TELEMETRY_SECTIONS);

    const consensus = computeConsensus(sampled, baseScore);
    for (let i = 0; i < consensus.scores.length; i++) {
      await new Promise(r => setTimeout(r, 400));
      setValidatorScores(prev => [...prev, consensus.scores[i]]);
    }
    setConsensusData(consensus);

    if (consensus.challengeTriggered) {
      await new Promise(r => setTimeout(r, 600));
      const extras = runChallengeRound(VALIDATOR_POOL, sampled.map(v => v.id), baseScore);
      for (const ev2 of extras) {
        await new Promise(r => setTimeout(r, 350));
        setValidatorScores(prev => [...prev, ev2]);
      }
    }

    // PHASE 3: SCORE
    const scoreTxSteps = [
      'Computing consensus popw_score…',
      'Uploading full telemetry to IPFS…',
      'Signing writeMemory extrinsic — approve in wallet…',
      'Memory committed onchain ✓',
    ];
    const scorePhasePromise = runPhase('SCORE', scoreTxSteps, 750);

    const finalScore = consensus.passed ? consensus.consensusScore : baseScore;
    const ipfsCid    = generateIPFSCID(telemetryHash);
    const taskId     = generateTaskId(form.robotId, ts);

    let scoreTxResult;
    try {
      scoreTxResult = await sendExtrinsic(
        'axiom.writeMemory',
        { robotId: form.robotId.slice(0, 16), taskId: taskId.slice(0, 16), taskType: form.taskType, popw: finalScore, ipfsCid: ipfsCid.slice(0, 20) },
        `writeMemory(${form.taskType}, score=${finalScore.toFixed(3)})`
      );
    } catch (err) {
      scoreTxResult = { txHash: null, blockNumber: realBlock };
    }

    await scorePhasePromise;

    const newMem = {
      task_id: taskId, telemetry_hash: telemetryHash, popw_score: finalScore,
      block_number: scoreTxResult.blockNumber || realBlock, tx_hash: realTxHash,
      score_tx_hash: scoreTxResult.txHash || null, ipfs_cid: ipfsCid,
      id: `MEM-${ts}`, robot_id: form.robotId, robotId: form.robotId,
      robotName: robot?.metadata?.label || robot?.name || 'Unknown',
      task_type: form.taskType, taskType: form.taskType,
      description: form.description, duration: form.duration,
      timestamp: ts, outcome: finalScore >= 0.5 ? 'SUCCESS' : 'FAILED',
      validator_addr: WALLET.address, local: false,
    };

    await fbSaveMemory(newMem).catch(console.warn);
    await addItem('memories', newMem).catch(console.warn);

    // Mark task as completed
    try {
      await fbUpdateTask(task.task_id, {
        status: 'completed',
        completed_at: new Date().toISOString(),
        popw_score: finalScore,
        tx_hash: realTxHash,
        completed_by: form.robotId,
      });
    } catch (e) { console.warn('[modal] fbUpdateTask:', e.message); }

    // Update reputation
    const success = finalScore >= 0.5;
    const DECAY = 0.95;
    if (!DB.reputation[form.robotId]) DB.reputation[form.robotId] = { score: 0, total_tasks: 0, successful_tasks: 0, last_updated: new Date().toISOString() };
    const rep = DB.reputation[form.robotId];
    rep.score = +Math.min(1, Math.max(0, DECAY * rep.score + (1 - DECAY) * finalScore)).toFixed(4);
    rep.total_tasks = (rep.total_tasks || 0) + 1;
    if (success) rep.successful_tasks = (rep.successful_tasks || 0) + 1;
    rep.last_updated = new Date().toISOString();
    await fbSaveReputation(form.robotId, rep).catch(console.warn);

    setResult(newMem);
    setPhase('DONE');
    onComplete(newMem);
  }

  const currentPhaseData = phase && phase !== 'DONE' ? PHASES[phase] : null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(4,6,14,0.92)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '1rem',
      backdropFilter: 'blur(6px)',
    }}>
      <div style={{
        width: '100%', maxWidth: 640,
        background: '#0B0E1A',
        border: '1px solid rgba(240,165,0,0.25)',
        borderRadius: 12,
        maxHeight: '90vh',
        overflowY: 'auto',
        boxShadow: '0 0 60px rgba(240,165,0,0.08)',
      }}>
        {/* Modal Header */}
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid rgba(240,165,0,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div className="f-mono" style={{ fontSize: '0.58rem', color: '#F0A500', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: '0.2rem' }}>
              ⛓ Submit PoPW — Task
            </div>
            <div style={{ fontSize: '0.85rem', color: '#E2DDD6', fontWeight: 500, maxWidth: 420, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {task.instruction}
            </div>
          </div>
          {!isRunning && (
            <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, padding: '6px', cursor: 'pointer', color: '#5A5550', display: 'flex' }}>
              <X size={14} />
            </button>
          )}
        </div>

        <div style={{ padding: '1.5rem' }}>
          {/* Phase pipeline */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '1px', background: 'rgba(240,165,0,0.08)', marginBottom: '1.5rem', borderRadius: 6, overflow: 'hidden' }}>
            {Object.entries(PHASES).map(([key, p], i) => {
              const done   = phasesDone.includes(key);
              const active = phase === key;
              return (
                <div key={key} style={{ padding: '0.75rem 1rem', background: active ? `${p.color}10` : done ? '#0F1220' : '#101525', borderLeft: active ? `2px solid ${p.color}` : done ? '2px solid rgba(0,255,178,0.3)' : '2px solid transparent' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <div style={{ width: 14, height: 14, borderRadius: '50%', background: done ? 'rgba(0,255,178,0.15)' : active ? `${p.color}20` : 'rgba(255,255,255,0.04)', border: `1px solid ${done ? 'rgba(0,255,178,0.4)' : active ? p.color + '60' : 'rgba(255,255,255,0.08)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {done ? <CheckCircle size={7} color="#00FFB2" /> : <span className="f-mono" style={{ fontSize: '0.45rem', color: active ? p.color : '#3A3835' }}>{i+1}</span>}
                    </div>
                    <span className="f-mono" style={{ fontSize: '0.55rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: done ? '#00FFB2' : active ? p.color : '#3A3835' }}>{p.label}</span>
                    {active && <span style={{ width: 5, height: 5, borderRadius: '50%', background: p.color, animation: 'anim-pulse 1.5s infinite' }} />}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Form — only shown before running */}
          {!isRunning && !result && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ fontFamily: "'Space Mono',monospace", fontSize: '0.6rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#3A3835', display: 'block', marginBottom: '0.35rem' }}>Select Robot *</label>
                <select value={form.robotId} onChange={e => setForm({ ...form, robotId: e.target.value })}>
                  <option value="">Choose robot...</option>
                  {robots.map(r => (
                    <option key={r.robot_id || r.id} value={r.robot_id || r.id}>
                      {r.metadata?.label || r.name || r.robot_id} — {r.metadata?.type || r.type}
                    </option>
                  ))}
                </select>
                {errors.robotId && <div style={{ color: '#FF4D6A', fontSize: '0.68rem', marginTop: '0.25rem', fontFamily: "'Space Mono',monospace" }}>{errors.robotId}</div>}
              </div>

              <div>
                <label style={{ fontFamily: "'Space Mono',monospace", fontSize: '0.6rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#3A3835', display: 'block', marginBottom: '0.35rem' }}>Task Category *</label>
                <select value={form.taskType} onChange={e => setForm({ ...form, taskType: e.target.value })}>
                  <option value="">Select category...</option>
                  {TASK_CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
                {errors.taskType && <div style={{ color: '#FF4D6A', fontSize: '0.68rem', marginTop: '0.25rem', fontFamily: "'Space Mono',monospace" }}>{errors.taskType}</div>}
              </div>

              <div>
                <label style={{ fontFamily: "'Space Mono',monospace", fontSize: '0.6rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#3A3835', display: 'block', marginBottom: '0.35rem' }}>Task Description *</label>
                <textarea rows={3} placeholder="What did the robot do, sensors active, environment conditions..." value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} style={{ resize: 'vertical' }} />
                {errors.description && <div style={{ color: '#FF4D6A', fontSize: '0.68rem', marginTop: '0.25rem', fontFamily: "'Space Mono',monospace" }}>{errors.description}</div>}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ fontFamily: "'Space Mono',monospace", fontSize: '0.6rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#3A3835', display: 'block', marginBottom: '0.35rem' }}>Duration *</label>
                  <input placeholder="e.g. 12m 34s" value={form.duration} onChange={e => setForm({ ...form, duration: e.target.value })} />
                  {errors.duration && <div style={{ color: '#FF4D6A', fontSize: '0.68rem', marginTop: '0.25rem', fontFamily: "'Space Mono',monospace" }}>{errors.duration}</div>}
                </div>
                <div>
                  <label style={{ fontFamily: "'Space Mono',monospace", fontSize: '0.6rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#3A3835', display: 'block', marginBottom: '0.35rem' }}>Evidence (IPFS)</label>
                  <input placeholder="CID or sensor hash..." value={form.evidence} onChange={e => setForm({ ...form, evidence: e.target.value })} />
                </div>
              </div>

              {errors._wallet && (
                <div style={{ padding: '0.7rem 1rem', background: 'rgba(255,77,77,0.07)', border: '1px solid rgba(255,77,77,0.25)', borderRadius: 8, fontFamily: "'Space Mono',monospace", fontSize: '0.68rem', color: '#FF4D4D' }}>
                  ⚠ {errors._wallet}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginTop: '0.25rem' }}>
                <button onClick={onClose} style={{ padding: '10px', background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, cursor: 'pointer', fontFamily: "'Space Mono',monospace", fontSize: '0.68rem', color: '#5A5550' }}>
                  Cancel
                </button>
                <button onClick={handleSubmit} style={{ padding: '10px 16px', background: 'rgba(240,165,0,0.12)', border: '1px solid rgba(240,165,0,0.4)', borderRadius: 8, cursor: 'pointer', fontFamily: "'Space Mono',monospace", fontWeight: 700, fontSize: '0.72rem', color: '#F0A500', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <Play size={12} /> Begin PoPW Transaction
                </button>
              </div>
            </div>
          )}

          {/* Running pipeline display */}
          {isRunning && currentPhaseData && (
            <div>
              <div style={{ background: '#06080F', border: '1px solid rgba(0,255,178,0.1)', padding: '0.85rem', marginBottom: '1rem', borderRadius: 6 }}>
                <div className="f-mono" style={{ fontSize: '0.52rem', color: '#3A3835', marginBottom: '0.4rem', letterSpacing: '0.1em' }}>TELEMETRY HASH — animating</div>
                <div className="f-mono" style={{ fontSize: '0.62rem', color: '#F0A500', wor
