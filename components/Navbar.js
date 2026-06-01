'use client';
import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Cpu, Menu, X } from 'lucide-react';

const links = [
  { href: '/',           label: 'Home'       },
  { href: '/registry',   label: 'Registry'   },
  { href: '/memory',     label: 'Memory Vault'},
  { href: '/fleet',      label: 'Fleet'      },
  { href: '/popw',       label: 'PoPW Submit'},
  { href: '/validators', label: 'Validators' },
];

const S = {
  nav: {
    position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
    background: 'rgba(6,8,15,0.92)', backdropFilter: 'blur(14px)',
    borderBottom: '1px solid rgba(240,165,0,0.1)',
  },
  inner: {
    maxWidth: 1200, margin: '0 auto', padding: '0 1.5rem',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 64,
  },
  logo: { display: 'flex', alignItems: 'center', gap: '0.7rem', textDecoration: 'none' },
  logoIcon: {
    width: 34, height: 34,
    background: 'rgba(240,165,0,0.08)', border: '1px solid rgba(240,165,0,0.35)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    clipPath: 'polygon(0 0, calc(100% - 7px) 0, 100% 7px, 100% 100%, 7px 100%, 0 calc(100% - 7px))',
  },
  logoText: {
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: '1.45rem', letterSpacing: '0.1em',
    color: '#F0A500', lineHeight: 1,
  },
  logoSub: {
    fontFamily: "'Space Mono', monospace",
    fontSize: '0.52rem', letterSpacing: '0.14em',
    color: '#6A6560', textTransform: 'uppercase',
  },
  navLinks: { display: 'flex', alignItems: 'center', gap: '0.1rem' },
  live: { display: 'flex', alignItems: 'center', gap: '0.5rem' },
  dot: {
    width: 7, height: 7, borderRadius: '50%',
    background: '#00FFB2', boxShadow: '0 0 8px #00FFB2',
  },
  liveText: {
    fontFamily: "'Space Mono', monospace",
    fontSize: '0.62rem', letterSpacing: '0.12em',
    color: '#00FFB2',
  },
};

export default function Navbar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      <nav style={S.nav}>
        <div style={S.inner}>
          {/* Logo */}
          <Link href="/" style={S.logo}>
            <div style={S.logoIcon}><Cpu size={15} color="#F0A500" /></div>
            <div>
              <div style={S.logoText}>AXIOM</div>
              <div style={S.logoSub}>Robot Identity Layer</div>
            </div>
          </Link>

          {/* Desktop links */}
          <div style={S.navLinks} className="hide-mobile">
            {links.map(l => (
              <Link
                key={l.href}
                href={l.href}
                className={`axiom-nav-link${pathname === l.href ? ' active' : ''}`}
              >
                {l.label}
              </Link>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={S.live}>
              <div style={S.dot} className="anim-pulse" />
              <span style={S.liveText}>TESTNET LIVE</span>
            </div>
            {/* Hamburger */}
            <button className="show-mobile"
              onClick={() => setOpen(!open)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#F0A500' }}>
              {open ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {open && (
          <div style={{
            background: '#0B0E1A', borderTop: '1px solid rgba(240,165,0,0.1)',
            padding: '1rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '0.25rem',
          }}>
            {links.map(l => (
              <Link key={l.href} href={l.href} onClick={() => setOpen(false)} style={{
                fontFamily: "'Space Mono', monospace",
                fontSize: '0.72rem', letterSpacing: '0.08em',
                textTransform: 'uppercase', textDecoration: 'none',
                padding: '0.6rem 0',
                color: pathname === l.href ? '#F0A500' : '#7A7570',
                borderBottom: '1px solid rgba(240,165,0,0.06)',
              }}>
                {l.label}
              </Link>
            ))}
          </div>
        )}
      </nav>

      <style>{`
        .axiom-nav-link {
          font-family: 'Space Mono', monospace;
          font-size: 0.68rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          text-decoration: none;
          padding: 0.45rem 0.8rem;
          color: #7A7570;
          border-bottom: 1px solid transparent;
          transition: color 0.2s;
        }
        .axiom-nav-link:hover { color: #D0C8C0; }
        .axiom-nav-link.active { color: #F0A500; border-bottom: 1px solid #F0A500; }
        .hide-mobile { display: flex !important; }
        .show-mobile { display: none !important; }
        @media(max-width:768px) {
          .hide-mobile { display: none !important; }
          .show-mobile { display: flex !important; }
        }
      `}</style>
    </>
  );
}
