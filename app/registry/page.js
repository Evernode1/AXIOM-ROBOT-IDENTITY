'use client';
import { useState, useEffect, useCallback } from 'react';
import { Search, Plus, CheckCircle, Copy, X, ChevronRight, Wifi, WifiOff, ExternalLink, Wallet } from 'lucide-react';
import { ROBOT_TYPES } from '@/lib/data';
import { reputationScore, timeAgo, typeColor } from '@/lib/utils';
import {
  WALLET, CHAIN, EXPLORER,
  registerRobotOnchain, loadDB, DB,
  on, off, initChain,
  shortAddr, explorerTxUrl,
} from '@/lib/chain';

const EMPTY = { name: '', type: '', location: '', description: '' };

export default function Registry() {
  const [robots, setRobots]         = useState([]);
  const [form, setForm]             = useState(EMPTY);
  const [errors, setErrors]         = useState({});
  const [minting, setMinting]       = useState(false);
  const [mintStep, setMintStep]     = useState('');
  const [minted, setMinted]         = useState(null);
  const [search, setSearch]         = useState('');
  const [filterType, setFilterType] = useState('All');
  const [copied, setCopied]         = useState(false);
  const [syncStatus, setSyncStatus] = useState('idle');
  const [walletState, setWalletState] = useState({ connected: false, address: null, name: null });

  const syncWallet = useCallback(() => {
    setWalletState({ connected: WALLET.connected, address: WALLET.address, name: WALLET.name });
  }, []);

  async function fetchRobots() {
    setSyncStatus('syncing');
    try {
      await loadDB();
      setRobots([...DB.robots]);
      setSyncStatus('synced');
    } catch {
      setSyncStatus('offline');
    }
  }

  useEffect(() => {
    syncWallet();
    initChain().catch(console.warn);

    const onRobotsUpdated = (r) => setRobots([...r]);
    const onWalConn  = () => syncWallet();
    const onWalDisconn = () => syncWallet();
    on('robots:updated', onRobotsUpdated);
    on('wallet:connected', onWalConn);
    on('wallet:disconnected', onWalDisconn);

    fetchRobots();

    return () => {
      off('robots:updated', onRobotsUpdated);
      off('wallet:connected', onWalConn);
      off('wallet:disconnected', onWalDisconn);
    };
  }, [syncWallet]);

  function validate() {
    const e = {};
    if (!form.name.trim()) e.name = 'Robot name required';
    if (!form.type)        e.type = 'Select a robot type';
    if (!walletState.connected) e._wallet = 'Pehle wallet connect karo (Navbar se)';
    return e;
  }

  async function handleMint(ev) {
    ev.preventDefault();
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    setErrors({});
    setMinting(true);
    setMinted(null);

    try {
      setMintStep('Signing transaction — wallet approve karo...');
      const robot = await registerRobotOnchain(
        WALLET.address,
        form.name,
        form.type,
        { label: form.name, type: form.type, location: form.location || 'Konnex Testnet Zone-1' }
      );
      setMintStep('Robot registered! Firebase mein save ho raha hai...');
      setMinted({
        ...robot,
        name: form.name,
        type: form.type,
        location: form.location || 'Konnex Testnet Zone-1',
        description: form.description,
      });
      setForm(EMPTY);
    } catch (err) {
      const msg = err.message || String(err);
      if (/cancel|reject|denied/i.test(msg)) {
        setErrors({ _wallet: 'Transaction cancel kar diya — wallet mein Approve dabao' });
      } else {
        setErrors({ _wallet: 'Error: ' + msg });
      }
    } finally {
      setMinting(false);
      setMintStep('');
    }
  }

  function copy(text) {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  const typeLabel = { blue: '#4D9FFF', gold: '#F0A500', green: '#00FFB2', red: '#FF4D6A' };

  const filtered = robots.filter(r => {
    const q = search.toLowerCase();
    const name = r.metadata?.label || r.name || '';
    const type = r.metadata?.type || r.type || '';
    const mQ = !q || name.toLowerCase().includes(q) || (r.robot_id || r.id || '').toLowerCase().includes(q) || type.toLowerCase().includes(q);
    const mT = filterType === 'All' || type === filterType;
    return mQ && mT;
  });

  return (
    <div className="page-wrap">
      <div className="page-header">
        <div className="page-sub">// Robot Registry</div>
        <h1 className="page-title">IDENTITY REGISTRY</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.5rem' }}>
          <p style={{ color: '#6A6560', fontSize: '0.88rem', maxWidth: 540 }}>
            Real onchain identity mint karo — Konnex Testnet pe system.remark tx + Firebase Firestore persistence.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
            {syncStatus === 'syncing' && <span style={{ width: 8, height: 8, border: '1.5px solid #F0A500', borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />}
            {syncStatus === 'synced'  && <Wifi size={12} color="#00FFB2" />}
            {syncStatus === 'offline' && <WifiOff size={12} color="#FF4D6A" />}
            <span className="f-mono" style={{ fontSize: '0.58rem', color: syncStatus === 'synced' ? '#00FFB2' : syncStatus === 'offline' ? '#FF4D6A' : '#F0A500', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              {syncStatus === 'syncing' ? 'Firebase Loading...' : syncStatus === 'synced' ? 'Onchain Synced' : 'Offline'}
            </span>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr', gap: '2rem', alignItems: 'start' }} className="reg-grid">

        {/* ── FORM ── */}
        <div>
          {/* Wallet status banner */}
          {!walletState.connected && (
            <div style={{ background: 'rgba(240,165,0,0.06)', border: '1px solid rgba(240,165,0,0.25)', padding: '0.9rem 1.1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <Wallet size={14} color="#F0A500" />
              <span className="f-mono" style={{ fontSize: '0.65rem', color: '#F0A500' }}>Wallet connect karo (Navbar) — real onchain tx ke liye</span>
            </div>
          )}
          {walletState.connected && (
            <div style={{ background: 'rgba(0,255,178,0.05)', border: '1px solid rgba(0,255,178,0.2)', padding: '0.75rem 1.1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <CheckCircle size={14} color="#00FFB2" />
              <span className="f-mono" style={{ fontSize: '0.62rem', color: '#00FFB2' }}>
                {walletState.name} — {shortAddr(walletState.address)}
              </span>
            </div>
          )}

          <div className="card" style={{ padding: '1.75rem' }}>
            <div className="f-mono" style={{ fontSize: '0.65rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: '#F0A500', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Plus size={12} /> Mint New Identity (Onchain)
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
                <label>Physical Location</label>
                <input placeholder="e.g. Warehouse B, Zone-1" value={form.location} onChange={e => setForm({...form, location: e.target.value})} />
              </div>

              <div>
                <label>Description</label>
                <textarea placeholder="Describe this robot's purpose..." rows={3} value={form.description} onChange={e => setForm({...form, description: e.target.value})} />
              </div>

              {errors._wallet && (
                <div style={{ background: 'rgba(255,77,106,0.08)', border: '1px solid rgba(255,77,106,0.3)', padding: '0.75rem', color: '#FF4D6A', fontFamily: "'Space Mono', monospace", fontSize: '0.68rem' }}>
                  ⚠ {errors._wallet}
                </div>
              )}

              <button type="submit" className="btn btn-gold clip-sm" style={{ width: '100%', justifyContent: 'center', fontSize: '0.75rem' }} disabled={minting}>
                {minting ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ width: 12, height: 12, border: '2px solid #06080F', borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />
                    {mintStep || 'Onchain tx sending...'}
                  </span>
                ) : (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>Mint Robot Identity (Konnex Testnet) <ChevronRight size={14} /></span>
                )}
              </button>
            </form>

            {minted && (
              <div style={{ marginTop: '1.25rem', background: 'rgba(0,255,178,0.05)', border: '1px solid rgba(0,255,178,0.2)', padding: '1.1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#00FFB2' }}>
                    <CheckCircle size={14} />
                    <span className="f-mono" style={{ fontSize: '0.65rem', letterSpacing: '0.1em' }}>ONCHAIN + FIREBASE SAVED ✓</span>
                  </div>
                  <button onClick={() => setMinted(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#5A5550' }}><X size={14} /></button>
                </div>
                <div className="f-mono" style={{ fontSize: '0.68rem', color: '#00FFB2', wordBreak: 'break-all', marginBottom: '0.4rem' }}>
                  Robot ID: {minted.robot_id}
                </div>
                {minted.tx_hash && (
                  <div className="f-mono" style={{ fontSize: '0.63rem', color: '#4D9FFF', wordBreak: 'break-all', marginBottom: '0.65rem' }}>
                    TX: {minted.tx_hash}
                    {explorerTxUrl(minted.tx_hash) && (
                      <a href={explorerTxUrl(minted.tx_hash)} target="_blank" rel="noopener noreferrer" style={{ color: '#F0A500', marginLeft: '0.5rem' }}>
                        <ExternalLink size={10} style={{ display: 'inline' }} />
                      </a>
                    )}
                  </div>
                )}
                {minted.block_number && (
                  <div className="f-mono" style={{ fontSize: '0.6rem', color: '#5A5550', marginBottom: '0.65rem' }}>
                    Block #{minted.block_number}
                  </div>
                )}
                <button onClick={() => copy(minted.robot_id)} className="btn btn-outline" style={{ fontSize: '0.6rem', padding: '0.35rem 0.8rem' }}>
                  <Copy size={10} /> {copied ? 'Copied!' : 'Copy Robot ID'}
                </button>
              </div>
            )}
          </div>

          <div className="card" style={{ padding: '1.25rem', marginTop: '1rem' }}>
            <div className="f-mono" style={{ fontSize: '0.6rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#4A4845', marginBottom: '0.85rem' }}>Real Onchain Flow</div>
            {[
              { c: '#F0A500', label: 'Konnex Testnet (Substrate)', desc: 'system.remark extrinsic — real signed tx' },
              { c: '#4D9FFF', label: 'Firebase Firestore', desc: 'Global persistent DB — all users dekh saktey hain' },
              { c: '#00FFB2', label: 'Realtime Listeners', desc: 'onSnapshot — live updates across all clients' },
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

        {/* ── ROBOTS LIST ── */}
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
            <span className="tag tag-green">Firebase Live</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {filtered.length === 0 && (
              <div style={{ color: '#4A4845', fontFamily: "'Space Mono', monospace", fontSize: '0.75rem', padding: '2rem', textAlign: 'center' }}>
                {syncStatus === 'syncing' ? 'Firebase se load ho raha hai...' : 'No robots found.'}
              </div>
            )}
            {filtered.map(r => {
              const rType = r.metadata?.type || r.type || 'Custom';
              const rName = r.metadata?.label || r.name || 'Unknown';
              const c = typeLabel[typeColor(rType)] || '#4D9FFF';
              const rep = DB.reputation?.[r.robot_id] || {};
              const score = rep.score ? Math.round(rep.score * 100) : 0;
              const tasks = rep.total_tasks || 0;
              const successRate = tasks > 0 ? Math.round((rep.successful_tasks / tasks) * 100) : 0;
              return (
                <div key={r.robot_id || r.id} className="card" style={{ padding: '1.25rem', display: 'flex', gap: '1rem' }}>
                  <div style={{ width: 3, background: c, borderRadius: 2, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.35rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <div>
                        <span className="f-display" style={{ fontSize: '1.1rem', color: '#E2DDD6', marginRight: '0.5rem' }}>{rName}</span>
                        <span className="tag" style={{ color: c, borderColor: c + '44', background: c + '12', fontFamily: "'Space Mono', monospace", fontSize: '0.6rem', letterSpacing: '0.12em', textTransform: 'uppercase', padding: '0.2rem 0.55rem' }}>{rType}</span>
                      </div>
                      <span className="tag tag-green">ONCHAIN</span>
                    </div>

                    <div className="f-mono" style={{ fontSize: '0.6rem', color: '#4A4845', marginBottom: '0.6rem', wordBreak: 'break-all' }}>{r.robot_id || r.id}</div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', marginBottom: '0.6rem' }}>
                      {[
                        { l: 'Tasks', v: tasks },
                        { l: 'Success', v: `${successRate}%` },
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

                    <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.3rem' }}>
                      <span style={{ fontSize: '0.7rem', color: '#5A5550' }}>{shortAddr(r.owner_address)}</span>
                      {r.tx_hash && (
                        <a href={explorerTxUrl(r.tx_hash)} target="_blank" rel="noopener noreferrer" className="f-mono" style={{ fontSize: '0.58rem', color: '#4D9FFF', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                          Block #{r.block_number} <ExternalLink size={9} />
                        </a>
                      )}
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
