'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Play, Square, Cpu, Brain, CheckCircle, XCircle,
  Zap, Activity, BarChart2, ChevronRight, Database, RefreshCw,
} from 'lucide-react';
import {
  CHAIN, WALLET, DB,
  loadDB, attachRealtimeListeners, initChain,
  registerRobotOnchain, submitPoPWOnchain,
  sendExtrinsic,
  chainHash, now,
  on, off,
} from '@/lib/chain';

// ── Constants ─────────────────────────────────────────────────────────────────

const C = {
  bg:     '#0A0A0A',
  surface:'#111111',
  card:   '#141414',
  card2:  '#1A1A1A',
  border: '#222222',
  border2:'#2A2A2A',
  gold:   '#F0A500',
  gold2:  '#B07800',
  green:  '#00E676',
  red:    '#FF5252',
  blue:   '#4D9FFF',
  purple: '#CE93D8',
  orange: '#FF9800',
  muted:  '#555555',
  muted2: '#888888',
  text:   '#E2DDD6',
};

const W_SCORES = { safety: 0.40, match: 0.35, efficiency: 0.25 };
const DECAY    = 0.95;

const ROBOT_CFGS = [
  { hw: { model: 'DJI-Mavic-3',    type: 'drone'     }, label: 'Drone Alpha',    type: 'Drone'              },
  { hw: { model: 'UR5e',           type: 'arm'       }, label: 'RoboArm Beta',   type: 'Fixed Arm (Roboarm)'},
  { hw: { model: 'Boston-Spot',    type: 'quadruped' }, label: 'Spot Gamma',     type: 'Mobile Manipulator' },
  { hw: { model: 'Figure-01',      type: 'humanoid'  }, label: 'Humanoid Delta', type: 'Humanoid'           },
  { hw: { model: 'DJI-M300',       type: 'drone'     }, label: 'Drone Epsilon',  type: 'Drone'              },
];

const TASK_DEFS = [
  ['Drone Navigation & Swarm Coordination',     'Fly to roof zone B, photograph solar panels for damage assessment', 12],
  ['Robotic Manipulation (Roboarm)',            'Pick red cylinder from bin A, place precisely in bin B',            8 ],
  ['SLAM / Spatial Perception',                'Generate full 3D map of warehouse sector C with all shelving',       15],
  ['Robot Identity & Memory',                  'Inspect pipeline joints 47-52, record PoPW telemetry to memory',    10],
  ['Robot Fleet Orchestration',                'Coordinate 3-drone perimeter sweep, return in formation',           18],
];

const STRATS = {
  'Drone Navigation & Swarm Coordination':      ['waypoint_optimal','obstacle_avoidance','speed_optimised','energy_efficient'],
  'Robotic Manipulation (Roboarm)':             ['precision_grasp','force_controlled','vision_guided','adaptive_grip'],
  'SLAM / Spatial Perception':                  ['loop_closure','feature_dense','lidar_primary','visual_inertial'],
  'Robot Identity & Memory':                    ['structured_grid','anomaly_focused','thermal_priority','full_coverage'],
  'Robot Fleet Orchestration':                  ['centralised','distributed','role_specialised','dynamic_rebalance'],
};

const TIERS = [
  [0.85, 'Elite',   '👑', C.gold  ],
  [0.70, 'Proven',  '⭐', C.green ],
  [0.50, 'Active',  '🔵', C.blue  ],
  [0.25, 'Novice',  '🟣', C.purple],
  [0.00, 'Unrated', '⚪', C.muted2],
];

// ── Utils ─────────────────────────────────────────────────────────────────────

const rand   = (a, b) => Math.random() * (b - a) + a;
const pick   = arr => arr[Math.floor(Math.random() * arr.length)];
const sleep  = ms => new Promise(r => setTimeout(r, ms));
const sc     = v => v >= 0.8 ? C.green : v >= 0.5 ? C.gold : C.red;
const fmtS   = v => (typeof v === 'number' ? v.toFixed(3) : '—');
const shortId = id => id ? id.slice(0, 14) + '…' : '—';

function tierInfo(score) {
  for (const [t, l, ic, cl] of TIERS) if (score >= t) return { label: l, icon: ic, color: cl };
  return { label: 'Unrated', icon: '⚪', color: C.muted2 };
}

