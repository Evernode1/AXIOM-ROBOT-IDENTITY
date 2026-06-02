'use client';
import { useState, useEffect, useCallback } from 'react';
import {
  Shield, AlertTriangle, CheckCircle, XCircle,
  Clock, Zap, TrendingDown, Award, Lock, ExternalLink, RefreshCw
} from 'lucide-react';
import { VALIDATOR_POOL, SAMPLE_CHALLENGES } from '@/lib/data';
import { challengeTimeLeft, timeAgo } from '@/lib/utils';
import {
  WALLET, CHAIN, DB,
  loadDB, attachRealtimeListeners, initChain,
  on, off, shortAddr, explorerTxUrl, sendExtrinsic,
} from '@/lib/chain';

const LAYER_COLORS = ['#4D9FFF','#F0A500','#FF4D6A','#00FFB2','#B44DFF'];

const LAYERS = [
  { n: '01', color: '#4D9FFF', icon: Shield,     title: 'Random Sampling',        body: 'Har task pe 3–5 validators randomly assign hote hain. Har validator IPFS payload ke alag sections check karta hai — fraud detect karna easy, collusion impossible.', tag: 'ANTI-COLLUSION' },
  { n: '02', color: '#F0A500', icon: CheckCircle, title: '70% Consensus',           body: 'Score tab accept hota hai jab ≥70% assigned validators agree karein (±15 pts median ke). Deviant scores automatically challenge trigger karte hain.', tag: 'CONSENSUS' },
  { n: '03', color: '#FF4D6A', icon: TrendingDown, title: 'Staking & Slashing',    body: 'Validators testKNX stake karte hain registration pe. Galat scores pe stake slash hota hai. Honest validators per-task rewards earn karte hain.', tag: 'ECONOMIC' },
  { n: '04', color: '#00FFB2', icon: Clock,       title: '24-Hour Challenge Window', body: 'Koi bhi validator ya watcher 24 hours mein dispute raise kar sakta hai. Successful challenges dishonest validator ko slash karke challenger ko reward dete hain.', tag: 'DISPUTE' },
  { n: '05', color: '#B44DFF', icon: Award,       title: 'Reputation System',      body: 'Lazy validators ka reputation score girta hai aur unhein kam tasks milte hain. Slowly active pool se bahar ho jaate hain. Self-healing network.', tag: 'LONG-TERM' },
];

