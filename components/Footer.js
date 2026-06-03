import Link from 'next/link';
import { Cpu, ExternalLink } from 'lucide-react';

export default function Footer() {
  return (
    <footer style={{
      borderTop: '1px solid rgba(240,165,0,0.1)',
      background: '#06080F',
      padding: '3rem 1.5rem 2rem',
      marginTop: '5rem',
    }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '2.5rem', marginBottom: '2.5rem' }}>

          {/* Brand */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.75rem' }}>
              <Cpu size={16} color="#F0A500" />
              <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '1.2rem', letterSpacing: '0.1em', color: '#F0A500' }}>
                AXIOM
              </span>
            </div>
            <p style={{ fontSize: '0.82rem', color: '#5A5550', lineHeight: 1.6, maxWidth: 200 }}>
              Decentralized identity &amp; memory layer for physical-world AI on Konnex Subnet.
            </p>
          </div>

          {/* Protocol */}
          <div>
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: '0.62rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: '#F0A500', marginBottom: '1rem' }}>
              Protocol
            </div>
            {['Registry', 'Memory Vault', 'Fleet Dashboard', 'PoPW Submit'].map(l => (
              <Link key={l} href={`/${l.split(' ')[0].toLowerCase()}`} className="axiom-footer-link">
                {l}
              </Link>
            ))}
            <Link href="/team" className="axiom-footer-link" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              Team
            </Link>
          </div>

          {/* Konnex */}
          <div>
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: '0.62rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: '#F0A500', marginBottom: '1rem' }}>
              Konnex Network
            </div>
            {[
              { label: 'Konnex Subnets', href: 'https://subnets.testnet.konnex.world' },
              { label: 'Builder Program', href: 'https://subnets.testnet.konnex.world/builders' },
              { label: 'Documentation', href: '#' },
            ].map(l => (
              <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer" className="axiom-footer-link" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                {l.label} <ExternalLink size={10} />
              </a>
            ))}
          </div>

          {/* Status */}
          <div>
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: '0.62rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: '#F0A500', marginBottom: '1rem' }}>
              Network Status
            </div>
            {[
              { label: 'Subnet RPC', status: 'ONLINE' },
              { label: 'PoPW Validator', status: 'ONLINE' },
              { label: 'Identity Registry', status: 'ONLINE' },
              { label: 'Memory Indexer', status: 'SYNCING' },
            ].map(s => (
              <div key={s.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.78rem', color: '#6A6560' }}>{s.label}</span>
                <span style={{
                  fontFamily: "'Space Mono', monospace", fontSize: '0.58rem',
                  letterSpacing: '0.1em', textTransform: 'uppercase',
                  color: s.status === 'ONLINE' ? '#00FFB2' : '#F0A500',
                }}>
                  {s.status}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ height: 1, background: 'linear-gradient(90deg, transparent, rgba(240,165,0,0.15), transparent)', marginBottom: '1.5rem' }} />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
          <span style={{ fontFamily: "'Space Mono', monospace", fontSize: '0.62rem', letterSpacing: '0.1em', color: '#3A3835' }}>
            © 2025 AXIOM — KONNEX SUBNET BUILDER PROGRAM
          </span>
          <span style={{ fontFamily: "'Space Mono', monospace", fontSize: '0.62rem', letterSpacing: '0.1em', color: '#3A3835' }}>
            BLOCK #{(1284750 + Math.floor(Date.now() / 6000)).toLocaleString()} · TESTNET
          </span>
        </div>
      </div>

      <style>{`
        .axiom-footer-link {
          display: block;
          font-size: 0.82rem;
          color: #6A6560;
          text-decoration: none;
          margin-bottom: 0.5rem;
          transition: color 0.2s;
        }
        .axiom-footer-link:hover { color: #F0A500; }
      `}</style>
    </footer>
  );
}
