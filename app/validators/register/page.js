'use client';
import { useState, useEffect, useCallback } from 'react';
import {
  Shield, Plus, Award, TrendingUp, TrendingDown, CheckCircle,
  XCircle, Wallet, ExternalLink, Copy, Users, Zap, Star,
  AlertTriangle, Lock, RefreshCw, ChevronRight, Activity,
} from 'lucide-react';
import { VALIDATOR_POOL, TASK_CATEGORIES } from '@/lib/data';
import { timeAgo } from '@/lib/utils';
import {
  WALLET, CHAIN, DB,
  loadDB, attachRealtimeListeners, initChain,
  on, off, shortAddr, explorerTxUrl, sendExtrinsic,
  getFirestore, chainHash, now,
} from '@/lib/chain';

// ─── Constants ────────────────────────────────────────────────────────────────
const MIN_STAKE      = 1000;          // tKNX minimum stake
const REWARD_RATE    = 0.005;         // 0.5% of stake per honest task
const SLASH_RATE_1   = 0.10;          // 10% stake slash on deviant score
const SLASH_RATE_2   = 0.25;          // 25% on repeat offence (3+)
const SLASH_RATE_BAN = 1.00;          // 100% + ban for collusion

const SPECIALITIES = [
  'Drone Navigation & Swarm Coordination',
  'Robotic Manipulation (Roboarm)',
  'SLAM / Spatial Perception',
  'Sensor Fusion & PoPW Validation',
  'Robot Fleet Orchestration',
  'Robotic General Intelligence VLA/LBM',
  'Humanoid Robot Control',
  'Long Horizon Robotics Task Execution',
  'Robot Identity & Memory',
  'General PoPW (All Categories)',
  'Cross-Category Expert',
];

const TIER_COLORS = {
  ELITE:    '#F0A500',
  ACTIVE:   '#00FFB2',
  PROBATION:'#FF8800',
  SUSPENDED:'#FF4D6A',
};

const REGIONS = [
  'Konnex Testnet Zone-1',
  'Konnex Testnet Zone-2',
  'Konnex Testnet Zone-3',
  'Global / No Preference',
];

// Compute tier from reputation
function validatorTier(rep, slashes) {
  if (slashes >= 7) return 'SUSPENDED';
  if (rep >= 90)    return 'ELITE';
  if (rep >= 70)    return 'ACTIVE';
  return 'PROBATION';
}

// Approximate rewards earned (stake × rate × tasks)
function rewardsEarned(v) {
  return Math.round(v.tasksScored * v.stake * REWARD_RATE / 100);
}

// Save validator to Firebase
async function fbSaveValidator(validator) {
  try {
    const fs = getFirestore();
    if (fs) await fs.collection('axiom_validators').doc(validator.val_id).set(validator);
  } catch (e) {
    console.warn('[Firebase] saveValidator:', e.message);
  }
}

// ─── Page Component ───────────────────────────────────────────────────────────
const EMPTY_FORM = { label: '', speciality: '', stakeAmount: '5000', region: REGIONS[0] };

