'use client';
import { useState, useEffect } from 'react';
import { Search, Plus, CheckCircle, Copy, X, ChevronRight, Wifi, WifiOff } from 'lucide-react';
import { SAMPLE_ROBOTS, ROBOT_TYPES } from '@/lib/data';
import { loadItems, addItem, storageStatus } from '@/lib/storage';
import { generateRobotId, reputationScore, timeAgo, typeColor } from '@/lib/utils';

const EMPTY = { name: '', type: '', wallet: '', location: '', description: '' };

export default function Registry() {
  const [robots, setRobots]         = useState([]);
  const [form, setForm]             = useState(EMPTY);
  const [errors, setErrors]         = useState({});
  const [minting, setMinting]       = useState(false);
  const [minted, setMinted]         = useState(null);
  const [search, setSearch]         = useState('');
  const [filterType, setFilterType] = useState('All');
  const [copied, setCopied]         = useState(false);
  const [syncStatus, setSyncStatus] = useState('idle'); // idle | syncing | synced | offline

  async function fetchRobots() {
    setSyncStatus('syncing');
    try {
      const data = await loadItems('robots');
      setRobots(data);
      setSyncStatus('synced');
    } catch {
      setSyncStatus('offline');
    }
  }

  useEffect(() => { fetchRobots(); }, []);

  function validate() {
    const e = {};
    if (!form.name.trim())   e.name   = 'Robot name required';
    if (!form.type)          e.type   = 'Select a robot type';
    if (!form.wallet.trim()) e.wallet = 'Operator wallet required';
    else if (!form.wallet.startsWith('0x')) e.wallet = 'Must start with 0x';
    return e;
  }

  async function handleMint(ev) {
    ev.preventDefault();
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    setErrors({});
    setMinting(true);

    await new Promise(r => setTimeout(r, 2200));

    const newRobot = {
      id: generateRobotId(form.name, form.type, form.wallet),
      name: form.name,
      type: form.type,
      operator: form.wallet,
      location: form.location || 'Konnex Testnet Zone-1',
      registeredAt: Date.now(),
      status: 'active',
      tasks: 0,
      successRate: 0,
      lastActive: Date.now(),
      description: form.description || `${form.type} registered on AXIOM subnet.`,
    };

    // Hybrid save — optimistic local + async server
    await addItem('robots', newRobot);
    setRobots(prev => [newRobot, ...prev]);
    setMinting(false);
    setMinted(newRobot);
    setForm(EMPTY);
  }

  function copy(text) {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  const typeLabel = { blue: '#4D9FFF', gold: '#F0A500', green: '#00FFB2', red: '#FF4D6A' };

  const filtered = robots.filter(r => {
    const q = search.toLowerCase();
    const mQ = !q || r.name.toLowerCase().includes(q) || r.id.toLowerCase().includes(q) || r.type.toLowerCase().includes(q);
    const mT = filterType === 'All' || r.type === filterType;
    return mQ && mT;
  });

  return (
    <div className="page-wrap">
      {/* Header */}
      <div className="page-header">
        <div className="page-sub">// Robot Registry</div>
        <h1 className="page-title">IDENTITY REGISTRY</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.5rem' }}>
          <p style={{ color: '#6A6560', fontSize: '0.88rem', maxWidth: 540 }}>
            Mint a permanent on-chain identity for your robot. Data is persisted via Vercel KV with localStorage cache fallback.
          </p>
          {/* Sync indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
            {syncStatus === 'syncing' && <span style={{ width: 8, height: 8, border: '1.5px solid #F0A500', borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />}
            {syncStatus === 'synced'  && <Wifi size={12} color="#00FFB2" />}
            {syncStatus === 'offline' && <WifiOff size={12} color="#FF4D6A" />}
            <span className="f-mono" style={{ fontSize: '0.58rem', color: syncStatus === 'synced' ? '#00FFB2' : syncStatus === 'offline' ? '#FF4D6A' : '#F0A500', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              {syncStatus === 'syncing' ? 'Syncing KV...' : syncStatus === 'synced' ? 'KV Synced' : 'Offline Mode'}
            </span>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr', gap: '2rem', alignItems: 'start' }} className="reg-grid">

        {/* ── FORM ──────────────────────────────────────────────────── */}
        <div>
          <div className="card" style={{ padding: '1.75rem' }}>
            <div className="f-mono" style={{ fontSize: '0.65rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: '#F0A500', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Plus size={12} /> Mint New Identity
            </div>

            <form onSubmit={handleMint} style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
              <div>
                <label>Robot Name *</label>
                <input placeholder="e.g. Sentinel-Alpha" value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
                {errors.name && <div style={{ color: '#FF4D6A', fontSize: '0.72rem', marginTop: '0.3rem', fontFamily: "'Space Mono', monospace" }}>{errors.name}</div>}
              </div>

              <div>
                <label>Robot Type *</label>
                <select value={form.type} onChange={e => setForm({...form, type: e.target.value})}>
                  <option value="">Select type...</option>
                  {ROBOT_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
                {errors.type && <div style={{ color: '#FF4D6A', fontSize: '0.72rem', marginTop: '0.3rem', fontFamily: "'Space Mono', monospace" }}>{errors.type}</div>}
              </div>

              <div>
                <label>Operator Wallet *</label>
                <input placeholder="0x..." value={form.wallet} onChange={e => setForm({...form, wallet: e.target.value})} />
                {errors.wallet && <div style={{ color: '#FF4D6A', fontSize: '0.72rem', marginTop: '0.3rem', fontFamily: "'Space Mono', monospace" }}>{errors.wallet}</div>}
              </div>

              <div>
                <label>Physical Location</label>
                <input placeholder="e.g. Warehouse B, Zone-1" value={form.location} onChange={e => setForm({...form, location: e.target.value})} />
              </div>

              <div>
                <label>Description</label>
                <textarea placeholder="Describe this robot's purpose..." rows={3} value={form.description} onChange={e => setForm({...form, description: e.target.value})} />
              </div>

              <button type="submit" className="btn btn-gold clip-sm" style={{ width: '100%', justifyContent: 'center', fontSize: '0.75rem' }} disabled={minting}>
                {minting ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ width: 12, height: 12, border: '2px solid #06080F', borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />
                    Minting on AXIOM Subnet...
                  </span>
                ) : (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>Mint Robot Identity <ChevronRight size={14} /></span>
                )}
              </button>
            </form>

            {/* Mint success */}
            {minted && (
              <div style={{ marginTop: '1.25rem', background: 'rgba(0,255,178,0.05)', border: '1px solid rgba(0,255,178,0.2)', padding: '1.1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#00FFB2' }}>
                    <CheckCircle size={14} />
                    <span className="f-mono" style={{ fontSize: '0.65rem', letterSpacing: '0.1em' }}>IDENTITY MINTED + SAVED TO KV</span>
                  </div>
                  <button onClick={() => setMinted(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#5A5550' }}><X size={14} /></button>
                </div>
                <div className="f-mono" style={{ fontSize: '0.72rem', color: '#00FFB2', wordBreak: 'break-all', marginBottom: '0.5rem' }}>{minted.id}</div>
                <button onClick={() => copy(minted.id)} className="btn btn-outline" style={{ fontSize: '0.6rem', padding: '0.35rem 0.8rem' }}>
                  <Copy size={10} /> {copied ? 'Copied!' : 'Copy ID'}
                </button>
              </div>
            )}
          </div>

          {/* Storage legend */}
          <div className="card" style={{ padding: '1.25rem', marginTop: '1rem' }}>
            <div className="f-mono" style={{ fontSize: '0.6rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#4A4845', marginBottom: '0.85rem' }}>Hybrid Storage Flow</div>
            {[
              { c: '#00FFB2', label: 'Vercel KV (Redis)', desc: 'Persistent, shared across users' },
              { c: '#F0A500', label: 'localStorage Cache', desc: 'Fast reads, offline fallback' },
            ].map(s => (
              <div key={s.label} style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.65rem', alignItems: 'flex-start' }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: s.c, marginTop: '0.35rem', flexShrink: 0 }} />
                <div>
                  <div className="f-mono" style={{ fontSize: '0.65rem', color: s.c }}>{s.label}</div>
                  <div style={{ fontSize: '0.72rem', color: '#4A4845' }}>{s.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── ROBOTS LIST ──────────────────────────────────────────── */}
        <div>
          <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, position: 'relative', minWidth: 180 }}>
              <Search size={13} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: '#5A5550' }} />
              <input placeholder="Search robots..." value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: '2.25rem' }} />
            </div>
            <select value={filterType} onChange={e => setFilterType(e.target.value)} style={{ width: 'auto', minWidth: 150 }}>
              <option>All</option>
              {ROBOT_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
            <span className="tag tag-gold">{filtered.length} Robots</span>
            <span className="tag tag-green">{filtered.filter(r => r.status === 'active').length} Active</span>
            <span className="tag tag-blue">{filtered.filter(r => r.status === 'idle').length} Idle</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {filtered.length === 0 && (
              <div style={{ color: '#4A4845', fontFamily: "'Space Mono', monospace", fontSize: '0.75rem', padding: '2rem', textAlign: 'center' }}>
                No robots found.
              </div>
            )}
            {filtered.map(r => {
              const c = typeLabel[typeColor(r.type)] || '#4D9FFF';
              const score = reputationScore(r);
              return (
                <div key={r.id} className="card" style={{ padding: '1.25rem', display: 'flex', gap: '1rem' }}>
                  <div style={{ width: 3, background: c, borderRadius: 2, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.35rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <div>
                        <span className="f-display" style={{ fontSize: '1.1rem', color: '#E2DDD6', marginRight: '0.5rem' }}>{r.name}</span>
                        <span className="tag" style={{ color: c, borderColor: c + '44', background: c + '12', fontFamily: "'Space Mono', monospace", fontSize: '0.6rem', letterSpacing: '0.12em', textTransform: 'uppercase', padding: '0.2rem 0.55rem' }}>{r.type}</span>
                      </div>
                      <span className={`tag tag-${r.status === 'active' ? 'green' : 'blue'}`}>{r.status.toUpperCase()}</span>
                    </div>

                    <div className="f-mono" style={{ fontSize: '0.6rem', color: '#4A4845', marginBottom: '0.6rem', wordBreak: 'break-all' }}>{r.id}</div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', marginBottom: '0.6rem' }}>
                      {[
                        { l: 'Tasks', v: r.tasks },
                        { l: 'Success', v: `${r.successRate}%` },
                        { l: 'REP Score', v: score },
                      ].map(m => (
                        <div key={m.l}>
                          <div className="f-display" style={{ fontSize: '1.1rem', color: '#F0A500', lineHeight: 1 }}>{m.v}</div>
                          <div className="f-mono" style={{ fontSize: '0.56rem', color: '#5A5550', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{m.l}</div>
                        </div>
                      ))}
                    </div>

                    <div style={{ height: 2, background: '#1A1D2A', borderRadius: 1, marginBottom: '0.5rem' }}>
                      <div style={{ height: '100%', width: `${score}%`, background: 'linear-gradient(90deg, #F0A500, #00FFB2)', borderRadius: 1 }} />
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '0.72rem', color: '#5A5550' }}>{r.operator}</span>
                      <span className="f-mono" style={{ fontSize: '0.6rem', color: '#4A4845' }}>{timeAgo(r.lastActive)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <style>{`
        .reg-grid { grid-template-columns: 1fr 1.6fr; }
        @media(max-width: 900px) { .reg-grid { grid-template-columns: 1fr; } }
      `}</style>
    </div>
  );
}