function simulateTelemetry(taskType, round2 = false) {
  const n = round2 ? 0.03 : 0.10;
  return {
    completion_confirmed:        Math.random() > n * 2,
    completion_pct:              +rand(round2 ? 80 : 55, 100).toFixed(1),
    collision_detected:          Math.random() < n,
    emergency_stop_triggered:    Math.random() < n * 0.4,
    boundary_violated:           Math.random() < n * 0.5,
    max_velocity_observed:       +rand(0.2, round2 ? 1.1 : 1.7).toFixed(2),
    elapsed_s:                   +rand(10, round2 ? 160 : 230).toFixed(1),
    timeout_s:                   240,
    retry_count:                 Math.floor(rand(0, round2 ? 1.5 : 3)),
    energy_efficient:            Math.random() > (round2 ? 0.25 : 0.5),
    map_generated:               Math.random() > (round2 ? 0.05 : 0.12),
    object_grasped:              Math.random() > (round2 ? 0.05 : 0.14),
    coverage_pct:                +rand(round2 ? 85 : 65, 100).toFixed(1),
  };
}

function scorePoPW(tele, taskType) {
  let safety = 1;
  if (tele.collision_detected)          safety -= 0.50;
  if (tele.emergency_stop_triggered)    safety -= 0.30;
  if (tele.boundary_violated)           safety -= 0.20;
  const vLim = { 'Drone Navigation & Swarm Coordination': 1.5, 'Robotic Manipulation (Roboarm)': 0.5, 'Robot Fleet Orchestration': 2 }[taskType] || 1;
  if (tele.max_velocity_observed > vLim) safety -= Math.min(0.2, (tele.max_velocity_observed - vLim) / vLim * 0.2);
  safety = Math.max(0, safety);

  let match = tele.completion_confirmed ? 1 : (tele.completion_pct || 50) / 100;
  if (taskType === 'SLAM / Spatial Perception'       && !tele.map_generated)  match *= 0.6;
  if (taskType === 'Robotic Manipulation (Roboarm)'  && !tele.object_grasped) match *= 0.7;
  if (taskType === 'Robot Identity & Memory'         && (tele.coverage_pct || 100) < 80) match *= 0.8;
  match = Math.min(1, Math.max(0, match));

  let eff = 1;
  if (tele.elapsed_s && tele.timeout_s) {
    const r = tele.elapsed_s / tele.timeout_s;
    if (r > 1) eff -= Math.min(0.4, (r - 1) * 0.4);
    else if (r > 0.8) eff -= 0.10;
  }
  eff -= Math.min(0.3, (tele.retry_count || 0) * 0.10);
  if (tele.energy_efficient) eff = Math.min(1, eff + 0.05);
  eff = Math.max(0, eff);

  const popw = +(safety * W_SCORES.safety + match * W_SCORES.match + eff * W_SCORES.efficiency).toFixed(4);
  return { popw, safety: +safety.toFixed(4), match: +match.toFixed(4), eff: +eff.toFixed(4) };
}

function generatePolicy(taskType, robotId) {
  const strats = STRATS[taskType] || ['default'];
  const history = DB.memory.filter(m => m.robot_id === robotId && m.task_type === taskType);
  let strategy = pick(strats), memEnhanced = false, memUsed = 0;

  if (history.length > 0) {
    const ss = {};
    for (const e of history) {
      const s = (e.telemetry || {}).strategy || '?';
      ss[s] = (ss[s] || []).concat(e.popw_score);
    }
    let best = '', ba = 0;
    for (const [s, sc] of Object.entries(ss)) {
      const a = sc.reduce((x, y) => x + y, 0) / sc.length;
      if (a > ba) { ba = a; best = s; }
    }
    if (best) strategy = best;
    memEnhanced = true; memUsed = history.length;
  }

  return { strategy, memory_enhanced: memEnhanced, memory_entries_used: memUsed };
}

// ── Step components ───────────────────────────────────────────────────────────

const STEPS_DEF = [
  { id: 1, label: 'Register robots → axiom.registerRobot()' },
  { id: 2, label: 'Post tasks → axiom.postTask()' },
  { id: 3, label: 'Miners query memory → chain.getMemory()' },
  { id: 4, label: 'Execute tasks → PoPW telemetry capture' },
  { id: 5, label: 'Score PoPW → axiom.submitPoPW()' },
  { id: 6, label: 'Write memory → axiom.writeMemory()' },
  { id: 7, label: 'Update reputation → updateReputation()' },
  { id: 8, label: 'Round 2: memory-enhanced policies' },
];

