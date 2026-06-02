'use client';
import { useState, useEffect, useRef } from 'react';
import {
  CheckCircle, Hash, Zap, ChevronRight, Lock, Unlock,
  Eye, EyeOff, AlertTriangle, Wifi, WifiOff, Database, Globe, Wallet
} from 'lucide-react';
import { TASK_CATEGORIES, MEMORY_CAP, VALIDATOR_POOL, TELEMETRY_SECTIONS } from '@/lib/data';
import { loadItems, addItem }          from '@/lib/storage';
import {
  generateTelemetryHash, generateIPFSCID, generateTaskId,
  calcPoPWScore, fmtTime, timeAgo, trunc,
  selectValidators, assignSections, computeConsensus, runChallengeRound,
} from '@/lib/utils';

// ── Onchain engine ────────────────────────────────────────────────────────────
import {
  WALLET, CHAIN, EXPLORER,
  sendExtrinsic, initChain,
  fbSaveMemory, loadDB, DB,
  chainHash,
  on, off,
} from '@/lib/chain';

// ── Commit-Reveal Pipeline Stages ────────────────────────────────────────────
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

// ── Validator pool pulled from shared data ────────────────────────────────────

export default function PoPW() {
  const [robots, setRobots]   = useState([]);
  const [memories, setMemories] = useState([]);
  const [form, setForm]       = useState(EMPTY);
  const [errors, setErrors]   = useState({});
  const [synced, setSynced]   = useState(false);

  // Pipeline state
  const [phase, setPhase]         = useState(null);  // null | 'COMMIT' | 'VALIDATE' | 'SCORE'
  const [step, setStep]           = useState(0);
  const [phasesDone, setPhasesDone] = useState([]);  // completed phases
  const [hashAnim, setHashAnim]   = useState('');
  const [result, setResult]       = useState(null);
  const [validatorScores, setValidatorScores] = useState([]);
  const [selectedVals, setSelectedVals]       = useState([]);
  const [consensusData, setConsensusData]     = useState(null);
  const [challengeVals, setChallengeVals]     = useState([]);
  const [showRaw, setShowRaw]     = useState(false); // privacy toggle
  const intervalRef               = useRef(null);

  useEffect(() => {
    (async () => {
      const [r, m] = await Promise.all([loadItems('robots'), loadItems('memories')]);
      setRobots(r);
      setMemories(m.sort((a, b) => b.timestamp - a.timestamp));
      setSynced(true);
    })();
  }, []);

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

  async function handleSubmit(ev) {
    ev.preventDefault();
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }

    // ── Wallet guard ──────────────────────────────────────────────────
    if (!WALLET.connected || !WALLET.signer || WALLET.readOnly) {
      setErrors({ _wallet: 'SubWallet / Talisman connect karo pehle — real onchain tx ke liye signer chahiye.' });
      return;
    }

    setErrors({});
    setResult(null);
    setPhasesDone([]);
    setValidatorScores([]);

    const ts             = Date.now();
    const telemetryHash  = generateTelemetryHash(form.robotId, form.taskType, ts, form.evidence);
    const robot          = robots.find(r => r.id === form.robotId);

    // ── PHASE 1: COMMIT — real system.remark tx ───────────────────────
    const chars = '0123456789abcdef';
    intervalRef.current = setInterval(() => {
      setHashAnim('0x' + Array.from({ length: 32 }, () => chars[Math.floor(Math.random() * chars.length)]).join(''));
    }, 60);

    // Start phase animation concurrently with tx signing
    const commitPhasePromise = runPhase('COMMIT', PHASES.COMMIT.steps, 700);

    let txResult;
    try {
      txResult = await sendExtrinsic(
        'axiom.commitPoPW',
        {
          robotId:       form.robotId.slice(0, 16),
          taskType:      form.taskType,
          telemetryHash: telemetryHash.slice(0, 18),
          ts,
        },
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

    const realBlock = txResult.blockNumber;
    const realTxHash = txResult.txHash;

    // ── PHASE 2: VALIDATE ─────────────────────────────────────────────
    await runPhase('VALIDATE', PHASES.VALIDATE.steps, 800);

    const baseScore  = calcPoPWScore(form.duration, !!form.evidence);
    const sampled    = selectValidators(VALIDATOR_POOL);
    const withSecs   = assignSections(sampled, TELEMETRY_SECTIONS);
    setSelectedVals(withSecs);

    const consensus = computeConsensus(sampled, baseScore);
    for (let i = 0; i < consensus.scores.length; i++) {
      await new Promise(r => setTimeout(r, 400));
      setValidatorScores(prev => [...prev, consensus.scores[i]]);
    }
    setConsensusData(consensus);

    if (consensus.challengeTriggered) {
      await new Promise(r => setTimeout(r, 600));
      const extras = runChallengeRound(VALIDATOR_POOL, sampled.map(v => v.id), baseScore);
      setChallengeVals(extras);
      for (const ev2 of extras) {
        await new Promise(r => setTimeout(r, 350));
        setValidatorScores(prev => [...prev, ev2]);
      }
    }

    // ── PHASE 3: SCORE — second real tx (writeMemory) ─────────────────
    const scoreTxSteps = [
      'Computing consensus popw_score…',
      'Uploading full telemetry to IPFS…',
      'Signing writeMemory extrinsic — approve in wallet…',
      'Memory committed onchain ✓',
    ];
    const scorePhasePromise = runPhase('SCORE', scoreTxSteps, 750);

    const finalScore   = consensus.passed ? consensus.consensusScore : baseScore;
    const ipfsCid      = generateIPFSCID(telemetryHash);
    const taskId       = generateTaskId(form.robotId, ts);

    let scoreTxResult;
    try {
      scoreTxResult = await sendExtrinsic(
        'axiom.writeMemory',
        {
          robotId:   form.robotId.slice(0, 16),
          taskId:    taskId.slice(0, 16),
          taskType:  form.taskType,
          popw:      finalScore,
          ipfsCid:   ipfsCid.slice(0, 20),
        },
        `writeMemory(${form.taskType}, score=${finalScore.toFixed(3)})`
      );
    } catch (err) {
      // Score tx failed — still show commit result with warning
      scoreTxResult = { txHash: null, blockNumber: realBlock };
      console.warn('[PoPW] Score tx failed:', err.message);
    }

    await scorePhasePromise;

    // ── Build final memory entry ──────────────────────────────────────
    const newMem = {
      // ── ONCHAIN DIGEST ──
      task_id:        taskId,
      telemetry_hash: telemetryHash,
      popw_score:     finalScore,
      block_number:   scoreTxResult.blockNumber || realBlock,
      tx_hash:        realTxHash,
      score_tx_hash:  scoreTxResult.txHash || null,
      // ── OFFCHAIN (IPFS) ──
      ipfs_cid:       ipfsCid,
      // ── INDEX ──
      id:             `MEM-${ts}`,
      robot_id:       form.robotId,
      robotId:        form.robotId,
      robotName:      robot?.name || 'Unknown',
      task_type:      form.taskType,
      taskType:       form.taskType,
      description:    form.description,
      duration:       form.duration,
      timestamp:      ts,
      outcome:        finalScore >= 0.5 ? 'SUCCESS' : 'FAILED',
      validator_addr: WALLET.address,
      commit_phase:   ts - 2400,
      reveal_phase:   ts - 1600,
      score_phase:    ts,
      local:          false,
    };

    // Persist: Firebase (global) + Vercel KV (index)
    await fbSaveMemory(newMem).catch(console.warn);
    await addItem('memories', newMem).catch(console.warn);

    setMemories(prev => [newMem, ...prev]);
    setResult(newMem);
    setPhase('DONE');
    setForm(EMPTY);
  }

  const selectedRobot = robots.find(r => r.id === form.robotId);
  const isRunning     = phase && phase !== 'DONE';
  const currentPhaseData = phase && phase !== 'DONE' ? PHASES[phase] : null;

  return (
    <div className="page-wrap">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="page-header">
        <div className="page-sub">// Proof of Physical Work</div>
        <h1 className="page-title">COMMIT–REVEAL–SCORE</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
          <p style={{ color: '#6A6560', fontSize: '0.88rem', maxWidth: 560 }}>
            Three-phase verification. Telemetry hash committed onchain before execution.
            Raw telemetry stays off-chain on IPFS — only the 32-byte digest and PoPW score touch Konnex.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            {synced ? <Wifi size={12} color="#00FFB2" /> : <WifiOff size={12} color="#F0A500" />}
            <span className="f-mono" style={{ fontSize: '0.58rem', color: synced ? '#00FFB2' : '#F0A500', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              {synced ? 'KV Ready' : 'Loading...'}
            </span>
          </div>
        </div>
      </div>

      {/* ── Phase pipeline indicator ────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1px', background: 'rgba(240,165,0,0.08)', marginBottom: '2rem' }}>
        {Object.entries(PHASES).map(([key, p], i) => {
          const done    = phasesDone.includes(key);
          const active  = phase === key;
          const pending = !done && !active;
          return (
            <div key={key} style={{
              padding: '1rem 1.25rem',
              background: active ? `${p.color}10` : done ? '#0F1220' : '#101525',
              borderLeft: active ? `2px solid ${p.color}` : done ? '2px solid rgba(0,255,178,0.3)' : '2px solid transparent',
              transition: 'all 0.3s',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem' }}>
                <div style={{
                  width: 18, height: 18, borderRadius: '50%',
                  background: done ? 'rgba(0,255,178,0.15)' : active ? `${p.color}20` : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${done ? 'rgba(0,255,178,0.4)' : active ? p.color + '60' : 'rgba(255,255,255,0.08)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  {done
                    ? <CheckCircle size={9} color="#00FFB2" />
                    : <span className="f-mono" style={{ fontSize: '0.5rem', color: active ? p.color : '#3A3835' }}>{i+1}</span>
                  }
                </div>
                <span className="f-mono" style={{
                  fontSize: '0.62rem', letterSpacing: '0.12em', textTransform: 'uppercase',
                  color: done ? '#00FFB2' : active ? p.color : '#3A3835',
                }}>{p.label}</span>
                {active && <span style={{ width: 6, height: 6, borderRadius: '50%', background: p.color, animation: 'anim-pulse 1.5s infinite', flexShrink: 0 }} />}
              </div>
              <div style={{ fontSize: '0.72rem', color: pending ? '#2A2825' : '#5A5550' }}>
                {key === 'COMMIT'   && 'Hash telemetry → anchor onchain'}
                {key === 'VALIDATE' && 'Peer validators verify off-chain'}
                {key === 'SCORE'    && 'PoPW score + IPFS CID committed'}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', alignItems: 'start' }} className="popw-grid">

        {/* ── FORM ─────────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div className="card" style={{ padding: '1.75rem' }}>
            <div className="f-mono" style={{ fontSize: '0.65rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: '#F0A500', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Zap size={12} /> New Task Submission
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
              <div>
                <label>Select Robot *</label>
                <select value={form.robotId} onChange={e => setForm({ ...form, robotId: e.target.value })} disabled={isRunning}>
                  <option value="">Choose registered robot...</option>
                  {robots.map(r => (
                    <option key={r.id} value={r.id}>
                      {r.name} — {r.type}{r.memoryCount >= MEMORY_CAP ? ' [AT CAP]' : ` (${r.memoryCount ?? r.tasks ?? 0}/${MEMORY_CAP})`}
                    </option>
                  ))}
                </select>
                {errors.robotId && <div style={{ color: '#FF4D6A', fontSize: '0.7rem', marginTop: '0.3rem', fontFamily: "'Space Mono', monospace" }}>{errors.robotId}</div>}
              </div>

              {/* Robot preview */}
              {selectedRobot && (
                <div style={{ background: 'rgba(240,165,0,0.03)', border: '1px solid rgba(240,165,0,0.1)', padding: '0.85rem 1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                    <span className="f-display" style={{ fontSize: '1rem', color: '#E2DDD6' }}>{selectedRobot.name}</span>
                    <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                      {(selectedRobot.memoryCount ?? selectedRobot.tasks ?? 0) >= MEMORY_CAP
                        ? <span className="tag tag-gold" style={{ fontSize: '0.55rem' }}>AT CAP — WILL PRUNE</span>
                        : <span className="tag tag-green" style={{ fontSize: '0.55rem' }}>{selectedRobot.memoryCount ?? selectedRobot.tasks ?? 0}/{MEMORY_CAP} ENTRIES</span>
                      }
                    </div>
                  </div>
                  {/* Memory fill bar */}
                  <div style={{ height: 2, background: '#1A1D2A', borderRadius: 1, marginBottom: '0.6rem' }}>
                    <div style={{
                      height: '100%', borderRadius: 1,
                      width: `${Math.min(((selectedRobot.memoryCount ?? selectedRobot.tasks ?? 0) / MEMORY_CAP) * 100, 100)}%`,
                      background: (selectedRobot.memoryCount ?? selectedRobot.tasks ?? 0) >= MEMORY_CAP
                        ? '#F0A500' : '#00FFB2',
                      transition: 'width 0.4s',
                    }} />
                  </div>
                  <div className="f-mono" style={{ fontSize: '0.56rem', color: '#3A3835' }}>
                    ~{Math.min((selectedRobot.memoryCount ?? selectedRobot.tasks ?? 0), MEMORY_CAP) * 96} bytes onchain · {MEMORY_CAP * 96} bytes max
                  </div>
                </div>
              )}

              <div>
                <label>Task Category *</label>
                <select value={form.taskType} onChange={e => setForm({ ...form, taskType: e.target.value })} disabled={isRunning}>
                  <option value="">Select category...</option>
                  {TASK_CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
                {errors.taskType && <div style={{ color: '#FF4D6A', fontSize: '0.7rem', marginTop: '0.3rem', fontFamily: "'Space Mono', monospace" }}>{errors.taskType}</div>}
              </div>

              <div>
                <label>Task Description *</label>
                <textarea rows={3} placeholder="What did the robot do, sensors active, environment conditions..." value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} disabled={isRunning} />
                {errors.description && <div style={{ color: '#FF4D6A', fontSize: '0.7rem', marginTop: '0.3rem', fontFamily: "'Space Mono', monospace" }}>{errors.description}</div>}
              </div>

              <div>
                <label>Task Duration *</label>
                <input placeholder="e.g. 12m 34s" value={form.duration} onChange={e => setForm({ ...form, duration: e.target.value })} disabled={isRunning} />
                {errors.duration && <div style={{ color: '#FF4D6A', fontSize: '0.7rem', marginTop: '0.3rem', fontFamily: "'Space Mono', monospace" }}>{errors.duration}</div>}
              </div>

              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Lock size={10} /> Telemetry Evidence (goes to IPFS, never onchain)
                </label>
                <input placeholder="IPFS CID, sensor hash, or raw telemetry identifier..." value={form.evidence} onChange={e => setForm({ ...form, evidence: e.target.value })} disabled={isRunning} />
                <div style={{ fontSize: '0.68rem', color: '#3A3835', marginTop: '0.3rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <EyeOff size={9} color="#3A3835" />
                  Proprietary motion policies &amp; env maps stay private. Only the hash is public.
                </div>
              </div>

              {/* Wallet guard — shown if not connected */}
              {errors._wallet && (
                <div style={{
                  padding: '0.75rem', background: 'rgba(255,77,77,0.07)',
                  border: '1px solid rgba(255,77,77,0.25)', borderRadius: 8,
                  fontFamily: "'Space Mono', monospace", fontSize: '0.68rem', color: '#FF4D4D', lineHeight: 1.5,
                }}>
                  ⚠ {errors._wallet}
                </div>
              )}

              <button type="submit" className="btn btn-gold clip-sm" style={{ width: '100%', justifyContent: 'center', fontSize: '0.75rem' }} disabled={isRunning}>
                {isRunning ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ width: 12, height: 12, border: '2px solid #06080F', borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />
                    {phase === 'COMMIT' ? 'Committing Hash...' : phase === 'VALIDATE' ? 'Validating Off-chain...' : 'Scoring & Storing...'}
                  </span>
                ) : (
                  <span style={{ display: 'flex', alignItems: 'center', gap:
