'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Cpu, Shield, Brain, Network, Zap, ChevronRight, ArrowRight } from 'lucide-react';

const FEATURES = [
  {
    icon: Shield,
    title: 'Permanent Robot Identity',
    body: 'Every robot mints a unique on-chain ID derived from its operator, type, and genesis parameters. Non-fungible. Immutable. Verifiable across any Konnex subnet.',
    tag: 'IDENTITY',
  },
  {
    icon: Brain,
    title: 'Tamper-Proof Memory',
    body: 'Task histories, sensor logs, and behavioral data are committed as PoPW hashes to the AXIOM subnet. Robots build a permanent, auditable reputation.',
    tag: 'MEMORY',
  },
  {
    icon: Network,
    title: 'Cross-Robot Knowledge',
    body: 'Robots can query the shared memory graph. A new unit can learn from 10,000 prior task executions before its first real-world deployment.',
    tag: 'KNOWLEDGE GRAPH',
  },
  {
    icon: Zap,
    title: 'PoPW Native',
    body: 'Every task submission includes a cryptographic Proof of Physical Work — verifiable evidence that the robot actually did the job, not just reported it.',
    tag: 'PROOF OF WORK',
  },
];

const STEPS = [
  { n: '01', title: 'Register', body: 'Operator mints a robot identity on the AXIOM subnet. A unique AXM-ID is generated and recorded on-chain.' },
  { n: '02', title: 'Execute', body: 'Robot performs physical tasks. Sensor data, duration, and outcome are captured in real time.' },
  { n: '03', title: 'Prove', body: 'A PoPW hash is computed from the task evidence and submitted to the AXIOM memory contract.' },
  { n: '04', title: 'Accrue', body: 'Reputation score grows with each verified task. Memory becomes a tradable, composable asset in the Konnex ecosystem.' },
];

const STATS = [
  { label: 'Robots Registered', value: 847, suffix: '' },
  { label: 'Tasks Logged', value: 24891, suffix: '' },
  { label: 'PoPW Verified', value: 23104, suffix: '' },
  { label: 'Uptime', value: 99.97, suffix: '%' },
];

function Counter({ target, suffix }) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    const isFloat = !Number.isInteger(target);
    const dur = 1600, steps = 60;
    const inc = target / steps;
    let cur = 0, i = 0;
    const t = setInterval(() => {
      i++;
      cur = Math.min(cur + inc, target);
      setVal(isFloat ? parseFloat(cur.toFixed(2)) : Math.round(cur));
      if (i >= steps) clearInterval(t);
    }, dur / steps);
    return () => clearInterval(t);
  }, [target]);
  return <>{Number.isInteger(target) ? val.toLocaleString() : val}{suffix}</>;
}

