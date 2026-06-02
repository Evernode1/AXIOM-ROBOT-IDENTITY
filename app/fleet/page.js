'use client';
import { useState, useEffect, useCallback } from 'react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line,
} from 'recharts';
import { timeAgo } from '@/lib/utils';
import {
  CHAIN, DB, CHAIN_STATS,
  loadDB, attachRealtimeListeners, initChain,
  fetchNetworkStats, attachNetworkStatsListener,
  on, off, explorerTxUrl, explorerBlockUrl,
  TOKEN_DECIMALS,
} from '@/lib/chain';

const COLORS = ['#4D9FFF', '#F0A500', '#00FFB2', '#FF4D6A', '#B44DFF', '#FF8C42'];

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#0F1525', border: '1px solid rgba(240,165,0,0.2)', padding: '0.75rem 1rem', fontFamily: "'Space Mono', monospace", fontSize: '0.68rem' }}>
      <div style={{ color: '#F0A500', marginBottom: '0.4rem' }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color, marginBottom: '0.2rem' }}>{p.name}: {p.value?.toLocaleString()}</div>
      ))}
    </div>
  );
};

// Blinking live indicator dot
const LiveDot = ({ color = '#00FFB2', size = 7 }) => (
  <span style={{
    display: 'inline-block', width: size, height: size, borderRadius: '50%',
    background: color, marginRight: 6, flexShrink: 0,
    animation: 'blink 1.4s ease-in-out infinite',
  }} />
);

