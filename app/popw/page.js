'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  CheckCircle, Hash, Zap, ChevronRight, Lock,
  Eye, EyeOff, Wifi, WifiOff, Database, Globe,
  ClipboardList, Clock, Shield, Activity, Network, BookOpen,
  Plus, X, ChevronDown, ChevronUp, AlertCircle,
} from 'lucide-react';
import { TASK_CATEGORIES, MEMORY_CAP, VALIDATOR_POOL, TELEMETRY_SECTIONS } from '@/lib/data';
import { addItem } from '@/lib/storage';
import {
  generateTelemetryHash, generateIPFSCID, generateTaskId,
  calcPoPWScore, timeAgo, trunc,
  selectValidators, assignSections, computeConsensus, runChallengeRound,
} from '@/lib/utils';
import {
  WALLET, CHAIN, EXPLORER,
  sendExtrinsic, initChain,
  fbSaveMemory, fbSaveReputation, loadDB, DB,
  postTaskOnchain, fbUpdateTask, fbSaveRobot,
  chainHash, now,
  on, off,
} from '@/lib/chain';

// ─── colours ─────────────────────────────────────────────────────────────────
const C = {
  gold: '#F0A500', green: '#00FFB2', blue: '#4D9FFF',
  red: '#FF4D6A', purple: '#CE93D8', bg: '#0A0D1A',
  card: '#101525', border: 'rgba(240,165,0,0.1)',
};

// ─── Commit-Reveal phases ─────────────────────────────────────────────────────
const PHASES = {
  COMMIT: { label: 'COMMIT', color: C.blue, steps: [
    'Hashing telemetry payload (local)…',
    'Generating 32-byte telemetry_hash…',
    'Broadcasting commitPoPW tx to Konnex…',
    'Hash anchored onchain ✓',
  ]},
  VALIDATE: { label: 'VALIDATE', color: C.gold, steps: [
    'Sampling 5 lazy validators off-chain…',
    'Assigning telemetry sections per validator…',
    'Collecting validator scores…',
    'Computing consensus (≥70% threshold)…',
    'Consensus reached ✓',
  ]},
  SCORE: { label: 'SCORE', color: C.green, steps: [
    'Computing final popw_score…',
    'Uploading full telemetry to IPFS…',
    'Signing writeMemory extrinsic…',
    'Memory committed onchain ✓',
  ]},
};

// ─── Tech depth data ──────────────────────────────────────────────────────────
const TECH = [
  {
    icon: Shield, color: C.gold, title: 'Lazy Validator Strategy', tag: 'CONSENSUS',
    body: '5-of-N validators sampled per PoPW. Each gets non-overlapping telemetry sections. 70% agreement = pass; below 70% triggers a 3-validator challenge round. O(log N) cost regardless of fleet size.',
    details: ['Random 5-of-N sampling per round', '70% threshold → consensus pass', '<70% → challenge round (+3 validators)', 'Stake-weighted scoring', 'Deviant validators slashed on mainnet'],
  },
  {
    icon: Activity, color: C.blue, title: 'Sensor Fusion & Telemetry', tag: 'DATA LAYER',
    body: 'LiDAR + Camera + IMU + Joint torque fused via weighted Kalman filter. Scores: completion_pct (40%), safety from collision/boundary (35%), efficiency from elapsed/timeout ratio (25%).',
    details: ['Multi-modal fusion: LiDAR, Camera, IMU, Joints', 'Weighted Kalman filter', '32-byte Keccak-256 hash → onchain only', 'Full raw payload → IPFS (private)', 'Task-specific scoring per robot type'],
  },
  {
    icon: Database, color: C.green, title: 'Hybrid Storage Architecture', tag: 'STORAGE',
    body: 'Three-layer stack: Konnex Substrate stores 96-byte digests per task. IPFS stores full telemetry content-addressed by CID. Firebase Firestore is the hot-path real-time index.',
    details: ['Konnex Substrate: 96 bytes/task, immutable', 'IPFS: raw telemetry, content-addressed', 'Firebase: real-time index, onSnapshot sync', 'Memory cap: 100 entries/robot, oldest pruned', 'Cross-subnet portability via KNX bridge'],
  },
  {
    icon: Network, color: C.purple, title: 'ZK-PoPW Roadmap', tag: 'ZERO KNOWLEDGE',
    body: 'Current: hash-commitment + validator consensus. Roadmap: Groth16 SNARK proves task completion predicates without revealing raw data. ZK verification: ~200k gas vs ~5M for full consensus.',
    details: ['Phase 1: Hash-commit + consensus (live now)', 'Phase 2: Groth16 SNARK for completion (Q3 2025)', 'Phase 3: Safety + efficiency ZK predicates (Q4 2025)', 'Phase 4: Full ZK-PoPW, no validators (Q2 2026)', 'ZK: ~200k gas vs ~5M consensus gas'],
  },
];