export default function Home() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div style={{ paddingTop: 64 }}>

      {/* ── HERO ─────────────────────────────────────────────────────── */}
      <section className="grid-bg" style={{ position: 'relative', minHeight: '92vh', display: 'flex', alignItems: 'center', overflow: 'hidden' }}>

        {/* Corner accents */}
        {['top:0;left:0;border-top:2px solid;border-left:2px solid', 'top:0;right:0;border-top:2px solid;border-right:2px solid',
          'bottom:0;left:0;border-bottom:2px solid;border-left:2px solid', 'bottom:0;right:0;border-bottom:2px solid;border-right:2px solid'].map((s, i) => (
          <div key={i} style={{
            position: 'absolute', ...Object.fromEntries(s.split(';').map(p => {
              const [k, v] = p.split(':');
              return [k === 'border-top' || k === 'border-bottom' || k === 'border-left' || k === 'border-right' ? `border${k.replace('border', '')}` : k,
                k.startsWith('border') ? `2px solid rgba(240,165,0,0.35)` : v + 'px'];
            })),
            width: 60, height: 60, borderColor: 'rgba(240,165,0,0.35)', zIndex: 1,
          }} />
        ))}

        {/* Glow blob */}
        <div style={{
          position: 'absolute', top: '20%', right: '10%',
          width: 500, height: 500, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(240,165,0,0.06) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '4rem 1.5rem', width: '100%', zIndex: 2, position: 'relative' }}>

          {/* Pre-label */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
            <div style={{ height: 1, width: 40, background: '#F0A500' }} />
            <span className="tag tag-gold">Konnex Subnet Builder Program</span>
          </div>

          {/* Main headline */}
          <h1 className="f-display" style={{
            fontSize: 'clamp(4rem, 10vw, 8.5rem)',
            lineHeight: 0.92, color: '#E2DDD6',
            marginBottom: '1.5rem', maxWidth: 800,
          }}>
            THE IDENTITY<br />
            <span style={{ color: '#F0A500' }}>LAYER</span><br />
            FOR MACHINES
          </h1>

          <p style={{
            fontSize: 'clamp(0.95rem, 1.5vw, 1.1rem)',
            color: '#7A7570', lineHeight: 1.7,
            maxWidth: 520, marginBottom: '2.5rem',
          }}>
            AXIOM gives every robot a permanent, verifiable on-chain identity and an immutable memory of every task it has ever performed — built natively on Konnex Subnet.
          </p>

          {/* CTAs */}
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <Link href="/registry">
              <button className="btn btn-gold clip-sm" style={{ fontSize: '0.75rem' }}>
                Register Your Robot <ArrowRight size={14} />
              </button>
            </Link>
            <Link href="/fleet">
              <button className="btn btn-outline clip-sm" style={{ fontSize: '0.75rem' }}>
                View Fleet <ChevronRight size={14} />
              </button>
            </Link>
          </div>

          {/* Block ticker */}
          <div style={{ marginTop: '3rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#00FFB2', boxShadow: '0 0 8px #00FFB2' }} className="anim-pulse" />
            <span className="f-mono" style={{ fontSize: '0.62rem', color: '#4A4845', letterSpacing: '0.12em' }}>
              AXIOM SUBNET · BLOCK #{(1284750 + (mounted ? Math.floor(Date.now() / 6000) % 100 : 0)).toLocaleString()} · {mounted ? new Date().toUTCString().slice(0, -4) : 'UTC'} UTC
            </span>
          </div>
        </div>
      </section>

      {/* ── STATS BAR ────────────────────────────────────────────────── */}
      <section style={{ background: '#0B0E1A', borderTop: '1px solid rgba(240,165,0,0.1)', borderBottom: '1px solid rgba(240,165,0,0.1)' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 1.5rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
          {STATS.map((s, i) => (
            <div key={s.label} style={{
              padding: '2rem 1.5rem',
              borderRight: i < STATS.length - 1 ? '1px solid rgba(240,165,0,0.08)' : 'none',
            }}>
              <div className="f-display" style={{ fontSize: '2.8rem', color: '#F0A500', lineHeight: 1 }}>
                {mounted ? <Counter target={s.value} suffix={s.suffix} /> : '—'}
              </div>
              <div className="f-mono" style={{ fontSize: '0.62rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#5A5550', marginTop: '0.4rem' }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── FEATURES ─────────────────────────────────────────────────── */}
      <section style={{ maxWidth: 1200, margin: '0 auto', padding: '6rem 1.5rem' }}>
        <div style={{ marginBottom: '3.5rem' }}>
          <div className="f-mono" style={{ fontSize: '0.68rem', letterSpacing: '0.15em', textTransform: 'uppercase', color: '#F0A500', marginBottom: '0.75rem' }}>
            // Protocol Features
          </div>
          <h2 className="f-display" style={{ fontSize: 'clamp(2.2rem, 4vw, 3.5rem)', color: '#E2DDD6' }}>
            BUILT FOR THE<br />MACHINE ECONOMY
          </h2>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1px', background: 'rgba(240,165,0,0.08)' }}>
          {FEATURES.map((f, i) => {
            const Icon = f.icon;
            return (
              <div key={i} className="card" style={{ padding: '2rem', background: '#101525' }}>
                <div style={{ marginBottom: '1.25rem', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <div style={{
                    width: 40, height: 40, background: 'rgba(240,165,0,0.08)',
                    border: '1px solid rgba(240,165,0,0.2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    clipPath: 'polygon(0 0, calc(100% - 6px) 0, 100% 6px, 100% 100%, 6px 100%, 0 calc(100% - 6px))',
                  }}>
                    <Icon size={17} color="#F0A500" />
                  </div>
                  <span className="tag tag-gold">{f.tag}</span>
                </div>
                <h3 className="f-display" style={{ fontSize: '1.45rem', color: '#E2DDD6', marginBottom: '0.75rem' }}>{f.title}</h3>
                <p style={{ fontSize: '0.85rem', color: '#6A6560', lineHeight: 1.7 }}>{f.body}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── HOW IT WORKS ─────────────────────────────────────────────── */}
      <section style={{ background: '#0B0E1A', borderTop: '1px solid rgba(240,165,0,0.08)', borderBottom: '1px solid rgba(240,165,0,0.08)' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '6rem 1.5rem' }}>
          <div style={{ marginBottom: '3.5rem' }}>
            <div className="f-mono" style={{ fontSize: '0.68rem', letterSpacing: '0.15em', textTransform: 'uppercase', color: '#F0A500', marginBottom: '0.75rem' }}>
              // How It Works
            </div>
            <h2 className="f-display" style={{ fontSize: 'clamp(2.2rem, 4vw, 3.5rem)', color: '#E2DDD6' }}>
              FROM METAL<br />TO MEMORY
            </h2>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem' }}>
            {STEPS.map((s, i) => (
              <div key={i} style={{ position: 'relative' }}>
                {i < STEPS.length - 1 && (
                  <div style={{
                    position: 'absolute', top: '1.8rem', right: '-0.75rem',
                    zIndex: 1, display: 'flex', alignItems: 'center',
                  }} className="hide-mobile-step">
                    <ChevronRight size={16} color="rgba(240,165,0,0.3)" />
                  </div>
                )}
                <div className="card" style={{ padding: '1.75rem', background: '#101525', height: '100%' }}>
                  <div className="f-display" style={{ fontSize: '3rem', color: 'rgba(240,165,0,0.15)', lineHeight: 1, marginBottom: '0.75rem' }}>{s.n}</div>
                  <h3 className="f-display" style={{ fontSize: '1.35rem', color: '#F0A500', marginBottom: '0.6rem' }}>{s.title}</h3>
                  <p style={{ fontSize: '0.83rem', color: '#6A6560', lineHeight: 1.65 }}>{s.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── KONNEX INFO ──────────────────────────────────────────────── */}
      <section style={{ maxWidth: 1200, margin: '0 auto', padding: '6rem 1.5rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3rem', alignItems: 'center' }} className="responsive-2col">
          <div>
            <div className="f-mono" style={{ fontSize: '0.68rem', letterSpacing: '0.15em', textTransform: 'uppercase', color: '#F0A500', marginBottom: '0.75rem' }}>
              // Built on Konnex
            </div>
            <h2 className="f-display" style={{ fontSize: 'clamp(2rem, 4vw, 3.2rem)', color: '#E2DDD6', marginBottom: '1.25rem' }}>
              FUNDING<br />PHYSICAL-WORLD AI
            </h2>
            <p style={{ fontSize: '0.88rem', color: '#6A6560', lineHeight: 1.75, marginBottom: '1.5rem' }}>
              Konnex funds subnet teams shipping incentive mechanisms for physical-world AI. AXIOM is purpose-built for the <strong style={{ color: '#D0C8C0' }}>Robot Identity &amp; Memory</strong> category — enabling every robot in the network to carry a portable, provable history.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '2rem' }}>
              {[
                'On-chain robot identity (non-transferable DID)',
                'Immutable task memory with PoPW proofs',
                'Composable reputation score for robot operators',
                'Cross-subnet memory portability via KNX',
              ].map(point => (
                <div key={point} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#F0A500', marginTop: '0.45rem', flexShrink: 0 }} />
                  <span style={{ fontSize: '0.85rem', color: '#8A8580' }}>{point}</span>
                </div>
              ))}
            </div>
            <a href="https://subnets.testnet.konnex.world/builders" target="_blank" rel="noopener noreferrer">
              <button className="btn btn-gold clip-sm">Apply to Build <ArrowRight size={14} /></button>
            </a>
          </div>

          {/* Grant tiers */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {[
              { tier: 'SPARK', amount: '$25,000', desc: 'SDK access + dev support. Working prototype required.', color: '#4D9FFF' },
              { tier: 'LAUNCH', amount: '$75,000', desc: 'Testnet allocation + co-marketing. Working demo required.', color: '#F0A500' },
              { tier: 'MAINNET', amount: '$200,000+', desc: 'KNX allocation + ecosystem distribution. For shipped subnets.', color: '#00FFB2' },
            ].map(g => (
              <div key={g.tier} className="card" style={{ padding: '1.25rem 1.5rem', display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                <div style={{ width: 3, height: 48, background: g.color, flexShrink: 0, borderRadius: 2 }} />
                <div>
                  <div className="f-mono" style={{ fontSize: '0.6rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: g.color, marginBottom: '0.25rem' }}>{g.tier}</div>
                  <div className="f-display" style={{ fontSize: '1.6rem', color: '#E2DDD6', lineHeight: 1, marginBottom: '0.25rem' }}>{g.amount}</div>
                  <div style={{ fontSize: '0.78rem', color: '#6A6560' }}>{g.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA BANNER ───────────────────────────────────────────────── */}
      <section style={{ background: '#0B0E1A', borderTop: '1px solid rgba(240,165,0,0.12)' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '4rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1.5rem' }}>
          <div>
            <h2 className="f-display" style={{ fontSize: 'clamp(1.8rem, 3vw, 2.8rem)', color: '#E2DDD6' }}>START BUILDING TODAY</h2>
            <p style={{ fontSize: '0.85rem', color: '#6A6560', marginTop: '0.4rem' }}>Register your robot and log your first task in under 2 minutes.</p>
          </div>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <Link href="/registry"><button className="btn btn-gold clip-sm">Register Robot <ArrowRight size={14} /></button></Link>
            <Link href="/memory"><button className="btn btn-outline clip-sm">View Memory Vault</button></Link>
          </div>
        </div>
      </section>

      <style>{`
        .responsive-2col { grid-template-columns: 1fr 1fr; }
        @media(max-width: 768px) {
          .responsive-2col { grid-template-columns: 1fr; }
          .hide-mobile-step { display: none; }
        }
      `}</style>
    </div>
  );
}