// Section header divider
const SectionHeader = ({ label, sub, accent = '#F0A500', dot, dotColor }) => (
  <div style={{ marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
    <div style={{ width: 2, height: 28, background: accent, flexShrink: 0 }} />
    <div>
      <div style={{ fontFamily: "'Space Mono', monospace", fontSize: '0.62rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: accent, display: 'flex', alignItems: 'center', gap: 6 }}>
        {dot && <LiveDot color={dotColor || accent} size={6} />}
        {label}
      </div>
      {sub && <div style={{ fontSize: '0.72rem', color: '#4A4845', marginTop: 2 }}>{sub}</div>}
    </div>
  </div>
);

function buildActivityData(memories) {
  const buckets = {};
  for (let i = 0; i < 24; i++) {
    const h = String(i).padStart(2, '0') + ':00';
    buckets[h] = { hour: h, tasks: 0, verified: 0 };
  }
  const now = Date.now();
  memories.forEach(m => {
    const age = now - (m.timestamp || (m.executed_at && new Date(m.executed_at).getTime()) || now);
    if (age < 86400000) {
      const hIdx = 23 - Math.floor(age / 3600000);
      if (hIdx >= 0 && hIdx < 24) {
        const key = String(hIdx).padStart(2, '0') + ':00';
        if (buckets[key]) {
          buckets[key].tasks++;
          if ((m.outcome || '') !== 'FAILED') buckets[key].verified++;
        }
      }
    }
  });
  return Object.values(buckets);
}

function formatIssuance(raw) {
  if (!raw) return '—';
  try {
    const num = BigInt(raw);
    const divisor = BigInt(10 ** TOKEN_DECIMALS);
    const whole = num / divisor;
    if (whole >= BigInt(1_000_000_000)) return (Number(whole) / 1_000_000_000).toFixed(2) + 'B';
    if (whole >= BigInt(1_000_000))     return (Number(whole) / 1_000_000).toFixed(2) + 'M';
    if (whole >= BigInt(1_000))         return (Number(whole) / 1_000).toFixed(2) + 'K';
    return whole.toLocaleString();
  } catch { return '—'; }
}

// Shared card style
const cardBase = { background: '#101525', padding: '1.25rem 1.5rem', position: 'relative' };
const chainCard = { background: '#0A1020', padding: '1.25rem 1.5rem', position: 'relative', border: '1px solid rgba(77,159,255,0.1)' };

export default function Fleet() {
  const [robots,      setRobots]      = useState([]);
  const [memories,    setMemories]    = useState([]);
  const [rep,         setRep]         = useState({});
  const [liveBlock,   setLiveBlock]   = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [chainStatus, setChainStatus] = useState('disconnected');
  const [netStats,    setNetStats]    = useState({ ...CHAIN_STATS });

  const sync = useCallback(() => {
    setRobots([...DB.robots]);
    setMemories([...DB.memory]);
    setRep({ ...DB.reputation });
    setLoading(false);
  }, []);

  useEffect(() => {
    const onBlock   = blk => setLiveBlock(blk);
    const onStatus  = s   => setChainStatus(s);
    const onRobots  = ()  => setRobots([...DB.robots]);
    const onMem     = ()  => setMemories([...DB.memory]);
    const onRepUp   = ()  => setRep({ ...DB.reputation });
    const onStats   = s   => setNetStats({ ...s });

    on('chain:block',        onBlock);
    on('chain:status',       onStatus);
    on('robots:updated',     onRobots);
    on('memory:updated',     onMem);
    on('reputation:updated', onRepUp);
    on('chain:stats',        onStats);

    (async () => {
      await initChain();
      await loadDB();
      attachRealtimeListeners();
      attachNetworkStatsListener();
      sync();
    })();

    return () => {
      off('chain:block',        onBlock);
      off('chain:status',       onStatus);
      off('robots:updated',     onRobots);
      off('memory:updated',     onMem);
      off('reputation:updated', onRepUp);
      off('chain:stats',        onStats);
    };
  }, [sync]);

  // ── Derived — AXIOM app data (Firebase) ───────────────────────────
  const totalRobots  = robots.length;
  const totalTasks   = memories.length;
  const successCount = memories.filter(m => m.outcome === 'SUCCESS' || m.popw_score >= 0.5).length;
  const successRate  = totalTasks > 0 ? ((successCount / totalTasks) * 100).toFixed(1) : '0.0';
  const avgPopw      = totalTasks > 0
    ? (memories.reduce((s, m) => s + (m.popw_score || 0), 0) / totalTasks).toFixed(3)
    : '0.000';
  const failedCount  = totalTasks - successCount;

  const topRobots = robots
    .map(r => ({
      ...r,
      repData: rep[r.robot_id] || { score: 0, total_tasks: 0, successful_tasks: 0 },
      rName: r.metadata?.label || r.name || 'Unknown',
      rType: r.metadata?.type  || r.type  || 'Custom',
    }))
    .sort((a, b) => b.repData.total_tasks - a.repData.total_tasks)
    .slice(0, 5);

  const activityData = buildActivityData(memories);

  const taskCatMap = {};
  memories.forEach(m => {
    const cat = (m.task_type || m.taskType || 'Unknown').split(' ')[0];
    taskCatMap[cat] = (taskCatMap[cat] || 0) + 1;
  });
  const taskDistData = Object.entries(taskCatMap).map(([name, count]) => ({ name, count }));

  const typeMap = {};
  robots.forEach(r => {
    const t = (r.metadata?.type || r.type || 'Custom').split(' ')[0];
    typeMap[t] = (typeMap[t] || 0) + 1;
  });
  const robotDistData = Object.entries(typeMap).map(([name, value]) => ({ name, value }));

  // ── Derived — Konnex Testnet (chain RPC) ──────────────────────────
  const statusColor = chainStatus === 'connected' ? '#00FFB2' : chainStatus === 'connecting' ? '#F0A500' : '#FF4D6A';
  const blockLag    = (netStats.bestBlock && netStats.finalizedBlock)
    ? netStats.bestBlock - netStats.finalizedBlock : null;
  const blockTimeData = netStats.blockTimeSeries.map((b, i) => ({
    i, block: b.block, ms: +(b.ms / 1000).toFixed(2),
  }));

  const Skeleton = () => (
    <div style={{ height: 32, background: 'rgba(240,165,0,0.07)', borderRadius: 4, marginBottom: 6, animation: 'pulse 1.5s infinite' }} />
  );

  return (
    <div className="page-wrap">
      {/* Page header */}
      <div className="page-header">
        <div className="page-sub">// Fleet Dashboard</div>
        <h1 className="page-title">FLEET ANALYTICS</h1>
        <p style={{ color: '#6A6560', fontSize: '0.88rem', marginTop: '0.5rem', maxWidth: 560 }}>
          Fleet data (Firebase) aur Konnex Testnet chain stats (Polkadot.js RPC) — alag alag sections mein.
        </p>
      </div>

      {/* ════════════════════════════════════════════════════════════
          SECTION 1 — AXIOM FLEET DATA  (source: Firebase)
      ════════════════════════════════════════════════════════════ */}
      <SectionHeader
        label="AXIOM Fleet Data"
        sub="Source: Firebase Firestore — robots, tasks, PoPW memory"
        accent="#F0A500"
      />

      {/* Fleet metric cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '1px', background: 'rgba(240,165,0,0.08)', marginBottom: '0.75rem' }}>
        {[
          { label: 'Total Robots',    value: totalRobots.toLocaleString(),  sub: 'registered on AXIOM',        color: '#E2DDD6' },
          { label: 'Tasks Submitted', value: totalTasks.toLocaleString(),   sub: 'PoPW memory entries',        color: '#E2DDD6' },
          { label: 'Success',         value: successCount.toLocaleString(), sub: 'score ≥ 0.5 or SUCCESS',     color: '#00FFB2' },
          { label: 'Failed',          value: failedCount.toLocaleString(),  sub: 'score < 0.5 or FAILED',      color: '#FF4D6A' },
          { label: 'Success Rate',    value: `${successRate}%`,             sub: 'verified task success',      color: '#00FFB2' },
          { label: 'Avg PoPW Score',  value: avgPopw,                       sub: 'consensus weighted score',   color: '#4D9FFF' },
        ].map(m => (
          <div key={m.label} style={cardBase}>
            {loading ? <Skeleton /> : (
              <div className="metric-value" style={{ color: m.color, fontSize: '1.4rem' }}>{m.value}</div>
            )}
            <div className="metric-label">{m.label}</div>
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: '0.56rem', color: '#3A3835', marginTop: 2 }}>{m.sub}</div>
          </div>
        ))}
      </div>

      {/* Fleet charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: '1rem', marginBottom: '1rem' }} className="chart-row">
        {/* 24h activity */}
        <div className="card" style={{ padding: '1.5rem' }}>
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: '0.62rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#F0A500' }}>Task Activity — Last 24h</div>
            <div style={{ fontSize: '0.72rem', color: '#5A5550', marginTop: 3 }}>Firebase memory entries per hour</div>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={activityData}>
              <defs>
                <linearGradient id="gT" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#F0A500" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#F0A500" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gV" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#00FFB2" stopOpacity={0.12} />
                  <stop offset="95%" stopColor="#00FFB2" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="hour" tick={{ fontFamily: "'Space Mono', monospace", fontSize: '0.55rem', fill: '#4A4845' }} interval={5} />
              <YAxis tick={{ fontFamily: "'Space Mono', monospace", fontSize: '0.6rem', fill: '#4A4845' }} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="tasks"    stroke="#F0A500" strokeWidth={1.5} fill="url(#gT)" name="Tasks" />
              <Area type="monotone" dataKey="verified" stroke="#00FFB2" strokeWidth={1.5} fill="url(#gV)" name="Verified" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Robot type pie */}
        <div className="card" style={{ padding: '1.5rem' }}>
          <div style={{ fontFamily: "'Space Mono', monospace", fontSize: '0.62rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#F0A500', marginBottom: '1rem' }}>Robot Types</div>
          {robotDistData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={robotDistData} cx="50%" cy="50%" innerRadius={40} outerRadius={68} dataKey="value" paddingAngle={3}>
                    {robotDistData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.75rem' }}>
                {robotDistData.map((d, i) => (
                  <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: COLORS[i % COLORS.length] }} />
                    <span style={{ fontFamily: "'Space Mono', monospace", fontSize: '0.58rem', color: '#5A5550' }}>{d.name} ({d.value})</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4A4845', fontFamily: "'Space Mono', monospace", fontSize: '0.7rem' }}>
              {loading ? 'Loading...' : 'No robots yet'}
            </div>
          )}
        </div>
      </div>

      {/* Tasks by category + Top robots */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '2rem' }} className="chart-row">
        {/* Tasks by category */}
        <div className="card" style={{ padding: '1.5rem' }}>
          <div style={{ fontFamily: "'Space Mono', monospace", fontSize: '0.62rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#F0A500', marginBottom: '1rem' }}>Tasks by Category</div>
          {taskDistData.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={taskDistData} layout="vertical">
                <XAxis type="number" tick={{ fontFamily: "'Space Mono', monospace", fontSize: '0.55rem', fill: '#4A4845' }} />
                <YAxis type="category" dataKey="name" tick={{ fontFamily: "'Space Mono', monospace", fontSize: '0.58rem', fill: '#5A5550' }} width={80} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" fill="#F0A500" name="Tasks" radius={[0, 2, 2, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4A4845', fontFamily: "'Space Mono', monospace", fontSize: '0.7rem' }}>
              {loading ? 'Loading...' : 'No tasks yet'}
            </div>
          )}
        </div>

        {/* Top robots */}
        <div className="card" style={{ padding: '1.5rem' }}>
          <div style={{ fontFamily: "'Space Mono', monospace", fontSize: '0.62rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#F0A500', marginBottom: '1rem' }}>Top Robots by Tasks</div>
          {topRobots.length === 0 ? (
            <div style={{ color: '#4A4845', fontFamily: "'Space Mono', monospace", fontSize: '0.7rem', padding: '2rem 0', textAlign: 'center' }}>
              {loading ? 'Loading...' : 'No robots registered yet'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {topRobots.map((r, i) => {
                const repScore = Math.round((r.repData.score || 0) * 100);
                const barWidth = Math.max(4, repScore);
                return (
                  <div key={r.robot_id} style={{ padding: '0.55rem 0', borderBottom: i < topRobots.length - 1 ? '1px solid rgba(240,165,0,0.06)' : 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: 4 }}>
                      <div style={{ fontFamily: "'Space Mono', monospace", fontSize: '0.65rem', color: '#5A5550', width: 18 }}>#{i + 1}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '0.8rem', color: '#D0C8C0', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.rName}</div>
                        <div style={{ fontFamily: "'Space Mono', monospace", fontSize: '0.56rem', color: '#4A4845' }}>{r.rType} · {r.repData.total_tasks} tasks</div>
                      </div>
                      <div style={{ fontFamily: "'Space Mono', monospace", fontSize: '0.78rem', color: '#F0A500' }}>{repScore}<span style={{ fontSize: '0.5rem', color: '#4A4845', marginLeft: 2 }}>REP</span></div>
                    </div>
                    {/* Rep bar */}
                    <div style={{ height: 2, background: 'rgba(240,165,0,0.08)', borderRadius: 2, marginLeft: 24 }}>
                      <div style={{ height: '100%', width: `${barWidth}%`, background: '#F0A500', borderRadius: 2, opacity: 0.6 }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Recent memory entries table */}
      <div className="card" style={{ padding: '1.5rem', marginBottom: '3rem' }}>
        <div style={{ fontFamily: "'Space Mono', monospace", fontSize: '0.62rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#F0A500', marginBottom: '1rem' }}>
          Recent PoPW Memory Entries
        </div>
        {memories.length === 0 ? (
          <div style={{ color: '#4A4845', fontFamily: "'Space Mono', monospace", fontSize: '0.7rem', padding: '1.5rem 0', textAlign: 'center' }}>
            {loading ? 'Loading from Firebase...' : 'No memory entries yet'}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: "'Space Mono', monospace", fontSize: '0.68rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(240,165,0,0.1)' }}>
                  {['Task ID', 'Robot', 'Type', 'PoPW Score', 'Block', 'Status'].map(h => (
                    <th key={h} style={{ padding: '0.5rem 0.75rem', color: '#5A5550', fontWeight: 400, textAlign: 'left', fontSize: '0.58rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {memories.slice(0, 10).map((m, i) => {
                  const robot  = robots.find(r => r.robot_id === (m.robot_id || m.robotId));
                  const rName  = robot ? (robot.metadata?.label || robot.name) : (m.robotName || 'Unknown');
                  const score  = typeof m.popw_score === 'number' ? (m.popw_score > 1 ? m.popw_score : Math.round(m.popw_score * 100)) : '—';
                  const scoreC = score >= 70 ? '#00FFB2' : score >= 50 ? '#F0A500' : '#FF4D6A';
                  const outcome  = m.outcome || (m.popw_score >= 0.5 ? 'SUCCESS' : 'FAILED');
                  const outcomeC = outcome === 'SUCCESS' ? '#00FFB2' : outcome === 'PARTIAL' ? '#F0A500' : '#FF4D6A';
                  return (
                    <tr key={m.task_id || i} style={{ borderBottom: '1px solid rgba(240,165,0,0.04)' }}>
                      <td style={{ padding: '0.5rem 0.75rem', color: '#4D9FFF' }}>
                        {m.tx_hash
                          ? <a href={explorerTxUrl(m.tx_hash)} target="_blank" rel="noopener noreferrer" style={{ color: '#4D9FFF' }}>{(m.task_id || '').slice(0, 14)}…</a>
                          : (m.task_id || '').slice(0, 14)}
                      </td>
                      <td style={{ padding: '0.5rem 0.75rem', color: '#D0C8C0' }}>{rName}</td>
                      <td style={{ padding: '0.5rem 0.75rem', color: '#5A5550', fontSize: '0.6rem' }}>{(m.task_type || m.taskType || '').split(' ').slice(0, 2).join(' ')}</td>
                      <td style={{ padding: '0.5rem 0.75rem', color: scoreC }}>{score}</td>
                      <td style={{ padding: '0.5rem 0.75rem', color: '#5A5550' }}>
                        {m.block_number
                          ? <a href={explorerBlockUrl(m.block_number)} target="_blank" rel="noopener noreferrer" style={{ color: '#5A5550', textDecoration: 'none' }}>#{m.block_number}</a>
                          : '—'}
                      </td>
                      <td style={{ padding: '0.5rem 0.75rem', color: outcomeC, fontSize: '0.6rem' }}>{outcome}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ════════════════════════════════════════════════════════════
          SECTION 2 — KONNEX TESTNET  (source: Polkadot.js RPC)
      ════════════════════════════════════════════════════════════ */}
      <SectionHeader
        label="Konnex Testnet — Live Chain Data"
        sub={`Source: Polkadot.js RPC (wss://testnet-rpc1.konnex.world)${netStats.specName ? `  ·  ${netStats.specName} v${netStats.specVersion}` : ''}`}
        accent="#4D9FFF"
        dot
        dotColor={statusColor}
      />

      {/* Chain metric cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1px', background: 'rgba(77,159,255,0.1)', marginBottom: '1rem' }}>
        {[
          {
            label: 'Chain Status',
            value: chainStatus.toUpperCase(),
            sub: 'Konnex Testnet',
            color: statusColor,
            live: chainStatus === 'connected',
          },
          {
            label: 'Best Block',
            value: liveBlock ? `#${liveBlock.toLocaleString()}` : '—',
            sub: 'Latest produced block',
            color: '#4D9FFF',
            live: !!liveBlock,
            href: liveBlock ? explorerBlockUrl(liveBlock) : null,
          },
          {
            label: 'Finalized Block',
            value: netStats.finalizedBlock ? `#${netStats.finalizedBlock.toLocaleString()}` : '—',
            sub: 'Last confirmed-final block',
            color: '#4D9FFF',
          },
          {
            label: 'Finality Lag',
            value: blockLag != null ? `${blockLag} blk` : '—',
            sub: 'best − finalized',
            color: blockLag != null && blockLag > 5 ? '#FF4D6A' : '#00FFB2',
          },
          {
            label: 'Block Time',
            value: netStats.blockTime ? `${(netStats.blockTime / 1000).toFixed(1)}s` : '—',
            sub: 'Rolling EMA avg',
            color: '#F0A500',
          },
          {
            label: 'Extrinsics/Block',
            value: netStats.totalExtrinsics != null ? netStats.totalExtrinsics : '—',
            sub: 'Latest block tx count',
            color: '#00FFB2',
          },
          {
            label: 'Approx TPS',
            value: netStats.tps != null ? netStats.tps : '—',
            sub: 'extrinsics ÷ block time',
            color: '#00FFB2',
          },
          {
            label: 'Active Validators',
            value: netStats.validators != null ? netStats.validators : '—',
            sub: 'Collator / validator set',
            color: '#B44DFF',
          },
          {
            label: 'Connected Peers',
            value: netStats.peers != null ? netStats.peers : '—',
            sub: 'RPC node peer count',
            color: '#4D9FFF',
          },
          {
            label: 'Total Issuance',
            value: formatIssuance(netStats.totalIssuance),
            sub: 'tKNX token supply',
            color: '#F0A500',
          },
        ].map(m => (
          <div key={m.label} style={chainCard}>
            {m.live && (
              <div style={{ position: 'absolute', top: 10, right: 10 }}>
                <LiveDot color={statusColor} size={6} />
              </div>
            )}
            <div style={{ fontSize: '1.3rem', fontWeight: 700, color: m.color, fontFamily: "'Space Mono', monospace", marginBottom: 4 }}>
              {m.href
                ? <a href={m.href} target="_blank" rel="noopener noreferrer" style={{ color: m.color, textDecoration: 'none' }}>{m.value}</a>
                : m.value}
            </div>
            <div className="metric-label">{m.label}</div>
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: '0.55rem', color: '#2A3040', marginTop: 2 }}>{m.sub}</div>
          </div>
        ))}
      </div>

      {/* Block time sparkline — only shows after enough data */}
      {blockTimeData.length > 3 && (
        <div className="card" style={{ padding: '1.25rem 1.5rem', background: '#0A1020', border: '1px solid rgba(77,159,255,0.1)', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <div>
              <div style={{ fontFamily: "'Space Mono', monospace", fontSize: '0.62rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#4D9FFF' }}>
                Block Time Sparkline — Konnex Testnet
              </div>
              <div style={{ fontSize: '0.7rem', color: '#3A4050', marginTop: 2 }}>
                Per-block interval in seconds — last {blockTimeData.length} blocks
              </div>
            </div>
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: '0.75rem', color: '#F0A500' }}>
              avg {(netStats.blockTime / 1000).toFixed(2)}s
            </div>
          </div>
          <ResponsiveContainer width="100%" height={90}>
            <LineChart data={blockTimeData}>
              <XAxis dataKey="i" hide />
              <YAxis domain={['auto', 'auto']} tick={{ fontFamily: "'Space Mono', monospace", fontSize: '0.55rem', fill: '#3A4050' }} width={28} />
              <Tooltip content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload;
                return (
                  <div style={{ background: '#0A1020', border: '1px solid rgba(77,159,255,0.2)', padding: '0.4rem 0.6rem', fontFamily: "'Space Mono', monospace", fontSize: '0.65rem' }}>
                    <div style={{ color: '#4D9FFF' }}>Block #{d.block?.toLocaleString()}</div>
                    <div style={{ color: '#F0A500' }}>{d.ms}s</div>
                  </div>
                );
              }} />
              <Line type="monotone" dataKey="ms" stroke="#4D9FFF" strokeWidth={1.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Explorer quick link */}
      {liveBlock && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0.75rem 1rem', background: '#0A1020', border: '1px solid rgba(77,159,255,0.1)', fontFamily: "'Space Mono', monospace", fontSize: '0.65rem' }}>
          <LiveDot color={statusColor} size={6} />
          <span style={{ color: '#3A4050' }}>Konnex Explorer:</span>
          <a
            href={explorerBlockUrl(liveBlock)}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#4D9FFF', textDecoration: 'none' }}
          >
            subnets.testnet.konnex.world ↗
          </a>
          <span style={{ color: '#2A3040', marginLeft: 'auto' }}>
            Block #{liveBlock.toLocaleString()} · Updated every ~{netStats.blockTime ? (netStats.blockTime / 1000).toFixed(0) : 6}s
          </span>
        </div>
      )}

      <style>{`
        .chart-row { grid-template-columns: 1fr 360px; }
        @media(max-width: 900px) { .chart-row { grid-template-columns: 1fr !important; } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes blink  { 0%, 100% { opacity: 1; } 50% { opacity: 0.15; } }
      `}</style>
    </div>
  );
}