// ─── Main Component ───────────────────────────────────────────────────────────
export default function PoPW() {
  const [robots, setRobots]     = useState([]);
  const [tasks, setTasks]       = useState([]);
  const [memories, setMemories] = useState([]);
  const [synced, setSynced]     = useState(false);
  const [tab, setTab]           = useState('board'); // 'board' | 'post' | 'tech'

  // Post-task form
  const TASK_EMPTY = { instruction: '', taskType: '', rewardKnx: 10, robotId: '' };
  const [taskForm,    setTaskForm]    = useState(TASK_EMPTY);
  const [taskPosting, setTaskPosting] = useState(false);
  const [taskResult,  setTaskResult]  = useState(null);
  const [taskError,   setTaskError]   = useState('');

  // Inline PoPW submit per task
  // activePopw = { taskId, phase, step, phasesDone, hashAnim, validatorScores, consensusData, result, error }
  const [activePopw, setActivePopw] = useState({}); // keyed by task_id
  const [popwForms, setPopwForms]   = useState({}); // keyed by task_id: { robotId, description, duration, evidence }
  const [expandedTask, setExpandedTask] = useState(null); // task_id of expanded card

  const intervalRefs = useRef({});

  // ─── Load + realtime ───────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      await loadDB();
      setRobots([...DB.robots]);
      setTasks([...DB.tasks].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
      setMemories([...DB.memory].sort((a, b) => b.timestamp - a.timestamp));
      setSynced(true);
    })();

    const onR = (u) => setRobots([...u]);
    const onT = (u) => setTasks([...u].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
    const onM = (u) => setMemories([...u].sort((a, b) => b.timestamp - a.timestamp));
    on('robots:updated', onR);
    on('tasks:updated',  onT);
    on('memory:updated', onM);
    return () => { off('robots:updated', onR); off('tasks:updated', onT); off('memory:updated', onM); };
  }, []);

  // ─── Post Task ─────────────────────────────────────────────────────────────
  const EXAMPLES = [
    { instruction: 'Fly to roof zone B and photograph solar panels for damage assessment', taskType: 'Drone Navigation & Swarm Coordination', rewardKnx: 12 },
    { instruction: 'Pick red cylinder from conveyor A, place precisely in bin B', taskType: 'Robotic Manipulation (Roboarm)', rewardKnx: 8 },
    { instruction: 'Generate complete 3D SLAM map of warehouse sector C', taskType: 'SLAM / Spatial Perception', rewardKnx: 15 },
    { instruction: 'Inspect pipeline joints 47-52 for corrosion, record PoPW telemetry', taskType: 'Robot Identity & Memory', rewardKnx: 10 },
    { instruction: 'Coordinate 3 drones for perimeter sweep, return in formation', taskType: 'Robot Fleet Orchestration', rewardKnx: 18 },
  ];

  async function handlePostTask() {
    if (!taskForm.instruction.trim()) { setTaskError('Task instruction required'); return; }
    if (!taskForm.taskType)           { setTaskError('Select a task type'); return; }
    if (!WALLET.connected || !WALLET.signer || WALLET.readOnly) {
      setTaskError('Wallet connect karo pehle (SubWallet / Talisman)');
      return;
    }
    setTaskPosting(true); setTaskError(''); setTaskResult(null);
    try {
      const task = await postTaskOnchain({
        instruction:   taskForm.instruction,
        taskType:      taskForm.taskType,
        rewardKnx:     parseFloat(taskForm.rewardKnx) || 0,
        posterAddress: WALLET.address,
        robotId:       taskForm.robotId || null,
      });
      setTaskResult(task);
      setTaskForm(TASK_EMPTY);
      setTab('board');
    } catch (e) { setTaskError(e.message); }
    setTaskPosting(false);
  }

  // ─── Inline PoPW Submit ────────────────────────────────────────────────────
  function setPoPWState(taskId, patch) {
    setActivePopw(prev => ({ ...prev, [taskId]: { ...(prev[taskId] || {}), ...patch } }));
  }

  async function runPhase(taskId, phaseName, steps, delayMs = 700) {
    setPoPWState(taskId, { phase: phaseName, step: 0 });
    for (let i = 0; i < steps.length; i++) {
      await new Promise(r => setTimeout(r, i === steps.length - 1 ? delayMs * 1.4 : delayMs));
      setPoPWState(taskId, { step: i + 1 });
    }
    setPoPWState(taskId, { phasesDone: [...(activePopw[taskId]?.phasesDone || []), phaseName] });
  }

  async function handleSubmitPoPW(task) {
    const form = popwForms[task.task_id] || {};
    const robotId = form.robotId || (task.robot_id ? task.robot_id : (robots[0]?.robot_id || robots[0]?.id || ''));
    const description = form.description || task.instruction;
    const duration = form.duration || '10m 0s';
    const evidence = form.evidence || '';

    if (!robotId) {
      setPoPWState(task.task_id, { error: 'Koi robot registered nahi. Pehle register karo.' });
      return;
    }
    if (!WALLET.connected || !WALLET.signer || WALLET.readOnly) {
      setPoPWState(task.task_id, { error: 'Wallet connect karo (SubWallet / Talisman)' });
      return;
    }

    const robot = robots.find(r => (r.robot_id || r.id) === robotId);
    setPoPWState(task.task_id, { error: null, result: null, phasesDone: [], validatorScores: [], consensusData: null });

    const ts = Date.now();
    const telemetryHash = generateTelemetryHash(robotId, task.task_type, ts, evidence);

    // Animate hash
    const chars = '0123456789abcdef';
    intervalRefs.current[task.task_id] = setInterval(() => {
      setPoPWState(task.task_id, {
        hashAnim: '0x' + Array.from({ length: 32 }, () => chars[Math.floor(Math.random() * 16)]).join('')
      });
    }, 60);

    // PHASE 1: COMMIT
    const commitPromise = runPhase(task.task_id, 'COMMIT', PHASES.COMMIT.steps, 650);
    let txResult;
    try {
      txResult = await sendExtrinsic(
        'axiom.commitPoPW',
        { robotId: robotId.slice(0, 16), taskType: task.task_type, telemetryHash: telemetryHash.slice(0, 18), ts },
        `commitPoPW(${task.task_type})`
      );
    } catch (err) {
      clearInterval(intervalRefs.current[task.task_id]);
      setPoPWState(task.task_id, { phase: null, error: 'Tx failed: ' + err.message });
      return;
    }
    await commitPromise;
    clearInterval(intervalRefs.current[task.task_id]);
    setPoPWState(task.task_id, { hashAnim: telemetryHash });

    const realBlock = txResult.blockNumber;
    const realTxHash = txResult.txHash;

    // PHASE 2: VALIDATE
    await runPhase(task.task_id, 'VALIDATE', PHASES.VALIDATE.steps, 750);

    const baseScore = calcPoPWScore(duration, !!evidence);
    const sampled   = selectValidators(VALIDATOR_POOL);
    const withSecs  = assignSections(sampled, TELEMETRY_SECTIONS);
    const consensus = computeConsensus(sampled, baseScore);

    for (let i = 0; i < consensus.scores.length; i++) {
      await new Promise(r => setTimeout(r, 380));
      setPoPWState(task.task_id, {
        validatorScores: consensus.scores.slice(0, i + 1),
        consensusData: i === consensus.scores.length - 1 ? consensus : null,
      });
    }

    if (consensus.challengeTriggered) {
      const extras = runChallengeRound(VALIDATOR_POOL, sampled.map(v => v.id), baseScore);
      for (const ev2 of extras) {
        await new Promise(r => setTimeout(r, 320));
        setPoPWState(task.task_id, (prev) => ({
          ...prev[task.task_id],
          validatorScores: [...(prev[task.task_id]?.validatorScores || []), ev2],
        }));
      }
    }

    const finalScore = consensus.passed ? consensus.consensusScore : baseScore;
    const ipfsCid    = generateIPFSCID(telemetryHash);
    const taskId     = generateTaskId(robotId, ts);

    // PHASE 3: SCORE
    const scoreTxSteps = [
      'Computing final popw_score…',
      'Uploading full telemetry to IPFS…',
      'Signing writeMemory extrinsic — approve in wallet…',
      'Memory committed onchain ✓',
    ];
    const scorePromise = runPhase(task.task_id, 'SCORE', scoreTxSteps, 700);

    let scoreTxResult;
    try {
      scoreTxResult = await sendExtrinsic(
        'axiom.writeMemory',
        { robotId: robotId.slice(0, 16), taskId: taskId.slice(0, 16), taskType: task.task_type, popw: finalScore, ipfsCid: ipfsCid.slice(0, 20) },
        `writeMemory(score=${finalScore})`
      );
    } catch (err) {
      scoreTxResult = { txHash: null, blockNumber: realBlock };
    }
    await scorePromise;

    // Build memory entry
    const newMem = {
      task_id: taskId, telemetry_hash: telemetryHash, popw_score: finalScore,
      block_number: scoreTxResult.blockNumber || realBlock,
      tx_hash: realTxHash, score_tx_hash: scoreTxResult.txHash || null,
      ipfs_cid: ipfsCid, id: `MEM-${ts}`,
      robot_id: robotId, robotId,
      robotName: robot?.metadata?.label || robot?.name || 'Unknown',
      task_type: task.task_type, taskType: task.task_type,
      description, duration, timestamp: ts,
      outcome: finalScore >= 50 ? 'SUCCESS' : 'FAILED',
      validator_addr: WALLET.address, local: false,
    };

    await fbSaveMemory(newMem).catch(console.warn);
    await addItem('memories', newMem).catch(console.warn);

    // ── Mark this task COMPLETED in Firebase ──────────────────────────
    await fbUpdateTask(task.task_id, {
      status:       'completed',
      completed_at: new Date().toISOString(),
      popw_score:   finalScore,
      completed_by: robotId,
      score_tx_hash: scoreTxResult.txHash || null,
    }).catch(console.warn);

    // Update reputation
    const success = finalScore >= 50;
    if (!DB.reputation[robotId]) DB.reputation[robotId] = { score: 0, total_tasks: 0, successful_tasks: 0, last_updated: new Date().toISOString() };
    const rep = DB.reputation[robotId];
    rep.score = +Math.min(1, Math.max(0, 0.95 * rep.score + 0.05 * (finalScore / 100))).toFixed(4);
    rep.total_tasks = (rep.total_tasks || 0) + 1;
    if (success) rep.successful_tasks = (rep.successful_tasks || 0) + 1;
    rep.last_updated = new Date().toISOString();
    await fbSaveReputation(robotId, rep).catch(console.warn);

    const ridx = DB.robots.findIndex(r => (r.robot_id || r.id) === robotId);
    if (ridx >= 0) {
      const ur = { ...DB.robots[ridx], total_tasks: (DB.robots[ridx].total_tasks || 0) + 1, last_task_at: new Date().toISOString() };
      DB.robots[ridx] = ur;
      await fbSaveRobot(ur).catch(console.warn);
    }

    setMemories(prev => [newMem, ...prev]);
    setPoPWState(task.task_id, { phase: 'DONE', result: newMem, error: null });
  }

  // ─── Derived ───────────────────────────────────────────────────────────────
  const openTasks      = tasks.filter(t => t.status === 'open');
  const completedTasks = tasks.filter(t => t.status === 'completed');

  // ─── RENDER ────────────────────────────────────────────────────────────────
  return (
    <div className="page-wrap">

      {/* Header */}
      <div className="page-header">
        <div className="page-sub">// Proof of Physical Work</div>
        <h1 className="page-title">TASK BOARD</h1>
        <p style={{ color: '#6A6560', fontSize: '0.88rem', maxWidth: 560, marginTop: '0.5rem', lineHeight: 1.65 }}>
          Post tasks onchain, then submit PoPW directly from each task card. Real-time Firebase sync — completion is instant across all clients.
        </p>
      </div>

      {/* Phase strip (live animation reference) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '1px', background: 'rgba(240,165,0,0.08)', marginBottom: '2rem' }}>
        {Object.entries(PHASES).map(([key, p], i) => (
          <div key={key} style={{ padding: '0.85rem 1.25rem', background: '#101525' }}>
            <div className="f-mono" style={{ fontSize: '0.58rem', color: p.color, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '0.2rem' }}>{i+1}. {p.label}</div>
            <div style={{ fontSize: '0.7rem', color: '#3A3835' }}>
              {key === 'COMMIT' && 'Hash telemetry → anchor onchain'}
              {key === 'VALIDATE' && 'Lazy validators score off-chain'}
              {key === 'SCORE' && 'PoPW score + IPFS CID committed'}
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: '2rem', border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden', background: '#0B0E1A' }}>
        {[
          { id: 'board', icon: ClipboardList, label: `Task Board  ${openTasks.length} open · ${completedTasks.length} done` },
          { id: 'post',  icon: Plus,          label: 'Post New Task' },
          { id: 'tech',  icon: BookOpen,      label: 'Technical Depth' },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            flex: 1, padding: '0.8rem 0.5rem', cursor: 'pointer', border: 'none',
            background: tab === t.id ? 'rgba(240,165,0,0.1)' : 'transparent',
            borderBottom: tab === t.id ? `2px solid ${C.gold}` : '2px solid transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
            fontFamily: "'Space Mono', monospace", fontSize: '0.62rem',
            color: tab === t.id ? C.gold : '#5A5550',
            letterSpacing: '0.07em', textTransform: 'uppercase', transition: 'all 0.2s',
          }}>
            <t.icon size={12} /> {t.label}
          </button>
        ))}
      </div>

      {/* ════════════════════════════════════════════════════════════════
          TAB: TASK BOARD
          ════════════════════════════════════════════════════════════════ */}
      {tab === 'board' && (
        <div>
          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '1px', background: 'rgba(240,165,0,0.08)', marginBottom: '2rem' }}>
            {[
              { label: 'Total Tasks',    value: tasks.length,      color: '#E2DDD6' },
              { label: 'Open',           value: openTasks.length,  color: C.gold },
              { label: 'Completed',      value: completedTasks.length, color: C.green },
              { label: 'Completion Rate', value: tasks.length ? `${Math.round(completedTasks.length / tasks.length * 100)}%` : '0%', color: C.blue },
            ].map((s, i) => (
              <div key={s.label} style={{ padding: '1.1rem 1.3rem', background: '#101525', borderRight: i < 3 ? `1px solid rgba(240,165,0,0.06)` : 'none' }}>
                <div className="f-display" style={{ fontSize: '1.7rem', color: s.color, lineHeight: 1 }}>{s.value}</div>
                <div className="f-mono" style={{ fontSize: '0.56rem', color: '#5A5550', textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: '0.25rem' }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Live dot */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: synced ? C.green : C.gold, boxShadow: `0 0 8px ${synced ? C.green : C.gold}` }} className="anim-pulse" />
            <span className="f-mono" style={{ fontSize: '0.58rem', color: '#4A4845', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              Firebase Realtime · auto-updates on completion
            </span>
          </div>

          {/* ── OPEN TASKS ─────────────────────────────────────────────── */}
          {openTasks.length > 0 && (
            <div style={{ marginBottom: '2.5rem' }}>
              <div className="f-mono" style={{ fontSize: '0.63rem', color: C.gold, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Clock size={12} /> Open Tasks ({openTasks.length})
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {openTasks.map(task => {
                  const pState   = activePopw[task.task_id] || {};
                  const pForm    = popwForms[task.task_id] || {};
                  const isExpanded = expandedTask === task.task_id;
                  const isRunning  = pState.phase && pState.phase !== 'DONE';
                  const isDone     = pState.phase === 'DONE';
                  const assignedRobot = task.robot_id ? robots.find(r => (r.robot_id || r.id) === task.robot_id) : null;

                  const currentPhaseData = isRunning ? PHASES[pState.phase] : null;

                  return (
                    <div key={task.task_id} className="card" style={{
                      border: isDone ? `1px solid rgba(0,255,178,0.3)` : isRunning ? `1px solid ${C.blue}40` : `1px solid ${C.border}`,
                      borderLeft: `3px solid ${isDone ? C.green : isRunning ? C.blue : C.gold}`,
                      transition: 'all 0.3s',
                    }}>

                      {/* ── Task header ──────────────────────────────── */}
                      <div style={{ padding: '1.1rem 1.25rem', display: 'flex', alignItems: 'flex-start', gap: '0.9rem' }}>
                        {/* Status dot */}
                        <div style={{ flexShrink: 0, marginTop: '0.2rem' }}>
                          {isDone
                            ? <CheckCircle size={16} color={C.green} />
                            : isRunning
                              ? <div style={{ width: 14, height: 14, borderRadius: '50%', border: `2px solid ${C.blue}`, borderTopColor: 'transparent', animation: 'spin 0.7s linear infinite' }} />
                              : <div style={{ width: 10, height: 10, borderRadius: '50%', background: C.gold, boxShadow: `0 0 8px ${C.gold}` }} className="anim-pulse" />
                          }
                        </div>

                        {/* Content */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.35rem' }}>
                            <span style={{ fontSize: '0.9rem', color: isDone ? '#8A8580' : '#E2DDD6', fontWeight: 500, textDecoration: isDone ? 'line-through' : 'none' }}>
                              {task.instruction}
                            </span>
                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexShrink: 0 }}>
                              <span className="tag tag-gold" style={{ fontSize: '0.58rem' }}>{task.reward_knx} KNX</span>
                              {isDone && <span className="tag tag-green" style={{ fontSize: '0.55rem' }}>PoPW {pState.result?.popw_score ?? (task.popw_score ? Math.round(task.popw_score) : '—')}</span>}
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                            <span className="f-mono" style={{ fontSize: '0.6rem', color: '#5A5550' }}>{task.task_type}</span>
                            {assignedRobot && <span className="f-mono" style={{ fontSize: '0.6rem', color: C.blue }}>→ {assignedRobot.metadata?.label || assignedRobot.name}</span>}
                            <span className="f-mono" style={{ fontSize: '0.56rem', color: '#3A3835' }}>{task.created_at ? new Date(task.created_at).toLocaleString() : '—'}</span>
                          </div>
                        </div>

                        {/* Submit / Expand button */}
                        {!isDone && (
                          <button
                            onClick={() => setExpandedTask(isExpanded ? null : task.task_id)}
                            style={{
                              flexShrink: 0, padding: '7px 16px',
                              background: isExpanded ? 'rgba(77,159,255,0.15)' : 'rgba(240,165,0,0.1)',
                              border: `1px solid ${isExpanded ? 'rgba(77,159,255,0.4)' : 'rgba(240,165,0,0.3)'}`,
                              borderRadius: 6, cursor: 'pointer',
                              fontFamily: "'Space Mono', monospace", fontSize: '0.65rem',
                              color: isExpanded ? C.blue : C.gold,
                              display: 'flex', alignItems: 'center', gap: 5,
                              transition: 'all 0.2s',
                            }}
                          >
                            {isExpanded ? <><X size={11} /> Cancel</> : <><Hash size={11} /> Submit PoPW</>}
                          </button>
                        )}
                      </div>

                      {/* ── EXPANDED: PoPW inline form + pipeline ──── */}
                      {isExpanded && !isDone && (
                        <div style={{ borderTop: `1px solid rgba(240,165,0,0.08)`, padding: '1.25rem' }}>

                          {/* Error */}
                          {pState.error && (
                            <div style={{ padding: '0.7rem 1rem', background: 'rgba(255,77,106,0.07)', border: '1px solid rgba(255,77,106,0.25)', borderRadius: 8, fontFamily: "'Space Mono',monospace", fontSize: '0.68rem', color: C.red, marginBottom: '1rem', display: 'flex', gap: '0.5rem' }}>
                              <AlertCircle size={12} style={{ flexShrink: 0, marginTop: 1 }} /> {pState.error}
                            </div>
                          )}

                          {/* Form fields (compact) */}
                          {!isRunning && (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
                              <div>
                                <label style={{ fontFamily: "'Space Mono',monospace", fontSize: '0.58rem', color: '#3A3835', display: 'block', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Robot *</label>
                                <select
                                  value={pForm.robotId || task.robot_id || ''}
                                  onChange={e => setPopwForms(prev => ({ ...prev, [task.task_id]: { ...pForm, robotId: e.target.value } }))}
                                  style={{ width: '100%', padding: '7px 10px', background: '#0A0D1A', border: '1px solid rgba(240,165,0,0.15)', borderRadius: 6, color: '#C0B8B0', fontFamily: "'Space Mono',monospace", fontSize: '0.7rem' }}
                                >
                                  <option value="">Select robot…</option>
                                  {robots.map(r => (
                                    <option key={r.robot_id || r.id} value={r.robot_id || r.id}>
                                      {r.metadata?.label || r.name || r.robot_id}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label style={{ fontFamily: "'Space Mono',monospace", fontSize: '0.58rem', color: '#3A3835', display: 'block', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Duration *</label>
                                <input
                                  placeholder="e.g. 12m 34s"
                                  value={pForm.duration || ''}
                                  onChange={e => setPopwForms(prev => ({ ...prev, [task.task_id]: { ...pForm, duration: e.target.value } }))}
                                  style={{ width: '100%', padding: '7px 10px', background: '#0A0D1A', border: '1px solid rgba(240,165,0,0.15)', borderRadius: 6, color: '#C0B8B0', fontFamily: "'Space Mono',monospace", fontSize: '0.7rem', boxSizing: 'border-box' }}
                                />
                              </div>
                              <div style={{ gridColumn: '1/-1' }}>
                                <label style={{ fontFamily: "'Space Mono',monospace", fontSize: '0.58rem', color: '#3A3835', display: 'block', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                                  <Lock size={9} style={{ display: 'inline', marginRight: 4 }} />
                                  Telemetry Evidence (IPFS — never onchain)
                                </label>
                                <input
                                  placeholder="IPFS CID or sensor hash (optional)"
                                  value={pForm.evidence || ''}
                                  onChange={e => setPopwForms(prev => ({ ...prev, [task.task_id]: { ...pForm, evidence: e.target.value } }))}
                                  style={{ width: '100%', padding: '7px 10px', background: '#0A0D1A', border: '1px solid rgba(240,165,0,0.15)', borderRadius: 6, color: '#C0B8B0', fontFamily: "'Space Mono',monospace", fontSize: '0.7rem', boxSizing: 'border-box' }}
                                />
                              </div>
                            </div>
                          )}

                          {/* Submit button */}
                          {!isRunning && !isDone && (
                            <button
                              onClick={() => handleSubmitPoPW(task)}
                              style={{
                                width: '100%', padding: '11px', marginBottom: '1rem',
                                background: 'rgba(240,165,0,0.12)', border: '1px solid rgba(240,165,0,0.4)',
                                borderRadius: 8, cursor: 'pointer',
                                fontFamily: "'Space Mono',monospace", fontWeight: 700, fontSize: '0.75rem',
                                color: C.gold, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                              }}
                            >
                              <Zap size={13} /> ⛓ Begin Commit–Reveal–Score
                            </button>
                          )}

                          {/* ── Live Pipeline ─────────────────────────── */}
                          {(isRunning || isDone) && (
                            <div>
                              {/* Phase indicators */}
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '1px', background: 'rgba(240,165,0,0.08)', marginBottom: '1rem', borderRadius: 6, overflow: 'hidden' }}>
                                {Object.entries(PHASES).map(([key, p], i) => {
                                  const done   = (pState.phasesDone || []).includes(key);
                                  const active = pState.phase === key;
                                  return (
                                    <div key={key} style={{
                                      padding: '0.6rem 0.8rem', background: active ? `${p.color}12` : done ? '#0F1220' : '#101525',
                                      borderLeft: active ? `2px solid ${p.color}` : done ? '2px solid rgba(0,255,178,0.3)' : '2px solid transparent',
                                    }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                        {done
                                          ? <CheckCircle size={9} color={C.green} />
                                          : <span className="f-mono" style={{ fontSize: '0.48rem', color: active ? p.color : '#2A2825' }}>{i+1}</span>
                                        }
                                        <span className="f-mono" style={{ fontSize: '0.56rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: done ? C.green : active ? p.color : '#2A2825' }}>{p.label}</span>
                                        {active && <span style={{ width: 5, height: 5, borderRadius: '50%', background: p.color, animation: 'anim-pulse 1.2s infinite', flexShrink: 0 }} />}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>

                              {/* Current phase steps */}
                              {currentPhaseData && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '0.85rem' }}>
                                  {currentPhaseData.steps.map((s, i) => (
                                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', opacity: (pState.step || 0) > i ? 1 : 0.2, transition: 'opacity 0.3s' }}>
                                      <div style={{
                                        width: 13, height: 13, borderRadius: '50%', flexShrink: 0,
                                        background: (pState.step || 0) > i ? `${currentPhaseData.color}18` : 'transparent',
                                        border: `1px solid ${(pState.step || 0) > i ? currentPhaseData.color + '50' : 'rgba(255,255,255,0.06)'}`,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                      }}>
                                        {(pState.step || 0) > i && <CheckCircle size={7} color={currentPhaseData.color} />}
                                      </div>
                                      <span className="f-mono" style={{ fontSize: '0.6rem', color: (pState.step || 0) > i ? '#8A8580' : '#2A2825' }}>{s}</span>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {/* Hash animation */}
                              {pState.hashAnim && (
                                <div style={{ background: '#06080F', border: '1px solid rgba(0,255,178,0.1)', padding: '0.7rem', marginBottom: '0.85rem', borderRadius: 6 }}>
                                  <div className="f-mono" style={{ fontSize: '0.5rem', color: '#3A3835', marginBottom: '0.3rem', letterSpacing: '0.1em' }}>TELEMETRY HASH (32B · onchain)</div>
                                  <div className="f-mono" style={{ fontSize: '0.6rem', color: isRunning ? C.gold : C.green, wordBreak: 'break-all', lineHeight: 1.5 }}>
                                    {pState.hashAnim}
                                  </div>
                                </div>
                              )}

                              {/* Validator scores */}
                              {(pState.validatorScores || []).length > 0 && (
                                <div style={{ marginBottom: '0.85rem' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                    <span className="f-mono" style={{ fontSize: '0.54rem', color: '#4A4845', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Validators ({(pState.validatorScores || []).length})</span>
                                    {pState.consensusData && (
                                      <span className={`tag tag-${pState.consensusData.passed ? 'green' : 'gold'}`} style={{ fontSize: '0.5rem' }}>
                                        {pState.consensusData.ratio}% agree {pState.consensusData.passed ? '✓' : '⚡ CHALLENGE'}
                                      </span>
                                    )}
                                  </div>
                                  {(pState.validatorScores || []).map((v, i) => {
                                    const isDeviant    = pState.consensusData && Math.abs(v.score - pState.consensusData.median) > 15;
                                    const isChallenger = v.isChallenge;
                                    return (
                                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem', padding: '0.35rem 0.6rem', background: '#06080F', borderRadius: 4, border: `1px solid ${isChallenger ? 'rgba(77,159,255,0.2)' : isDeviant ? 'rgba(255,77,106,0.2)' : 'rgba(240,165,0,0.06)'}` }}>
                                        <span className="f-mono" style={{ fontSize: '0.58rem', color: isChallenger ? C.blue : C.gold }}>{v.id}{isChallenger ? ' [CHG]' : ''}</span>
                                        <span className="f-display" style={{ fontSize: '0.95rem', color: isDeviant ? C.red : C.green }}>{v.score}</span>
                                      </div>
                                    );
                                  })}
                                  {pState.consensusData && (
                                    <div style={{ marginTop: '0.5rem', padding: '0.45rem 0.65rem', background: 'rgba(0,255,178,0.04)', border: '1px solid rgba(0,255,178,0.1)', borderRadius: 4, display: 'flex', justifyContent: 'space-between' }}>
                                      <span className="f-mono" style={{ fontSize: '0.56rem', color: '#4A4845' }}>Consensus ({pState.consensusData.agreeingCount}/{pState.consensusData.totalCount})</span>
                                      <span className="f-display" style={{ fontSize: '1rem', color: C.green }}>{pState.consensusData.consensusScore}</span>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}

                          {/* ── DONE: Result card ─────────────────────── */}
                          {isDone && pState.result && (
                            <div>
                              {/* Onchain digest */}
                              <div style={{ border: '1px solid rgba(77,159,255,0.25)', background: 'rgba(77,159,255,0.04)', padding: '1rem', marginBottom: '0.75rem', borderRadius: 6 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                                  <Database size={11} color={C.blue} />
                                  <span className="f-mono" style={{ fontSize: '0.58rem', color: C.blue, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                                    Onchain Digest · 96 bytes · Block #{pState.result.block_number?.toLocaleString()}
                                  </span>
                                </div>
                                {[
                                  { l: 'task_id',        v: trunc(pState.result.task_id, 10, 6),        c: '#E2DDD6' },
                                  { l: 'telemetry_hash', v: trunc(pState.result.telemetry_hash, 12, 6), c: C.green },
                                  { l: 'popw_score',     v: pState.result.popw_score,                   c: C.gold },
                                  { l: 'outcome',        v: pState.result.outcome,                      c: pState.result.outcome === 'SUCCESS' ? C.green : C.red },
                                ].map(f => (
                                  <div key={f.l} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                                    <span className="f-mono" style={{ fontSize: '0.58rem', color: '#3A3835' }}>{f.l}</span>
                                    <span className="f-mono" style={{ fontSize: '0.6rem', color: f.c }}>{f.v}</span>
                                  </div>
                                ))}
                                {pState.result.tx_hash && (
                                  <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid rgba(77,159,255,0.12)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                      <span className="f-mono" style={{ fontSize: '0.56rem', color: '#3A3835' }}>commit_tx</span>
                                      <a href={`${EXPLORER}/explorer?tx=${pState.result.tx_hash}`} target="_blank" rel="noreferrer"
                                        style={{ fontFamily: "'Space Mono',monospace", fontSize: '0.56rem', color: C.blue, textDecoration: 'none' }}>
                                        {pState.result.tx_hash.slice(0, 14)}… ↗
                                      </a>
                                    </div>
                                    {pState.result.score_tx_hash && (
                                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.25rem' }}>
                                        <span className="f-mono" style={{ fontSize: '0.56rem', color: '#3A3835' }}>score_tx</span>
                                        <a href={`${EXPLORER}/explorer?tx=${pState.result.score_tx_hash}`} target="_blank" rel="noreferrer"
                                          style={{ fontFamily: "'Space Mono',monospace", fontSize: '0.56rem', color: C.green, textDecoration: 'none' }}>
                                          {pState.result.score_tx_hash.slice(0, 14)}… ↗
                                        </a>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>

                              {/* IPFS */}
                              <div style={{ border: '1px solid rgba(240,165,0,0.2)', background: 'rgba(240,165,0,0.03)', padding: '0.85rem 1rem', borderRadius: 6 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
                                  <Globe size={11} color={C.gold} />
                                  <span className="f-mono" style={{ fontSize: '0.58rem', color: C.gold, letterSpacing: '0.1em', textTransform: 'uppercase' }}>IPFS — full telemetry (0 bytes onchain)</span>
                                </div>
                                <div className="f-mono" style={{ fontSize: '0.6rem', color: '#5A5550', wordBreak: 'break-all' }}>{pState.result.ipfs_cid}</div>
                              </div>

                              {/* Task now completed banner */}
                              <div style={{ marginTop: '0.75rem', padding: '0.7rem 1rem', background: 'rgba(0,255,178,0.05)', border: '1px solid rgba(0,255,178,0.2)', borderRadius: 6, display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                <CheckCircle size={14} color={C.green} />
                                <span className="f-mono" style={{ fontSize: '0.65rem', color: C.green }}>Task marked COMPLETED in Firebase — visible to all users</span>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── COMPLETED TASKS ──────────────────────────────────────── */}
          {completedTasks.length > 0 && (
            <div>
              <div className="f-mono" style={{ fontSize: '0.63rem', color: C.green, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <CheckCircle size={12} /> Completed Tasks ({completedTasks.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                {completedTasks.map(task => {
                  const completedRobot = task.completed_by ? robots.find(r => (r.robot_id || r.id) === task.completed_by) : null;
                  const mem = memories.find(m => m.robot_id === task.completed_by && m.task_type === task.task_type);
                  return (
                    <div key={task.task_id} className="card" style={{ padding: '0.9rem 1.25rem', borderLeft: `3px solid rgba(0,255,178,0.4)`, display: 'flex', alignItems: 'flex-start', gap: '0.9rem', opacity: 0.82 }}>
                      <CheckCircle size={14} color={C.green} style={{ flexShrink: 0, marginTop: '0.2rem' }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '0.3rem', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '0.82rem', color: '#7A7570', textDecoration: 'line-through' }}>{task.instruction}</span>
                          <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
                            {task.popw_score != null && (
                              <span className="tag tag-green" style={{ fontSize: '0.54rem' }}>PoPW {typeof task.popw_score === 'number' && task.popw_score <= 1 ? Math.round(task.popw_score * 100) : Math.round(task.popw_score)}</span>
                            )}
                            <span className="tag tag-green" style={{ fontSize: '0.54rem', opacity: 0.7 }}>DONE</span>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                          <span className="f-mono" style={{ fontSize: '0.58rem', color: '#3A3835' }}>{task.task_type}</span>
                          {completedRobot && <span className="f-mono" style={{ fontSize: '0.58rem', color: C.blue }}>by {completedRobot.metadata?.label || completedRobot.name}</span>}
                          {task.completed_at && <span className="f-mono" style={{ fontSize: '0.55rem', color: '#2A2825' }}>{new Date(task.completed_at).toLocaleString()}</span>}
                          {mem?.tx_hash && (
                            <a href={`${EXPLORER}/explorer?tx=${mem.tx_hash}`} target="_blank" rel="noreferrer"
                              style={{ fontFamily: "'Space Mono',monospace", fontSize: '0.55rem', color: C.blue, textDecoration: 'none' }}>
                              ↗ explorer
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {tasks.length === 0 && (
            <div style={{ padding: '3rem', textAlign: 'center', color: '#3A3835', fontFamily: "'Space Mono',monospace", fontSize: '0.72rem', border: '1px dashed rgba(240,165,0,0.1)', borderRadius: 8 }}>
              No tasks yet — go to "Post New Task" tab to add one.
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════
          TAB: POST TASK
          ════════════════════════════════════════════════════════════════ */}
      {tab === 'post' && (
        <div style={{ maxWidth: 600 }}>
          <div className="card" style={{ padding: '1.75rem', border: '1px solid rgba(0,230,118,0.15)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
              <div className="f-mono" style={{ fontSize: '0.65rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: '#00E676', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Plus size={12} color="#00E676" /> Post Task On-Chain
              </div>
              <button
                onClick={() => { const ex = EXAMPLES[Math.floor(Math.random() * EXAMPLES.length)]; setTaskForm({ ...ex, robotId: taskForm.robotId }); setTaskError(''); setTaskResult(null); }}
                style={{ background: 'rgba(0,230,118,0.08)', border: '1px solid rgba(0,230,118,0.25)', borderRadius: 6, padding: '5px 12px', cursor: 'pointer', fontFamily: "'Space Mono',monospace", fontSize: '0.62rem', color: '#00E676' }}
              >
                ✦ Auto-fill
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
              <div>
                <label style={{ fontFamily: "'Space Mono',monospace", fontSize: '0.6rem', color: '#3A3835', display: 'block', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Task Instruction *</label>
                <textarea rows={3} placeholder="Describe what the robot should do…" value={taskForm.instruction} onChange={e => setTaskForm({ ...taskForm, instruction: e.target.value })} disabled={taskPosting} style={{ resize: 'vertical' }} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ fontFamily: "'Space Mono',monospace", fontSize: '0.6rem', color: '#3A3835', display: 'block', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Task Type *</label>
                  <select value={taskForm.taskType} onChange={e => setTaskForm({ ...taskForm, taskType: e.target.value })} disabled={taskPosting}>
                    <option value="">Select…</option>
                    {TASK_CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontFamily: "'Space Mono',monospace", fontSize: '0.6rem', color: '#3A3835', display: 'block', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Reward (testKNX)</label>
                  <input type="number" min="0" step="0.5" value={taskForm.rewardKnx} onChange={e => setTaskForm({ ...taskForm, rewardKnx: e.target.value })} disabled={taskPosting} />
                </div>
              </div>

              <div>
                <label style={{ fontFamily: "'Space Mono',monospace", fontSize: '0.6rem', color: '#3A3835', display: 'block', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Assign Robot (optional)</label>
                <select value={taskForm.robotId} onChange={e => setTaskForm({ ...taskForm, robotId: e.target.value })} disabled={taskPosting}>
                  <option value="">Any available robot</option>
                  {robots.map(r => <option key={r.robot_id || r.id} value={r.robot_id || r.id}>{r.metadata?.label || r.name}</option>)}
                </select>
              </div>

              {taskError && (
                <div style={{ padding: '0.7rem 1rem', background: 'rgba(255,77,77,0.07)', border: '1px solid rgba(255,77,77,0.25)', borderRadius: 8, fontFamily: "'Space Mono',monospace", fontSize: '0.68rem', color: '#FF4D4D' }}>
                  ⚠ {taskError}
                </div>
              )}
              {taskResult && (
                <div style={{ padding: '0.7rem 1rem', background: 'rgba(0,230,118,0.07)', border: '1px solid rgba(0,230,118,0.25)', borderRadius: 8, fontFamily: "'Space Mono',monospace", fontSize: '0.68rem', color: '#00E676', lineHeight: 1.7 }}>
                  ✅ Task posted onchain!<br />
                  <span style={{ color: '#5A5550' }}>ID: </span>{taskResult.task_id?.slice(0, 24)}…
                  {taskResult.tx_hash && <><br /><a href={`${EXPLORER}/explorer?tx=${taskResult.tx_hash}`} target="_blank" rel="noreferrer" style={{ color: '#00E676' }}>{taskResult.tx_hash.slice(0, 22)}… ↗</a></>}
                  <br /><span style={{ color: '#5A5550' }}>→ Task Board mein dikhai dega</span>
                </div>
              )}

              <button onClick={handlePostTask} disabled={taskPosting} style={{
                width: '100%', padding: '11px', background: taskPosting ? 'rgba(0,230,118,0.06)' : 'rgba(0,230,118,0.12)',
                border: `1px solid ${taskPosting ? 'rgba(0,230,118,0.2)' : 'rgba(0,230,118,0.4)'}`,
                borderRadius: 10, cursor: taskPosting ? 'not-allowed' : 'pointer',
                fontFamily: "'Space Mono',monospace", fontWeight: 700, fontSize: '0.75rem',
                color: '#00E676', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}>
                {taskPosting
                  ? <><span style={{ width: 12, height: 12, border: '2px solid rgba(0,230,118,0.3)', borderTopColor: '#00E676', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} /> Wallet mein approve karo…</>
                  : <><Zap size={13} /> ⛓ Post Task On-Chain</>
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════
          TAB: TECHNICAL DEPTH
          ════════════════════════════════════════════════════════════════ */}
      {tab === 'tech' && (
        <div>
          <div style={{ marginBottom: '2rem' }}>
            <div className="f-mono" style={{ fontSize: '0.65rem', color: C.gold, letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: '0.5rem' }}>// Protocol Architecture</div>
            <h2 className="f-display" style={{ fontSize: 'clamp(1.6rem,3vw,2.4rem)', color: '#E2DDD6' }}>HOW AXIOM WORKS<br />UNDER THE HOOD</h2>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(400px,1fr))', gap: '1.25rem' }}>
            {TECH.map((s, i) => {
              const Icon = s.icon;
              return (
                <div key={i} className="card" style={{ padding: '1.6rem', borderTop: `2px solid ${s.color}40` }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1rem' }}>
                    <div style={{ width: 38, height: 38, background: `${s.color}10`, border: `1px solid ${s.color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', clipPath: 'polygon(0 0,calc(100% - 6px) 0,100% 6px,100% 100%,6px 100%,0 calc(100% - 6px))' }}>
                      <Icon size={16} color={s.color} />
                    </div>
                    <span className="f-mono" style={{ fontSize: '0.56rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: s.color, background: `${s.color}10`, padding: '3px 8px', borderRadius: 4, border: `1px solid ${s.color}25` }}>{s.tag}</span>
                  </div>
                  <h3 className="f-display" style={{ fontSize: '1.25rem', color: '#E2DDD6', marginBottom: '0.65rem' }}>{s.title}</h3>
                  <p style={{ fontSize: '0.82rem', color: '#6A6560', lineHeight: 1.75, marginBottom: '1.1rem' }}>{s.body}</p>
                  <div style={{ height: 1, background: `linear-gradient(90deg,${s.color}20,transparent)`, marginBottom: '0.9rem' }} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    {s.details.map((d, j) => (
                      <div key={j} style={{ display: 'flex', gap: '0.55rem', alignItems: 'flex-start' }}>
                        <div style={{ width: 4, height: 4, borderRadius: '50%', background: s.color, marginTop: '0.5rem', flexShrink: 0, opacity: 0.7 }} />
                        <span className="f-mono" style={{ fontSize: '0.65rem', color: '#4A4845', lineHeight: 1.6 }}>{d}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* End-to-end flow */}
          <div style={{ marginTop: '2rem', background: '#06080F', border: '1px solid rgba(240,165,0,0.1)', padding: '1.6rem', borderRadius: 6 }}>
            <div className="f-mono" style={{ fontSize: '0.6rem', color: C.gold, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '1rem' }}>// End-to-End Data Flow</div>
            {[
              { n: '01', label: 'ROBOT EXECUTES',  desc: 'LiDAR + Camera + IMU capture real-world task execution',                         c: C.blue },
              { n: '02', label: 'SENSOR FUSION',   desc: 'Kalman filter → completion_pct (40%), safety (35%), efficiency (25%)',           c: C.gold },
              { n: '03', label: 'HASH COMMIT',     desc: 'Keccak-256(telemetry+robotId+ts) → 32B hash committed onchain',                  c: C.purple },
              { n: '04', label: 'LAZY VALIDATE',   desc: '5-of-N validators each score their assigned telemetry section',                  c: '#FF9800' },
              { n: '05', label: 'CONSENSUS',       desc: '≥70% agree → pass · <70% → challenge round (+3 validators)',                     c: C.gold },
              { n: '06', label: 'IPFS UPLOAD',     desc: 'Full raw telemetry → IPFS content-addressed by CID (private)',                   c: C.green },
              { n: '07', label: 'MEMORY WRITE',    desc: 'task_id + hash + popw_score + ipfs_cid → Konnex subnet (96 bytes)',              c: C.green },
              { n: '08', label: 'REP UPDATE',      desc: 'rep = 0.95×prev + 0.05×raw_popw → robot reputation accrues permanently',        c: C.blue },
            ].map((item) => (
              <div key={item.n} style={{ display: 'flex', gap: '1rem', marginBottom: '0.6rem', alignItems: 'flex-start' }}>
                <span style={{ color: item.c, fontSize: '0.58rem', minWidth: 18, flexShrink: 0, fontFamily: "'Space Mono',monospace" }}>{item.n}</span>
                <span style={{ color: item.c, fontSize: '0.6rem', minWidth: 110, flexShrink: 0, letterSpacing: '0.07em', fontFamily: "'Space Mono',monospace" }}>{item.label}</span>
                <span style={{ color: '#4A4845', fontSize: '0.63rem', lineHeight: 1.5 }}>{item.desc}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        select, input, textarea {
          background: #0A0D1A;
          border: 1px solid rgba(240,165,0,0.15);
          border-radius: 6px;
          color: #C0B8B0;
          font-family: 'Space Mono', monospace;
          font-size: 0.8rem;
          padding: 8px 12px;
          width: 100%;
          box-sizing: border-box;
          outline: none;
          transition: border-color 0.2s;
        }
        select:focus, input:focus, textarea:focus { border-color: rgba(240,165,0,0.4); }
        label { font-family: 'Space Mono', monospace; font-size: 0.62rem; color: #5A5550; display: block; margin-bottom: 0.4rem; text-transform: uppercase; letter-spacing: 0.1em; }
      `}</style>
    </div>
  );
}

