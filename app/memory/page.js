'use client';
import { useState, useEffect } from 'react';
import {
  Search, CheckCircle, AlertTriangle, XCircle,
  Database, Globe, Lock, Hash, RefreshCw, Wifi, WifiOff
} from 'lucide-react';
import { TASK_CATEGORIES, MEMORY_CAP } from '@/lib/data';
import { loadItems }                    from '@/lib/storage';
import { timeAgo, fmtTime, trunc, outcomeColor } from '@/lib/utils';
import { ONCHAIN_BYTES_PER_ENTRY }      from '@/lib/utils';
import {
  DB, loadDB, attachRealtimeListeners, initChain,
  on, off, explorerTxUrl,
} from '@/lib/chain';

const OUTCOMES = ['All', 'SUCCESS', 'PARTIAL', 'FAILED'];
const ICON     = { SUCCESS: CheckCircle, PARTIAL: AlertTriangle, FAILED: XCircle };
const C        = { SUCCESS: '#00FFB2',   PARTIAL: '#F0A500',     FAILED: '#FF4D6A' };

export default function Memory() {
  const [memories, setMemories] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [synced, setSynced]     = useState(false);
  const [search, setSearch]     = useState('');
  const [outcome, setOutcome]   = useState('All');
  const [category, setCategory] = useState('All');
  const [selected, setSelected] = useState(null);

  async function fetchMemories() {
    setLoading(true); setSynced(false);
    try {
      // Primary: Firebase realtime DB
      await initChain();
      await loadDB();
      attachRealtimeListeners();
      // Also load from KV as supplemental
      const kvData = await loadItems('memories').catch(() => []);
      // Merge Firebase + KV, deduplicate by task_id
      const fbMem = [...DB.memory];
      const merged = [...fbMem];
      kvData.forEach(m => {
        if (!merged.find(x => x.task_id === m.task_id)) merged.push(m);
      });
      setMemories(merged.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)));
      setSynced(true);
    } catch { setSynced(false); }
    finally  { setLoading(false); }
  }

  useEffect(() => {
    const onMem = () => {
      const kvMerged = [...DB.memory];
      setMemories([...kvMerged].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)));
    };
    on('memory:updated', onMem);
    fetchMemories();
    return () => off('memory:updated', onMem);
  }, []);

  const filtered = memories.filter(m => {
    const q  = search.toLowerCase();
    const mQ = !q || [m.robotName, m.robotId, m.telemetry_hash, m.ipfs_cid, m.task_id, m.description]
      .some(f => f?.toLowerCase().includes(q));
    const mO = outcome  === 'All' || m.outcome  === outcome;
    const mC = category === 'All' || m.taskType === category;
    return mQ && mO && mC;
  });

  const totalOnchain = memories.length * ONCHAIN_BYTES_PER_ENTRY;
  const totalIPFS    = memories.length; // count of IPFS payloads

  return (
    <div className="page-wrap">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="page-header">
        <div className="page-sub">// Memory Vault</div>
        <h1 className="page-title">TASK MEMORY CHAIN</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
          <p style={{ color: '#6A6560', fontSize: '0.88rem', maxWidth: 540 }}>
            Hybrid memory log — only the 96-byte digest lives on Konnex.
            Full telemetry payloads reference IPFS. Cap: {MEMORY_CAP} entries per robot.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {loading
              ? <span style={{ width: 8, height: 8, border: '1.5px solid #F0A500', borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />
              : synced ? <Wifi size={12} color="#00FFB2" /> : <WifiOff size={12} color="#FF4D6A" />
            }
            <span className="f-mono" style={{ fontSize: '0.58rem', color: loading ? '#F0A500' : synced ? '#00FFB2' : '#FF4D6A', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              {loading ? 'Firebase Loading...' : synced ? 'Firebase Live' : 'Cache Mode'}
            </span>
            <button onClick={fetchMemories} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#5A5550' }}><RefreshCw size={11} /></button>
          </div>
        </div>
      </div>

      {/* ── Storage summary ─────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1px', background: 'rgba(240,165,0,0.08)', marginBottom: '2rem' }}>
        {[
          { label: 'Total Entries',   value: memories.length,                  note: `${MEMORY_CAP} cap/robot` },
          { label: 'Onchain (Konnex)',value: `${(totalOnchain/1024).toFixed(1)} KB`, note: '96 bytes each', color: '#4D9FFF',  icon: Database },
          { label: 'IPFS Payloads',   value: totalIPFS,                        note: '0 bytes onchain', color: '#F0A500', icon: Globe },
          { label: 'Success Rate',    value: `${memories.length ? Math.round(memories.filter(m=>m.outcome==='SUCCESS').length/memories.length*100) : 0}%`, note: 'verified tasks', color: '#00FFB2' },
        ].map(s => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="card" style={{ padding: '1.2rem 1.5rem', background: '#101525' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                <div className="metric-value" style={{ color: s.color || '#E2DDD6' }}>{s.value}</div>
                {Icon && <Icon size={14} color={s.color} style={{ opacity: 0.5, marginTop: '0.4rem' }} />}
              </div>
              <div className="metric-label">{s.label}</div>
              <div style={{ fontFamily: "'Space Mono', monospace", fontSize: '0.54rem', color: '#3A3835', marginTop: '0.15rem' }}>{s.note}</div>
            </div>
          );
        })}
      </div>

      {/* ── Schema legend ───────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1.75rem' }} className="legend-grid">
        {/* Onchain */}
        <div style={{ border: '1px solid rgba(77,159,255,0.2)', background: 'rgba(77,159,255,0.03)', padding: '0.85rem 1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.6rem' }}>
            <Database size={11} color="#4D9FFF" />
            <span className="f-mono" style={{ fontSize: '0.6rem', color: '#4D9FFF', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Onchain Digest (96 bytes)</span>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {['task_id', 'telemetry_hash', 'popw_score', 'block_number'].map(f => (
              <span key={f} className="tag" style={{ background: 'rgba(77,159,255,0.08)', border: '1px solid rgba(77,159,255,0.2)', color: '#4D9FFF', fontFamily: "'Space Mono', monospace", fontSize: '0.55rem', letterSpacing: '0.08em', padding: '0.2rem 0.5rem' }}>{f}</span>
            ))}
          </div>
        </div>
        {/* IPFS */}
        <div style={{ border: '1px solid rgba(240,165,0,0.15)', background: 'rgba(240,165,0,0.02)', padding: '0.85rem 1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.6rem' }}>
            <Globe size={11} color="#F0A500" />
            <span className="f-mono" style={{ fontSize: '0.6rem', color: '#F0A500', letterSpacing: '0.1em', textTransform: 'uppercase' }}>IPFS Offchain (0 bytes onchain)</span>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {['sensor_streams', 'trajectory_traces', 'motion_policy', 'env_map'].map(f => (
              <span key={f} className="tag" style={{ background: 'rgba(240,165,0,0.06)', border: '1px solid rgba(240,165,0,0.15)', color: '#7A6530', fontFamily: "'Space Mono', monospace", fontSize: '0.55rem', letterSpacing: '0.08em', padding: '0.2rem 0.5rem' }}>
                <Lock size={7} style={{ display: 'inline', marginRight: '0.25rem' }} />{f}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ── Filters ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, position: 'relative', minWidth: 220 }}>
          <Search size={13} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: '#5A5550' }} />
          <input placeholder="Search by robot, task_id, telemetry hash..." value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: '2.25rem' }} />
        </div>
        <select value={outcome}  onChange={e => setOutcome(e.target.value)}  style={{ width: 'auto', minWidth: 130 }}>{OUTCOMES.map(o => <option key={o}>{o}</option>)}</select>
        <select value={category} onChange={e => setCategory(e.target.value)} style={{ width: 'auto', minWidth: 200 }}>
          <option>All</option>
          {TASK_CATEGORIES.map(c => <option key={c}>{c}</option>)}
        </select>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: selected ? '1fr 380px' : '1fr', gap: '1.5rem', alignItems: 'start' }}>

        {/* ── Table ───────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {/* Column headers */}
          <div className="f-mono" style={{
            fontSize: '0.56rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#3A3835',
            display: 'grid', gridTemplateColumns: '90px 50px 1fr 140px 60px 70px',
            gap: '0.75rem', padding: '0.55rem 1rem', borderBottom: '1px solid rgba(240,165,0,0.08)',
          }}>
            <span>Block</span><span>Score</span><span>Task / Robot</span><span>Hashes</span><span>Duration</span><span>Status</span>
          </div>

          {loading && (
            <div style={{ color: '#4A4845', fontFamily: "'Space Mono', monospace", fontSize: '0.75rem', padding: '3rem', textAlign: 'center' }}>
              Loading from Vercel KV...
            </div>
          )}
          {!loading && filtered.length === 0 && (
            <div style={{ color: '#4A4845', fontFamily: "'Space Mono', monospace", fontSize: '0.75rem', padding: '3rem', textAlign: 'center' }}>No memories found.</div>
          )}

          {filtered.map((m, i) => {
            const Icon  = ICON[m.outcome] || CheckCircle;
            const col   = C[m.outcome]   || '#4D9FFF';
            const isSel = selected?.id === m.id;
            return (
              <div key={m.id} onClick={() => setSelected(isSel ? null : m)} style={{
                display: 'grid', gridTemplateColumns: '90px 50px 1fr 140px 60px 70px',
                gap: '0.75rem', padding: '0.85rem 1rem', cursor: 'pointer',
                borderBottom: '1px solid rgba(240,165,0,0.05)',
                background: isSel ? 'rgba(240,165,0,0.04)' : i % 2 === 0 ? '#101525' : '#0F1220',
                borderLeft: isSel ? '2px solid #F0A500' : '2px solid transparent',
                transition: 'background 0.15s',
              }}>
                {/* Block */}
                <div>
                  <div className="f-mono" style={{ fontSize: '0.62rem', color: '#4D9FFF' }}>#{m.block_number?.toLocaleString() || m.blockHeight?.toLocaleString()}</div>
                  <div className="f-mono" style={{ fontSize: '0.54rem', color: '#3A3835' }}>{timeAgo(m.timestamp)}</div>
                </div>
                {/* PoPW score */}
                <div>
                  {m.popw_score != null
                    ? <div className="f-display" style={{ fontSize: '1.1rem', color: '#F0A500', lineHeight: 1 }}>{m.popw_score}</div>
                    : <div className="f-mono" style={{ fontSize: '0.58rem', color: '#3A3835' }}>—</div>
                  }
                </div>
                {/* Task + Robot */}
                <div>
                  <div style={{ fontSize: '0.78rem', color: '#D0C8C0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: '0.15rem' }}>{m.taskType}</div>
                  <div style={{ fontSize: '0.71rem', color: '#5A5550' }}>{m.robotName}</div>
                </div>
                {/* Hashes */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginBottom: '0.2rem' }}>
                    <Database size={8} color="#4D9FFF" />
                    <span className="f-mono" style={{ fontSize: '0.54rem', color: '#4D9FFF' }}>{trunc(m.telemetry_hash || m.popwHash, 8, 4)}</span>
                  </div>
                  {m.ipfs_cid && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      <Globe size={8} color="#F0A500" />
                      <span className="f-mono" style={{ fontSize: '0.54rem', color: '#7A6530' }}>{trunc(m.ipfs_cid, 6, 4)}</span>
                    </div>
                  )}
                </div>
                {/* Duration */}
                <div style={{ fontSize: '0.72rem', color: '#5A5550', alignSelf: 'center' }}>{m.duration}</div>
                {/* Status */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <Icon size={11} color={col} />
                  <span className="f-mono" style={{ fontSize: '0.56rem', color: col }}>{m.outcome}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Detail panel ────────────────────────────────────────────────── */}
        {selected && (
          <div className="card" style={{ padding: '1.5rem', position: 'sticky', top: 80 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
              <span className="f-mono" style={{ fontSize: '0.62rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#F0A500' }}>Memory Detail</span>
              <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#5A5550' }}><XCircle size={14} /></button>
            </div>

            <div className="f-display" style={{ fontSize: '1.1rem', color: '#E2DDD6', marginBottom: '0.2rem' }}>{selected.robotName}</div>
            <div style={{ fontSize: '0.78rem', color: '#5A5550', marginBottom: '1.25rem' }}>{selected.taskType}</div>

            {/* ── ONCHAIN DIGEST ── */}
            <div style={{ border: '1px solid rgba(77,159,255,0.25)', background: 'rgba(77,159,255,0.04)', padding: '0.9rem', marginBottom: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.75rem' }}>
                <Database size={11} color="#4D9FFF" />
                <span className="f-mono" style={{ fontSize: '0.58rem', color: '#4D9FFF', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                  Onchain Digest · {ONCHAIN_BYTES_PER_ENTRY} bytes
                </span>
              </div>
              {[
                { l: 'task_id',        v: selected.task_id || selected.id,                    c: '#E2DDD6' },
                { l: 'telemetry_hash', v: trunc(selected.telemetry_hash || selected.popwHash || selected.ipfs_cid, 14, 8), c: '#00FFB2' },
                { l: 'popw_score',     v: selected.popw_score != null ? `${selected.popw_score} / 100` : '—',             c: '#F0A500' },
                { l: 'block_number',   v: `#${(selected.block_number || selected.blockHeight)?.toLocaleString()}`,         c: '#4D9FFF' },
              ].map(f => (
                <div key={f.l} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                  <span className="f-mono" style={{ fontSize: '0.58rem', color: '#3A3835' }}>{f.l}</span>
                  <span className="f-mono" style={{ fontSize: '0.6rem', color: f.c }}>{f.v}</span>
                </div>
              ))}
              {/* Commit timeline */}
              {selected.commit_phase && (
                <div style={{ borderTop: '1px solid rgba(77,159,255,0.1)', marginTop: '0.6rem', paddingTop: '0.6rem' }}>
                  {[
                    { l: 'Committed', v: timeAgo(selected.commit_phase) },
                    { l: 'Revealed',  v: timeAgo(selected.reveal_phase) },
                    { l: 'Scored',    v: timeAgo(selected.score_phase)  },
                  ].map(f => (
                    <div key={f.l} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                      <span className="f-mono" style={{ fontSize: '0.56rem', color: '#3A3835' }}>{f.l}</span>
                      <span className="f-mono" style={{ fontSize: '0.56rem', color: '#4A4845' }}>{f.v}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── OFFCHAIN / IPFS ── */}
            <div style={{ border: '1px solid rgba(240,165,0,0.15)', background: 'rgba(240,165,0,0.02)', padding: '0.9rem', marginBottom: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.75rem' }}>
                <Globe size={11} color="#F0A500" />
                <span className="f-mono" style={{ fontSize: '0.58rem', color: '#F0A500', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                  IPFS Payload · 0 bytes onchain
                </span>
              </div>
              {selected.ipfs_cid
                ? <>
                    <div className="f-mono" style={{ fontSize: '0.62rem', color: '#F0A500', wordBreak: 'break-all', marginBottom: '0.5rem' }}>{selected.ipfs_cid}</div>
                    <div style={{ fontSize: '0.7rem', color: '#3A3835' }}>Full telemetry: sensor streams, trajectory traces, raw execution data.</div>
                  </>
                : <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Lock size={9} color="#3A3835" />
                    <span className="f-mono" style={{ fontSize: '0.6rem', color: '#3A3835' }}>No IPFS payload (legacy entry)</span>
                  </div>
              }
            </div>

            {/* ── Meta ── */}
            <div style={{ marginBottom: '0.85rem' }}>
              {[
                { l: 'Description', v: selected.description },
                { l: 'Duration',    v: selected.duration },
                { l: 'Timestamp',   v: fmtTime(selected.timestamp) },
              ].map(f => f.v && (
                <div key={f.l} style={{ marginBottom: '0.6rem' }}>
                  <div className="f-mono" style={{ fontSize: '0.56rem', color: '#3A3835', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.2rem' }}>{f.l}</div>
                  <div style={{ fontSize: '0.78rem', color: '#8A8580' }}>{f.v}</div>
                </div>
              ))}
            </div>

            <a href="https://subnets.testnet.konnex.world" target="_blank" rel="noopener noreferrer">
              <button className="btn btn-outline" style={{ fontSize: '0.6rem', width: '100%', justifyContent: 'center' }}>View on Konnex Explorer</button>
            </a>
          </div>
        )}
      </div>

      <style>{`
        .legend-grid { grid-template-columns: 1fr 1fr; }
        @media(max-width: 700px) { .legend-grid { grid-template-columns: 1fr; } }
      `}</style>
    </div>
  );
}
