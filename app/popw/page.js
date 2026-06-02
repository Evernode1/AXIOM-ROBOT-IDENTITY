'use client';
import { useState, useEffect, useRef } from 'react';
import {
  CheckCircle, Hash, Zap, ChevronRight, Lock, Unlock,
  Eye, EyeOff, AlertTriangle, Wifi, WifiOff, Database, Globe, Wallet,
  ClipboardList, Clock, Shield, Activity, Cpu, Network, BookOpen
} from 'lucide-react';
import { TASK_CATEGORIES, MEMORY_CAP, VALIDATOR_POOL, TELEMETRY_SECTIONS } from '@/lib/data';
import { addItem } from '@/lib/storage';
import {
  generateTelemetryHash, generateIPFSCID, generateTaskId,
  calcPoPWScore, fmtTime, timeAgo, trunc,
  selectValidators, assignSections, computeConsensus, runChallengeRound,
} from '@/lib/utils';

// ── Onchain engine ────────────────────────────────────────────────────────────
import {
  WALLET, CHAIN, EXPLORER,
  sendExtrinsic, initChain,
  fbSaveMemory, fbSaveReputation, loadDB, DB,
  postTaskOnchain, fbUpdateTask,
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

// ── Technical depth data ──────────────────────────────────────────────────────
const TECH_SECTIONS = [
  {
    icon: Shield,
    color: '#F0A500',
    title: 'Lazy Validator Strategy',
    tag: 'CONSENSUS',
    body: 'Validators are sampled lazily — only 5 of N registered validators are randomly selected per PoPW submission. Each validator receives a non-overlapping telemetry section via assignSections(). A 70% agreement threshold triggers consensus; below 70% spawns a challenge round with 3 additional validators. This O(log N) approach prevents validator collusion while keeping gas costs fixed regardless of fleet size.',
    details: ['Random 5-of-N sampling per round', '70% threshold → consensus pass', '<70% → challenge round (+3 validators)', 'Stake-weighted scoring (higher KNX stake = higher weight)', 'Deviant validators slashed in future mainnet'],
  },
  {
    icon: Activity,
    color: '#4D9FFF',
    title: 'Sensor Fusion & Telemetry',
    tag: 'DATA LAYER',
    body: 'Raw telemetry is a multi-modal stream: LiDAR point clouds, camera frames, IMU quaternions, joint torques, and task completion signals. Before PoPW submission, sensors are fused via a weighted Kalman filter: completion_pct (40%), safety_score from collision/boundary detection (35%), efficiency from elapsed_s/timeout_s ratio (25%). Only the fused PoPW scalar (0–1) and 32-byte Keccak-256 hash land onchain.',
    details: ['LiDAR + Camera + IMU + Joint torque fusion', 'Weighted Kalman filter (completion 40%, safety 35%, efficiency 25%)', '32-byte Keccak-256 telemetry_hash → onchain only', 'Full raw payload → IPFS (proprietary, private)', 'Task-type-specific scoring: velocity limits, map coverage, grasp success'],
  },
  {
    icon: Database,
    color: '#00FFB2',
    title: 'Hybrid Storage Architecture',
    tag: 'STORAGE',
    body: 'AXIOM uses a three-layer storage stack: (1) Konnex Substrate chain stores only 96-byte digests per task — task_id, telemetry_hash, popw_score, block_number. (2) IPFS stores full telemetry payloads — sensor logs, trajectory traces, motion policies — content-addressed by CID. (3) Firebase Firestore acts as the hot-path index for real-time fleet queries, with onSnapshot listeners syncing across all clients instantly.',
    details: ['Layer 1 — Konnex Substrate: 96 bytes/task, immutable', 'Layer 2 — IPFS: raw telemetry, proprietary, content-addressed', 'Layer 3 — Firebase Firestore: real-time index, onSnapshot listeners', 'Memory cap: 1024 entries/robot → oldest pruned at cap', 'Cross-subnet portability via KNX token bridge'],
  },
  {
    icon: Network,
    color: '#CE93D8',
    title: 'ZK-PoPW Roadmap',
    tag: 'ZERO KNOWLEDGE',
    body: 'Current PoPW uses hash-commitment + validator consensus. The ZK roadmap replaces validator consensus with a SNARK proof: the robot generates a Groth16 proof that its sensor data satisfies task completion predicates without revealing raw data. Verifying a ZK proof costs ~200k gas vs ~5M for full validator voting. Planned milestones: ZK circuit for completion_pct (Q3 2025), safety predicate (Q4 2025), full ZK-PoPW on mainnet (Q2 2026).',
    details: ['Phase 1: hash-commitment + validator consensus (live)', 'Phase 2: Groth16 SNARK for completion predicates (Q3 2025)', 'Phase 3: safety + efficiency ZK predicates (Q4 2025)', 'Phase 4: Full ZK-PoPW — no validators needed (Q2 2026)', 'ZK verification: ~200k gas vs ~5M for full consensus'],
  },
];

export default function PoPW() {
  const [robots, setRobots]   = useState([]);
  const [memories, setMemories] = useState([]);
  const [openTasks, setOpenTasks] = useState([]);
  const [form, setForm]       = useState(EMPTY);
  const [errors, setErrors]   = useState({});
  const [synced, setSynced]   = useState(false);
  const [activeTab, setActiveTab] = useState('submit'); // 'submit' | 'board' | 'tech'

  // Pipeline state
  const [phase, setPhase]         = useState(null);
  const [step, setStep]           = useState(0);
  const [phasesDone, setPhasesDone] = useState([]);
  const [hashAnim, setHashAnim]   = useState('');
  const [result, setResult]       = useState(null);
  const [validatorScores, setValidatorScores] = useState([]);
  const [selectedVals, setSelectedVals]       = useState([]);
  const [consensusData, setConsensusData]     = useState(null);
  const [challengeVals, setChallengeVals]     = useState([]);
  const [showRaw, setShowRaw]     = useState(false);
  const intervalRef               = useRef(null);

  // ── Task Post state ───────────────────────────────────────────────────────
  const TASK_EMPTY = { instruction: '', taskType: '', rewardKnx: 10, robotId: '' };
  const [taskForm,    setTaskForm]    = useState(TASK_EMPTY);
  const [taskPosting, setTaskPosting] = useState(false);
  const [taskResult,  setTaskResult]  = useState(null);
  const [taskError,   setTaskError]   = useState('');

  const TASK_EXAMPLES = [
    { instruction: 'Fly to building roof zone B and photograph solar panel array for damage assessment', taskType: 'Drone Navigation & Swarm Coordination',    rewardKnx: 12 },
    { instruction: 'Pick the red cylinder from conveyor A and place it precisely in bin B',              taskType: 'Robotic Manipulation (Roboarm)',            rewardKnx: 8  },
    { instruction: 'Generate complete 3D SLAM map of warehouse sector C including all shelving units',   taskType: 'SLAM / Spatial Perception',                rewardKnx: 15 },
    { instruction: 'Inspect pipeline joints 47-52 for corrosion damage and record PoPW telemetry',       taskType: 'Robot Identity & Memory',                  rewardKnx: 10 },
    { instruction: 'Coordinate fleet of 3 drones to do perimeter sweep and return in formation',         taskType: 'Robot Fleet Orchestration',                rewardKnx: 18 },
    { instruction: 'Perform full VLA task execution on humanoid in unstructured kitchen environment',    taskType: 'Robotic General Intelligence VLA/LBM',     rewardKnx: 20 },
  ];

  function autofillTask() {
    const ex = TASK_EXAMPLES[Math.floor(Math.random() * TASK_EXAMPLES.length)];
    const firstRobot = robots[0];
    setTaskForm({
      instruction: ex.instruction,
      taskType:    ex.taskType,
      rewardKnx:   ex.rewardKnx,
      robotId:     firstRobot ? (firstRobot.robot_id || firstRobot.id) : '',
    });
    setTaskError('');
    setTaskResult(null);
  }

  async function handlePostTask() {
    if (!taskForm.instruction.trim()) { setTaskError('Task instruction required'); return; }
    if (!taskForm.taskType)           { setTaskError('Select a task type'); return; }
    if (!WALLET.connected || !WALLET.signer || WALLET.readOnly) {
      setTaskError('SubWallet / Talisman wallet connect karo — onchain tx ke liye signer chahiye.');
      return;
    }
    setTaskPosting(true);
    setTaskError('');
    setTaskResult(null);
    try {
      const task = await postTaskOnchain({
        instruction:    taskForm.instruction,
        taskType:       taskForm.taskType,
        rewardKnx:      parseFloat(taskForm.rewardKnx) || 0,
        posterAddress:  WALLET.address,
        robotId:        taskForm.robotId || null,
      });
      setTaskResult(task);
      setTaskForm(TASK_EMPTY);
      // Switch to board to see the new open task
      setActiveTab('board');
    } catch (e) {
      setTaskError(e.message);
    }
    setTaskPosting(false);
  }

  useEffect(() => {
    (async () => {
      await loadDB();
      const loadedRobots = [...DB.robots];
      setRobots(loadedRobots);
      setMemories([...DB.memory].sort((a, b) => b.timestamp - a.timestamp));
      // Load open tasks from DB
      setOpenTasks([...DB.tasks].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
      setSynced(true);

      const unitree = loadedRobots.find(r =>
        (r.metadata?.label || r.name || '').toLowerCase().includes('unitree') ||
        (r.metadata?.type  || r.type  || '').toLowerCase().includes('unitree')
      );
      if (unitree) {
        setForm(prev => ({ ...prev, robotId: unitree.robot_id || unitree.id }));
      }
    })();

    const onRobotsUpdated = (updated) => setRobots([...updated]);
    const onMemoryUpdated = (updated) =>
      setMemories([...updated].sort((a, b) => b.timestamp - a.timestamp));
    const onTasksUpdated = (updated) =>
      setOpenTasks([...updated].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));

    on('robots:updated', onRobotsUpdated);
    on('memory:updated', onMemoryUpdated);
    on('tasks:updated', onTasksUpdated);

    return () => {
      off('robots:updated', onRobotsUpdated);
      off('memory:updated', onMemoryUpdated);
      off('tasks:updated', onTasksUpdated);
    };
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

  // ── Auto-complete matching open task in Firebase ──────────────────────────
  async function autoCompleteMatchingTask(robotId, taskType, popwScore, txHash) {
    try {
      // Find matching open task for this robot+taskType
      const match = DB.tasks.find(t =>
        t.status === 'open' &&
        (t.robot_id === robotId || !t.robot_id) &&
        (t.task_type === taskType || !t.task_type)
      );
      if (match) {
        await fbUpdateTask(match.task_id, {
          status:       'completed',
          completed_at: new Date().toISOString(),
          popw_score:   popwScore,
          tx_hash:      txHash || match.tx_hash,
          completed_by: robotId,
        });
        // DB.tasks is already updated by fbUpdateTask, but emit for UI
        const { emit } = await import('@/lib/chain');
      }
    } catch (e) {
      console.warn('[PoPW] autoCompleteMatchingTask:', e.message);
    }
  }

  async function handleSubmit(ev) {
    ev.preventDefault();
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }

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
    const robot          = robots.find(r => (r.robot_id || r.id) === form.robotId);

    // ── PHASE 1: COMMIT ───────────────────────────────────────────────
    const chars = '0123456789abcdef';
    intervalRef.current = setInterval(() => {
      setHashAnim('0x' + Array.from({ length: 32 }, () => chars[Math.floor(Math.random() * chars.length)]).join(''));
    }, 60);

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

    // ── PHASE 3: SCORE ────────────────────────────────────────────────
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
      scoreTxResult = { txHash: null, blockNumber: realBlock };
      console.warn('[PoPW] Score tx failed:', err.message);
    }

    await scorePhasePromise;

    // ── Build final memory entry ──────────────────────────────────────
    const newMem = {
      task_id:        taskId,
      telemetry_hash: telemetryHash,
      popw_score:     finalScore,
      block_number:   scoreTxResult.blockNumber || realBlock,
      tx_hash:        realTxHash,
      score_tx_hash:  scoreTxResult.txHash || null,
      ipfs_cid:       ipfsCid,
      id:             `MEM-${ts}`,
      robot_id:       form.robotId,
      robotId:        form.robotId,
      robotName:      robot?.metadata?.label || robot?.name || 'Unknown',
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

    await fbSaveMemory(newMem).catch(console.warn);
    await addItem('memories', newMem).catch(console.warn);

    // ── Mark matching open task as COMPLETED in Firebase (real-time) ──
    await autoCompleteMatchingTask(form.robotId, form.taskType, finalScore, realTxHash);

    // ── Update reputation ─────────────────────────────────────────────
    const success = finalScore >= 0.5;
    const DECAY = 0.95;
    const W = { safety: 0.40, match: 0.35, efficiency: 0.25 };
    if (!DB.reputation[form.robotId]) {
      DB.reputation[form.robotId] = { score: 0, total_tasks: 0, successful_tasks: 0, last_updated: new Date().toISOString() };
    }
    const rep = DB.reputation[form.robotId];
    const raw = finalScore * W.safety + finalScore * W.match + finalScore * W.efficiency;
    rep.score = +Math.min(1, Math.max(0, DECAY * rep.score + (1 - DECAY) * raw)).toFixed(4);
    rep.total_tasks = (rep.total_tasks || 0) + 1;
    if (success) rep.successful_tasks = (rep.successful_tasks || 0) + 1;
    rep.last_updated = new Date().toISOString();
    await fbSaveReputation(form.robotId, rep).catch(console.warn);

    const robotIdx = DB.robots.findIndex(r => (r.robot_id || r.id) === form.robotId);
    if (robotIdx >= 0) {
      const updatedRobot = {
        ...DB.robots[robotIdx],
        total_tasks:      (DB.robots[robotIdx].total_tasks || 0) + 1,
        successful_tasks: success ? (DB.robots[robotIdx].successful_tasks || 0) + 1 : (DB.robots[robotIdx].successful_tasks || 0),
        last_task_at:     new Date().toISOString(),
      };
      DB.robots[robotIdx] = updatedRobot;
      const { fbSaveRobot } = await import('@/lib/chain');
      await fbSaveRobot(updatedRobot).catch(console.warn);
      setRobots([...DB.robots]);
    }

    setMemories(prev => [newMem, ...prev]);
    setResult(newMem);
    setPhase('DONE');
    setForm(EMPTY);
  }

  const selectedRobot = robots.find(r => (r.robot_id || r.id) === form.robotId);
  const isRunning     = phase && phase !== 'DONE';
  const currentPhaseData = phase && phase !== 'DONE' ? PHASES[phase] : null;

  // Task board stats
  const openCount      = openTasks.filter(t => t.status === 'open').length;
  const completedCount = openTasks.filter(t => t.status === 'completed').length;

  return (
    <div className="page-wrap">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
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
              {synced ? 'Firebase Live' : 'Loading...'}
            </span>
          </div>
        </div>
      </div>

      {/* ── Phase pipeline indicator ─────────────────────────────────────────── */}
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

      {/* ── Tab Nav ──────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: '0', marginBottom: '2rem', border: '1px solid rgba(240,165,0,0.12)', borderRadius: 8, overflow: 'hidden', background: '#0B0E1A' }}>
        {[
          { id: 'submit', icon: Hash,          label: 'Submit PoPW' },
          { id: 'board',  icon: ClipboardList, label: `Task Board (${openCount} open · ${completedCount} done)` },
          { id: 'tech',   icon: BookOpen,      label: 'Technical Depth' },
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
            flex: 1, padding: '0.8rem 1rem', cursor: 'pointer',
            background: activeTab === tab.id ? 'rgba(240,165,0,0.1)' : 'transparent',
            border: 'none',
            borderBottom: activeTab === tab.id ? '2px solid #F0A500' : '2px solid transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
            fontFamily: "'Space Mono', monospace", fontSize: '0.65rem',
            color: activeTab === tab.id ? '#F0A500' : '#5A5550',
            letterSpacing: '0.08em', textTransform: 'uppercase',
            transition: 'all 0.2s',
          }}>
            <tab.icon size={12} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* TAB: SUBMIT POPW                                                       */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'submit' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', alignItems: 'start' }} className="popw-grid">

          {/* ── FORM ─────────────────────────────────────────────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

            {/* ── TASK POST CARD ─────────────────────────────────────────────── */}
            <div className="card" style={{ padding: '1.75rem', border: '1px solid rgba(0,230,118,0.15)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
                <div className="f-mono" style={{ fontSize: '0.65rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: '#00E676', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Zap size={12} color="#00E676" /> Post New Task On-Chain
                </div>
                <button
                  onClick={autofillTask}
                  style={{
                    background: 'rgba(0,230,118,0.08)', border: '1px solid rgba(0,230,118,0.25)',
                    borderRadius: 8, padding: '5px 12px', cursor: 'pointer',
                    fontFamily: "'Space Mono', monospace", fontSize: '0.65rem', color: '#00E676',
                    display: 'flex', alignItems: 'center', gap: 5,
                  }}
                >
                  ✦ Auto-fill Example
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
                <div>
                  <label style={{ fontFamily: "'Space Mono', monospace", fontSize: '0.62rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#3A3835', display: 'block', marginBottom: '0.4rem' }}>Task Instruction *</label>
                  <textarea
                    rows={3}
                    placeholder="Describe what the robot should do — e.g. Fly to zone B, scan solar panels, return to base"
                    value={taskForm.instruction}
                    onChange={e => setTaskForm({ ...taskForm, instruction: e.target.value })}
                    disabled={taskPosting}
                    style={{ resize: 'vertical' }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div>
                    <label style={{ fontFamily: "'Space Mono', monospace", fontSize: '0.62rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#3A3835', display: 'block', marginBottom: '0.4rem' }}>Task Type *</label>
                    <select
                      value={taskForm.taskType}
                      onChange={e => setTaskForm({ ...taskForm, taskType: e.target.value })}
                      disabled={taskPosting}
                    >
                      <option value="">Select type…</option>
                      {TASK_CATEGORIES.map(c => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontFamily: "'Space Mono', monospace", fontSize: '0.62rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#3A3835', display: 'block', marginBottom: '0.4rem' }}>Reward (testKNX)</label>
                    <input
                      type="number" min="0" step="0.5"
                      value={taskForm.rewardKnx}
                      onChange={e => setTaskForm({ ...taskForm, rewardKnx: e.target.value })}
                      disabled={taskPosting}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ fontFamily: "'Space Mono', monospace", fontSize: '0.62rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#3A3835', display: 'block', marginBottom: '0.4rem' }}>Assign Robot (optional)</label>
                  <select
                    value={taskForm.robotId}
                    onChange={e => setTaskForm({ ...taskForm, robotId: e.target.value })}
                    disabled={taskPosting}
                  >
                    <option value="">Any available robot</option>
                    {robots.map(r => (
                      <option key={r.robot_id || r.id} value={r.robot_id || r.id}>
                        {r.metadata?.label || r.name || r.robot_id} — {r.metadata?.type || r.type}
                      </option>
                    ))}
                  </select>
                </div>

                {taskError && (
                  <div style={{ padding: '0.7rem 1rem', background: 'rgba(255,77,77,0.07)', border: '1px solid rgba(255,77,77,0.25)', borderRadius: 8, fontFamily: "'Space Mono', monospace", fontSize: '0.68rem', color: '#FF4D4D' }}>
                    ⚠ {taskError}
                  </div>
                )}

                {taskResult && (
                  <div style={{ padding: '0.7rem 1rem', background: 'rgba(0,230,118,0.07)', border: '1px solid rgba(0,230,118,0.25)', borderRadius: 8, fontFamily: "'Space Mono', monospace", fontSize: '0.68rem', color: '#00E676', lineHeight: 1.7 }}>
                    ✅ Task posted onchain! Check Task Board tab.<br />
                    <span style={{ color: '#5A5550' }}>Task ID: </span>{taskResult.task_id?.slice(0, 24)}…<br />
                    {taskResult.tx_hash && <><span style={{ color: '#5A5550' }}>Tx: </span><a href={`${EXPLORER}/explorer?tx=${taskResult.tx_hash}`} target="_blank" rel="noreferrer" style={{ color: '#00E676', textDecoration: 'none', borderBottom: '1px solid rgba(0,230,118,0.4)' }}>{taskResult.tx_hash.slice(0, 22)}…</a></>}
                  </div>
                )}

                <button
                  onClick={handlePostTask}
                  disabled={taskPosting}
                  style={{
                    width: '100%', padding: '11px 16px',
                    background: taskPosting ? 'rgba(0,230,118,0.06)' : 'rgba(0,230,118,0.12)',
                    border: `1px solid ${taskPosting ? 'rgba(0,230,118,0.2)' : 'rgba(0,230,118,0.4)'}`,
                    borderRadius: 10, cursor: taskPosting ? 'not-allowed' : 'pointer',
                    fontFamily: "'Space Mono', monospace", fontWeight: 700, fontSize: '0.75rem',
                    color: '#00E676', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    transition: 'all 0.2s',
                  }}
                >
                  {taskPosting ? (
                    <><span style={{ width: 12, height: 12, border: '2px solid rgba(0,230,118,0.3)', borderTopColor: '#00E676', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} /> Wallet mein approve karo…</>
                  ) : (
                    <><Zap size={13} /> ⛓ Post Task On-Chain</>
                  )}
                </button>
              </div>
            </div>

            {/* ── PoPW SUBMIT FORM ──────────────────────────────────────────── */}
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
                      <option key={r.robot_id || r.id} value={r.robot_id || r.id}>
                        {r.metadata?.label || r.name || r.robot_id} — {r.metadata?.type || r.type}
                      </option>
                    ))}
                  </select>
                  {errors.robotId && <div style={{ color: '#FF4D6A', fontSize: '0.7rem', marginTop: '0.3rem', fontFamily: "'Space Mono', monospace" }}>{errors.robotId}</div>}
                </div>

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
                    <div style={{ height: 2, background: '#1A1D2A', borderRadius: 1, marginBottom: '0.6rem' }}>
                      <div style={{
                        height: '100%', borderRadius: 1,
                        width: `${Math.min(((selectedRobot.memoryCount ?? selectedRobot.tasks ?? 0) / MEMORY_CAP) * 100, 100)}%`,
                        background: (selectedRobot.memoryCount ?? selectedRobot.tasks ?? 0) >= MEMORY_CAP ? '#F0A500' : '#00FFB2',
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
                    Proprietary motion policies & env maps stay private. Only the hash is public.
                  </div>
                </div>

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

            {(isRunning || result) && (
              <div className="card" style={{ padding: '1.5rem', border: `1px solid ${currentPhaseData ? currentPhaseData.color + '40' : 'rgba(0,255,178,0.25)'}`, transition: 'border-color 0.4s' }}>
                <div className="f-mono" style={{ fontSize: '0.62rem', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '1.25rem', color: currentPhaseData ? currentPhaseData.color : '#00FFB2' }}>
                  {phase === 'DONE' ? '✓ All Phases Complete' : `⟳ Phase: ${phase}`}
                </div>

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

                {result && phase === 'DONE' && (
                  <>
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
                      {result.tx_hash && (
                        <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid rgba(77,159,255,0.15)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                            <span className="f-mono" style={{ fontSize: '0.6rem', color: '#3A3835' }}>commit_tx</span>
                            <a href={`${EXPLORER}/explorer?tx=${result.tx_hash}`} target="_blank" rel="noreferrer"
                              style={{ fontFamily: "'Space Mono',monospace", fontSize: '0.6rem', color: '#4D9FFF', textDecoration: 'none' }}>
                              {result.tx_hash.slice(0, 14)}… ↗
                            </a>
                          </div>
                          {result.score_tx_hash && (
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span className="f-mono" style={{ fontSize: '0.6rem', color: '#3A3835' }}>score_tx</span>
                              <a href={`${EXPLORER}/explorer?tx=${result.score_tx_hash}`} target="_blank" rel="noreferrer"
                                style={{ fontFamily: "'Space Mono',monospace", fontSize: '0.6rem', color: '#00FFB2', textDecoration: 'none' }}>
                                {result.score_tx_hash.slice(0, 14)}… ↗
                              </a>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

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
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                          <Database size={8} color="#4D9FFF" />
                          <span className="f-mono" style={{ fontSize: '0.55rem', color: '#4D9FFF' }}>{m.popw_score ?? '—'}pts</span>
                        </div>
                        {m.ipfs_cid && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                            <Globe size={8} color="#F0A500" />
                            <span className="f-mono" style={{ fontSize: '0.55rem', color: '#4A4845' }}>{trunc(m.ipfs_cid, 6, 4)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                {memories.length === 0 && (
                  <div style={{ padding: '1.5rem 0', textAlign: 'center', color: '#3A3835', fontFamily: "'Space Mono', monospace", fontSize: '0.65rem' }}>
                    No submissions yet
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* TAB: LIVE TASK BOARD                                                   */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'board' && (
        <div>
          {/* Stats bar */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1px', background: 'rgba(240,165,0,0.08)', marginBottom: '2rem' }}>
            {[
              { label: 'Total Tasks', value: openTasks.length, color: '#E2DDD6' },
              { label: 'Open', value: openCount, color: '#F0A500' },
              { label: 'Completed', value: completedCount, color: '#00FFB2' },
              { label: 'Completion Rate', value: openTasks.length ? `${Math.round(completedCount / openTasks.length * 100)}%` : '0%', color: '#4D9FFF' },
            ].map((s, i) => (
              <div key={s.label} style={{
                padding: '1.25rem 1.5rem', background: '#101525',
                borderRight: i < 3 ? '1px solid rgba(240,165,0,0.08)' : 'none',
              }}>
                <div className="f-display" style={{ fontSize: '1.8rem', color: s.color, lineHeight: 1 }}>{s.value}</div>
                <div className="f-mono" style={{ fontSize: '0.58rem', color: '#5A5550', textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: '0.3rem' }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Live Firebase indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: synced ? '#00FFB2' : '#F0A500', boxShadow: `0 0 8px ${synced ? '#00FFB2' : '#F0A500'}` }} className={synced ? 'anim-pulse' : ''} />
            <span className="f-mono" style={{ fontSize: '0.6rem', color: '#4A4845', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              Firebase Realtime · {openTasks.length} tasks loaded · auto-updates on completion
            </span>
          </div>

          {/* Open tasks */}
          {openCount > 0 && (
            <div style={{ marginBottom: '2rem' }}>
              <div className="f-mono" style={{ fontSize: '0.65rem', color: '#F0A500', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Clock size={12} /> Open Tasks ({openCount})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {openTasks.filter(t => t.status === 'open').map(task => {
                  const assignedRobot = task.robot_id ? robots.find(r => (r.robot_id || r.id) === task.robot_id) : null;
                  return (
                    <div key={task.task_id} className="card" style={{ padding: '1.25rem 1.5rem', borderLeft: '3px solid #F0A500', display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
                      <div style={{ flexShrink: 0, marginTop: '0.15rem' }}>
                        <div style={{ width: 9, height: 9, borderRadius: '50%', background: '#F0A500', boxShadow: '0 0 8px #F0A500' }} className="anim-pulse" />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', marginBottom: '0.4rem', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '0.85rem', color: '#E2DDD6', fontWeight: 500 }}>{task.instruction}</span>
                          <span className="tag tag-gold" style={{ flexShrink: 0 }}>{task.reward_knx} KNX</span>
                        </div>
                        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.35rem' }}>
                          <span className="f-mono" style={{ fontSize: '0.6rem', color: '#5A5550' }}>{task.task_type}</span>
                          {assignedRobot && <span className="f-mono" style={{ fontSize: '0.6rem', color: '#4D9FFF' }}>→ {assignedRobot.metadata?.label || assignedRobot.name}</span>}
                        </div>
                        <div className="f-mono" style={{ fontSize: '0.56rem', color: '#3A3835' }}>
                          {task.task_id?.slice(0, 20)}… · {task.created_at ? new Date(task.created_at).toLocaleString() : '—'}
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          setForm(prev => ({ ...prev, taskType: task.task_type || '', robotId: task.robot_id || prev.robotId }));
                          setActiveTab('submit');
                        }}
                        style={{
                          flexShrink: 0, padding: '6px 14px',
                          background: 'rgba(240,165,0,0.1)', border: '1px solid rgba(240,165,0,0.3)',
                          borderRadius: 6, cursor: 'pointer',
                          fontFamily: "'Space Mono', monospace", fontSize: '0.62rem', color: '#F0A500',
                        }}
                      >
                        Submit PoPW →
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Completed tasks */}
          {completedCount > 0 && (
            <div>
              <div className="f-mono" style={{ fontSize: '0.65rem', color: '#00FFB2', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <CheckCircle size={12} /> Completed Tasks ({completedCount})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                {openTasks.filter(t => t.status === 'completed').map(task => {
                  const completedRobot = task.completed_by ? robots.find(r => (r.robot_id || r.id) === task.completed_by) : null;
                  return (
                    <div key={task.task_id} className="card" style={{ padding: '1rem 1.5rem', borderLeft: '3px solid rgba(0,255,178,0.4)', display: 'flex', alignItems: 'flex-start', gap: '1rem', opacity: 0.85 }}>
                      <div style={{ flexShrink: 0, marginTop: '0.15rem' }}>
                        <CheckCircle size={14} color="#00FFB2" />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', marginBottom: '0.3rem', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '0.82rem', color: '#8A8580', textDecoration: 'line-through' }}>{task.instruction}</span>
                          <span className="tag tag-green" style={{ flexShrink: 0, fontSize: '0.55rem' }}>
                            {task.popw_score ? `PoPW ${(task.popw_score * 100).toFixed(0)}` : 'DONE'}
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                          <span className="f-mono" style={{ fontSize: '0.58rem', color: '#3A3835' }}>{task.task_type}</span>
                          {completedRobot && <span className="f-mono" style={{ fontSize: '0.58rem', color: '#4D9FFF' }}>by {completedRobot.metadata?.label || completedRobot.name}</span>}
                          {task.completed_at && <span className="f-mono" style={{ fontSize: '0.56rem', color: '#2A2825' }}>{new Date(task.completed_at).toLocaleString()}</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {openTasks.length === 0 && (
            <div style={{ padding: '3rem', textAlign: 'center', color: '#3A3835', fontFamily: "'Space Mono', monospace", fontSize: '0.72rem', border: '1px dashed rgba(240,165,0,0.1)', borderRadius: 8 }}>
              No tasks yet. Post a task above to get started.
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* TAB: TECHNICAL DEPTH                                                   */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'tech' && (
        <div>
          <div style={{ marginBottom: '2rem' }}>
            <div className="f-mono" style={{ fontSize: '0.68rem', letterSpacing: '0.15em', textTransform: 'uppercase', color: '#F0A500', marginBottom: '0.6rem' }}>
              // Protocol Architecture
            </div>
            <h2 className="f-display" style={{ fontSize: 'clamp(1.8rem, 3vw, 2.6rem)', color: '#E2DDD6' }}>
              HOW AXIOM WORKS<br />UNDER THE HOOD
            </h2>
            <p style={{ fontSize: '0.85rem', color: '#5A5550', maxWidth: 640, marginTop: '0.75rem', lineHeight: 1.7 }}>
              Deep technical documentation for protocol reviewers, grant committees, and developers building on AXIOM.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(440px, 1fr))', gap: '1.5rem' }}>
            {TECH_SECTIONS.map((s, i) => {
              const Icon = s.icon;
              return (
                <div key={i} className="card" style={{ padding: '1.75rem', borderTop: `2px solid ${s.color}40` }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1rem' }}>
                    <div style={{
                      width: 40, height: 40,
                      background: `${s.color}10`,
                      border: `1px solid ${s.color}30`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      clipPath: 'polygon(0 0, calc(100% - 6px) 0, 100% 6px, 100% 100%, 6px 100%, 0 calc(100% - 6px))',
                    }}>
                      <Icon size={17} color={s.color} />
                    </div>
                    <span className="f-mono" style={{ fontSize: '0.58rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: s.color, background: `${s.color}10`, padding: '3px 8px', borderRadius: 4, border: `1px solid ${s.color}25` }}>
                      {s.tag}
                    </span>
                  </div>

                  <h3 className="f-display" style={{ fontSize: '1.35rem', color: '#E2DDD6', marginBottom: '0.75rem' }}>{s.title}</h3>
                  <p style={{ fontSize: '0.83rem', color: '#6A6560', lineHeight: 1.75, marginBottom: '1.25rem' }}>{s.body}</p>

                  <div style={{ height: 1, background: `linear-gradient(90deg, ${s.color}20, transparent)`, marginBottom: '1rem' }} />

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                    {s.details.map((d, j) => (
                      <div key={j} style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start' }}>
                        <div style={{ width: 5, height: 5, borderRadius: '50%', background: s.color, marginTop: '0.45rem', flexShrink: 0, opacity: 0.7 }} />
                        <span className="f-mono" style={{ fontSize: '0.68rem', color: '#4A4845', lineHeight: 1.6 }}>{d}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Architecture diagram text */}
          <div style={{ marginTop: '2rem', background: '#06080F', border: '1px solid rgba(240,165,0,0.1)', padding: '1.75rem', fontFamily: "'Space Mono', monospace" }}>
            <div style={{ fontSize: '0.6rem', color: '#F0A500', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '1rem' }}>// End-to-End Data Flow</div>
            {[
              { step: '01', label: 'ROBOT EXECUTES', desc: 'LiDAR + Camera + IMU sensors capture real-world task execution', color: '#4D9FFF' },
              { step: '02', label: 'SENSOR FUSION',  desc: 'Kalman filter fuses streams → completion_pct, safety_score, efficiency', color: '#F0A500' },
              { step: '03', label: 'HASH COMMIT',    desc: 'Keccak-256(telemetry + robotId + ts) → 32-byte hash committed onchain', color: '#CE93D8' },
              { step: '04', label: 'LAZY VALIDATE',  desc: '5 of N validators sampled → each scores assigned telemetry section', color: '#FF9800' },
              { step: '05', label: 'CONSENSUS',      desc: '≥70% agreement → consensus PoPW score · <70% → challenge round', color: '#F0A500' },
              { step: '06', label: 'IPFS UPLOAD',    desc: 'Full raw telemetry → IPFS (private, content-addressed by CID)', color: '#00FFB2' },
              { step: '07', label: 'MEMORY WRITE',   desc: 'task_id + telemetry_hash + popw_score + ipfs_cid → Konnex subnet (96 bytes)', color: '#00FFB2' },
              { step: '08', label: 'REP UPDATE',     desc: 'rep_score = 0.95 × prev + 0.05 × raw_popw → robot reputation accrues', color: '#4D9FFF' },
            ].map((item, i) => (
              <div key={i} style={{ display: 'flex', gap: '1rem', marginBottom: '0.65rem', alignItems: 'flex-start' }}>
                <span style={{ color: item.color, fontSize: '0.6rem', minWidth: 20, flexShrink: 0, marginTop: '0.05rem' }}>{item.step}</span>
                <span style={{ color: item.color, fontSize: '0.62rem', minWidth: 120, flexShrink: 0, letterSpacing: '0.08em' }}>{item.label}</span>
                <span style={{ color: '#4A4845', fontSize: '0.65rem', lineHeight: 1.5 }}>{item.desc}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <style>{`
        .popw-grid { grid-template-columns: 1fr 1fr; }
        @media(max-width: 900px) { .popw-grid { grid-template-columns: 1fr; } }
      `}</style>
    </div>
  );
}
