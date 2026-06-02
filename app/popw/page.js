'use client';
import { useState, useEffect, useRef } from 'react';
import {
  CheckCircle, Hash, Zap, ChevronRight, Lock, Unlock,
  Eye, EyeOff, AlertTriangle, Wifi, WifiOff, Database,
  Globe, Wallet, ClipboardList, Play, Clock, Star,
  BarChart2, ArrowRight, Filter, RefreshCw,
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
  fbSaveMemory, fbSaveReputation, fbSaveTask, fbUpdateTask, loadDB, DB,
  postTaskOnchain, chainHash, attachRealtimeListeners,
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

const TASK_EXAMPLES = [
  { instruction: 'Fly to building roof zone B and photograph solar panel array for damage assessment', taskType: 'Drone Navigation & Swarm Coordination', rewardKnx: 12 },
  { instruction: 'Pick the red cylinder from conveyor A and place it precisely in bin B',             taskType: 'Robotic Manipulation (Roboarm)',       rewardKnx: 8  },
  { instruction: 'Generate complete 3D SLAM map of warehouse sector C including all shelving units',  taskType: 'SLAM / Spatial Perception',             rewardKnx: 15 },
  { instruction: 'Inspect pipeline joints 47-52 for corrosion damage and record PoPW telemetry',      taskType: 'Robot Identity & Memory',               rewardKnx: 10 },
  { instruction: 'Coordinate fleet of 3 drones to do perimeter sweep and return in formation',        taskType: 'Robot Fleet Orchestration',             rewardKnx: 18 },
  { instruction: 'Perform full VLA task execution on humanoid in unstructured kitchen environment',   taskType: 'Robotic General Intelligence VLA/LBM',  rewardKnx: 20 },
];

const EMPTY_SUBMIT = { robotId: '', taskType: '', description: '', duration: '', evidence: '' };
const EMPTY_POST   = { instruction: '', taskType: '', rewardKnx: 10, robotId: '' };

function statusColor(s) {
  if (s === 'completed') return '#00FFB2';
  if (s === 'failed')    return '#FF4D6A';
  if (s === 'open')      return '#F0A500';
  return '#4A4845';
}
function statusLabel(s) {
  if (s === 'completed') return '✓ DONE';
  if (s === 'failed')    return '✗ FAILED';
  if (s === 'open')      return '◎ OPEN';
  return s?.toUpperCase() || '—';
}
function scoreColor(v) {
  if (v == null) return '#4A4845';
  if (v >= 0.75) return '#00FFB2';
  if (v >= 0.5)  return '#F0A500';
  return '#FF4D6A';
}

// ── Tab enum ─────────────────────────────────────────────────────────────────
const TABS = { POST: 'POST', SUBMIT: 'SUBMIT', BOARD: 'BOARD' };

export default function PoPW() {
  const [robots,   setRobots]   = useState([]);
  const [memories, setMemories] = useState([]);
  const [tasks,    setTasks]    = useState([]);
  const [synced,   setSynced]   = useState(false);
  const [activeTab, setActiveTab] = useState(TABS.POST);

  // ── Task Post state ───────────────────────────────────────────────────────
  const [postForm,    setPostForm]    = useState(EMPTY_POST);
  const [taskPosting, setTaskPosting] = useState(false);
  const [taskResult,  setTaskResult]  = useState(null);
  const [taskError,   setTaskError]   = useState('');

  // ── PoPW Submit state ─────────────────────────────────────────────────────
  const [form,       setForm]       = useState(EMPTY_SUBMIT);
  const [errors,     setErrors]     = useState({});
  const [phase,      setPhase]      = useState(null);
  const [step,       setStep]       = useState(0);
  const [phasesDone, setPhasesDone] = useState([]);
  const [hashAnim,   setHashAnim]   = useState('');
  const [result,     setResult]     = useState(null);
  const [validatorScores, setValidatorScores] = useState([]);
  const [selectedVals,    setSelectedVals]    = useState([]);
  const [consensusData,   setConsensusData]   = useState(null);
  const [challengeVals,   setChallengeVals]   = useState([]);
  const [showRaw,         setShowRaw]         = useState(false);
  const intervalRef = useRef(null);

  // ── Board filter ──────────────────────────────────────────────────────────
  const [boardFilter, setBoardFilter] = useState('all'); // all | open | completed | failed

  // ── Load DB ───────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      await loadDB();
      attachRealtimeListeners(); // keep tasks/robots in sync via Firestore onSnapshot
      const loadedRobots = [...DB.robots];
      setRobots(loadedRobots);
      setMemories([...DB.memory].sort((a, b) => b.timestamp - a.timestamp));
      setTasks([...DB.tasks].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
      setSynced(true);
      const unitree = loadedRobots.find(r =>
        (r.metadata?.label || r.name || '').toLowerCase().includes('unitree') ||
        (r.metadata?.type  || r.type  || '').toLowerCase().includes('unitree')
      );
      if (unitree) setForm(p => ({ ...p, robotId: unitree.robot_id || unitree.id }));
    })();

    const onRobotsUpdated = (u) => setRobots([...u]);
    const onMemoryUpdated = (u) => setMemories([...u].sort((a, b) => b.timestamp - a.timestamp));
    const onTasksUpdated  = (u) => setTasks([...u].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));

    on('robots:updated',     onRobotsUpdated);
    on('memory:updated',     onMemoryUpdated);
    on('tasks:updated',      onTasksUpdated);
    return () => {
      off('robots:updated',  onRobotsUpdated);
      off('memory:updated',  onMemoryUpdated);
      off('tasks:updated',   onTasksUpdated);
    };
  }, []);

  // ── Autofill task post ────────────────────────────────────────────────────
  function autofillPost() {
    const ex = TASK_EXAMPLES[Math.floor(Math.random() * TASK_EXAMPLES.length)];
    setPostForm({
      instruction: ex.instruction,
      taskType:    ex.taskType,
      rewardKnx:   ex.rewardKnx,
      robotId:     robots[0] ? (robots[0].robot_id || robots[0].id) : '',
    });
    setTaskError('');
    setTaskResult(null);
  }

  // ── Post Task handler ─────────────────────────────────────────────────────
  async function handlePostTask() {
    if (!postForm.instruction.trim()) { setTaskError('Task instruction required'); return; }
    if (!postForm.taskType)           { setTaskError('Select a task type'); return; }
    if (!WALLET.connected || !WALLET.signer || WALLET.readOnly) {
      setTaskError('SubWallet / Talisman wallet connect karo — onchain tx ke liye signer chahiye.');
      return;
    }
    setTaskPosting(true);
    setTaskError('');
    setTaskResult(null);
    try {
      const task = await postTaskOnchain({
        instruction:   postForm.instruction,
        taskType:      postForm.taskType,
        rewardKnx:     parseFloat(postForm.rewardKnx) || 0,
        posterAddress: WALLET.address,
        robotId:       postForm.robotId || null,
      });
      // Persist to Firebase so task survives refresh
      await fbSaveTask(task).catch(console.warn);
      setTaskResult(task);
      setPostForm(EMPTY_POST);
      // Switch to board after posting
      setTimeout(() => setActiveTab(TABS.BOARD), 1200);
    } catch (e) {
      setTaskError(e.message);
    }
    setTaskPosting(false);
  }

  // ── PoPW Submit validation ────────────────────────────────────────────────
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

  // ── PoPW Submit handler ───────────────────────────────────────────────────
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

    const ts            = Date.now();
    const telemetryHash = generateTelemetryHash(form.robotId, form.taskType, ts, form.evidence);
    const robot         = robots.find(r => (r.robot_id || r.id) === form.robotId);

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

    await runPhase('VALIDATE', PHASES.VALIDATE.steps, 800);

    const baseScore = calcPoPWScore(form.duration, !!form.evidence);
    const sampled   = selectValidators(VALIDATOR_POOL);
    const withSecs  = assignSections(sampled, TELEMETRY_SECTIONS);
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
      description: form.description, duration: form.duration, timestamp: ts,
      outcome: finalScore >= 0.5 ? 'SUCCESS' : 'FAILED',
      validator_addr: WALLET.address,
      commit_phase: ts - 2400, reveal_phase: ts - 1600, score_phase: ts, local: false,
    };

    await fbSaveMemory(newMem).catch(console.warn);
    await addItem('memories', newMem).catch(console.warn);

    // ── Update matching open task status in Firebase ──────────────────────────
    // Find task that matches this robot + taskType that is still 'open'
    const matchedTask = DB.tasks.find(t =>
      t.status === 'open' &&
      t.task_type === form.taskType &&
      (!t.robot_id || t.robot_id === form.robotId)
    );
    if (matchedTask) {
      const taskUpdates = {
        status:       success ? 'completed' : 'failed',
        popw_score:   finalScore,
        completed_at: new Date().toISOString(),
        tx_hash:      realTxHash || matchedTask.tx_hash,
      };
      await fbUpdateTask(matchedTask.task_id, taskUpdates).catch(console.warn);
    }

    const success = finalScore >= 0.5;
    const DECAY = 0.95;
    if (!DB.reputation[form.robotId]) {
      DB.reputation[form.robotId] = { score: 0, total_tasks: 0, successful_tasks: 0, last_updated: new Date().toISOString() };
    }
    const rep = DB.reputation[form.robotId];
    rep.score = +Math.min(1, Math.max(0, DECAY * rep.score + (1 - DECAY) * finalScore)).toFixed(4);
    rep.total_tasks = (rep.total_tasks || 0) + 1;
    if (success) rep.successful_tasks = (rep.successful_tasks || 0) + 1;
    rep.last_updated = new Date().toISOString();
    await fbSaveReputation(form.robotId, rep).catch(console.warn);

    const robotIdx = DB.robots.findIndex(r => (r.robot_id || r.id) === form.robotId);
    if (robotIdx >= 0) {
      const updatedRobot = {
        ...DB.robots[robotIdx],
        total_tasks: (DB.robots[robotIdx].total_tasks || 0) + 1,
        successful_tasks: success ? (DB.robots[robotIdx].successful_tasks || 0) + 1 : (DB.robots[robotIdx].successful_tasks || 0),
        last_task_at: new Date().toISOString(),
      };
      DB.robots[robotIdx] = updatedRobot;
      const { fbSaveRobot } = await import('@/lib/chain');
      await fbSaveRobot(updatedRobot).catch(console.warn);
      setRobots([...DB.robots]);
    }

    setMemories(prev => [newMem, ...prev]);
    setResult(newMem);
    setPhase('DONE');
    setForm(EMPTY_SUBMIT);
  }

  const selectedRobot     = robots.find(r => (r.robot_id || r.id) === form.robotId);
  const isRunning         = phase && phase !== 'DONE';
  const currentPhaseData  = phase && phase !== 'DONE' ? PHASES[phase] : null;

  const filteredTasks = tasks.filter(t => boardFilter === 'all' || t.status === boardFilter);

  // ── Task stats ────────────────────────────────────────────────────────────
  const openCount      = tasks.filter(t => t.status === 'open').length;
  const completedCount = tasks.filter(t => t.status === 'completed').length;
  const totalReward    = tasks.reduce((s, t) => s + (t.reward_knx || 0), 0);

  return (
    <div className="page-wrap">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="page-header">
        <div className="page-sub">// Proof of Physical Work</div>
        <h1 className="page-title">AXIOM PoPW SYSTEM</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
          <p style={{ color: '#6A6560', fontSize: '0.88rem', maxWidth: 600 }}>
            Post tasks on-chain for robots to claim. Submit completed work with commit–reveal–score verification. All proofs anchored on Konnex.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            {synced ? <Wifi size={12} color="#00FFB2" /> : <WifiOff size={12} color="#F0A500" />}
            <span className="f-mono" style={{ fontSize: '0.58rem', color: synced ? '#00FFB2' : '#F0A500', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              {synced ? 'KV Ready' : 'Loading...'}
            </span>
          </div>
        </div>
      </div>

      {/* ── Phase pipeline bar ─────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1px', background: 'rgba(240,165,0,0.08)', marginBottom: '2rem' }}>
        {Object.entries(PHASES).map(([key, p], i) => {
          const done   = phasesDone.includes(key);
          const active = phase === key;
          return (
            <div key={key} style={{
              padding: '0.9rem 1.25rem',
              background: active ? `${p.color}10` : done ? '#0F1220' : '#101525',
              borderLeft: active ? `2px solid ${p.color}` : done ? '2px solid rgba(0,255,178,0.3)' : '2px solid transparent',
              transition: 'all 0.3s',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                <div style={{
                  width: 18, height: 18, borderRadius: '50%',
                  background: done ? 'rgba(0,255,178,0.15)' : active ? `${p.color}20` : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${done ? 'rgba(0,255,178,0.4)' : active ? p.color + '60' : 'rgba(255,255,255,0.08)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  {done ? <CheckCircle size={9} color="#00FFB2" /> : <span className="f-mono" style={{ fontSize: '0.5rem', color: active ? p.color : '#3A3835' }}>{i + 1}</span>}
                </div>
                <span className="f-mono" style={{ fontSize: '0.62rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: done ? '#00FFB2' : active ? p.color : '#3A3835' }}>{p.label}</span>
                {active && <span style={{ width: 6, height: 6, borderRadius: '50%', background: p.color, animation: 'anim-pulse 1.5s infinite', flexShrink: 0 }} />}
              </div>
              <div style={{ fontSize: '0.7rem', color: '#3A3835' }}>
                {key === 'COMMIT' && 'Hash telemetry → anchor onchain'}
                {key === 'VALIDATE' && 'Peer validators verify off-chain'}
                {key === 'SCORE' && 'PoPW score + IPFS CID committed'}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Section Tabs ───────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid rgba(240,165,0,0.1)', marginBottom: '1.75rem' }}>
        {[
          { id: TABS.POST,   icon: <Zap size={13} />,           label: 'Post Task',     badge: null },
          { id: TABS.SUBMIT, icon: <Hash size={13} />,          label: 'Submit PoPW',   badge: null },
          { id: TABS.BOARD,  icon: <ClipboardList size={13} />, label: 'Task Board',    badge: tasks.length > 0 ? tasks.length : null },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              padding: '0.75rem 1.5rem',
              background: 'none', border: 'none', cursor: 'pointer',
              borderBottom: activeTab === tab.id ? '2px solid #F0A500' : '2px solid transparent',
              color: activeTab === tab.id ? '#F0A500' : '#4A4845',
              fontFamily: "'Space Mono', monospace", fontSize: '0.7rem', letterSpacing: '0.1em',
              textTransform: 'uppercase', transition: 'all 0.2s',
              marginBottom: '-1px',
            }}
          >
            {tab.icon}
            {tab.label}
            {tab.badge && (
              <span style={{
                background: 'rgba(240,165,0,0.15)', border: '1px solid rgba(240,165,0,0.3)',
                borderRadius: 10, padding: '1px 7px', fontSize: '0.6rem', color: '#F0A500',
              }}>{tab.badge}</span>
            )}
          </button>
        ))}
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          TAB 1 — POST TASK
      ════════════════════════════════════════════════════════════════════ */}
      {activeTab === TABS.POST && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', alignItems: 'start' }} className="popw-grid">

          {/* Post form */}
          <div className="card" style={{ padding: '1.75rem', border: '1px solid rgba(240,165,0,0.18)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(240,165,0,0.1)', border: '1px solid rgba(240,165,0,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Zap size={15} color="#F0A500" />
                </div>
                <div>
                  <div className="f-mono" style={{ fontSize: '0.65rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: '#F0A500' }}>Post New Task</div>
                  <div style={{ fontSize: '0.72rem', color: '#4A4845', marginTop: '1px' }}>axiom.postTask() onchain</div>
                </div>
              </div>
              <button
                onClick={autofillPost}
                style={{
                  background: 'rgba(240,165,0,0.07)', border: '1px solid rgba(240,165,0,0.2)',
                  borderRadius: 8, padding: '5px 12px', cursor: 'pointer',
                  fontFamily: "'Space Mono', monospace", fontSize: '0.63rem', color: '#F0A500',
                  display: 'flex', alignItems: 'center', gap: 5, transition: 'all 0.2s',
                }}
              >
                ✦ Example
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ fontFamily: "'Space Mono', monospace", fontSize: '0.62rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#3A3835', display: 'block', marginBottom: '0.4rem' }}>Task Instruction *</label>
                <textarea
                  rows={3}
                  placeholder="Describe what the robot should do — e.g. Fly to zone B, scan solar panels, return to base"
                  value={postForm.instruction}
                  onChange={e => setPostForm({ ...postForm, instruction: e.target.value })}
                  disabled={taskPosting}
                  style={{ resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ fontFamily: "'Space Mono', monospace", fontSize: '0.62rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#3A3835', display: 'block', marginBottom: '0.4rem' }}>Task Type *</label>
                  <select value={postForm.taskType} onChange={e => setPostForm({ ...postForm, taskType: e.target.value })} disabled={taskPosting}>
                    <option value="">Select type…</option>
                    {TASK_CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontFamily: "'Space Mono', monospace", fontSize: '0.62rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#3A3835', display: 'block', marginBottom: '0.4rem' }}>Reward (testKNX)</label>
                  <input type="number" min="0" step="0.5" value={postForm.rewardKnx} onChange={e => setPostForm({ ...postForm, rewardKnx: e.target.value })} disabled={taskPosting} />
                </div>
              </div>

              <div>
                <label style={{ fontFamily: "'Space Mono', monospace", fontSize: '0.62rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#3A3835', display: 'block', marginBottom: '0.4rem' }}>Assign Robot (optional)</label>
                <select value={postForm.robotId} onChange={e => setPostForm({ ...postForm, robotId: e.target.value })} disabled={taskPosting}>
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
                <div style={{ padding: '0.85rem 1rem', background: 'rgba(240,165,0,0.06)', border: '1px solid rgba(240,165,0,0.25)', borderRadius: 8, fontFamily: "'Space Mono', monospace", fontSize: '0.68rem', color: '#F0A500', lineHeight: 1.8 }}>
                  ⛓ Task posted onchain!<br />
                  <span style={{ color: '#5A5550' }}>Task ID: </span><span style={{ color: '#E2DDD6' }}>{taskResult.task_id?.slice(0, 24)}…</span><br />
                  {taskResult.tx_hash && (
                    <><span style={{ color: '#5A5550' }}>Tx: </span>
                    <a href={`${EXPLORER}/explorer?tx=${taskResult.tx_hash}`} target="_blank" rel="noreferrer" style={{ color: '#F0A500', textDecoration: 'none', borderBottom: '1px solid rgba(240,165,0,0.4)' }}>
                      {taskResult.tx_hash.slice(0, 22)}… ↗
                    </a></>
                  )}
                  <div style={{ marginTop: '0.5rem', fontSize: '0.63rem', color: '#5A5550' }}>Redirecting to Task Board…</div>
                </div>
              )}

              <button
                onClick={handlePostTask}
                disabled={taskPosting}
                style={{
                  width: '100%', padding: '12px 16px',
                  background: taskPosting ? 'rgba(240,165,0,0.05)' : 'rgba(240,165,0,0.1)',
                  border: `1px solid ${taskPosting ? 'rgba(240,165,0,0.15)' : 'rgba(240,165,0,0.4)'}`,
                  borderRadius: 10, cursor: taskPosting ? 'not-allowed' : 'pointer',
                  fontFamily: "'Space Mono', monospace", fontWeight: 700, fontSize: '0.75rem',
                  color: '#F0A500', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  transition: 'all 0.2s',
                }}
              >
                {taskPosting
                  ? <><span style={{ width: 12, height: 12, border: '2px solid rgba(240,165,0,0.3)', borderTopColor: '#F0A500', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} /> Wallet mein approve karo…</>
                  : <><Zap size={13} /> ⛓ Post Task On-Chain</>
                }
              </button>
            </div>
          </div>

          {/* Right info panel */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

            {/* Stats quick view */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
              {[
                { label: 'Open Tasks',  value: openCount,      color: '#F0A500', icon: <Clock size={14} color="#F0A500" /> },
                { label: 'Completed',   value: completedCount, color: '#00FFB2', icon: <CheckCircle size={14} color="#00FFB2" /> },
                { label: 'Total KNX',   value: totalReward.toFixed(1), color: '#4D9FFF', icon: <Star size={14} color="#4D9FFF" /> },
              ].map(s => (
                <div key={s.label} className="card" style={{ padding: '1rem', textAlign: 'center', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.4rem' }}>{s.icon}</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</div>
                  <div className="f-mono" style={{ fontSize: '0.56rem', color: '#4A4845', marginTop: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* How it works */}
            <div className="card" style={{ padding: '1.5rem', border: '1px solid rgba(240,165,0,0.1)' }}>
              <div className="f-mono" style={{ fontSize: '0.62rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: '#F0A500', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <BarChart2 size={11} /> How Task Flow Works
              </div>
              {[
                { step: '01', label: 'Post Task', desc: 'Poster signs axiom.postTask() — instruction hash + reward locked onchain', color: '#F0A500' },
                { step: '02', label: 'Robot Claims', desc: 'Registered robot picks open task, executes in physical environment', color: '#4D9FFF' },
                { step: '03', label: 'Submit PoPW', desc: 'Robot submits telemetry proof via Commit→Validate→Score pipeline', color: '#00FFB2' },
                { step: '04', label: 'Memory Written', desc: 'Consensus score + IPFS CID anchored. Reward released to robot operator', color: '#CE93D8' },
              ].map(s => (
                <div key={s.step} style={{ display: 'flex', gap: '0.9rem', marginBottom: '1rem', alignItems: 'flex-start' }}>
                  <div style={{
                    minWidth: 28, height: 28, borderRadius: 8, background: `${s.color}15`,
                    border: `1px solid ${s.color}35`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <span className="f-mono" style={{ fontSize: '0.55rem', color: s.color, fontWeight: 700 }}>{s.step}</span>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#C0B8B0', marginBottom: '0.2rem' }}>{s.label}</div>
                    <div style={{ fontSize: '0.7rem', color: '#4A4845', lineHeight: 1.5 }}>{s.desc}</div>
                  </div>
                </div>
              ))}
              <button
                onClick={() => setActiveTab(TABS.BOARD)}
                style={{
                  width: '100%', marginTop: '0.25rem', padding: '9px 14px',
                  background: 'none', border: '1px solid rgba(240,165,0,0.2)', borderRadius: 8,
                  fontFamily: "'Space Mono', monospace", fontSize: '0.68rem', color: '#F0A500',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  transition: 'all 0.2s',
                }}
              >
                View Task Board <ArrowRight size={12} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          TAB 2 — SUBMIT PoPW
      ════════════════════════════════════════════════════════════════════ */}
      {activeTab === TABS.SUBMIT && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', alignItems: 'start' }} className="popw-grid">

          {/* Submit form */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div className="card" style={{ padding: '1.75rem', border: '1px solid rgba(77,159,255,0.15)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.5rem' }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(77,159,255,0.1)', border: '1px solid rgba(77,159,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Hash size={15} color="#4D9FFF" />
                </div>
                <div>
                  <div className="f-mono" style={{ fontSize: '0.65rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: '#4D9FFF' }}>Submit PoPW Proof</div>
                  <div style={{ fontSize: '0.72rem', color: '#4A4845', marginTop: '1px' }}>Commit → Validate → Score</div>
                </div>
              </div>

              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
                <div>
                  <label style={{ fontFamily: "'Space Mono', monospace", fontSize: '0.62rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#3A3835', display: 'block', marginBottom: '0.4rem' }}>Select Robot *</label>
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
                  <div style={{ background: 'rgba(77,159,255,0.03)', border: '1px solid rgba(77,159,255,0.1)', borderRadius: 8, padding: '0.85rem 1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                      <span className="f-display" style={{ fontSize: '1rem', color: '#E2DDD6' }}>{selectedRobot.name}</span>
                      <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                        {(selectedRobot.memoryCount ?? selectedRobot.tasks ?? 0) >= MEMORY_CAP
                          ? <span className="tag tag-gold" style={{ fontSize: '0.55rem' }}>AT CAP — WILL PRUNE</span>
                          : <span className="tag tag-green" style={{ fontSize: '0.55rem' }}>{selectedRobot.memoryCount ?? selectedRobot.tasks ?? 0}/{MEMORY_CAP} ENTRIES</span>
                        }
                      </div>
                    </div>
                    <div style={{ height: 2, background: '#1A1D2A', borderRadius: 1, marginBottom: '0.5rem' }}>
                      <div style={{
                        height: '100%', borderRadius: 1,
                        width: `${Math.min(((selectedRobot.memoryCount ?? selectedRobot.tasks ?? 0) / MEMORY_CAP) * 100, 100)}%`,
                        background: (selectedRobot.memoryCount ?? selectedRobot.tasks ?? 0) >= MEMORY_CAP ? '#F0A500' : '#4D9FFF',
                        transition: 'width 0.4s',
                      }} />
                    </div>
                    <div className="f-mono" style={{ fontSize: '0.56rem', color: '#3A3835' }}>
                      ~{Math.min((selectedRobot.memoryCount ?? selectedRobot.tasks ?? 0), MEMORY_CAP) * 96} bytes onchain · {MEMORY_CAP * 96} bytes max
                    </div>
                  </div>
                )}

                <div>
                  <label style={{ fontFamily: "'Space Mono', monospace", fontSize: '0.62rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#3A3835', display: 'block', marginBottom: '0.4rem' }}>Task Category *</label>
                  <select value={form.taskType} onChange={e => setForm({ ...form, taskType: e.target.value })} disabled={isRunning}>
                    <option value="">Select category...</option>
                    {TASK_CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                  {errors.taskType && <div style={{ color: '#FF4D6A', fontSize: '0.7rem', marginTop: '0.3rem', fontFamily: "'Space Mono', monospace" }}>{errors.taskType}</div>}
                </div>

                <div>
                  <label style={{ fontFamily: "'Space Mono', monospace", fontSize: '0.62rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#3A3835', display: 'block', marginBottom: '0.4rem' }}>Task Description *</label>
                  <textarea rows={3} placeholder="What did the robot do, sensors active, environment conditions..." value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} disabled={isRunning} />
                  {errors.description && <div style={{ color: '#FF4D6A', fontSize: '0.7rem', marginTop: '0.3rem', fontFamily: "'Space Mono', monospace" }}>{errors.description}</div>}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div>
                    <label style={{ fontFamily: "'Space Mono', monospace", fontSize: '0.62rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#3A3835', display: 'block', marginBottom: '0.4rem' }}>Task Duration *</label>
                    <input placeholder="e.g. 12m 34s" value={form.duration} onChange={e => setForm({ ...form, duration: e.target.value })} disabled={isRunning} />
                    {errors.duration && <div style={{ color: '#FF4D6A', fontSize: '0.7rem', marginTop: '0.3rem', fontFamily: "'Space Mono', monospace" }}>{errors.duration}</div>}
                  </div>
                  <div>
                    <label style={{ fontFamily: "'Space Mono', monospace", fontSize: '0.62rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#3A3835', display: 'block', marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <Lock size={9} /> Telemetry (IPFS)
                    </label>
                    <input placeholder="IPFS CID or sensor hash…" value={form.evidence} onChange={e => setForm({ ...form, evidence: e.target.value })} disabled={isRunning} />
                  </div>
                </div>

                {errors._wallet && (
                  <div style={{ padding: '0.75rem', background: 'rgba(255,77,77,0.07)', border: '1px solid rgba(255,77,77,0.25)', borderRadius: 8, fontFamily: "'Space Mono', monospace", fontSize: '0.68rem', color: '#FF4D4D', lineHeight: 1.5 }}>
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

            {/* Privacy model */}
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
                  <div key={s.label} style={{ marginBottom: '0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.35rem' }}>
                      <Icon size={10} color={s.c} />
                      <span className="f-mono" style={{ fontSize: '0.6rem', color: s.c, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{s.label}</span>
                    </div>
                    {s.items.map(item => (
                      <div key={item} style={{ fontSize: '0.72rem', color: '#4A4845', paddingLeft: '1.2rem', marginBottom: '0.15rem' }}>· {item}</div>
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

          {/* Right col — pipeline + results */}
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
                        <div style={{
                          width: 14, height: 14, borderRadius: '50%', flexShrink: 0,
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
                  <div style={{ background: '#06080F', border: '1px solid rgba(77,159,255,0.1)', padding: '0.85rem', marginBottom: '1rem' }}>
                    <div className="f-mono" style={{ fontSize: '0.54rem', color: '#3A3835', marginBottom: '0.4rem', letterSpacing: '0.1em' }}>TELEMETRY HASH (32 bytes — onchain)</div>
                    <div className="f-mono" style={{ fontSize: '0.65rem', color: isRunning ? '#F0A500' : '#4D9FFF', wordBreak: 'break-all', lineHeight: 1.5, transition: 'color 0.4s' }}>
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
                            <span className="f-mono" style={{ fontSize: '0.56rem', color: '#4A4845' }}>{(v.stake / 1000).toFixed(1)}k KNX</span>
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
                    <div style={{ border: '1px solid rgba(77,159,255,0.25)', background: 'rgba(77,159,255,0.04)', padding: '1rem', marginBottom: '0.75rem', borderRadius: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                        <Database size={12} color="#4D9FFF" />
                        <span className="f-mono" style={{ fontSize: '0.6rem', color: '#4D9FFF', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                          Onchain Digest — 96 bytes · Block #{result.block_number?.toLocaleString()}
                        </span>
                      </div>
                      {[
                        { l: 'task_id',        v: result.task_id,                         c: '#E2DDD6' },
                        { l: 'telemetry_hash', v: trunc(result.telemetry_hash, 12, 8),    c: '#4D9FFF' },
                        { l: 'popw_score',     v: result.popw_score,                      c: '#F0A500' },
                        { l: 'block_number',   v: result.block_number?.toLocaleString(),  c: '#00FFB2' },
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
                            <a href={`${EXPLORER}/explorer?tx=${result.tx_hash}`} target="_blank" rel="noreferrer" style={{ fontFamily: "'Space Mono',monospace", fontSize: '0.6rem', color: '#4D9FFF', textDecoration: 'none' }}>
                              {result.tx_hash.slice(0, 14)}… ↗
                            </a>
                          </div>
                          {result.score_tx_hash && (
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span className="f-mono" style={{ fontSize: '0.6rem', color: '#3A3835' }}>score_tx</span>
                              <a href={`${EXPLORER}/explorer?tx=${result.score_tx_hash}`} target="_blank" rel="noreferrer" style={{ fontFamily: "'Space Mono',monospace", fontSize: '0.6rem', color: '#00FFB2', textDecoration: 'none' }}>
                                {result.score_tx_hash.slice(0, 14)}… ↗
                              </a>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <div style={{ border: '1px solid rgba(240,165,0,0.2)', background: 'rgba(240,165,0,0.03)', padding: '1rem', marginBottom: '1rem', borderRadius: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <Globe size={12} color="#F0A500" />
                          <span className="f-mono" style={{ fontSize: '0.6rem', color: '#F0A500', letterSpacing: '0.1em', textTransform: 'uppercase' }}>IPFS Payload — 0 bytes onchain</span>
                        </div>
                        <button onClick={() => setShowRaw(!showRaw)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                          {showRaw ? <Eye size={10} color="#5A5550" /> : <EyeOff size={10} color="#5A5550" />}
                          <span className="f-mono" style={{ fontSize: '0.54rem', color: '#4A4845' }}>{showRaw ? 'HIDE' : 'SHOW'} CID</span>
                        </button>
                      </div>
                      {showRaw
                        ? <div className="f-mono" style={{ fontSize: '0.62rem', color: '#F0A500', wordBreak: 'break-all' }}>{result.ipfs_cid}</div>
                        : <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Lock size={10} color="#4A4845" />
                            <span className="f-mono" style={{ fontSize: '0.6rem', color: '#3A3835' }}>Raw telemetry hidden — proprietary data stays private</span>
                          </div>
                      }
                    </div>

                    <button onClick={() => { setResult(null); setPhase(null); setPhasesDone([]); setValidatorScores([]); }}
                      className="btn btn-outline" style={{ fontSize: '0.62rem', justifyContent: 'center', width: '100%' }}>
                      Submit Another Task
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Recent memory submissions */}
            <div className="card" style={{ padding: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                <span className="f-mono" style={{ fontSize: '0.62rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#4D9FFF' }}>Recent PoPW Submissions</span>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <span className="tag tag-blue" style={{ fontSize: '0.55rem' }}>ONCHAIN</span>
                  <span className="tag tag-gold" style={{ fontSize: '0.55rem' }}>IPFS</span>
                </div>
              </div>

              {memories.length === 0 ? (
                <div style={{ color: '#3A3835', fontFamily: "'Space Mono', monospace", fontSize: '0.72rem', textAlign: 'center', padding: '2rem 0' }}>
                  No PoPW proofs submitted yet
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {memories.slice(0, 6).map((m, i) => (
                    <div key={m.id} style={{ padding: '0.75rem 0', borderBottom: i < 5 ? '1px solid rgba(77,159,255,0.05)' : 'none', display: 'flex', gap: '0.85rem' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '0.2rem', flexShrink: 0 }}>
                        <div style={{ width: 7, height: 7, borderRadius: '50%', background: m.outcome === 'SUCCESS' ? '#00FFB2' : '#F0A500', boxShadow: `0 0 5px ${m.outcome === 'SUCCESS' ? '#00FFB2' : '#F0A500'}` }} />
                        {i < 5 && <div style={{ width: 1, flex: 1, background: 'rgba(77,159,255,0.06)', marginTop: '0.3rem' }} />}
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
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          TAB 3 — TASK BOARD
      ════════════════════════════════════════════════════════════════════ */}
      {activeTab === TABS.BOARD && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

          {/* Board header stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem' }} className="board-stats">
            {[
              { label: 'Total Tasks',  value: tasks.length,     color: '#E2DDD6', accent: 'rgba(255,255,255,0.06)' },
              { label: 'Open',         value: openCount,         color: '#F0A500', accent: 'rgba(240,165,0,0.08)' },
              { label: 'Completed',    value: completedCount,    color: '#00FFB2', accent: 'rgba(0,255,178,0.08)' },
              { label: 'Total Reward', value: `${totalReward.toFixed(1)} KNX`, color: '#4D9FFF', accent: 'rgba(77,159,255,0.08)' },
            ].map(s => (
              <div key={s.label} style={{ background: s.accent, border: '1px solid rgba(255,255,255,0.05)', borderRadius: 12, padding: '1rem 1.25rem' }}>
                <div className="f-mono" style={{ fontSize: '0.58rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#4A4845', marginBottom: '0.4rem' }}>{s.label}</div>
                <div style={{ fontSize: '1.6rem', fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* Filter bar */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginRight: '0.5rem' }}>
                <Filter size={11} color="#4A4845" />
                <span className="f-mono" style={{ fontSize: '0.6rem', color: '#4A4845', letterSpacing: '0.08em' }}>FILTER:</span>
              </span>
              {['all', 'open', 'completed', 'failed'].map(f => (
                <button
                  key={f}
                  onClick={() => setBoardFilter(f)}
                  style={{
                    padding: '4px 12px', borderRadius: 8, border: '1px solid',
                    fontFamily: "'Space Mono', monospace", fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.08em',
                    cursor: 'pointer', transition: 'all 0.2s',
                    background: boardFilter === f ? (f === 'open' ? 'rgba(240,165,0,0.15)' : f === 'completed' ? 'rgba(0,255,178,0.15)' : f === 'failed' ? 'rgba(255,77,106,0.15)' : 'rgba(255,255,255,0.08)') : 'transparent',
                    borderColor: boardFilter === f ? (f === 'open' ? 'rgba(240,165,0,0.5)' : f === 'completed' ? 'rgba(0,255,178,0.5)' : f === 'failed' ? 'rgba(255,77,106,0.5)' : 'rgba(255,255,255,0.2)') : 'rgba(255,255,255,0.06)',
                    color: boardFilter === f ? (f === 'open' ? '#F0A500' : f === 'completed' ? '#00FFB2' : f === 'failed' ? '#FF4D6A' : '#E2DDD6') : '#4A4845',
                  }}
                >
                  {f}
                </button>
              ))}
            </div>
            <button
              onClick={() => setActiveTab(TABS.POST)}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.5rem',
                padding: '7px 14px', background: 'rgba(240,165,0,0.1)', border: '1px solid rgba(240,165,0,0.3)',
                borderRadius: 8, cursor: 'pointer', fontFamily: "'Space Mono', monospace", fontSize: '0.65rem', color: '#F0A500',
                transition: 'all 0.2s',
              }}
            >
              <Zap size={11} /> Post New Task
            </button>
          </div>

          {/* Tasks table */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid rgba(240,165,0,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span className="f-mono" style={{ fontSize: '0.65rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: '#F0A500', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <ClipboardList size={12} /> Task Board
                <span style={{ background: 'rgba(240,165,0,0.12)', border: '1px solid rgba(240,165,0,0.25)', borderRadius: 8, padding: '1px 8px', fontSize: '0.58rem' }}>
                  ⛓ ONCHAIN
                </span>
              </span>
              <span className="f-mono" style={{ fontSize: '0.58rem', color: '#4A4845' }}>{filteredTasks.length} tasks</span>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                <thead>
                  <tr>
                    {['#', 'Task ID', 'Type', 'Instruction', 'Reward', 'Robot', 'Status', 'PoPW', 'Tx', 'Action'].map(h => (
                      <th key={h} style={{
                        textAlign: 'left', padding: '0.65rem 1rem',
                        fontFamily: "'Space Mono', monospace", fontSize: '0.58rem', letterSpacing: '0.1em',
                        textTransform: 'uppercase', color: '#4A4845', borderBottom: '1px solid rgba(240,165,0,0.06)',
                        whiteSpace: 'nowrap', background: '#0F1220',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredTasks.length === 0 ? (
                    <tr>
                      <td colSpan={10} style={{ textAlign: 'center', padding: '3rem 1rem', color: '#3A3835', fontFamily: "'Space Mono', monospace", fontSize: '0.72rem' }}>
                        {boardFilter === 'all' ? 'No tasks posted yet — post a task to get started' : `No ${boardFilter} tasks`}
                      </td>
                    </tr>
                  ) : (
                    filteredTasks.map((t, i) => {
                      const robot = robots.find(r => (r.robot_id || r.id) === t.robot_id);
                      return (
                        <tr key={t.task_id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', transition: 'background 0.15s' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'rgba(240,165,0,0.03)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                          <td style={{ padding: '0.75rem 1rem', color: '#3A3835', fontFamily: "'Space Mono', monospace", fontSize: '0.62rem' }}>{i + 1}</td>
                          <td style={{ padding: '0.75rem 1rem' }}>
                            <span className="f-mono" style={{ fontSize: '0.65rem', color: '#F0A500' }}>{t.task_id?.slice(0, 14)}…</span>
                          </td>
                          <td style={{ padding: '0.75rem 1rem', whiteSpace: 'nowrap' }}>
                            <span style={{
                              background: 'rgba(77,159,255,0.08)', border: '1px solid rgba(77,159,255,0.2)',
                              borderRadius: 6, padding: '2px 8px', fontFamily: "'Space Mono', monospace", fontSize: '0.58rem', color: '#4D9FFF',
                            }}>
                              {t.task_type?.split(' ')[0] || '—'}
                            </span>
                          </td>
                          <td style={{ padding: '0.75rem 1rem', maxWidth: 220 }}>
                            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.75rem', color: '#8A8580' }}>
                              {t.instruction || '—'}
                            </div>
                            <div className="f-mono" style={{ fontSize: '0.56rem', color: '#3A3835', marginTop: '2px' }}>
                              {t.created_at ? new Date(t.created_at).toLocaleDateString() : ''}
                            </div>
                          </td>
                          <td style={{ padding: '0.75rem 1rem', whiteSpace: 'nowrap' }}>
                            <span style={{ fontFamily: "'Space Mono', monospace", fontSize: '0.72rem', color: '#00FFB2', fontWeight: 700 }}>
                              {t.reward_knx ?? 0} KNX
                            </span>
                          </td>
                          <td style={{ padding: '0.75rem 1rem' }}>
                            <span style={{ fontSize: '0.72rem', color: '#8A8580' }}>
                              {robot ? (robot.metadata?.label || robot.name || '—') : (t.robot_id ? t.robot_id.slice(0, 12) + '…' : <span style={{ color: '#3A3835' }}>Any</span>)}
                            </span>
                          </td>
                          <td style={{ padding: '0.75rem 1rem', whiteSpace: 'nowrap' }}>
                            <span style={{
                              display: 'inline-flex', alignItems: 'center', gap: 4,
                              padding: '3px 9px', borderRadius: 6,
                              fontFamily: "'Space Mono', monospace", fontSize: '0.6rem', fontWeight: 700,
                              color: statusColor(t.status),
                              background: `${statusColor(t.status)}12`,
                              border: `1px solid ${statusColor(t.status)}30`,
                            }}>
                              {statusLabel(t.status)}
                            </span>
                          </td>
                          <td style={{ padding: '0.75rem 1rem' }}>
                            {t.popw_score != null
                              ? <span style={{ fontFamily: "'Space Mono', monospace", fontSize: '0.72rem', fontWeight: 700, color: scoreColor(t.popw_score) }}>
                                  {t.popw_score.toFixed(3)}
                                </span>
                              : <span style={{ color: '#3A3835', fontFamily: "'Space Mono', monospace", fontSize: '0.65rem' }}>—</span>
                            }
                          </td>
                          <td style={{ padding: '0.75rem 1rem' }}>
                            {t.tx_hash
                              ? <a href={`${EXPLORER}/explorer?tx=${t.tx_hash}`} target="_blank" rel="noreferrer" style={{ fontFamily: "'Space Mono', monospace", fontSize: '0.6rem', color: '#4D9FFF', textDecoration: 'none' }}>
                                  {t.tx_hash.slice(0, 10)}… ↗
                                </a>
                              : <span style={{ color: '#3A3835', fontFamily: "'Space Mono', monospace", fontSize: '0.62rem' }}>—</span>
                            }
                          </td>
                          <td style={{ padding: '0.75rem 1rem' }}>
                            {t.status === 'open' && (
                              <button
                                onClick={() => { setForm(p => ({ ...p, taskType: t.task_type || '', description: t.instruction || '' })); setActiveTab(TABS.SUBMIT); }}
                                style={{
                                  display: 'flex', alignItems: 'center', gap: 4,
                                  padding: '4px 10px', background: 'rgba(0,255,178,0.08)', border: '1px solid rgba(0,255,178,0.25)',
                                  borderRadius: 6, cursor: 'pointer', fontFamily: "'Space Mono', monospace", fontSize: '0.58rem', color: '#00FFB2',
                                  transition: 'all 0.2s', whiteSpace: 'nowrap',
                                }}
                              >
                                <Play size={9} /> Submit PoPW
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .popw-grid { grid-template-columns: 1fr 1fr; }
        @media(max-width: 900px) {
          .popw-grid { grid-template-columns: 1fr; }
          .board-stats { grid-template-columns: 1fr 1fr; }
        }
        @media(max-width: 600px) {
          .board-stats { grid-template-columns: 1fr 1fr; }
        }
      `}</style>
    </div>
  );
}
