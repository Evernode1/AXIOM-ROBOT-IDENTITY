'use client';
import { useState, useEffect, useCallback } from 'react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { ROBOT_DIST, TASKS_BY_CAT } from '@/lib/data';
import { timeAgo, typeColor } from '@/lib/utils';
import {
  CHAIN, DB,
  loadDB, attachRealtimeListeners, initChain,
  on, off, shortAddr, explorerTxUrl,
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

function buildActivityData(memories) {
  // Build last 24 hours from real memory data
  const buckets = {};
  for (let i = 0; i < 24; i++) {
    const h = String(i).padStart(2, '0') + ':00';
    buckets[h] = { hour: h, tasks: 0, verified: 0 };
  }
  const now = Date.now();
  memories.forEach(m => {
    const age = now - (m.timestamp || m.executed_at && new Date(m.executed_at).getTime() || now);
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

export default function Fleet() {
  const [robots,    setRobots]    = useState([]);
  const [memories,  setMemories]  = useState([]);
  const [rep,       setRep]       = useState({});
  const [liveBlock, setLiveBlock] = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [chainStatus, setChainStatus] = useState('disconnected');

  const sync = useCallback(() => {
    setRobots([...DB.robots]);
    setMemories([...DB.memory]);
    setRep({ ...DB.reputation });
    setLoading(false);
  }, []);

  useEffect(() => {
    const onBlock  = blk  => setLiveBlock(blk);
    const onStatus = s    => setChainStatus(s);
    const onRobots = ()   => setRobots([...DB.robots]);
    const onMem    = ()   => setMemories([...DB.memory]);
    const onRepUp  = ()   => setRep({ ...DB.reputation });

    on('chain:block',         onBlock);
    on('chain:status',        onStatus);
    on('robots:updated',      onRobots);
    on('memory:updated',      onMem);
    on('reputation:updated',  onRepUp);

    (async () => {
      await initChain();
      await loadDB();
      attachRealtimeListeners();
      sync();
    })();

    return () => {
      off('chain:block',        onBlock);
      off('chain:status',       onStatus);
      off('robots:updated',     onRobots);
      off('memory:updated',     onMem);
      off('reputation:updated', onRepUp);
    };
  }, [sync]);

  // Derived stats from real data
  const totalRobots    = robots.length;
  const totalTasks     = memories.length;
  const successCount   = memories.filter(m => m.outcome === 'SUCCESS' || (m.popw_score >= 0.5)).length;
  const successRate    = totalTasks > 0 ? ((successCount / totalTasks) * 100).toFixed(1) : '0.0';
  const avgPopw        = totalTasks > 0 ? (memories.reduce((s, m) => s + (m.popw_score || 0), 0) / totalTasks).toFixed(3) : '0.000';

  // Top robots by task count (from reputation)
  const topRobots = robots
    .map(r => ({
      ...r,
      repData: rep[r.robot_id] || { score: 0, total_tasks: 0, successful_tasks: 0 },
      rName: r.metadata?.label || r.name || 'Unknown',
      rType: r.metadata?.type  || r.type  || 'Custom',
    }))
    .sort((a, b) => (b.repData.total_tasks - a.repData.total_tasks))
    .slice(0, 5);

  const activityData = buildActivityData(memories);

  // Task distribution from real memory data
  const taskCatMap = {};
  memories.forEach(m => {
    const cat = (m.task_type || m.taskType || 'Unknown').split(' ')[0];
    taskCatMap[cat] = (taskCatMap[cat] || 0) + 1;
  });
  const taskDistData = Object.entries(taskCatMap).map(([name, count]) => ({ name, count }));

  // Robot type distribution from real robots
  const typeMap = {};
  robots.forEach(r => {
    const t = (r.metadata?.type || r.type || 'Custom').split(' ')[0];
    typeMap[t] = (typeMap[t] || 0) + 1;
  });
  const robotDistData = Object.entries(typeMap).map(([name, value]) => ({ name, value }));

  const statusColor = chainStatus === 'connected' ? '#00FFB2' : chainStatus === 'connecting' ? '#F0A500' : '#FF4D6A';

  const METRICS = [
    { label: 'Total Robots',    value: totalRobots.toLocaleString(),   sub: 'registered on AXIOM',       color: '#E2DDD6' },
    { label: 'Tasks Completed', value: totalTasks.toLocaleString(),    sub: 'real PoPW memory entries',   color: '#E2DDD6' },
    { label: 'Success Rate',    value: `${successRate}%`,              sub: 'verified task success',      color: '#00FFB2' },
    { label: 'Avg PoPW Score',  value: avgPopw,                        sub: 'consensus score',            color: '#4D9FFF' },
    { label: 'Chain Status',    value: chainStatus.toUpperCase(),      sub: 'Konnex Testnet',             color: statusColor },
    { label: 'Live Block',      value: liveBlock ? `#${liveBlock.toLocaleString()}` : '—', sub: '~6s block time', color: '#4D9FFF' },
  ];

  return (
    <div className="page-wrap">
      <div className="page-header">
        <div className="page-sub">// Fleet Dashboard</div>
        <h1 className="page-title">FLEET ANALYTICS</h1>
        <p style={{ color: '#6A6560', fontSize: '0.88rem', marginTop: '0.5rem', maxWidth: 540 }}>
          Real-time Firebase + Konnex Testnet data — live robot stats, PoPW memory entries, aur chain metrics.
        </p>
      </div>

      {/* Metric cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1px', background: 'rgba(240,165,0,0.08)', marginBottom: '2rem' }}>
        {METRICS.map(m => (
          <div key={m.label} className="card" style={{ padding: '1.25rem 1.5rem', background: '#101525' }}>
            {loading ? (
              <div style={{ height: 36, background: 'rgba(240,165,0,0.08)', borderRadius: 4, marginBottom: 6, animation: 'pulse 1.5s infinite' }} />
            ) : (
              <div className="metric-value" style={{ color: m.color }}>{m.value}</div>
            )}
            <div className="metric-label">{m.label}</div>
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: '0.56rem', color: '#3A3835', marginTop: '0.2rem' }}>{m.sub}</div>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '1.5rem', marginBottom: '1.5rem' }} className="chart-row">
        <div className="card" style={{ padding: '1.5rem' }}>
          <div style={{ marginBottom: '1.25rem' }}>
            <div className="f-mono" style={{ fontSize: '0.62rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#F0A500', marginBottom: '0.25rem' }}>Network Activity (Real)</div>
            <div style={{ fontSize: '0.78rem', color: '#5A5550' }}>Last 24h task & verification throughput from Firebase</div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
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

        <div className="card" style={{ padding: '1.5rem' }}>
          <div className="f-mono" style={{ fontSize: '0.62rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#F0A500', marginBottom: '1.25rem' }}>Robot Types (Onchain)</div>
          {robotDistData.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={robotDistData} cx="50%" cy="50%" innerRadius={45} outerRadius={75} dataKey="value" paddingAngle={3}>
                  {robotDistData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4A4845', fontFamily: "'Space Mono', monospace", fontSize: '0.7rem' }}>
              {loading ? 'Loading...' : 'No robots yet'}
            </div>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '1rem' }}>
            {robotDistData.map((d, i) => (
              <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: COLORS[i % COLORS.length] }} />
                <span className="f-mono" style={{ fontSize: '0.58rem', color: '#5A5550' }}>{d.name} ({d.value})</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Task distribution */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }} className="chart-row">
        <div className="card" style={{ padding: '1.5rem' }}>
          <div className="f-mono" style={{ fontSize: '0.62rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#F0A500', marginBottom: '1.25rem' }}>Tasks by Category (Real)</div>
          {taskDistData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={taskDistData} layout="vertical">
                <XAxis type="number" tick={{ fontFamily: "'Space Mono', monospace", fontSize: '0.55rem', fill: '#4A4845' }} />
                <YAxis type="category" dataKey="name" tick={{ fontFamily: "'Space Mono', monospace", fontSize: '0.58rem', fill: '#5A5550' }} width={80} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" fill="#F0A500" name="Tasks" radius={[0, 2, 2, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4A4845', fontFamily: "'Space Mono', monospace", fontSize: '0.7rem' }}>
              {loading ? 'Firebase se load ho raha hai...' : 'No tasks submitted yet'}
            </div>
          )}
        </div>

        {/* Top Robots */}
        <div className="card" style={{ padding: '1.5rem' }}>
          <div className="f-mono" style={{ fontSize: '0.62rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#F0A500', marginBottom: '1.25rem' }}>
            Top Robots (Firebase Live)
          </div>
          {topRobots.length === 0 ? (
            <div style={{ color: '#4A4845', fontFamily: "'Space Mono', monospace", fontSize: '0.7rem', padding: '2rem 0', textAlign: 'center' }}>
              {loading ? 'Loading...' : 'No robots registered yet'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {topRobots.map((r, i) => {
                const repScore = Math.round((r.repData.score || 0) * 100);
                return (
                  <div key={r.robot_id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 0', borderBottom: i < topRobots.length - 1 ? '1px solid rgba(240,165,0,0.06)' : 'none' }}>
                    <div className="f-mono" style={{ fontSize: '0.7rem', color: '#5A5550', width: 20 }}>#{i + 1}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.82rem', color: '#D0C8C0', fontWeight: 500, marginBottom: '0.2rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.rName}
                      </div>
                      <div className="f-mono" style={{ fontSize: '0.58rem', color: '#4A4845' }}>{r.rType} · {r.repData.total_tasks} tasks</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div className="f-mono" style={{ fontSize: '0.8rem', color: '#F0A500' }}>{repScore}</div>
                      <div className="f-mono" style={{ fontSize: '0.55rem', color: '#4A4845' }}>REP</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Recent memory entries */}
      <div className="card" style={{ padding: '1.5rem' }}>
        <div className="f-mono" style={{ fontSize: '0.62rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#F0A500', marginBottom: '1.25rem' }}>
          Recent Onchain Entries (Firebase Realtime)
        </div>
        {memories.length === 0 ? (
          <div style={{ color: '#4A4845', fontFamily: "'Space Mono', monospace", fontSize: '0.7rem', padding: '1.5rem 0', textAlign: 'center' }}>
            {loading ? 'Loading from Firebase...' : 'No memory entries yet — PoPW Submit karo'}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: "'Space Mono', monospace", fontSize: '0.68rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(240,165,0,0.1)' }}>
                  {['Task ID', 'Robot', 'Type', 'PoPW Score', 'Block', 'Status'].map(h => (
                    <th key={h} style={{ padding: '0.5rem 0.75rem', color: '#5A5550', fontWeight: 400, textAlign: 'left', fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {memories.slice(0, 10).map((m, i) => {
                  const robot = robots.find(r => r.robot_id === (m.robot_id || m.robotId));
                  const rName = robot ? (robot.metadata?.label || robot.name) : (m.robotName || 'Unknown');
                  const score = typeof m.popw_score === 'number' ? (m.popw_score > 1 ? m.popw_score : Math.round(m.popw_score * 100)) : '—';
                  const scoreColor = score >= 70 ? '#00FFB2' : score >= 50 ? '#F0A500' : '#FF4D6A';
                  const outcome = m.outcome || (m.popw_score >= 0.5 ? 'SUCCESS' : 'FAILED');
                  const outcomeC = outcome === 'SUCCESS' ? '#00FFB2' : outcome === 'PARTIAL' ? '#F0A500' : '#FF4D6A';
                  return (
                    <tr key={m.task_id || i} style={{ borderBottom: '1px solid rgba(240,165,0,0.04)' }}>
                      <td style={{ padding: '0.5rem 0.75rem', color: '#4D9FFF' }}>
                        {m.tx_hash ? (
                          <a href={explorerTxUrl(m.tx_hash)} target="_blank" rel="noopener noreferrer" style={{ color: '#4D9FFF' }}>
                            {(m.task_id || '').slice(0, 14)}…
                          </a>
                        ) : (m.task_id || '').slice(0, 14)}
                      </td>
                      <td style={{ padding: '0.5rem 0.75rem', color: '#D0C8C0' }}>{rName}</td>
                      <td style={{ padding: '0.5rem 0.75rem', color: '#5A5550', fontSize: '0.6rem' }}>{(m.task_type || m.taskType || '').split(' ').slice(0, 2).join(' ')}</td>
                      <td style={{ padding: '0.5rem 0.75rem', color: scoreColor }}>{score}</td>
                      <td style={{ padding: '0.5rem 0.75rem', color: '#5A5550' }}>#{m.block_number || '—'}</td>
                      <td style={{ padding: '0.5rem 0.75rem', color: outcomeC, fontSize: '0.6rem' }}>{outcome}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <style>{`
        .chart-row { grid-template-columns: 1fr 380px; }
        @media(max-width: 900px) { .chart-row { grid-template-columns: 1fr; } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
      `}</style>
    </div>
  );
}
