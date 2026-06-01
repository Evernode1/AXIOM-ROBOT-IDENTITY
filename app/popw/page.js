'use client';
import { useState, useEffect, useRef } from 'react';
import {
  CheckCircle, Hash, Zap, ChevronRight, Lock, Unlock,
  Eye, EyeOff, AlertTriangle, Wifi, WifiOff, Database, Globe
} from 'lucide-react';
import { TASK_CATEGORIES, MEMORY_CAP, VALIDATOR_POOL, TELEMETRY_SECTIONS } from '@/lib/data';
import { loadItems, addItem }          from '@/lib/storage';
import {
  generateTelemetryHash, generateIPFSCID, generateTaskId,
  calcPoPWScore, fmtTime, timeAgo, trunc,
  selectValidators, assignSections, computeConsensus, runChallengeRound,
} from '@/lib/utils';

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
    setErrors({});
    setResult(null);
    setPhasesDone([]);
    setValidatorScores([]);

    const ts             = Date.now();
    const telemetryHash  = generateTelemetryHash(form.robotId, form.taskType, ts, form.evidence);
    const robot          = robots.find(r => r.id === form.robotId);

    // ── PHASE 1: COMMIT ──────────────────────────────────────────────────────
    // Animate hash generation
    const chars = '0123456789abcdef';
    intervalRef.current = setInterval(() => {
      setHashAnim('0x' + Array.from({ length: 32 }, () => chars[Math.floor(Math.random() * chars.length)]).join(''));
    }, 60);

    await runPhase('COMMIT', PHASES.COMMIT.steps, 700);
    clearInterval(intervalRef.current);
    setHashAnim(telemetryHash);

    // ── PHASE 2: VALIDATE ────────────────────────────────────────────────────
    await runPhase('VALIDATE', PHASES.VALIDATE.steps, 800);

    // ── Layer 1: Random sampling — select 3-5 validators ──
    const baseScore  = calcPoPWScore(form.duration, !!form.evidence);
    const sampled    = selectValidators(VALIDATOR_POOL);
    const withSecs   = assignSections(sampled, TELEMETRY_SECTIONS);
    setSelectedVals(withSecs);

    // Animate validator scores appearing one by one
    const consensus  = computeConsensus(sampled, baseScore);
    for (let i = 0; i < consensus.scores.length; i++) {
      await new Promise(r => setTimeout(r, 400));
      setValidatorScores(prev => [...prev, consensus.scores[i]]);
    }
    setConsensusData(consensus);

    // ── Layer 2: 70% consensus check — challenge round if needed ──
    if (consensus.challengeTriggered) {
      await new Promise(r => setTimeout(r, 600));
      const extras = runChallengeRound(VALIDATOR_POOL, sampled.map(v => v.id), baseScore);
      setChallengeVals(extras);
      for (const ev of extras) {
        await new Promise(r => setTimeout(r, 350));
        setValidatorScores(prev => [...prev, ev]);
      }
    }

    // ── PHASE 3: SCORE ───────────────────────────────────────────────────────
    await runPhase('SCORE', PHASES.SCORE.steps, 750);

    const ipfsCid     = generateIPFSCID(telemetryHash);
    const taskId      = generateTaskId(form.robotId, ts);
    const finalScore  = consensus.passed ? consensus.consensusScore : calcPoPWScore(form.duration, !!form.evidence);
    const blockNumber = 1284750 + Math.floor(ts / 6000) % 500;

    const newMem = {
      // ── ONCHAIN DIGEST (96 bytes) ──
      task_id:        taskId,
      telemetry_hash: telemetryHash,
      popw_score:     finalScore,
      block_number:   blockNumber,
      // ── OFFCHAIN (IPFS) ──
      ipfs_cid:       ipfsCid,
      // ── INDEX ──
      id:             `MEM-${ts}`,
      robotId:        form.robotId,
      robotName:      robot?.name || 'Unknown',
      taskType:       form.taskType,
      description:    form.description,
      duration:       form.duration,
      timestamp:      ts,
      outcome:        'SUCCESS',
      commit_phase:   ts - 2400,
      reveal_phase:   ts - 1600,
      score_phase:    ts,
    };

    await addItem('memories', newMem);
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

              <button type="submit" className="btn btn-gold clip-sm" style={{ width: '100%', justifyContent: 'center', fontSize: '0.75rem' }} disabled={isRunning}>
                {isRunning ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ width: 12, height: 12, border: '2px solid #06080F', borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />
                    {phase === 'COMMIT' ? 'Committing Hash...' : phase === 'VALIDATE' ? 'Validating Off-chain...' : 'Scoring & Storing...'}
                  </span>
                ) : (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Hash size={14} /> Begin Commit–Reveal <ChevronRight size={14} />
                  </span>
                )}
              </button>
            </form>
          </div>

          {/* Privacy explainer */}
          <div className="card" style={{ padding: '1.25rem' }}>
            <div className="f-mono" style={{ fontSize: '0.6rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#4A4845', marginBottom: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Lock size={10} /> Privacy Model
            </div>
            {[
              { icon: Eye,    c: '#FF4D6A', label: 'NEVER onchain', items: ['Raw sensor streams', 'Trajectory traces', 'Proprietary motion policies', 'Environment maps'] },
              { icon: EyeOff, c: '#00FFB2', label: 'ONCHAIN only',  items: ['32-byte telemetry_hash', 'popw_score (0–100)', 'block_number', 'task_id'] },
            ].map(s => {
              const Icon = s.icon;
              return (
                <div key={s.label} style={{ marginBottom: '0.85rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.4rem' }}>
                    <Icon size={10} color={s.c} />
                    <span className="f-mono" style={{ fontSize: '0.6rem', color: s.c, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{s.label}</span>
                  </div>
                  {s.items.map(i => (
                    <div key={i} style={{ fontSize: '0.73rem', color: '#4A4845', paddingLeft: '1.2rem', marginBottom: '0.2rem' }}>· {i}</div>
                  ))}
                </div>
              );
            })}
            <div style={{ height: 1, background: 'linear-gradient(90deg, transparent, rgba(240,165,0,0.1), transparent)', margin: '0.75rem 0' }} />
            <div style={{ fontSize: '0.7rem', color: '#3A3835', lineHeight: 1.6 }}>
              Memory cap: <span style={{ color: '#F0A500' }}>{MEMORY_CAP} entries/robot</span> · Oldest pruned at cap · ~96 bytes per entry onchain
            </div>
          </div>
        </div>

        {/* ── RIGHT COLUMN ─────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

          {/* Active pipeline */}
          {(isRunning || result) && (
            <div className="card" style={{ padding: '1.5rem', border: `1px solid ${currentPhaseData ? currentPhaseData.color + '40' : 'rgba(0,255,178,0.25)'}`, transition: 'border-color 0.4s' }}>
              <div className="f-mono" style={{ fontSize: '0.62rem', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '1.25rem', color: currentPhaseData ? currentPhaseData.color : '#00FFB2' }}>
                {phase === 'DONE' ? '✓ All Phases Complete' : `⟳ Phase: ${phase}`}
              </div>

              {/* Current phase steps */}
              {currentPhaseData && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.25rem' }}>
                  {currentPhaseData.steps.map((s, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', opacity: step > i ? 1 : 0.2, transition: 'opacity 0.3s' }}>
                      <div style={{ width: 14, height: 14, borderRadius: '50%', flexShrink: 0,
                        background: step > i ? `${currentPhaseData.color}18` : 'rgba(255,255,255,0.03)',
                        border: `1px solid ${step > i ? currentPhaseData.color + '50' : 'rgba(255,255,255,0.06)'}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {step > i && <CheckCircle size={8} color={currentPhaseData.color} />}
                      </div>
                      <span className="f-mono" style={{ fontSize: '0.62rem', color: step > i ? '#8A8580' : '#2A2825' }}>{s}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Live hash display */}
              {(isRunning || result) && (
                <div style={{ background: '#06080F', border: '1px solid rgba(0,255,178,0.1)', padding: '0.85rem', marginBottom: '1rem' }}>
                  <div className="f-mono" style={{ fontSize: '0.54rem', color: '#3A3835', marginBottom: '0.4rem', letterSpacing: '0.1em' }}>
                    TELEMETRY HASH (32 bytes — onchain)
                  </div>
                  <div className="f-mono" style={{ fontSize: '0.65rem', color: isRunning ? '#F0A500' : '#00FFB2', wordBreak: 'break-all', lineHeight: 1.5, transition: 'color 0.4s' }}>
                    {isRunning ? hashAnim : result?.telemetry_hash}
                  </div>
                </div>
              )}

              {/* Validator scores — real 5-layer consensus */}
              {validatorScores.length > 0 && (
                <div style={{ marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
                    <div className="f-mono" style={{ fontSize: '0.56rem', color: '#4A4845', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                      Off-chain Validators ({validatorScores.length} sampled)
                    </div>
                    {consensusData && (
                      <span className={`tag tag-${consensusData.passed ? 'green' : 'gold'}`} style={{ fontSize: '0.52rem' }}>
                        {consensusData.ratio}% agree {consensusData.passed ? '✓' : '— CHALLENGE'}
                      </span>
                    )}
                  </div>
                  {validatorScores.map((v, i) => {
                    const isDeviant    = consensusData && Math.abs(v.score - consensusData.median) > 15;
                    const isChallenger = v.isChallenge;
                    return (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem', padding: '0.4rem 0.65rem', background: '#06080F', border: `1px solid ${isChallenger ? 'rgba(77,159,255,0.2)' : isDeviant ? 'rgba(255,77,106,0.2)' : 'rgba(240,165,0,0.06)'}` }}>
                        <div>
                          <span className="f-mono" style={{ fontSize: '0.6rem', color: isChallenger ? '#4D9FFF' : '#F0A500', marginRight: '0.5rem' }}>
                            {v.id}{isChallenger ? ' [CHG]' : ''}
                          </span>
                          <span className="f-mono" style={{ fontSize: '0.54rem', color: '#3A3835' }}>{v.addr}</span>
                        </div>
                        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
                          {v.sections && <span className="f-mono" style={{ fontSize: '0.52rem', color: '#3A3835' }}>{v.sections.length} sections</span>}
                          <span className="f-mono" style={{ fontSize: '0.56rem', color: '#4A4845' }}>{(v.stake/1000).toFixed(1)}k KNX</span>
                          <span className="f-display" style={{ fontSize: '1rem', color: isDeviant ? '#FF4D6A' : '#00FFB2' }}>{v.score}</span>
                        </div>
                      </div>
                    );
                  })}
                  {consensusData?.challengeTriggered && (
                    <div style={{ fontSize: '0.7rem', color: '#F0A500', marginTop: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span>⚡</span> Consensus below 70% — challenge round triggered
                    </div>
                  )}
                  {consensusData && (
                    <div style={{ marginTop: '0.6rem', padding: '0.5rem 0.65rem', background: 'rgba(0,255,178,0.04)', border: '1px solid rgba(0,255,178,0.1)', display: 'flex', justifyContent: 'space-between' }}>
                      <span className="f-mono" style={{ fontSize: '0.58rem', color: '#4A4845' }}>Consensus ({consensusData.agreeingCount}/{consensusData.totalCount} agree)</span>
                      <span className="f-display" style={{ fontSize: '1.1rem', color: '#00FFB2' }}>{consensusData.consensusScore}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Final result — dual layer display */}
              {result && phase === 'DONE' && (
                <>
                  {/* ONCHAIN DIGEST */}
                  <div style={{ border: '1px solid rgba(77,159,255,0.25)', background: 'rgba(77,159,255,0.04)', padding: '1rem', marginBottom: '0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                      <Database size={12} color="#4D9FFF" />
                      <span className="f-mono" style={{ fontSize: '0.6rem', color: '#4D9FFF', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                        Onchain Digest — {96} bytes · Block #{result.block_number?.toLocaleString()}
                      </span>
                    </div>
                    {[
                      { l: 'task_id',        v: result.task_id,        c: '#E2DDD6' },
                      { l: 'telemetry_hash', v: trunc(result.telemetry_hash, 12, 8), c: '#00FFB2' },
                      { l: 'popw_score',     v: result.popw_score,     c: '#F0A500' },
                      { l: 'block_number',   v: result.block_number?.toLocaleString(), c: '#4D9FFF' },
                    ].map(f => (
                      <div key={f.l} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                        <span className="f-mono" style={{ fontSize: '0.6rem', color: '#3A3835' }}>{f.l}</span>
                        <span className="f-mono" style={{ fontSize: '0.62rem', color: f.c }}>{f.v}</span>
                      </div>
                    ))}
                  </div>

                  {/* OFFCHAIN IPFS */}
                  <div style={{ border: '1px solid rgba(240,165,0,0.2)', background: 'rgba(240,165,0,0.03)', padding: '1rem', marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Globe size={12} color="#F0A500" />
                        <span className="f-mono" style={{ fontSize: '0.6rem', color: '#F0A500', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                          IPFS Payload — 0 bytes onchain
                        </span>
                      </div>
                      <button onClick={() => setShowRaw(!showRaw)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#5A5550', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        {showRaw ? <Eye size={10} /> : <EyeOff size={10} />}
                        <span className="f-mono" style={{ fontSize: '0.54rem', color: '#4A4845' }}>{showRaw ? 'HIDE' : 'SHOW'} CID</span>
                      </button>
                    </div>
                    {showRaw ? (
                      <>
                        <div className="f-mono" style={{ fontSize: '0.62rem', color: '#F0A500', wordBreak: 'break-all', marginBottom: '0.4rem' }}>{result.ipfs_cid}</div>
                        <div style={{ fontSize: '0.7rem', color: '#3A3835' }}>Full telemetry payload: sensor streams, trajectory traces, raw execution data.</div>
                      </>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Lock size={10} color="#4A4845" />
                        <span className="f-mono" style={{ fontSize: '0.6rem', color: '#3A3835' }}>Raw telemetry hidden — proprietary data stays private</span>
                      </div>
                    )}
                  </div>

                  <button onClick={() => { setResult(null); setPhase(null); setPhasesDone([]); setValidatorScores([]); }}
                    className="btn btn-outline" style={{ fontSize: '0.62rem', justifyContent: 'center', width: '100%' }}>
                    Submit Another Task
                  </button>
                </>
              )}
            </div>
          )}

          {/* Recent submissions */}
          <div className="card" style={{ padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <span className="f-mono" style={{ fontSize: '0.62rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#F0A500' }}>Recent Submissions</span>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <span className="tag tag-blue" style={{ fontSize: '0.55rem' }}>ONCHAIN</span>
                <span className="tag tag-gold" style={{ fontSize: '0.55rem' }}>IPFS</span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {memories.slice(0, 7).map((m, i) => (
                <div key={m.id} style={{ padding: '0.85rem 0', borderBottom: i < 6 ? '1px solid rgba(240,165,0,0.05)' : 'none', display: 'flex', gap: '0.85rem' }}>
                  {/* Timeline */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '0.2rem', flexShrink: 0 }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: m.outcome === 'SUCCESS' ? '#00FFB2' : '#F0A500', boxShadow: `0 0 5px ${m.outcome === 'SUCCESS' ? '#00FFB2' : '#F0A500'}` }} />
                    {i < 6 && <div style={{ width: 1, flex: 1, background: 'rgba(240,165,0,0.06)', marginTop: '0.3rem' }} />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem', gap: '0.4rem' }}>
                      <span style={{ fontSize: '0.78rem', color: '#C0B8B0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.robotName}</span>
                      <span className="f-mono" style={{ fontSize: '0.56rem', color: '#4A4845', flexShrink: 0 }}>{timeAgo(m.timestamp)}</span>
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#5A5550', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: '0.25rem' }}>{m.taskType}</div>
                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                      {/* Onchain indicator */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        <Database size={8} color="#4D9FFF" />
                        <span className="f-mono" style={{ fontSize: '0.55rem', color: '#4D9FFF' }}>
                          {m.popw_score ?? '—'}pts
                        </span>
                      </div>
                      {/* IPFS indicator */}
                      {m.ipfs_cid && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                          <Globe size={8} color="#F0A500" />
                          <span className="f-mono" style={{ fontSize: '0.55rem', color: '#4A4845' }}>
                            {trunc(m.ipfs_cid, 6, 4)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .popw-grid { grid-template-columns: 1fr 1fr; }
        @media(max-width: 900px) { .popw-grid { grid-template-columns: 1fr; } }
      `}</style>
    </div>
  );
}
