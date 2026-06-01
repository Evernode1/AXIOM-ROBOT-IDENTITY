'use client';
import { useState, useEffect } from 'react';
import { AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { SAMPLE_ROBOTS, NETWORK, ACTIVITY_24H, TASKS_BY_CAT, ROBOT_DIST } from '@/lib/data';
import { reputationScore, timeAgo, typeColor } from '@/lib/utils';

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

export default function Fleet() {
  const [robots, setRobots]   = useState([]);
  const [liveBlock, setLiveBlock] = useState(NETWORK.blockHeight);

  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem('axiom_robots') || '[]');
    setRobots([...SAMPLE_ROBOTS, ...saved]);
    const t = setInterval(() => setLiveBlock(b => b + 1), 6000);
    return () => clearInterval(t);
  }, []);

  const topRobots = [...robots].sort((a, b) => b.tasks - a.tasks).slice(0, 5);

  const METRICS = [
    { label: 'Total Robots', value: (NETWORK.totalRobots + robots.filter(r => !SAMPLE_ROBOTS.find(s => s.id === r.id)).length).toLocaleString(), sub: 'registered on AXIOM' },
    { label: 'Tasks Completed', value: NETWORK.tasksCompleted.toLocaleString(), sub: 'all-time PoPW logs' },
    { label: 'Success Rate', value: `${NETWORK.successRate}%`, sub: 'verified task success', color: '#00FFB2' },
    { label: 'Active Subnets', value: NETWORK.activeSubnets, sub: 'Konnex testnet zones' },
    { label: 'KNX Staked', value: NETWORK.knxStaked, sub: 'by robot operators' },
    { label: 'Live Block', value: `#${liveBlock.toLocaleString()}`, sub: '~6s block time', color: '#4D9FFF' },
  ];

  return (
    <div className="page-wrap">
      {/* Header */}
      <div className="page-header">
        <div className="page-sub">// Fleet Dashboard</div>
        <h1 className="page-title">FLEET ANALYTICS</h1>
        <p style={{ color: '#6A6560', fontSize: '0.88rem', marginTop: '0.5rem', maxWidth: 540 }}>
          Real-time network metrics, task activity, and robot performance across all AXIOM-registered units on Konnex Testnet.
        </p>
      </div>

      {/* Metric cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1px', background: 'rgba(240,165,0,0.08)', marginBottom: '2rem' }}>
        {METRICS.map(m => (
          <div key={m.label} className="card" style={{ padding: '1.25rem 1.5rem', background: '#101525' }}>
            <div className="metric-value" style={{ color: m.color || '#E2DDD6' }}>{m.value}</div>
            <div className="metric-label">{m.label}</div>
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: '0.56rem', color: '#3A3835', marginTop: '0.2rem' }}>{m.sub}</div>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '1.5rem', marginBottom: '1.5rem' }} className="chart-row">

        {/* Activity chart */}
        <div className="card" style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <div>
              <div className="f-mono" style={{ fontSize: '0.62rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#F0A500', marginBottom: '0.25rem' }}>Network Activity</div>
              <div style={{ fontSize: '0.78rem', color: '#5A5550' }}>24-hour task & verification throughput</div>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              {[{ c: '#F0A500', l: 'Tasks' }, { c: '#00FFB2', l: 'Verified' }].map(i => (
                <div key={i.l} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <div style={{ width: 8, height: 2, background: i.c, borderRadius: 1 }} />
                  <span className="f-mono" style={{ fontSize: '0.58rem', color: '#5A5550' }}>{i.l}</span>
                </div>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={ACTIVITY_24H}>
              <defs>
                <linearGradient id="gT" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#F0A500" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#F0A500" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gV" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#00FFB2" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="#00FFB2" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="hour" tick={{ fill: '#4A4845', fontSize: 9, fontFamily: 'Space Mono' }} axisLine={false} tickLine={false} interval={3} />
              <YAxis tick={{ fill: '#4A4845', fontSize: 9, fontFamily: 'Space Mono' }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="tasks"    name="Tasks"    stroke="#F0A500" strokeWidth={1.5} fill="url(#gT)" />
              <Area type="monotone" dataKey="verified" name="Verified" stroke="#00FFB2" strokeWidth={1.5} fill="url(#gV)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Robot type donut */}
        <div className="card" style={{ padding: '1.5rem' }}>
          <div className="f-mono" style={{ fontSize: '0.62rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#F0A500', marginBottom: '1.25rem' }}>
            Robot Type Distribution
          </div>
          <ResponsiveContainer width="100%" height={170}>
            <PieChart>
              <Pie data={ROBOT_DIST} cx="50%" cy="50%" innerRadius={50} outerRadius={75} dataKey="value" paddingAngle={2}>
                {ROBOT_DIST.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.75rem' }}>
            {ROBOT_DIST.map((d, i) => (
              <div key={d.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{ width: 8, height: 8, borderRadius: 1, background: COLORS[i % COLORS.length] }} />
                  <span style={{ fontSize: '0.76rem', color: '#7A7570' }}>{d.name}</span>
                </div>
                <span className="f-mono" style={{ fontSize: '0.65rem', color: '#E2DDD6' }}>{d.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tasks by category bar chart */}
      <div className="card" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
        <div className="f-mono" style={{ fontSize: '0.62rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#F0A500', marginBottom: '1.25rem' }}>
          Tasks by Category (All-Time)
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={TASKS_BY_CAT}>
            <XAxis dataKey="name" tick={{ fill: '#4A4845', fontSize: 9, fontFamily: 'Space Mono' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#4A4845', fontSize: 9, fontFamily: 'Space Mono' }} axisLine={false} tickLine={false} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="count" name="Tasks" radius={[2, 2, 0, 0]}>
              {TASKS_BY_CAT.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Top robots leaderboard */}
      <div className="card" style={{ padding: '1.5rem' }}>
        <div className="f-mono" style={{ fontSize: '0.62rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#F0A500', marginBottom: '1.25rem' }}>
          Top Performers — Reputation Leaderboard
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          <div className="f-mono" style={{
            fontSize: '0.58rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#3A3835',
            display: 'grid', gridTemplateColumns: '28px 1fr 80px 80px 80px 80px',
            gap: '1rem', padding: '0.5rem 0.75rem', borderBottom: '1px solid rgba(240,165,0,0.08)',
          }}>
            <span>#</span><span>Robot</span><span>Type</span><span>Tasks</span><span>Success</span><span>REP</span>
          </div>
          {topRobots.map((r, i) => {
            const score = reputationScore(r);
            const RANK_COLORS = ['#F0A500', '#D0C8C0', '#C8814A', '#5A5550', '#5A5550'];
            return (
              <div key={r.id} style={{
                display: 'grid', gridTemplateColumns: '28px 1fr 80px 80px 80px 80px',
                gap: '1rem', padding: '0.85rem 0.75rem', borderBottom: '1px solid rgba(240,165,0,0.05)',
                background: i === 0 ? 'rgba(240,165,0,0.03)' : 'transparent',
              }}>
                <div className="f-display" style={{ fontSize: '1.1rem', color: RANK_COLORS[i], lineHeight: 1 }}>{i + 1}</div>
                <div>
                  <div style={{ fontSize: '0.85rem', color: '#D0C8C0' }}>{r.name}</div>
                  <div className="f-mono" style={{ fontSize: '0.56rem', color: '#3A3835' }}>{r.id.slice(0, 20)}...</div>
                </div>
                <div style={{ fontSize: '0.76rem', color: '#6A6560', alignSelf: 'center' }}>{r.type.split(' ')[0]}</div>
                <div className="f-display" style={{ fontSize: '1.1rem', color: '#E2DDD6', alignSelf: 'center' }}>{r.tasks}</div>
                <div className="f-display" style={{ fontSize: '1.1rem', color: '#00FFB2', alignSelf: 'center' }}>{r.successRate}%</div>
                <div style={{ alignSelf: 'center' }}>
                  <div className="f-display" style={{ fontSize: '1.1rem', color: '#F0A500', lineHeight: 1 }}>{score}</div>
                  <div style={{ height: 2, background: '#1A1D2A', borderRadius: 1, marginTop: '0.3rem' }}>
                    <div style={{ height: '100%', width: `${score}%`, background: '#F0A500', borderRadius: 1 }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <style>{`
        .chart-row { grid-template-columns: 1fr 380px; }
        @media(max-width: 900px) { .chart-row { grid-template-columns: 1fr; } }
      `}</style>
    </div>
  );
}