function StepIndicator({ steps, currentStep, doneSteps, errorStep }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {steps.map(s => {
        const done  = doneSteps.includes(s.id);
        const active = currentStep === s.id;
        const error  = errorStep === s.id;
        return (
          <div key={s.id} style={{
            display: 'flex', alignItems: 'flex-start', gap: 10,
            padding: '7px 10px', borderRadius: 8,
            background: active ? '#4D9FFF0D' : done ? '#00E67608' : error ? '#FF525208' : C.card2,
            border: `1px solid ${active ? '#4D9FFF40' : done ? '#00E67630' : error ? '#FF525230' : C.border}`,
            transition: 'all 0.25s',
          }}>
            <div style={{
              minWidth: 22, height: 22, borderRadius: '50%', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.65rem', fontWeight: 700,
              background: done ? C.green : active ? C.blue : error ? C.red : C.border2,
              color: done || active || error ? '#000' : C.muted2,
              fontFamily: 'monospace',
            }}>
              {done ? '✓' : error ? '✗' : s.id}
            </div>
            <span style={{
              fontFamily: 'monospace', fontSize: '0.7rem',
              color: active ? C.blue : done ? C.text : C.muted2,
              lineHeight: 1.5,
            }}>{s.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function LogLine({ line }) {
  const color = { ok: C.green, err: C.red, warn: C.gold, info: C.blue }[line.type] || C.muted2;
  return (
    <div style={{ fontFamily: 'monospace', fontSize: '0.69rem', color, padding: '1px 0', lineHeight: 1.6 }}>
      {line.text}
    </div>
  );
}

function ScoreBar({ value, color }) {
  return (
    <div style={{ height: 3, borderRadius: 2, background: C.border2, overflow: 'hidden', marginTop: 3, minWidth: 60 }}>
      <div style={{ height: '100%', borderRadius: 2, width: `${(value * 100).toFixed(0)}%`, background: color || sc(value), transition: 'width 0.5s' }} />
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function Simulator() {
  const [mounted, setMounted] = useState(false);
  const [running, setRunning] = useState(false);
  const [logs, setLogs]       = useState([{ type: 'info', text: 'Ready — click "Run Simulation" to start.' }]);
  const [currentStep, setCurrentStep] = useState(0);
  const [doneSteps,   setDoneSteps]   = useState([]);
  const [errorStep,   setErrorStep]   = useState(null);
  const [results,     setResults]     = useState(null);
  const [chainOk,     setChainOk]     = useState(false);
  const [walletOk,    setWalletOk]    = useState(false);

  // Config
  const [numRobots,      setNumRobots]      = useState(3);
  const [tasksPerRobot,  setTasksPerRobot]  = useState(3);
  const [rounds,         setRounds]         = useState(2);
  const [noiseLevel,     setNoiseLevel]     = useState('medium');

  const logRef = useRef(null);
  const abortRef = useRef(false);

  const addLog = useCallback((text, type = 'info') => {
    const ts = new Date().toTimeString().slice(0, 8);
    setLogs(prev => [...prev.slice(-200), { type, text: `[${ts}] ${text}` }]);
    setTimeout(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, 30);
  }, []);

  useEffect(() => {
    setMounted(true);
    const onChain  = ({ status }) => setChainOk(status === 'connected');
    const onWallet = ({ connected }) => setWalletOk(connected);
    on('chain:status',  onChain);
    on('wallet:connected', onWallet);
    on('wallet:disconnected', () => setWalletOk(false));

    (async () => {
      await loadDB();
      attachRealtimeListeners();
      const api = await initChain();
      setChainOk(!!api);
      setWalletOk(WALLET.connected && !!WALLET.signer && !WALLET.readOnly);
    })();

    return () => {
      off('chain:status',  onChain);
      off('wallet:connected', onWallet);
    };
  }, []);

  // ── Simulation engine ─────────────────────────────────────────────────────

  async function runSimulation() {
    if (!walletOk) {
      addLog('🚫 Wallet nahi mila — SubWallet / Talisman connect karo', 'err');
      return;
    }
    if (!chainOk) {
      addLog('🚫 Konnex Testnet offline — chain connect karo', 'err');
      return;
    }

    setRunning(true);
    setLogs([]);
    setResults(null);
    setDoneSteps([]);
    setCurrentStep(0);
    setErrorStep(null);
    abortRef.current = false;

    const noiseMap = { low: 0.03, medium: 0.08, high: 0.18 };
    const noise    = noiseMap[noiseLevel] || 0.08;
    const owner    = WALLET.address;

    addLog('━━━ AXIOM Memory Mesh Simulation ━━━', 'info');
    addLog(`Config: ${numRobots} robots × ${tasksPerRobot} tasks × ${rounds} rounds | noise=${noiseLevel}`, 'info');
    addLog(`Wallet: ${owner.slice(0, 14)}… (${WALLET.name}) ⛓ LIVE`, 'ok');
    await sleep(200);

    // ── STEP 1: Register robots ──────────────────────────────────────────────
    setCurrentStep(1);
    addLog('\n[1] Registering robots → axiom.registerRobot()…', 'info');
    const simRobots = [];

    for (let i = 0; i < numRobots; i++) {
      if (abortRef.current) break;
      const cfg = ROBOT_CFGS[i % ROBOT_CFGS.length];
      try {
        const robot = await registerRobotOnchain(
          owner,
          cfg.label + ' #' + i,
          cfg.type,
          { ...cfg.hw, serial: 'SIM' + Date.now() + i }
        );
        simRobots.push(robot);
        addLog(`  ✅ [⛓] ${cfg.label}: ${shortId(robot.robot_id)}`, 'ok');
      } catch (e) {
        addLog(`  ❌ registerRobot failed: ${e.message}`, 'err');
        setErrorStep(1);
        setRunning(false);
        return;
      }
      await sleep(60);
    }

    setDoneSteps(prev => [...prev, 1]);

    // Build tasks list
    const allTasks = [];
    for (const robot of simRobots) {
      for (let ti = 0; ti < tasksPerRobot; ti++) {
        const [ttype, instr, reward] = TASK_DEFS[ti % TASK_DEFS.length];
        allTasks.push({ robot, ttype, instr, reward });
      }
    }

    // ── STEP 2: Post tasks ────────────────────────────────────────────────────
    setCurrentStep(2);
    addLog('\n[2] Posting tasks → axiom.postTask()…', 'info');
    const postedTasks = [];

    for (const { robot, ttype, instr, reward } of allTasks) {
      if (abortRef.current) break;
      const taskId = chainHash(instr + robot.robot_id + Math.random());
      try {
        await sendExtrinsic(
          'axiom.postTask',
          { taskId: taskId.slice(0, 16), ttype, reward, robotId: robot.robot_id.slice(0, 16) },
          `postTask(${ttype.slice(0, 20)}, ${reward}KNX)`
        );
        postedTasks.push({ taskId, robot, ttype, instr, reward, status: 'open' });
        addLog(`  📋 [⛓] [${ttype.slice(0, 30).padEnd(30)}] ${reward}KNX`, 'info');
      } catch (e) {
        addLog(`  ❌ postTask failed: ${e.message}`, 'err');
        setErrorStep(2);
        setRunning(false);
        return;
      }
      await sleep(40);
    }

    setDoneSteps(prev => [...prev, 2]);

    // ── ROUNDS ────────────────────────────────────────────────────────────────
    const roundResults = [];
    let totalPoPW = 0, totalAccepted = 0, lastEntry = null;

    for (let round = 1; round <= rounds; round++) {
      if (abortRef.current) break;
      const isR2 = round > 1;
      addLog(`\n━━ Round ${round}/${rounds} — ${isR2 ? '📚 Memory-enhanced' : '🆕 First pass'} ━━`, 'info');

      // ── STEP 3: Memory query ───────────────────────────────────────────────
      setCurrentStep(3);
      addLog('\n[3] Miners querying memory → chain.getMemory()…', 'info');

      let tasksThisRound = postedTasks;
      if (isR2) {
        tasksThisRound = [];
        for (const robot of simRobots) {
          if (abortRef.current) break;
          const [ttype, instr, reward] = TASK_DEFS[Math.floor(rand(0, TASK_DEFS.length))];
          const taskId = chainHash(instr + robot.robot_id + round + Math.random());
          try {
            await sendExtrinsic(
              'axiom.postTask',
              { taskId: taskId.slice(0, 16), ttype, reward, robotId: robot.robot_id.slice(0, 16) },
              `postTask(r${round}, ${ttype.slice(0, 18)})`
            );
            tasksThisRound.push({ taskId, robot, ttype, instr: instr + ` [r${round}]`, reward, status: 'open' });
          } catch (e) {
            addLog(`  ❌ R${round} postTask: ${e.message}`, 'err');
            setErrorStep(2);
            setRunning(false);
            return;
          }
          await sleep(30);
        }
      }

      const roundPairs = [];
      for (const t of tasksThisRound) {
        const policy = generatePolicy(t.ttype, t.robot.robot_id);
        roundPairs.push({ ...t, policy });
        const mem = policy.memory_enhanced ? `📚 mem=${policy.memory_entries_used}` : '🆕 fresh';
        addLog(`  ⛏️  ${t.robot.metadata.label.slice(0, 14).padEnd(14)} [${t.ttype.slice(0, 24).padEnd(24)}] ${policy.strategy} · ${mem}`, 'ok');
        await sleep(20);
      }
      setDoneSteps(prev => [...prev, 3]);

      // ── STEP 4: Execute ────────────────────────────────────────────────────
      setCurrentStep(4);
      addLog('\n[4] Robots executing tasks — telemetry captured…', 'info');
      await sleep(120);
      setDoneSteps(prev => [...prev, 4]);

      // ── STEPS 5–7: PoPW + Memory + Reputation ─────────────────────────────
      const roundArtifacts = [];

      for (const { taskId, robot, ttype, instr, policy } of roundPairs) {
        if (abortRef.current) break;

        const tele   = { ...simulateTelemetry(ttype, isR2), strategy: policy.strategy };
        if (Math.random() < noise)       tele.collision_detected = true;
        if (Math.random() < noise * 0.4) tele.emergency_stop_triggered = true;
        const scores = scorePoPW(tele, ttype);
        const accepted = scores.popw >= 0.5;

        // STEP 5
        setCurrentStep(5);
        let entry;
        try {
          entry = await submitPoPWOnchain({
            robotId:     robot.robot_id,
            taskId,
            taskType:    ttype,
            instruction: instr,
            popwScore:   scores.popw,
            safetyScore: scores.safety,
            matchScore:  scores.match,
            effScore:    scores.eff,
            strategy:    policy.strategy,
            telemetry:   tele,
          });
        } catch (e) {
          addLog(`  ❌ submitPoPW: ${e.message}`, 'err');
          setErrorStep(5);
          setRunning(false);
          return;
        }

        setCurrentStep(6);
        setCurrentStep(7);

        totalPoPW++; if (accepted) totalAccepted++;
        roundArtifacts.push({ robot, ttype, scores, accepted, entry });
        lastEntry = entry;

        const icon = accepted ? '✅' : '❌';
        addLog(`  ${icon} [⛓] ${robot.metadata.label.slice(0, 14).padEnd(14)} [${ttype.slice(0, 20).padEnd(20)}] PoPW=${fmtS(scores.popw)}  S=${fmtS(scores.safety)} M=${fmtS(scores.match)} E=${fmtS(scores.eff)}`, 'ok');
        await sleep(35);
      }

      setDoneSteps(prev => [...prev, 5, 6, 7, 8]);

      const rAvg = roundArtifacts.length
        ? roundArtifacts.reduce((s, a) => s + a.scores.popw, 0) / roundArtifacts.length
        : 0;
      roundResults.push({ round, avg: rAvg, count: roundArtifacts.length, accepted: roundArtifacts.filter(a => a.accepted).length });
      addLog(`  → Round ${round} avg PoPW: ${rAvg.toFixed(4)} | accepted: ${roundArtifacts.filter(a => a.accepted).length}/${roundArtifacts.length}`, 'info');
    }

    // ── Final leaderboard ──────────────────────────────────────────────────
    addLog('\n━━ Final Reputation Leaderboard ━━', 'info');
    const lb = Object.entries(DB.reputation)
      .filter(([id]) => simRobots.find(r => r.robot_id === id))
      .sort(([, a], [, b]) => b.score - a.score);

    for (const [id, rep] of lb) {
      const r = DB.robots.find(x => x.robot_id === id);
      const { label, icon } = tierInfo(rep.score);
      const sr = rep.total_tasks ? ((rep.successful_tasks / rep.total_tasks) * 100).toFixed(0) + '%' : '—';
      addLog(`  ${icon} ${(r?.metadata?.label || '?').slice(0, 16).padEnd(16)} Score=${rep.score.toFixed(4)} Tier=${label.padEnd(7)} Tasks=${rep.total_tasks} Success=${sr}`, 'ok');
    }

    addLog('\n✅ Simulation complete! Check Dashboard & Leaderboard.', 'ok');

    const impr = roundResults.length > 1
      ? ((roundResults[roundResults.length - 1].avg - roundResults[0].avg) * 100).toFixed(1)
      : null;

    setResults({ simRobots, roundResults, totalPoPW, totalAccepted, impr, lastEntry, lb });
    setCurrentStep(0);
    setRunning(false);
  }

  if (!mounted) return null;

  // ── Render ────────────────────────────────────────────────────────────────

  const selStyle = {
    background: C.card2, border: `1px solid ${C.border2}`, borderRadius: 8,
    padding: '7px 10px', color: C.text, fontFamily: 'monospace', fontSize: '0.78rem',
    outline: 'none', width: '100%',
  };

  return (
    <div style={{ background: C.bg, minHeight: '100vh', paddingTop: 64, color: C.text, fontFamily: "'Inter', sans-serif" }}>
      <div style={{ maxWidth: 1300, margin: '0 auto', padding: '2rem 1.5rem' }}>

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div style={{ marginBottom: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '0.5rem' }}>
            <div style={{ height: 1, width: 32, background: C.gold }} />
            <span style={{ fontFamily: 'monospace', fontSize: '0.65rem', letterSpacing: 3, color: C.gold, textTransform: 'uppercase' }}>Memory Mesh</span>
          </div>
          <h1 style={{ fontSize: 'clamp(1.8rem, 4vw, 2.8rem)', fontWeight: 800, color: C.text, margin: '0 0 0.5rem' }}>
            Simulation <span style={{ color: C.gold }}>Engine</span>
          </h1>
          <p style={{ color: C.muted2, fontSize: '0.88rem', lineHeight: 1.6, maxWidth: 600 }}>
            Runs a full memory-mesh lifecycle onchain: register robots → post tasks → execute → PoPW submit → memory write → reputation update. Each step is a real Konnex extrinsic.
          </p>
        </div>

        {/* ── Status bar ─────────────────────────────────────────────────── */}
        <div style={{
          display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: '1.5rem',
          padding: '10px 14px', background: C.card, border: `1px solid ${C.border}`,
          borderRadius: 10, fontSize: '0.72rem', fontFamily: 'monospace',
        }}>
          <span style={{ color: chainOk ? C.green : C.red }}>{chainOk ? '⛓ Konnex: Connected' : '⛓ Konnex: Offline'}</span>
          <span style={{ color: C.border2 }}>|</span>
          <span style={{ color: walletOk ? C.green : C.gold }}>{walletOk ? `✅ Wallet: ${WALLET.name}` : '⚠️ Wallet: Not connected'}</span>
          {WALLET.address && <><span style={{ color: C.border2 }}>|</span><span style={{ color: C.muted2 }}>{WALLET.address.slice(0, 12)}…</span></>}
          <span style={{ color: C.border2 }}>|</span>
          <span style={{ color: C.muted2 }}>Firebase DB: {DB.robots.length} robots · {DB.memory.length} memories</span>
        </div>

        {(!walletOk || !chainOk) && (
          <div style={{ padding: '12px 16px', background: '#FF525210', border: `1px solid #FF525230`, borderRadius: 10, marginBottom: '1.5rem', fontSize: '0.8rem', color: C.red }}>
            {!walletOk
              ? '⚠️ SubWallet ya Talisman wallet connect karo (Navbar top-right) — simulator onchain mode mein hai.'
              : '⚠️ Konnex Testnet se connect nahi ho pa raha — network check karo aur retry karo.'}
          </div>
        )}

        {/* ── Main grid ──────────────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '1.5rem' }}>

          {/* Left panel */}
          <div>
            {/* Config card */}
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '1.2rem', marginBottom: '1rem' }}>
              <div style={{ fontFamily: 'monospace', fontSize: '0.62rem', letterSpacing: 3, color: C.gold, textTransform: 'uppercase', marginBottom: '1rem' }}>Config</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <label style={{ fontFamily: 'monospace', fontSize: '0.66rem', color: C.muted2, letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Robots</label>
                  <select value={numRobots} onChange={e => setNumRobots(+e.target.value)} style={selStyle} disabled={running}>
                    <option value={2}>2 Robots</option>
                    <option value={3}>3 Robots</option>
                    <option value={5}>5 Robots</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontFamily: 'monospace', fontSize: '0.66rem', color: C.muted2, letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Tasks / Robot</label>
                  <select value={tasksPerRobot} onChange={e => setTasksPerRobot(+e.target.value)} style={selStyle} disabled={running}>
                    <option value={2}>2 Tasks</option>
                    <option value={3}>3 Tasks</option>
                    <option value={5}>5 Tasks</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontFamily: 'monospace', fontSize: '0.66rem', color: C.muted2, letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Rounds</label>
                  <select value={rounds} onChange={e => setRounds(+e.target.value)} style={selStyle} disabled={running}>
                    <option value={1}>1 Round</option>
                    <option value={2}>2 Rounds</option>
                    <option value={3}>3 Rounds</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontFamily: 'monospace', fontSize: '0.66rem', color: C.muted2, letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Noise Level</label>
                  <select value={noiseLevel} onChange={e => setNoiseLevel(e.target.value)} style={selStyle} disabled={running}>
                    <option value="low">Low (mostly success)</option>
                    <option value="medium">Medium (realistic)</option>
                    <option value="high">High (many failures)</option>
                  </select>
                </div>
              </div>

              <button
                onClick={running ? () => { abortRef.current = true; setRunning(false); } : runSimulation}
                disabled={!walletOk || !chainOk}
                style={{
                  marginTop: '1rem', width: '100%', padding: '10px 16px',
                  background: running ? '#FF525220' : walletOk && chainOk ? C.gold : C.border2,
                  border: `1px solid ${running ? '#FF525250' : walletOk && chainOk ? C.gold : C.border}`,
                  borderRadius: 10, color: running ? C.red : walletOk && chainOk ? '#000' : C.muted,
                  fontFamily: 'monospace', fontWeight: 700, fontSize: '0.82rem',
                  cursor: walletOk && chainOk ? 'pointer' : 'not-allowed',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  transition: 'all 0.2s',
                }}
              >
                {running ? <><Square size={14} /> Stop</> : <><Play size={14} /> Run Onchain Simulation</>}
              </button>
            </div>

            {/* Steps card */}
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '1.2rem' }}>
              <div style={{ fontFamily: 'monospace', fontSize: '0.62rem', letterSpacing: 3, color: C.gold, textTransform: 'uppercase', marginBottom: '1rem' }}>Pipeline Steps</div>
              <StepIndicator steps={STEPS_DEF} currentStep={currentStep} doneSteps={doneSteps} errorStep={errorStep} />
            </div>
          </div>

          {/* Right panel */}
          <div>
            {/* Log */}
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '1.2rem', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.8rem' }}>
                <div style={{ fontFamily: 'monospace', fontSize: '0.62rem', letterSpacing: 3, color: C.gold, textTransform: 'uppercase' }}>
                  Simulation Log {running && <span style={{ color: C.blue, marginLeft: 8 }}>⛓ Broadcasting…</span>}
                </div>
                <button onClick={() => setLogs([])} style={{ background: 'none', border: 'none', color: C.muted2, cursor: 'pointer', fontSize: '0.7rem', fontFamily: 'monospace' }}>
                  <RefreshCw size={12} /> Clear
                </button>
              </div>
              <div
                ref={logRef}
                style={{
                  background: '#0D0D0D', border: `1px solid ${C.border}`, borderRadius: 8,
                  padding: '0.8rem', height: 300, overflowY: 'auto',
                }}
              >
                {logs.map((l, i) => <LogLine key={i} line={l} />)}
              </div>
            </div>

            {/* Results */}
            {results && (
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '1.2rem' }}>
                <div style={{ fontFamily: 'monospace', fontSize: '0.62rem', letterSpacing: 3, color: C.gold, textTransform: 'uppercase', marginBottom: '1rem' }}>Results</div>

                {/* Stat chips */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, marginBottom: '1.2rem' }}>
                  {[
                    { label: 'Robots',      value: results.simRobots.length, color: C.blue   },
                    { label: 'PoPW Events', value: results.totalPoPW,         color: C.purple },
                    { label: 'Accepted',    value: `${results.totalAccepted} (${results.totalPoPW ? ((results.totalAccepted / results.totalPoPW) * 100).toFixed(0) : 0}%)`, color: C.green },
                    ...(results.impr != null ? [{ label: 'Score Δ R1→R'+results.roundResults.length, value: (+results.impr >= 0 ? '+' : '') + results.impr + '%', color: +results.impr >= 0 ? C.green : C.red }] : []),
                  ].map(s => (
                    <div key={s.label} style={{ background: C.card2, border: `1px solid ${C.border}`, borderRadius: 8, padding: '0.8rem', textAlign: 'center' }}>
                      <div style={{ fontSize: '1.3rem', fontWeight: 800, color: s.color, fontFamily: 'monospace' }}>{s.value}</div>
                      <div style={{ fontSize: '0.65rem', color: C.muted2, fontFamily: 'monospace', marginTop: 3 }}>{s.label}</div>
                    </div>
                  ))}
                </div>

                {/* Round table */}
                <div style={{ overflowX: 'auto', marginBottom: '1.2rem' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                    <thead>
                      <tr>{['Round', 'Tasks', 'Avg PoPW', 'Accepted', 'Memory'].map(h => (
                        <th key={h} style={{ textAlign: 'left', padding: '6px 10px', fontFamily: 'monospace', fontSize: '0.62rem', letterSpacing: 1, textTransform: 'uppercase', color: C.muted2, borderBottom: `1px solid ${C.border}` }}>{h}</th>
                      ))}</tr>
                    </thead>
                    <tbody>
                      {results.roundResults.map(r => (
                        <tr key={r.round}>
                          <td style={{ padding: '8px 10px', fontFamily: 'monospace', borderBottom: `1px solid ${C.border}` }}>Round {r.round}</td>
                          <td style={{ padding: '8px 10px', borderBottom: `1px solid ${C.border}` }}>{r.count}</td>
                          <td style={{ padding: '8px 10px', borderBottom: `1px solid ${C.border}` }}>
                            <span style={{ color: sc(r.avg), fontFamily: 'monospace', fontWeight: 700 }}>{r.avg.toFixed(4)}</span>
                            <ScoreBar value={r.avg} />
                          </td>
                          <td style={{ padding: '8px 10px', color: C.green, fontFamily: 'monospace', borderBottom: `1px solid ${C.border}` }}>{r.accepted}/{r.count}</td>
                          <td style={{ padding: '8px 10px', borderBottom: `1px solid ${C.border}` }}>
                            <span style={{
                              padding: '2px 7px', borderRadius: 5, fontFamily: 'monospace', fontSize: '0.62rem', fontWeight: 700,
                              background: r.round > 1 ? '#CE93D815' : '#4D9FFF15',
                              color: r.round > 1 ? C.purple : C.blue,
                              border: `1px solid ${r.round > 1 ? '#CE93D830' : '#4D9FFF30'}`,
                            }}>{r.round > 1 ? '📚 Memory-enhanced' : '🆕 Fresh policies'}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Leaderboard */}
                {results.lb.length > 0 && (
                  <>
                    <div style={{ fontFamily: 'monospace', fontSize: '0.62rem', letterSpacing: 3, color: C.muted2, textTransform: 'uppercase', marginBottom: '0.6rem' }}>Reputation Leaderboard</div>
                    {results.lb.slice(0, 8).map(([id, rep], i) => {
                      const robot = DB.robots.find(x => x.robot_id === id);
                      const { label, icon, color } = tierInfo(rep.score);
                      const sr = rep.total_tasks ? ((rep.successful_tasks / rep.total_tasks) * 100).toFixed(0) + '%' : '—';
                      return (
                        <div key={id} style={{
                          display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0',
                          borderBottom: `1px solid ${C.border}`,
                        }}>
                          <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', minWidth: 22 }}>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}</span>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '0.82rem', fontWeight: 600 }}>{robot?.metadata?.label || shortId(id)}</div>
                            <ScoreBar value={rep.score} color={color} />
                          </div>
                          <span style={{ fontFamily: 'monospace', fontSize: '0.75rem', color, fontWeight: 700, minWidth: 50, textAlign: 'right' }}>{rep.score.toFixed(4)}</span>
                          <span style={{ fontSize: '0.7rem', color, minWidth: 60 }}>{icon} {label}</span>
                          <span style={{ fontFamily: 'monospace', fontSize: '0.65rem', color: C.green, minWidth: 40 }}>{sr}</span>
                        </div>
                      );
                    })}
                  </>
                )}

                {/* Last PoPW artifact */}
                {results.lastEntry && (
                  <div style={{ marginTop: '1.2rem' }}>
                    <div style={{ fontFamily: 'monospace', fontSize: '0.62rem', letterSpacing: 3, color: C.muted2, textTransform: 'uppercase', marginBottom: '0.6rem' }}>Last PoPW Artifact ⛓</div>
                    <div style={{
                      background: '#0D0D0D', border: `1px solid ${C.border}`, borderRadius: 8,
                      padding: '0.8rem', fontFamily: 'monospace', fontSize: '0.68rem',
                      color: C.muted2, lineHeight: 1.8,
                    }}>
                      {[
                        ['task_id',    results.lastEntry.task_id],
                        ['robot_id',   results.lastEntry.robot_id],
                        ['task_type',  results.lastEntry.task_type],
                        ['popw_score', results.lastEntry.popw_score],
                        ['accepted',   results.lastEntry.popw_score >= 0.5 ? 'true' : 'false'],
                        ['tx_hash',    results.lastEntry.tx_hash],
                        ['block',      results.lastEntry.block_number],
                        ['network',    'Konnex Testnet'],
                      ].map(([k, v]) => (
                        <div key={k}>
                          <span style={{ color: C.blue }}>&quot;{k}&quot;</span>
                          <span style={{ color: C.muted }}>: </span>
                          <span style={{ color: C.green }}>&quot;{String(v)}&quot;</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