export default function Validators() {
  const [tab, setTab] = useState('pool');
  const [walletState, setWalletState] = useState({ connected: false, address: null });
  const [challenges, setChallenges] = useState([]);
  const [memories, setMemories] = useState([]);
  const [robots, setRobots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [raising, setRaising] = useState(null); // challenge id being raised
  const [raiseResult, setRaiseResult] = useState(null);

  const syncWallet = useCallback(() => {
    setWalletState({ connected: WALLET.connected, address: WALLET.address });
  }, []);

  useEffect(() => {
    syncWallet();
    initChain().catch(console.warn);

    const onMem = () => {
      setMemories([...DB.memory]);
      setLoading(false);
    };
    const onRobots = () => setRobots([...DB.robots]);
    const onWal = () => syncWallet();

    on('memory:updated', onMem);
    on('robots:updated', onRobots);
    on('wallet:connected', onWal);
    on('wallet:disconnected', onWal);

    (async () => {
      await loadDB();
      attachRealtimeListeners();
      setMemories([...DB.memory]);
      setRobots([...DB.robots]);
      setLoading(false);
    })();

    return () => {
      off('memory:updated', onMem);
      off('robots:updated', onRobots);
      off('wallet:connected', onWal);
      off('wallet:disconnected', onWal);
    };
  }, [syncWallet]);

  // Build real challenges from memory entries where consensus was low or failed
  useEffect(() => {
    const realChallenges = memories
      .filter(m => m.popw_score < 0.7 || m.outcome === 'FAILED' || m.outcome === 'PARTIAL')
      .slice(0, 10)
      .map((m, i) => ({
        id: `CHG-${String(i + 1).padStart(3, '0')}`,
        memId: m.id || m.task_id,
        taskId: m.task_id,
        robotName: m.robotName || (robots.find(r => r.robot_id === m.robot_id)?.metadata?.label) || 'Unknown',
        challenger: m.validator_addr || '—',
        status: m.popw_score < 0.5 ? 'DISPUTABLE' : 'BORDERLINE',
        raisedAt: m.executed_at ? new Date(m.executed_at).getTime() : (m.timestamp || Date.now()),
        expiresAt: (m.timestamp || Date.now()) + 86400000,
        consensusScore: Math.round((m.popw_score || 0) * 100),
        txHash: m.tx_hash,
        blockNumber: m.block_number,
      }));

    // Merge with SAMPLE_CHALLENGES for display (sample = examples of the mechanism)
    setChallenges(realChallenges);
  }, [memories, robots]);

  async function raiseChallenge(ch) {
    if (!WALLET.connected || !WALLET.signer) {
      alert('Wallet connect karo pehle');
      return;
    }
    setRaising(ch.id);
    setRaiseResult(null);
    try {
      const result = await sendExtrinsic(
        'axiom.raiseChallenge',
        {
          taskId: (ch.taskId || '').slice(0, 16),
          challenger: WALLET.address.slice(0, 16),
          reason: 'score_outlier',
        },
        `raiseChallenge(${ch.id})`
      );
      setRaiseResult({
        success: true,
        txHash: result.txHash,
        blockNumber: result.blockNumber,
        challengeId: ch.id,
      });
    } catch (err) {
      setRaiseResult({ success: false, error: err.message, challengeId: ch.id });
    } finally {
      setRaising(null);
    }
  }

  const activeValidators = VALIDATOR_POOL.filter(v => v.status === 'active');
  const totalStaked = VALIDATOR_POOL.reduce((s, v) => s + v.stake, 0);
  const avgRep = Math.round(activeValidators.reduce((s, v) => s + v.reputation, 0) / activeValidators.length);
  const totalSlashes = VALIDATOR_POOL.reduce((s, v) => s + v.slashes, 0);

  return (
    <div className="page-wrap">
      <div className="page-header">
        <div className="page-sub">// Validator Network</div>
        <h1 className="page-title">LAZY VALIDATOR<br />PREVENTION</h1>
        <p style={{ color: '#6A6560', fontSize: '0.88rem', marginTop: '0.5rem', maxWidth: 560 }}>
          5-layer system — validators actually verify karein, na sirf random scores submit karein. Real onchain challenges supported.
        </p>
      </div>

      {/* 5 Layers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1px', background: 'rgba(240,165,0,0.08)', marginBottom: '2.5rem' }}>
        {LAYERS.map(l => {
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

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1px', background: 'rgba(240,165,0,0.08)', marginBottom: '2rem' }}>
        {[
          { l: 'Active Validators', v: activeValidators.length, c: '#00FFB2' },
          { l: 'Total Staked (tKNX)', v: (totalStaked / 1000).toFixed(1) + 'k', c: '#F0A500' },
          { l: 'Avg Reputation', v: avgRep, c: '#4D9FFF' },
          { l: 'Total Slashes', v: totalSlashes, c: '#FF4D6A' },
          { l: 'Real Challenges', v: challenges.length, c: '#B44DFF' },
          { l: 'Memory Entries', v: memories.length, c: '#E2DDD6' },
        ].map(m => (
          <div key={m.l} className="card" style={{ padding: '1.1rem 1.5rem', background: '#101525' }}>
            <div className="metric-value" style={{ color: m.c, fontSize: '1.6rem' }}>{m.v}</div>
            <div className="metric-label">{m.l}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0', marginBottom: '1.5rem', borderBottom: '1px solid rgba(240,165,0,0.1)' }}>
        {[
          { key: 'pool',       label: 'Validator Pool' },
          { key: 'challenges', label: `Real Challenges (${challenges.length})` },
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

      {/* Pool Tab */}
      {tab === 'pool' && (
        <div>
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
                <div className="f-display" style={{ fontSize: '1rem', color: '#E2DDD6', alignSelf: 'center' }}>{(v.stake / 1000).toFixed(1)}k</div>
                <div style={{ alignSelf: 'center' }}>
                  <div className="f-display" style={{ fontSize: '1rem', color: repColor, lineHeight: 1 }}>{v.reputation}</div>
                  <div style={{ height: 2, background: '#1A1D2A', borderRadius: 1, marginTop: '0.25rem', width: 40 }}>
                    <div style={{ height: '100%', width: `${v.reputation}%`, background: repColor, borderRadius: 1 }} />
                  </div>
                </div>
                <div className="f-display" style={{ fontSize: '1rem', color: '#D0C8C0', alignSelf: 'center' }}>{v.tasksScored.toLocaleString()}</div>
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
                  <span className={`tag tag-${v.status === 'active' ? 'green' : 'red'}`} style={{ fontSize: '0.55rem' }}>{v.status.toUpperCase()}</span>
                </div>
              </div>
            );
          })}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1.5rem' }} className="consensus-grid">
            <div className="card" style={{ padding: '1.25rem' }}>
              <div className="f-mono" style={{ fontSize: '0.6rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#F0A500', marginBottom: '0.85rem' }}>Consensus Logic</div>
              {[
                { l: 'Validators per task', v: '3–5 (random)' },
                { l: 'Agreement threshold', v: '70% of assigned' },
                { l: 'Deviation tolerance', v: '±15 pts of median' },
                { l: 'Challenge trigger',   v: 'Any deviant score' },
                { l: 'Challenge validators',v: '2 fresh picks' },
              ].map(r => (
                <div key={r.l} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.45rem' }}>
                  <span style={{ fontSize: '0.76rem', color: '#5A5550' }}>{r.l}</span>
                  <span className="f-mono" style={{ fontSize: '0.68rem', color: '#E2DDD6' }}>{r.v}</span>
                </div>
              ))}
            </div>
            <div className="card" style={{ padding: '1.25rem' }}>
              <div className="f-mono" style={{ fontSize: '0.6rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#FF4D6A', marginBottom: '0.85rem' }}>Slashing Rules</div>
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

      {/* Challenges Tab — Real data from Firebase memory entries */}
      {tab === 'challenges' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {loading && (
            <div style={{ color: '#5A5550', fontFamily: "'Space Mono', monospace", fontSize: '0.7rem', padding: '2rem', textAlign: 'center' }}>
              Firebase se load ho raha hai...
            </div>
          )}

          {!loading && challenges.length === 0 && (
            <div className="card" style={{ padding: '2rem', textAlign: 'center' }}>
              <div className="f-mono" style={{ fontSize: '0.7rem', color: '#4A4845', marginBottom: '0.5rem' }}>No disputable entries found</div>
              <div style={{ fontSize: '0.78rem', color: '#3A3835' }}>
                Jab PoPW score &lt; 70% hoga, woh entries yahan dikhein gi
              </div>
            </div>
          )}

          {!walletState.connected && challenges.length > 0 && (
            <div style={{ background: 'rgba(240,165,0,0.06)', border: '1px solid rgba(240,165,0,0.2)', padding: '0.75rem 1rem', fontFamily: "'Space Mono', monospace", fontSize: '0.65rem', color: '#F0A500' }}>
              ⚠ Challenge raise karne ke liye wallet connect karo (Navbar se)
            </div>
          )}

          {raiseResult && (
            <div style={{ background: raiseResult.success ? 'rgba(0,255,178,0.05)' : 'rgba(255,77,106,0.05)', border: `1px solid ${raiseResult.success ? 'rgba(0,255,178,0.2)' : 'rgba(255,77,106,0.3)'}`, padding: '0.85rem 1rem', fontFamily: "'Space Mono', monospace", fontSize: '0.65rem', color: raiseResult.success ? '#00FFB2' : '#FF4D6A' }}>
              {raiseResult.success
                ? `✓ Challenge ${raiseResult.challengeId} onchain! TX: ${(raiseResult.txHash || '').slice(0, 20)}… Block #${raiseResult.blockNumber}`
                : `✗ ${raiseResult.error}`}
            </div>
          )}

          {challenges.map(c => (
            <div key={c.id} className="card" style={{ padding: '1.5rem', borderLeft: `3px solid ${c.status === 'DISPUTABLE' ? '#FF4D6A' : '#F0A500'}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                    <AlertTriangle size={14} color={c.status === 'DISPUTABLE' ? '#FF4D6A' : '#F0A500'} />
                    <span className="f-mono" style={{ fontSize: '0.68rem', color: '#F0A500', letterSpacing: '0.1em' }}>{c.id}</span>
                    <span className={`tag tag-${c.status === 'DISPUTABLE' ? 'red' : 'gold'}`} style={{ fontSize: '0.55rem' }}>{c.status}</span>
                  </div>
                  <div className="f-display" style={{ fontSize: '1.1rem', color: '#E2DDD6' }}>{c.robotName}</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.4rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Clock size={10} color="#00FFB2" />
                    <span className="f-mono" style={{ fontSize: '0.62rem', color: '#00FFB2' }}>
                      {challengeTimeLeft(c.raisedAt)} remaining
                    </span>
                  </div>
                  {walletState.connected && c.status === 'DISPUTABLE' && (
                    <button
                      onClick={() => raiseChallenge(c)}
                      disabled={raising === c.id}
                      style={{ background: 'rgba(255,77,106,0.1)', border: '1px solid rgba(255,77,106,0.4)', color: '#FF4D6A', padding: '0.3rem 0.75rem', fontFamily: "'Space Mono', monospace", fontSize: '0.62rem', cursor: 'pointer', letterSpacing: '0.08em' }}
                    >
                      {raising === c.id ? '⟳ Sending...' : '⚡ Raise Challenge Onchain'}
                    </button>
                  )}
                </div>
              </div>

              <div style={{ background: '#06080F', border: '1px solid rgba(240,165,0,0.1)', padding: '0.85rem', marginBottom: '1rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
                  {[
                    { l: 'PoPW Score', v: c.consensusScore, c: c.consensusScore >= 70 ? '#00FFB2' : c.consensusScore >= 50 ? '#F0A500' : '#FF4D6A' },
                    { l: 'Block',      v: c.blockNumber ? `#${c.blockNumber}` : '—', c: '#4D9FFF' },
                    { l: 'Threshold',  v: '70%', c: '#5A5550' },
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
                  { l: 'Task ID',    v: (c.taskId || '').slice(0, 20) + '...' },
                  { l: 'Validator',  v: shortAddr(c.challenger) },
                ].map(f => (
                  <div key={f.l}>
                    <div className="f-mono" style={{ fontSize: '0.56rem', color: '#3A3835', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.15rem' }}>{f.l}</div>
                    <div className="f-mono" style={{ fontSize: '0.62rem', color: '#8A8580' }}>{f.v}</div>
                  </div>
                ))}
                {c.txHash && (
                  <a href={explorerTxUrl(c.txHash)} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: '#4D9FFF', fontFamily: "'Space Mono', monospace", fontSize: '0.6rem' }}>
                    Explorer <ExternalLink size={9} />
                  </a>
                )}
              </div>
            </div>
          ))}

          <div className="card" style={{ padding: '1.25rem', borderLeft: '3px solid rgba(240,165,0,0.15)' }}>
            <div className="f-mono" style={{ fontSize: '0.6rem', color: '#3A3835', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Challenge Window Rules</div>
            <div style={{ fontSize: '0.78rem', color: '#4A4845', lineHeight: 1.7 }}>
              Koi bhi validator ya watcher <strong style={{ color: '#D0C8C0' }}>24 hours</strong> ke andar dispute raise kar sakta hai. Successful challenges dishonest validator ko slash karke challenger ko reward dete hain. Expired challenges auto-close ho jaate hain. Real onchain tx required.
            </div>
          </div>
        </div>
      )}

      {/* ZK Roadmap Tab */}
      {tab === 'roadmap' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }} className="zk-grid">
            <div className="card" style={{ padding: '1.5rem', borderTop: '2px solid #F0A500' }}>
              <div className="f-mono" style={{ fontSize: '0.62rem', color: '#F0A500', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '1.25rem' }}>Now — SPARK Tier</div>
              <div className="f-display" style={{ fontSize: '1.5rem', color: '#E2DDD6', marginBottom: '1rem' }}>5-Layer Classical Verification</div>
              {['Random sampling (partial payload)', '70% consensus threshold', 'Stake-based slashing', '24h challenge window', 'Reputation decay'].map(item => (
                <div key={item} style={{ display: 'flex', gap: '0.6rem', marginBottom: '0.5rem' }}>
                  <CheckCircle size={13} color="#F0A500" style={{ flexShrink: 0, marginTop: '0.15rem' }} />
                  <span style={{ fontSize: '0.78rem', color: '#6A6560' }}>{item}</span>
                </div>
              ))}
            </div>
            <div className="card" style={{ padding: '1.5rem', borderTop: '2px solid #B44DFF' }}>
              <div className="f-mono" style={{ fontSize: '0.62rem', color: '#B44DFF', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '1.25rem' }}>LAUNCH Tier — ZK Integration</div>
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
        </div>
      )}

      <style>{`
        .consensus-grid { grid-template-columns: 1fr 1fr; }
        .zk-grid { grid-template-columns: 1fr 1fr; }
        @media(max-width: 700px) {
          .consensus-grid, .zk-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}
