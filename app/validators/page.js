'use client';
import { useState } from 'react';
import {
  Shield, AlertTriangle, CheckCircle, XCircle,
  Clock, Zap, TrendingDown, Award, Lock
} from 'lucide-react';
import { VALIDATOR_POOL, SAMPLE_CHALLENGES } from '@/lib/data';
import { challengeTimeLeft, timeAgo } from '@/lib/utils';

const LAYER_COLORS = ['#4D9FFF','#F0A500','#FF4D6A','#00FFB2','#B44DFF'];

const LAYERS = [
  {
    n: '01', color: '#4D9FFF', icon: Shield,
    title: 'Random Sampling',
    body: 'Each task assigns 3–5 validators randomly. Each checks different sections of the IPFS payload — enough to detect fraud without full download. Section assignments are unpredictable, making targeted lazy behaviour impossible.',
    tag: 'ANTI-COLLUSION',
  },
  {
    n: '02', color: '#F0A500', icon: CheckCircle,
    title: '70% Consensus',
    body: 'Score accepted only when ≥70% of assigned validators agree (within ±15 pts of median). Deviating scores automatically trigger a challenge round with fresh validators.',
    tag: 'CONSENSUS',
  },
  {
    n: '03', color: '#FF4D6A', icon: TrendingDown,
    title: 'Staking & Slashing',
    body: 'Validators stake testKNX at registration. Wrong scores that lose a challenge result in stake slash. Honest validators earn proportional rewards per task. Skin in the game.',
    tag: 'ECONOMIC',
  },
  {
    n: '04', color: '#00FFB2', icon: Clock,
    title: '24-Hour Challenge Window',
    body: 'Any validator or external watcher can raise a dispute within 24 hours. Successful challenges slash the dishonest validator and reward the challenger. Open participation.',
    tag: 'DISPUTE',
  },
  {
    n: '05', color: '#B44DFF', icon: Award,
    title: 'Reputation System',
    body: 'Lazy validators accumulate low reputation scores and receive fewer task assignments over time. Eventually pushed out of the active pool. Self-healing network.',
    tag: 'LONG-TERM',
  },
];