export default function ValidatorRegister() {
  const [tab, setTab] = useState('register');
  const [walletState, setWalletState] = useState({ connected: false, address: null, name: null });
  const [form, setForm]               = useState(EMPTY_FORM);
  const [errors, setErrors]           = useState({});
  const [registering, setRegistering] = useState(false);
  const [regStep, setRegStep]         = useState('');
  const [registered, setRegistered]   = useState(null);
  const [copied, setCopied]           = useState(false);
  const [fbValidators, setFbValidators] = useState([]);
  const [loadingFb, setLoadingFb]     = useState(true);
  const [searchVal, setSearchVal]     = useState('');

  const syncWallet = useCallback(() => {
    setWalletState({ connected: WALLET.connected, address: WALLET.address, name: WALLET.name });
  }, []);

  // Load Firebase validators + wallet sync
  useEffect(() => {
    syncWallet();
    initChain().catch(console.warn);
    on('wallet:connected',    syncWallet);
    on('wallet:disconnected', syncWallet);

    // Load Firebase validators
    (async () => {
      try {
        const fs = getFirestore();
        if (fs) {
          const snap = await fs.collection('axiom_validators').orderBy('registered_at', 'asc').get();
          setFbValidators(snap.docs.map(d => d.data()));
        }
      } catch (e) {
        console.warn('[ValidatorRegistry] Firebase load:', e.message);
      } finally {
        setLoadingFb(false);
      }
    })();

    // Realtime listener for new registrations
    let unsub = null;
    try {
      const fs = getFirestore();
      if (fs) {
        unsub = fs.collection('axiom_validators').onSnapshot(snap => {
          setFbValidators(snap.docs.map(d => d.data()));
        });
      }
    } catch (_) {}

    return () => {
      off('wallet:connected',    syncWallet);
      off('wallet:disconnected', syncWallet);
      if (unsub) try { unsub(); } catch (_) {}
    };
  }, [syncWallet]);

  // ── Validation ───────────────────────────────────────────────────────────────
  function validate() {
    const e = {};
    if (!form.label.trim())           e.label = 'Validator label required';
    if (!form.speciality)             e.speciality = 'Speciality select karo';
    const stake = parseInt(form.stakeAmount);
    if (isNaN(stake) || stake < MIN_STAKE)
      e.stakeAmount = `Minimum stake ${MIN_STAKE} tKNX hai`;
    if (!walletState.connected)       e._wallet = 'Wallet connect karo pehle (Navbar se)';
    return e;
  }

  // ── Register Handler ─────────────────────────────────────────────────────────
  async function handleRegister(ev) {
    ev?.preventDefault?.();
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    setErrors({});
    setRegistering(true);
    setRegistered(null);

    try {
      setRegStep('Wallet approve karo — Konnex Testnet tx sign ho raha hai...');
      const stake    = parseInt(form.stakeAmount);
      const valIdRaw = chainHash('validator::' + WALLET.address + '::' + form.label + '::' + Date.now());
      const valId    = 'VAL-' + valIdRaw.slice(2, 6).toUpperCase() + '-' + valIdRaw.slice(6, 10).toUpperCase();

      const result = await sendExtrinsic(
        'axiom.registerValidator',
        {
          valId:       valId.slice(0, 16),
          owner:       WALLET.address.slice(0, 16),
          label:       form.label.slice(0, 32),
          speciality:  form.speciality.slice(0, 32),
          stakeAmount: stake,
        },
        `registerValidator(${form.label})`
      );

      setRegStep('Onchain confirmed! Firebase mein save ho raha hai...');

      const validator = {
        val_id:        valId,
        owner_address: WALLET.address,
        label:         form.label,
        speciality:    form.speciality,
        stake:         stake,
        region:        form.region || REGIONS[0],
        reputation:    75,      // starting reputation
        tasks_scored:  0,
        slashes:       0,
        rewards_earned: 0,
        status:        'active',
        registered_at: now(),
        tx_hash:       result.txHash,
        block_number:  result.blockNumber,
      };

      await fbSaveValidator(validator);
      setRegistered(validator);
      setForm(EMPTY_FORM);
      setTab('validators');
    } catch (err) {
      const msg = err.message || String(err);
      if (/cancel|reject|denied/i.test(msg)) {
        setErrors({ _wallet: 'Transaction cancel kar diya — wallet mein Approve dabao' });
      } else {
        setErrors({ _wallet: 'Error: ' + msg });
      }
    } finally {
      setRegistering(false);
      setRegStep('');
    }
  }

  function copy(text) {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  // ── Merged pool: VALIDATOR_POOL + Firebase validators ────────────────────────
  const allValidators = [
    ...VALIDATOR_POOL.map(v => ({
      val_id:        v.id,
      owner_address: v.addr,
      label:         v.speciality,
      speciality:    v.speciality,
      stake:         v.stake,
      reputation:    v.reputation,
      tasks_scored:  v.tasksScored,
      slashes:       v.slashes,
      status:        v.status,
      rewards_earned: rewardsEarned(v),
      registered_at: null,
      tx_hash:       null,
      _sample:       true,
    })),
    ...fbValidators,
  ];

  const filteredVals = allValidators.filter(v =>
    !searchVal ||
    (v.label || '').toLowerCase().includes(searchVal.toLowerCase()) ||
    (v.val_id || '').toLowerCase().includes(searchVal.toLowerCase()) ||
    (v.speciality || '').toLowerCase().includes(searchVal.toLowerCase())
  );

  // ── Aggregate stats ──────────────────────────────────────────────────────────
  const activeVals      = allValidators.filter(v => v.status === 'active');
  const totalStaked     = allValidators.reduce((s, v) => s + (v.stake || 0), 0);
  const totalRewards    = allValidators.reduce((s, v) => s + (v.rewards_earned || 0), 0);
  const avgRep          = activeVals.length
    ? Math.round(activeVals.reduce((s, v) => s + (v.reputation || 0), 0) / activeVals.length)
    : 0;
  const newRegistered   = fbValidators.length;

  const STATS = [
    { l: 'Total Validators',   v: allValidators.length,             c: '#00FFB2' },
    { l: 'Active Now',         v: activeVals.length,                c: '#F0A500' },
    { l: 'Total Staked (tKNX)',v: (totalStaked / 1000).toFixed(1) + 'k', c: '#4D9FFF' },
    { l: 'Rewards Distributed',v: totalRewards.toLocaleString() + ' tKNX', c: '#B44DFF' },
    { l: 'Avg Reputation',     v: avgRep,                           c: '#E2DDD6' },
    { l: 'New Registrations',  v: newRegistered,                    c: '#F0A500' },
  ];

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="page-wrap">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="page-header">
        <div className="page-sub">// Validator Network</div>
        <h1 className="page-title">VALIDATOR<br />REGISTRY</h1>
        <p style={{ color: '#6A6560', fontSize: '0.88rem', marginTop: '0.5rem', maxWidth: 560 }}>
          Network mein join karo — stake karo, tasks score karo, rewards kamao.
          Dishonest scoring pe stake slash hoga. Honest validators ko har task pe reward milta hai.
        </p>
      </div>

      {/* ── Stats Bar ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1px', background: 'rgba(240,165,0,0.08)', marginBottom: '2rem' }}>
        {STATS.map(s => (
          <div key={s.l} className="card" style={{ padding: '1.1rem 1.4rem', background: '#101525' }}>
            <div className="f-display metric-value" style={{ color: s.c, fontSize: '1.6rem', lineHeight: 1 }}>{s.v}</div>
            <div className="metric-label" style={{ marginTop: '0.3rem' }}>{s.l}</div>
          </div>
        ))}
      </div>

      {/* ── Reward Banner ─────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1px', background: 'rgba(0,255,178,0.06)', marginBottom: '2rem' }}>
        {[
          { icon: Award,      color: '#00FFB2', title: 'Per-Task Reward',       body: `Stake ka ${(REWARD_RATE * 100).toFixed(1)}% — har honest task ke baad automatically credit hota hai.` },
          { icon: Zap,        color: '#F0A500', title: 'Challenge Reward',       body: 'Successful challenge pe slashed stake ka portion challenger ko milta hai.' },
          { icon: TrendingUp, color: '#4D9FFF', title: 'Reputation Bonus',       body: 'Rep 90+ validators ko high-value tasks prefer milte hain — zyada kam, zyada rewards.' },
          { icon: Shield,     color: '#B44DFF', title: 'Slashing Protection',    body: 'Honest validators ka stake 100% protected. Slash sirf deviant/colluding validators pe.' },
        ].map(r => {
          const Icon = r.icon;
          return (
            <div key={r.title} className="card" style={{ padding: '1.25rem', background: '#0B0E1A', display: 'flex', gap: '0.85rem', alignItems: 'flex-start' }}>
              <div style={{ width: 32, height: 32, background: r.color + '15', border: `1px solid ${r.color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, clipPath: 'polygon(0 0, calc(100% - 5px) 0, 100% 5px, 100% 100%, 5px 100%, 0 calc(100% - 5px))' }}>
                <Icon size={14} color={r.color} />
              </div>
              <div>
                <div className="f-mono" style={{ fontSize: '0.6rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: r.color, marginBottom: '0.4rem' }}>{r.title}</div>
                <p style={{ fontSize: '0.75rem', color: '#5A5550', lineHeight: 1.6 }}>{r.body}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Tabs ──────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 0, marginBottom: '1.75rem', borderBottom: '1px solid rgba(240,165,0,0.1)' }}>
        {[
          { key: 'register',   label: '+ Register New Validator' },
          { key: 'validators', label: `Active Validators (${allValidators.length})` },
          { key: 'rewards',    label: 'Reward Structure' },
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

      {/* ════════════════════════════════════════════════════════════════════
          TAB: REGISTER NEW VALIDATOR
      ════════════════════════════════════════════════════════════════════ */}
      {tab === 'register' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '2rem', alignItems: 'start' }} className="reg-grid">

          {/* ── Registration Form ─────────────────────────────────────────── */}
          <div>

            {/* Wallet banner */}
            {!walletState.connected ? (
              <div style={{ background: 'rgba(240,165,0,0.06)', border: '1px solid rgba(240,165,0,0.25)', padding: '0.85rem 1.1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <Wallet size={13} color="#F0A500" />
                <span className="f-mono" style={{ fontSize: '0.64rem', color: '#F0A500' }}>Wallet connect karo (Navbar) — real onchain registration ke liye</span>
              </div>
            ) : (
              <div style={{ background: 'rgba(0,255,178,0.05)', border: '1px solid rgba(0,255,178,0.2)', padding: '0.75rem 1.1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <CheckCircle size={13} color="#00FFB2" />
                <span className="f-mono" style={{ fontSize: '0.62rem', color: '#00FFB2' }}>
                  {walletState.name} — {shortAddr(walletState.address)}
                </span>
              </div>
            )}

            {/* Form card */}
            <div className="card" style={{ padding: '1.75rem' }}>
              <div className="f-mono" style={{ fontSize: '0.63rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: '#F0A500', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Plus size={12} /> Validator Registration — Onchain
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>

                {/* Validator Label */}
                <div>
                  <label>Validator Name / Label *</label>
                  <input
                    placeholder="e.g. DroneVal-Alpha, StakeMaster-7"
                    value={form.label}
                    onChange={e => setForm({ ...form, label: e.target.value })}
                  />
                  {errors.label && <div style={{ color: '#FF4D6A', fontSize: '0.7rem', marginTop: '0.3rem', fontFamily: "'Space Mono', monospace" }}>{errors.label}</div>}
                </div>

                {/* Speciality */}
                <div>
                  <label>Verification Speciality *</label>
                  <select value={form.speciality} onChange={e => setForm({ ...form, speciality: e.target.value })}>
                    <option value="">Select speciality...</option>
                    {SPECIALITIES.map(s => <option key={s}>{s}</option>)}
                  </select>
                  {errors.speciality && <div style={{ color: '#FF4D6A', fontSize: '0.7rem', marginTop: '0.3rem', fontFamily: "'Space Mono', monospace" }}>{errors.speciality}</div>}
                </div>

                {/* Stake Amount */}
                <div>
                  <label>Stake Amount (tKNX) — Min {MIN_STAKE.toLocaleString()} *</label>
                  <input
                    type="number"
                    min={MIN_STAKE}
                    step={500}
                    placeholder={`Min ${MIN_STAKE}`}
                    value={form.stakeAmount}
                    onChange={e => setForm({ ...form, stakeAmount: e.target.value })}
                  />
                  {/* Stake tier indicator */}
                  <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {[
                      { label: '1k (Minimum)', value: '1000',  color: '#5A5550' },
                      { label: '5k (Standard)',value: '5000',  color: '#F0A500' },
                      { label: '10k (Elite)',  value: '10000', color: '#00FFB2' },
                    ].map(t => (
                      <button
                        key={t.value}
                        onClick={() => setForm({ ...form, stakeAmount: t.value })}
                        style={{ background: form.stakeAmount === t.value ? t.color + '20' : 'transparent', border: `1px solid ${t.color}40`, color: t.color, padding: '0.25rem 0.65rem', fontFamily: "'Space Mono', monospace", fontSize: '0.58rem', cursor: 'pointer', letterSpacing: '0.08em' }}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                  {errors.stakeAmount && <div style={{ color: '#FF4D6A', fontSize: '0.7rem', marginTop: '0.3rem', fontFamily: "'Space Mono', monospace" }}>{errors.stakeAmount}</div>}
                </div>

                {/* Region */}
                <div>
                  <label>Network Region</label>
                  <select value={form.region} onChange={e => setForm({ ...form, region: e.target.value })}>
                    {REGIONS.map(r => <option key={r}>{r}</option>)}
                  </select>
                </div>

                {/* Projected rewards display */}
                {form.stakeAmount && parseInt(form.stakeAmount) >= MIN_STAKE && (
                  <div style={{ background: 'rgba(0,255,178,0.04)', border: '1px solid rgba(0,255,178,0.12)', padding: '0.85rem' }}>
                    <div className="f-mono" style={{ fontSize: '0.58rem', color: '#00FFB2', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Estimated Rewards (Projected)</div>
                    {(() => {
                      const stake = parseInt(form.stakeAmount) || 0;
                      const perTask  = (stake * REWARD_RATE / 100).toFixed(2);
                      const per100   = (stake * REWARD_RATE / 100 * 100).toFixed(0);
                      return (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                          {[
                            { l: 'Per honest task', v: `+${perTask} tKNX` },
                            { l: 'Per 100 tasks',   v: `+${per100} tKNX` },
                          ].map(r => (
                            <div key={r.l}>
                              <div className="f-display" style={{ fontSize: '1.1rem', color: '#00FFB2', lineHeight: 1 }}>{r.v}</div>
                              <div className="f-mono" style={{ fontSize: '0.56rem', color: '#3A3835', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{r.l}</div>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* Wallet / API error */}
                {errors._wallet && (
                  <div style={{ background: 'rgba(255,77,106,0.08)', border: '1px solid rgba(255,77,106,0.3)', padding: '0.75rem', color: '#FF4D6A', fontFamily: "'Space Mono', monospace", fontSize: '0.67rem' }}>
                    ⚠ {errors._wallet}
                  </div>
                )}

                {/* Submit button */}
                <button
                  onClick={handleRegister}
                  disabled={registering}
                  className="btn btn-gold clip-sm"
                  style={{ width: '100%', justifyContent: 'center', fontSize: '0.75rem' }}
                >
                  {registering ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ width: 12, height: 12, border: '2px solid #06080F', borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />
                      {regStep || 'Registering...'}
                    </span>
                  ) : (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Shield size={13} /> Register as Validator (Konnex Testnet) <ChevronRight size={13} />
                    </span>
                  )}
                </button>
              </div>
            </div>

            {/* ── Success Card ──────────────────────────────────────────────── */}
            {registered && (
              <div style={{ marginTop: '1rem', background: 'rgba(0,255,178,0.05)', border: '1px solid rgba(0,255,178,0.2)', padding: '1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.85rem', color: '#00FFB2' }}>
                  <CheckCircle size={14} />
                  <span className="f-mono" style={{ fontSize: '0.65rem', letterSpacing: '0.1em' }}>VALIDATOR REGISTERED — ONCHAIN ✓</span>
                </div>
                <div className="f-display" style={{ fontSize: '1.4rem', color: '#E2DDD6', marginBottom: '0.75rem' }}>{registered.label}</div>
                <div className="f-mono" style={{ fontSize: '0.65rem', color: '#00FFB2', wordBreak: 'break-all', marginBottom: '0.35rem' }}>
                  ID: {registered.val_id}
                </div>
                {registered.tx_hash && (
                  <div className="f-mono" style={{ fontSize: '0.62rem', color: '#4D9FFF', wordBreak: 'break-all', marginBottom: '0.35rem' }}>
                    TX: {registered.tx_hash}
                    {explorerTxUrl(registered.tx_hash) && (
                      <a href={explorerTxUrl(registered.tx_hash)} target="_blank" rel="noopener noreferrer" style={{ color: '#F0A500', marginLeft: '0.5rem' }}>
                        <ExternalLink size={9} style={{ display: 'inline' }} />
                      </a>
                    )}
                  </div>
                )}
                {registered.block_number && (
                  <div className="f-mono" style={{ fontSize: '0.59rem', color: '#5A5550', marginBottom: '0.75rem' }}>
                    Block #{registered.block_number}
                  </div>
                )}
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button onClick={() => copy(registered.val_id)} className="btn btn-outline" style={{ fontSize: '0.6rem', padding: '0.35rem 0.8rem' }}>
                    <Copy size={10} /> {copied ? 'Copied!' : 'Copy Validator ID'}
                  </button>
                  <button onClick={() => setTab('validators')} className="btn btn-outline" style={{ fontSize: '0.6rem', padding: '0.35rem 0.8rem', color: '#00FFB2', borderColor: 'rgba(0,255,178,0.3)' }}>
                    <Users size={10} /> View All Validators
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ── Right: Rules + Staking Info ───────────────────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

            {/* How registration works */}
            <div className="card" style={{ padding: '1.5rem', borderTop: '2px solid #F0A500' }}>
              <div className="f-mono" style={{ fontSize: '0.62rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#F0A500', marginBottom: '1.25rem' }}>Registration Flow</div>
              {[
                { n: '01', color: '#F0A500', title: 'Wallet Connect',       body: 'SubWallet ya Polkadot.js extension se connect karo. tKNX testnet tokens chahiye.' },
                { n: '02', color: '#4D9FFF', title: 'Stake tKNX',           body: 'Minimum 1,000 tKNX stake karo. Zyada stake = zyada rewards per task + more task assignments.' },
                { n: '03', color: '#B44DFF', title: 'Onchain TX',           body: 'system.remark extrinsic fire hoga — wallet mein Approve karo. Konnex Testnet pe confirm hoga.' },
                { n: '04', color: '#00FFB2', title: 'Firebase Persist',     body: 'Registration Firebase mein save hoga. Sab users real-time mein new validator dekh saktey hain.' },
                { n: '05', color: '#F0A500', title: 'Task Assignment Starts',body: 'Automatically scoring queue mein add ho jaoge. Har honest score pe rewards milenge.' },
              ].map(s => (
                <div key={s.n} style={{ display: 'flex', gap: '0.85rem', marginBottom: '0.85rem', alignItems: 'flex-start' }}>
                  <div className="f-display" style={{ fontSize: '1.4rem', color: s.color, lineHeight: 1, flexShrink: 0, width: 28 }}>{s.n}</div>
                  <div>
                    <div style={{ fontSize: '0.8rem', color: '#D0C8C0', fontWeight: 500, marginBottom: '0.2rem' }}>{s.title}</div>
                    <div style={{ fontSize: '0.73rem', color: '#5A5550', lineHeight: 1.55 }}>{s.body}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Slashing rules */}
            <div className="card" style={{ padding: '1.5rem', borderTop: '2px solid #FF4D6A' }}>
              <div className="f-mono" style={{ fontSize: '0.62rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#FF4D6A', marginBottom: '1.1rem' }}>Slashing Rules — Read Carefully</div>
              {[
                { l: 'Deviant score (>15pts off median)', v: '-10% stake',  c: '#FF8800' },
                { l: 'Repeat offence (3+ times)',          v: '-25% stake',  c: '#FF4D6A' },
                { l: 'Proven collusion / fraud',           v: '-100% + BAN', c: '#FF4D6A' },
                { l: 'Offline / lazy (missed tasks)',       v: 'Rep penalty', c: '#F0A500' },
                { l: 'Sub-threshold reputation (<50)',      v: 'Pool removal', c: '#FF4D6A' },
              ].map(r => (
                <div key={r.l} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.55rem', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.75rem', color: '#5A5550' }}>{r.l}</span>
                  <span className="f-mono" style={{ fontSize: '0.65rem', color: r.c, flexShrink: 0 }}>{r.v}</span>
                </div>
              ))}
              <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: 'rgba(255,77,106,0.05)', border: '1px solid rgba(255,77,106,0.15)', fontSize: '0.72rem', color: '#5A5550', lineHeight: 1.6 }}>
                Honest validators ka stake kabhi slash nahi hoga. Slashing sirf jab validator consensus se significantly deviate kare.
              </div>
            </div>

            {/* Faucet reminder */}
            <div className="card" style={{ padding: '1.25rem', display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
              <Zap size={14} color="#F0A500" style={{ flexShrink: 0, marginTop: '0.1rem' }} />
              <div>
                <div className="f-mono" style={{ fontSize: '0.6rem', color: '#F0A500', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '0.4rem' }}>tKNX Testnet Tokens Chahiye?</div>
                <p style={{ fontSize: '0.75rem', color: '#5A5550', lineHeight: 1.6 }}>
                  Konnex Testnet faucet se free tKNX mil sakta hai.{' '}
                  <a href="https://faucet.testnet.konnex.world" target="_blank" rel="noopener noreferrer" style={{ color: '#4D9FFF' }}>
                    faucet.testnet.konnex.world →
                  </a>
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          TAB: ALL VALIDATORS
      ════════════════════════════════════════════════════════════════════ */}
      {tab === 'validators' && (
        <div>
          {/* Search */}
          <div style={{ marginBottom: '1.25rem', display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <input
                placeholder="Search by name, ID, speciality..."
                value={searchVal}
                onChange={e => setSearchVal(e.target.value)}
              />
            </div>
            <span className="tag tag-gold">{filteredVals.length} validators</span>
            {newRegistered > 0 && <span className="tag tag-green">{newRegistered} new onchain</span>}
          </div>

          {/* Table header */}
          <div className="f-mono" style={{
            fontSize: '0.54rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#3A3835',
            display: 'grid', gridTemplateColumns: '80px 1fr 90px 55px 90px 60px 110px 75px',
            gap: '0.5rem', padding: '0.5rem 1rem', borderBottom: '1px solid rgba(240,165,0,0.08)',
          }}>
            <span>ID</span><span>Name / Speciality</span><span>Staked</span><span>Rep</span>
            <span>Tasks Scored</span><span>Slashes</span><span>Rewards Earned</span><span>Status</span>
          </div>

          {loadingFb && (
            <div style={{ color: '#5A5550', fontFamily: "'Space Mono', monospace", fontSize: '0.7rem', padding: '2rem', textAlign: 'center' }}>
              Firebase se validators load ho rahe hain...
            </div>
          )}

          {filteredVals.map((v, i) => {
            const tier     = validatorTier(v.reputation || 75, v.slashes || 0);
            const tierCol  = TIER_COLORS[tier];
            const repColor = (v.reputation || 75) >= 90 ? '#00FFB2' : (v.reputation || 75) >= 70 ? '#F0A500' : '#FF4D6A';
            const rewards  = v.rewards_earned ?? rewardsEarned({ stake: v.stake || 0, tasksScored: v.tasks_scored || v.tasksScored || 0 });
            const tasks    = v.tasks_scored ?? v.tasksScored ?? 0;

            return (
              <div key={v.val_id || v.id || i} style={{
                display: 'grid',
                gridTemplateColumns: '80px 1fr 90px 55px 90px 60px 110px 75px',
                gap: '0.5rem', padding: '0.9rem 1rem',
                borderBottom: '1px solid rgba(240,165,0,0.05)',
                background: i % 2 === 0 ? '#101525' : '#0F1220',
                opacity: v.status === 'suspended' ? 0.5 : 1,
              }}>
                {/* ID */}
                <div className="f-mono" style={{ fontSize: '0.63rem', color: '#F0A500' }}>
                  {v.val_id || v.id}
                  {!v._sample && <div style={{ fontSize: '0.53rem', color: '#00FFB2', marginTop: '0.15rem' }}>NEW ✓</div>}
                </div>

                {/* Name / Speciality */}
                <div>
                  <div style={{ fontSize: '0.8rem', color: '#E2DDD6', marginBottom: '0.15rem' }}>{v.label || v.val_id}</div>
                  <div style={{ fontSize: '0.68rem', color: '#4A4845' }}>{v.speciality}</div>
                  {v.region && <div style={{ fontSize: '0.6rem', color: '#3A3835', marginTop: '0.1rem' }}>{v.region}</div>}
                </div>

                {/* Staked */}
                <div className="f-display" style={{ fontSize: '1rem', color: '#D0C8C0', alignSelf: 'center' }}>
                  {((v.stake || 0) / 1000).toFixed(1)}k
                </div>

                {/* Reputation */}
                <div style={{ alignSelf: 'center' }}>
                  <div className="f-display" style={{ fontSize: '1rem', color: repColor, lineHeight: 1 }}>{v.reputation ?? 75}</div>
                  <div style={{ height: 2, background: '#1A1D2A', borderRadius: 1, marginTop: '0.2rem', width: 36 }}>
                    <div style={{ height: '100%', width: `${v.reputation ?? 75}%`, background: repColor, borderRadius: 1 }} />
                  </div>
                </div>

                {/* Tasks Scored */}
                <div className="f-display" style={{ fontSize: '1rem', color: '#D0C8C0', alignSelf: 'center' }}>
                  {tasks.toLocaleString()}
                </div>

                {/* Slashes */}
                <div style={{ alignSelf: 'center' }}>
                  {(v.slashes || 0) > 0 ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <TrendingDown size={10} color="#FF4D6A" />
                      <span className="f-display" style={{ fontSize: '1rem', color: '#FF4D6A' }}>{v.slashes}</span>
                    </span>
                  ) : (
                    <CheckCircle size={13} color="#00FFB2" />
                  )}
                </div>

                {/* Rewards Earned */}
                <div style={{ alignSelf: 'center' }}>
                  <div className="f-display" style={{ fontSize: '0.95rem', color: '#00FFB2', lineHeight: 1 }}>
                    {rewards.toLocaleString()}
                  </div>
                  <div className="f-mono" style={{ fontSize: '0.52rem', color: '#3A3835', textTransform: 'uppercase', letterSpacing: '0.08em' }}>tKNX</div>
                </div>

                {/* Status + Tier */}
                <div style={{ alignSelf: 'center', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <span className={`tag tag-${v.status === 'active' ? 'green' : 'red'}`} style={{ fontSize: '0.52rem' }}>
                    {(v.status || 'active').toUpperCase()}
                  </span>
                  <span className="tag" style={{ fontSize: '0.52rem', color: tierCol, borderColor: tierCol + '40', background: tierCol + '12' }}>
                    {tier}
                  </span>
                </div>
              </div>
            );
          })}

          {/* Register CTA */}
          <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'center' }}>
            <button onClick={() => setTab('register')} className="btn btn-outline" style={{ fontSize: '0.7rem' }}>
              <Plus size={12} /> New Validator Register Karo
            </button>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          TAB: REWARD STRUCTURE
      ════════════════════════════════════════════════════════════════════ */}
      {tab === 'rewards' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

          {/* Reward tiers grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
            {[
              {
                tier: 'PROBATION', color: '#FF8800', rep: '50–69', stake: '1k–4.9k tKNX',
                items: [
                  'Per-task reward: 0.5% of stake',
                  'Task assignment priority: Low',
                  'Challenge win bonus: 1x slash value',
                  'Rep recovery path: 3 clean tasks = +5 rep',
                ],
              },
              {
                tier: 'ACTIVE', color: '#00FFB2', rep: '70–89', stake: '5k+ tKNX',
                items: [
                  'Per-task reward: 0.5% of stake',
                  'Task assignment priority: Standard',
                  'Challenge win bonus: 1.25x slash value',
                  'Bonus on 10-streak: +100 tKNX',
                ],
              },
              {
                tier: 'ELITE', color: '#F0A500', rep: '90–100', stake: '10k+ tKNX',
                items: [
                  'Per-task reward: 0.5% of stake',
                  'Task assignment priority: HIGH',
                  'Challenge win bonus: 1.5x slash value',
                  'Monthly top-10 bonus: +2,000 tKNX',
                  'ZK-proof tier: Priority access (LAUNCH)',
                ],
              },
            ].map(t => (
              <div key={t.tier} className="card" style={{ padding: '1.5rem', borderTop: `2px solid ${t.color}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <span className="f-display" style={{ fontSize: '1.4rem', color: t.color }}>{t.tier}</span>
                  <span className="tag" style={{ color: t.color, borderColor: t.color + '40', background: t.color + '12', fontSize: '0.55rem' }}>
                    REP {t.rep}
                  </span>
                </div>
                <div className="f-mono" style={{ fontSize: '0.6rem', color: '#4A4845', marginBottom: '1rem' }}>Stake: {t.stake}</div>
                {t.items.map(item => (
                  <div key={item} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', alignItems: 'flex-start' }}>
                    <Star size={10} color={t.color} style={{ flexShrink: 0, marginTop: '0.2rem' }} />
                    <span style={{ fontSize: '0.76rem', color: '#6A6560', lineHeight: 1.55 }}>{item}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* Reward formula */}
          <div className="card" style={{ padding: '1.5rem' }}>
            <div className="f-mono" style={{ fontSize: '0.62rem', color: '#4D9FFF', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '1.1rem' }}>Reward Calculation Formula</div>
            <div style={{ background: '#06080F', border: '1px solid rgba(77,159,255,0.15)', padding: '1.1rem', fontFamily: "'Space Mono', monospace", fontSize: '0.72rem', color: '#4D9FFF', lineHeight: 2 }}>
              <div>Per-task Reward = Stake × 0.005</div>
              <div style={{ color: '#3A3835', fontSize: '0.64rem' }}>// 0.5% of staked amount per honest scored task</div>
              <div style={{ marginTop: '0.75rem' }}>Challenge Reward = Slashed Amount × Multiplier</div>
              <div style={{ color: '#3A3835', fontSize: '0.64rem' }}>// PROBATION: 1x | ACTIVE: 1.25x | ELITE: 1.5x</div>
              <div style={{ marginTop: '0.75rem' }}>Monthly Projected = Per-task × Tasks/Month</div>
              <div style={{ color: '#3A3835', fontSize: '0.64rem' }}>// ~30 tasks/day = ~900 tasks/month est.</div>
            </div>
          </div>

          {/* Example projections table */}
          <div className="card" style={{ padding: '1.5rem' }}>
            <div className="f-mono" style={{ fontSize: '0.62rem', color: '#F0A500', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '1.1rem' }}>Projected Monthly Rewards (900 tasks/month)</div>
            <div style={{ display: 'grid', gridTemplateColumns: '120px 100px 120px 140px', gap: '0.5rem 1rem', alignItems: 'center' }}>
              <div className="f-mono" style={{ fontSize: '0.56rem', color: '#3A3835', textTransform: 'uppercase', letterSpacing: '0.08em', paddingBottom: '0.5rem', borderBottom: '1px solid rgba(240,165,0,0.08)' }}>Stake</div>
              <div className="f-mono" style={{ fontSize: '0.56rem', color: '#3A3835', textTransform: 'uppercase', letterSpacing: '0.08em', paddingBottom: '0.5rem', borderBottom: '1px solid rgba(240,165,0,0.08)' }}>Per Task</div>
              <div className="f-mono" style={{ fontSize: '0.56rem', color: '#3A3835', textTransform: 'uppercase', letterSpacing: '0.08em', paddingBottom: '0.5rem', borderBottom: '1px solid rgba(240,165,0,0.08)' }}>Monthly</div>
              <div className="f-mono" style={{ fontSize: '0.56rem', color: '#3A3835', textTransform: 'uppercase', letterSpacing: '0.08em', paddingBottom: '0.5rem', borderBottom: '1px solid rgba(240,165,0,0.08)' }}>Tier</div>
              {[
                [1000,  '#5A5550', 'PROBATION'],
                [5000,  '#F0A500', 'ACTIVE'   ],
                [10000, '#00FFB2', 'ELITE'    ],
                [20000, '#F0A500', 'ELITE'    ],
              ].map(([stake, col, tier]) => {
                const perTask  = (stake * 0.005 / 100).toFixed(3);
                const monthly  = Math.round(stake * 0.005 / 100 * 900).toLocaleString();
                return [
                  <div key={`s${stake}`} className="f-display" style={{ fontSize: '1rem', color: '#D0C8C0' }}>{(stake/1000).toFixed(0)}k tKNX</div>,
                  <div key={`pt${stake}`} className="f-mono" style={{ fontSize: '0.68rem', color: col }}>+{perTask}</div>,
                  <div key={`m${stake}`} className="f-display" style={{ fontSize: '1rem', color: col }}>+{monthly} tKNX</div>,
                  <div key={`t${stake}`}><span className="tag" style={{ color: col, borderColor: col + '40', background: col + '12', fontSize: '0.53rem' }}>{tier}</span></div>,
                ];
              })}
            </div>
          </div>

          {/* CTA */}
          <div style={{ textAlign: 'center', paddingBottom: '1rem' }}>
            <button onClick={() => setTab('register')} className="btn btn-gold clip-sm" style={{ fontSize: '0.75rem' }}>
              <Shield size={13} /> Abhi Register Karo — Rewards Shuru Karo
            </button>
          </div>
        </div>
      )}

      <style>{`
        .reg-grid { grid-template-columns: 1fr 1.5fr; }
        @media (max-width: 900px) {
          .reg-grid { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 700px) {
          .page-title { font-size: 2.2rem !important; }
        }
      `}</style>
    </div>
  );
}