export default function Validators() {
  const [tab, setTab] = useState('pool'); // pool | challenges | roadmap

  const activeCount    = VALIDATOR_POOL.filter(v => v.status === 'active').length;
  const totalStaked    = VALIDATOR_POOL.reduce((s, v) => s + v.stake, 0);
  const avgReputation  = Math.round(VALIDATOR_POOL.filter(v=>v.status==='active').reduce((s,v)=>s+v.reputation,0) / activeCount);
  const totalSlashes   = VALIDATOR_POOL.reduce((s, v) => s + v.slashes, 0);

  return (
    <div className="page-wrap">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="page-header">
        <div className="page-sub">// Validator Network</div>
        <h1 className="page-title">LAZY VALIDATOR<br />PREVENTION</h1>
        <p style={{ color: '#6A6560', fontSize: '0.88rem', marginTop: '0.5rem', maxWidth: 560 }}>
          Five-layer system ensuring validators actually verify telemetry — not just submit random scores for rewards. Economic incentives aligned with honest behaviour.
        </p>
      </div>

      {/* ── 5 Layers overview ───────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1px', background: 'rgba(240,165,0,0.08)', marginBottom: '2.5rem' }}>
        {LAYERS.map((l) => {
          const Icon = l.icon;
          return (
            <div key={l.n} className="card" style={{ padding: '1.5rem', background: '#101525', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: l.color }} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.85rem' }}>
                <div style={{ width: 32, height: 32, background: l.color + '14', border: `1px solid ${l.color}35`, display: 'flex', alignItems: 'center', justifyContent: 'center', clipPath: 'polygon(0 0, calc(100% - 5px) 0, 100% 5px, 100% 100%, 5px 100%, 0 calc(100% - 5px))' }}>
                  <Icon size={14} color={l.color} />
                </div>
                <span className="f-mono" style={{ fontSize: '0.55rem', color: l.color, letterSpacing: '0.1em', padding: '0.15rem 0.5rem', background: l.color + '12', border: `1px solid ${l.color}30` }}>{l.tag}</span>
              </div>
              <div className="f-display" style={{ fontSize: '1.1rem', color: '#E2DDD6', marginBottom: '0.5rem' }}>{l.n} — {l.title}</div>
              <p style={{ fontSize: '0.76rem', color: '#5A5550', lineHeight: 1.65 }}>{l.body}</p>
            </div>
          );
        })}
      </div>

      {/* ── Stats ───────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1px', background: 'rgba(240,165,0,0.08)', marginBottom: '2rem' }}>
        {[
          { l: 'Active Validators', v: activeCount,                    c: '#00FFB2' },
          { l: 'Total Staked',      v: `${(totalStaked/1000).toFixed(1)}k KNX`, c: '#F0A500' },
          { l: 'Avg Reputation',    v: `${avgReputation}/100`,          c: '#4D9FFF' },
          { l: 'Total Slashes',     v: totalSlashes,                    c: '#FF4D6A' },
        ].map(s => (
          <div key={s.l} className="card" style={{ padding: '1.2rem 1.5rem', background: '#101525' }}>
            <div className="metric-value" style={{ color: s.c }}>{s.v}</div>
            <div className="metric-label">{s.l}</div>
          </div>
        ))}
      </div>

      {/* ── Tabs ────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: '0', marginBottom: '1.5rem', borderBottom: '1px solid rgba(240,165,0,0.1)' }}>
        {[
          { key: 'pool',       label: 'Validator Pool' },
          { key: 'challenges', label: `Challenges (${SAMPLE_CHALLENGES.length})` },
          { key: 'roadmap',    label: 'ZK Roadmap' },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontFamily: "'Space Mono', monospace", fontSize: '0.68rem',
            letterSpacing: '0.08em', textTransform: 'uppercase',
            padding: '0.6rem 1.1rem',
            color: tab === t.key ? '#F0A500' : '#5A5550',
            borderBottom: tab === t.key ? '2px solid #F0A500' : '2px solid transparent',
            marginBottom: '-1px', transition: 'color 0.2s',
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab: Validator Pool ─────────────────────────────────────────── */}
      {tab === 'pool' && (
        <div>
          {/* Table header */}
          <div className="f-mono" style={{ fontSize: '0.56rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#3A3835', display: 'grid', gridTemplateColumns: '70px 1fr 100px 80px 100px 80px 80px', gap: '0.75rem', padding: '0.55rem 1rem', borderBottom: '1px solid rgba(240,165,0,0.08)' }}>
            <span>ID</span><span>Address / Speciality</span><span>Staked</span><span>Rep</span><span>Tasks Scored</span><span>Slashes</span><span>Status</span>
          </div>

          {VALIDATOR_POOL.map((v, i) => {
            const repColor = v.reputation >= 90 ? '#00FFB2' : v.reputation >= 70 ? '#F0A500' : '#FF4D6A';
            return (
              <div key={v.id} style={{
                display: 'grid', gridTemplateColumns: '70px 1fr 100px 80px 100px 80px 80px',
                gap: '0.75rem', padding: '0.9rem 1rem',
                borderBottom: '1px solid rgba(240,165,0,0.05)',
                background: i % 2 === 0 ? '#101525' : '#0F1220',
                opacity: v.status === 'suspended' ? 0.5 : 1,
              }}>
                <div className="f-mono" style={{ fontSize: '0.65rem', color: '#F0A500' }}>{v.id}</div>
                <div>
                  <div className="f-mono" style={{ fontSize: '0.65rem', color: '#8A8580' }}>{v.addr}</div>
                  <div style={{ fontSize: '0.7rem', color: '#4A4845' }}>{v.speciality}</div>
                </div>
                <div className="f-display" style={{ fontSize: '1rem', color: '#E2DDD6', alignSelf: 'center' }}>
                  {(v.stake / 1000).toFixed(1)}k
                </div>
                <div style={{ alignSelf: 'center' }}>
                  <div className="f-display" style={{ fontSize: '1rem', color: repColor, lineHeight: 1 }}>{v.reputation}</div>
                  <div style={{ height: 2, background: '#1A1D2A', borderRadius: 1, marginTop: '0.25rem', width: 40 }}>
                    <div style={{ height: '100%', width: `${v.reputation}%`, background: repColor, borderRadius: 1 }} />
                  </div>
                </div>
                <div className="f-display" style={{ fontSize: '1rem', color: '#D0C8C0', alignSelf: 'center' }}>
                  {v.tasksScored.toLocaleString()}
                </div>
                <div style={{ alignSelf: 'center' }}>
                  {v.slashes > 0
                    ? <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        <TrendingDown size={11} color="#FF4D6A" />
                        <span className="f-display" style={{ fontSize: '1rem', color: '#FF4D6A' }}>{v.slashes}</span>
                      </span>
                    : <CheckCircle size={14} color="#00FFB2" />
                  }
                </div>
                <div style={{ alignSelf: 'center' }}>
                  <span className={`tag tag-${v.status === 'active' ? 'green' : 'red'}`} style={{ fontSize: '0.55rem' }}>
                    {v.status.toUpperCase()}
                  </span>
                </div>
              </div>
            );
          })}

          {/* Consensus explainer */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1.5rem' }} className="consensus-grid">
            <div className="card" style={{ padding: '1.25rem' }}>
              <div className="f-mono" style={{ fontSize: '0.6rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#F0A500', marginBottom: '0.85rem' }}>
                Consensus Logic
              </div>
              {[
                { l: 'Validators per task', v: '3–5 (random)'     },
                { l: 'Agreement threshold', v: '70% of assigned'  },
                { l: 'Deviation tolerance', v: '±15 pts of median'},
                { l: 'Challenge trigger',   v: 'Any deviant score' },
                { l: 'Challenge validators',v: '2 fresh picks'    },
              ].map(r => (
                <div key={r.l} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.45rem' }}>
                  <span style={{ fontSize: '0.76rem', color: '#5A5550' }}>{r.l}</span>
                  <span className="f-mono" style={{ fontSize: '0.68rem', color: '#E2DDD6' }}>{r.v}</span>
                </div>
              ))}
            </div>
            <div className="card" style={{ padding: '1.25rem' }}>
              <div className="f-mono" style={{ fontSize: '0.6rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#FF4D6A', marginBottom: '0.85rem' }}>
                Slashing Rules
              </div>
              {[
                { l: 'Deviant score loses challenge', v: '10% stake slash' },
                { l: 'Repeat offence (3+)',           v: '25% stake slash' },
                { l: 'Proven collusion',              v: '100% slash + ban'},
                { l: 'Honest score reward',           v: '+0.5% per task'  },
                { l: 'Successful challenge',          v: 'Slash redistributed'},
              ].map(r => (
                <div key={r.l} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.45rem' }}>
                  <span style={{ fontSize: '0.76rem', color: '#5A5550' }}>{r.l}</span>
                  <span className="f-mono" style={{ fontSize: '0.68rem', color: '#FF4D6A' }}>{r.v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Tab: Challenges ─────────────────────────────────────────────── */}
      {tab === 'challenges' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {SAMPLE_CHALLENGES.map(c => (
            <div key={c.id} className="card" style={{ padding: '1.5rem', borderLeft: '3px solid #F0A500' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                    <AlertTriangle size={14} color="#F0A500" />
                    <span className="f-mono" style={{ fontSize: '0.68rem', color: '#F0A500', letterSpacing: '0.1em' }}>{c.id}</span>
                    <span className="tag tag-gold" style={{ fontSize: '0.55rem' }}>{c.status}</span>
                  </div>
                  <div className="f-display" style={{ fontSize: '1.1rem', color: '#E2DDD6' }}>{c.robotName}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.25rem' }}>
                    <Clock size={10} color="#00FFB2" />
                    <span className="f-mono" style={{ fontSize: '0.62rem', color: '#00FFB2' }}>
                      {challengeTimeLeft(c.raisedAt)} remaining
                    </span>
                  </div>
                  <div className="f-mono" style={{ fontSize: '0.58rem', color: '#4A4845' }}>Raised {timeAgo(c.raisedAt)}</div>
                </div>
              </div>

              <div style={{ background: '#06080F', border: '1px solid rgba(240,165,0,0.1)', padding: '0.85rem', marginBottom: '1rem' }}>
                <div style={{ fontSize: '0.78rem', color: '#8A8580', marginBottom: '0.75rem' }}>{c.reason}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
                  {[
                    { l: 'Consensus Score', v: c.consensusScore, c: '#00FFB2' },
                    { l: 'Disputed Score',  v: c.disputedScore,  c: '#FF4D6A' },
                    { l: 'Delta',           v: `+${c.consensusScore - c.disputedScore}`, c: '#F0A500' },
                  ].map(f => (
                    <div key={f.l}>
                      <div className="f-display" style={{ fontSize: '1.5rem', color: f.c, lineHeight: 1 }}>{f.v}</div>
                      <div className="f-mono" style={{ fontSize: '0.56rem', color: '#3A3835', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{f.l}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                {[
                  { l: 'Task ID',    v: c.taskId     },
                  { l: 'Challenger', v: c.challenger  },
                  { l: 'Challenged', v: `${c.challenged}` },
                ].map(f => (
                  <div key={f.l}>
                    <div className="f-mono" style={{ fontSize: '0.56rem', color: '#3A3835', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.15rem' }}>{f.l}</div>
                    <div className="f-mono" style={{ fontSize: '0.62rem', color: '#8A8580' }}>{f.v}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div className="card" style={{ padding: '1.25rem', borderLeft: '3px solid rgba(240,165,0,0.15)' }}>
            <div className="f-mono" style={{ fontSize: '0.6rem', color: '#3A3835', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
              Challenge Window Rules
            </div>
            <div style={{ fontSize: '0.78rem', color: '#4A4845', lineHeight: 1.7 }}>
              Any validator or external watcher can raise a dispute within <strong style={{ color: '#D0C8C0' }}>24 hours</strong> of a score being committed. Successful challenges slash the dishonest validator and redistribute the slashed stake to the challenger. Expired challenges are auto-closed.
            </div>
          </div>
        </div>
      )}

      {/* ── Tab: ZK Roadmap ─────────────────────────────────────────────── */}
      {tab === 'roadmap' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }} className="zk-grid">

            {/* Current */}
            <div className="card" style={{ padding: '1.5rem', borderTop: '2px solid #F0A500' }}>
              <div className="f-mono" style={{ fontSize: '0.62rem', color: '#F0A500', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '1.25rem' }}>
                Now — SPARK Tier
              </div>
              <div className="f-display" style={{ fontSize: '1.5rem', color: '#E2DDD6', marginBottom: '1rem' }}>5-Layer Classical Verification</div>
              {['Random sampling (partial payload)', '70% consensus threshold', 'Stake-based slashing', '24h challenge window', 'Reputation decay'].map(item => (
                <div key={item} style={{ display: 'flex', gap: '0.6rem', marginBottom: '0.5rem' }}>
                  <CheckCircle size={13} color="#F0A500" style={{ flexShrink: 0, marginTop: '0.15rem' }} />
                  <span style={{ fontSize: '0.78rem', color: '#6A6560' }}>{item}</span>
                </div>
              ))}
            </div>

            {/* ZK Future */}
            <div className="card" style={{ padding: '1.5rem', borderTop: '2px solid #B44DFF' }}>
              <div className="f-mono" style={{ fontSize: '0.62rem', color: '#B44DFF', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '1.25rem' }}>
                LAUNCH Tier — ZK Integration
              </div>
              <div className="f-display" style={{ fontSize: '1.5rem', color: '#E2DDD6', marginBottom: '1rem' }}>RISC Zero / SP1</div>
              {[
                'Validators prove correct scoring without downloading full telemetry',
                'Chain verifies proof mathematically — O(1) verification',
                'Proprietary motion policies never leave operator control',
                'Sub-second proof generation on modern hardware',
                'Eliminates need for challenge rounds entirely',
              ].map(item => (
                <div key={item} style={{ display: 'flex', gap: '0.6rem', marginBottom: '0.5rem' }}>
                  <Lock size={13} color="#B44DFF" style={{ flexShrink: 0, marginTop: '0.15rem' }} />
                  <span style={{ fontSize: '0.78rem', color: '#6A6560' }}>{item}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ZK explainer */}
          <div className="card" style={{ padding: '1.5rem' }}>
            <div className="f-mono" style={{ fontSize: '0.62rem', color: '#B44DFF', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '1rem' }}>
              How ZK Proof Replaces Validator Downloads
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.25rem' }}>
              {[
                { step: '01', title: 'Operator proves', body: 'Generates a ZK proof that telemetry matches committed hash — locally, without sharing raw data.' },
                { step: '02', title: 'Proof submitted', body: 'Compact proof (~200KB) submitted on-chain. No raw telemetry needed. Full payload stays on IPFS.' },
                { step: '03', title: 'Chain verifies', body: 'Konnex subnet verifies the proof mathematically. If valid → PoPW score auto-committed. No validators needed.' },
                { step: '04', title: 'Privacy preserved', body: 'Proprietary motion policies, env maps, and sensor data never leave the operator. Mathematical guarantee.' },
              ].map(s => (
                <div key={s.step}>
                  <div className="f-display" style={{ fontSize: '2rem', color: 'rgba(180,77,255,0.2)', lineHeight: 1, marginBottom: '0.5rem' }}>{s.step}</div>
                  <div className="f-display" style={{ fontSize: '1rem', color: '#B44DFF', marginBottom: '0.35rem' }}>{s.title}</div>
                  <div style={{ fontSize: '0.76rem', color: '#5A5550', lineHeight: 1.65 }}>{s.body}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <style>{`
        .consensus-grid { grid-template-columns: 1fr 1fr; }
        .zk-grid        { grid-template-columns: 1fr 1fr; }
        @media(max-width: 700px) {
          .consensus-grid { grid-template-columns: 1fr; }
          .zk-grid        { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}
