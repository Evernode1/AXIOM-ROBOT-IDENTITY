'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Cpu, Menu, X, Wallet, ChevronDown, ExternalLink, LogOut, Zap } from 'lucide-react';
import {
  WALLET, CHAIN, EXPLORER,
  initChain, connectWallet, connectAnyWallet, disconnectWallet,
  on, off,
} from '@/lib/chain';

const NAV_LINKS = [
  { href: '/',                     label: 'Home'            },
  { href: '/registry',             label: 'Registry'        },
  { href: '/memory',               label: 'Memory Vault'    },
  { href: '/fleet',                label: 'Fleet'           },
  { href: '/popw',                 label: 'PoPW Submit'     },
  { href: '/validators',           label: 'Validators'      },
  { href: '/validators/register',  label: 'Val. Register', badge: 'NEW' },
  { href: '/simulator',            label: 'Simulator',     badge: 'NEW' },
  { href: '/team', label: 'Team' },
];

const WALLETS = [
  { key: 'subwallet',  label: 'SubWallet',      emoji: '🔷', desc: 'Best for Konnex — native Substrate + EVM', badge: 'Recommended' },
  { key: 'talisman',   label: 'Talisman',        emoji: '🔴', desc: 'Multichain — Polkadot native'             },
  { key: 'polkadotjs', label: 'Polkadot{.js}',   emoji: '🟣', desc: 'Official browser extension'             },
  { key: 'fearless',   label: 'Fearless',         emoji: '🟠', desc: 'Mobile-first Polkadot wallet'           },
];

// ── Colours ────────────────────────────────────────────────────────────
const C = {
  gold:    '#F0A500',
  green:   '#00FFB2',
  red:     '#FF4D4D',
  yellow:  '#FFD740',
  surface: 'rgba(6,8,15,0.96)',
  border:  'rgba(240,165,0,0.12)',
  card:    'rgba(15,18,30,0.98)',
  text:    '#D0C8C0',
  muted:   '#6A6560',
};

export default function Navbar() {
  const pathname = usePathname();
  const [mobileOpen,   setMobileOpen]   = useState(false);
  const [walletModal,  setWalletModal]  = useState(false);
  const [walletState,  setWalletState]  = useState({ connected: false, address: null, name: null, balance: null, readOnly: false });
  const [chainStatus,  setChainStatus]  = useState('disconnected'); // 'connecting' | 'connected' | 'error'
  const [chainBlock,   setChainBlock]   = useState(null);
  const [txPending,    setTxPending]    = useState(false);
  const [error,        setError]        = useState(null);
  const [connecting,   setConnecting]   = useState(false);

  // ── Sync wallet/chain state from module singletons ──────────────────
  const syncWallet = useCallback(() => {
    setWalletState({
      connected: WALLET.connected,
      address:   WALLET.address,
      name:      WALLET.name,
      balance:   WALLET.balance,
      readOnly:  WALLET.readOnly,
    });
  }, []);

  useEffect(() => {
    // Subscribe to chain.js events
    const onConnected    = () => { setChainStatus('connected');   };
    const onConnecting   = () => { setChainStatus('connecting');  };
    const onChainError   = () => { setChainStatus('error');       };
    const onBlock        = blk => setChainBlock(blk);
    const onWalConn      = () => syncWallet();
    const onWalDisconn   = () => syncWallet();
    const onBalance      = () => syncWallet();
    const onTxPend       = () => setTxPending(true);
    const onTxDone       = () => setTxPending(false);
    const onTxErr        = () => setTxPending(false);

    on('chain:status',      status => {
      if (status === 'connected')   onConnected();
      else if (status === 'connecting') onConnecting();
      else if (status === 'error')  onChainError();
    });
    on('chain:block',        onBlock);
    on('wallet:connected',   onWalConn);
    on('wallet:disconnected',onWalDisconn);
    on('wallet:balance',     onBalance);
    on('tx:pending',         onTxPend);
    on('tx:success',         onTxDone);
    on('tx:error',           onTxErr);

    // Init chain on mount (background — don't block UI)
    initChain().catch(console.warn);

    return () => {
      off('chain:block',        onBlock);
      off('wallet:connected',   onWalConn);
      off('wallet:disconnected',onWalDisconn);
      off('wallet:balance',     onBalance);
      off('tx:pending',         onTxPend);
      off('tx:success',         onTxDone);
      off('tx:error',           onTxErr);
    };
  }, [syncWallet]);

  // ── Handlers ─────────────────────────────────────────────────────────
  const handleConnect = async (walletKey) => {
    setError(null);
    setConnecting(true);
    try {
      if (walletKey === 'auto') await connectAnyWallet();
      else await connectWallet(walletKey);
      syncWallet();
      setWalletModal(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = () => {
    disconnectWallet();
    syncWallet();
    setWalletModal(false);
  };

  const shortAddr = addr => addr ? addr.slice(0, 8) + '…' + addr.slice(-4) : '';

  // ── Chain status pill ─────────────────────────────────────────────
  const chainPillColor = {
    connected:    C.green,
    connecting:   C.yellow,
    error:        C.red,
    disconnected: C.muted,
  }[chainStatus] || C.muted;

  const chainPillText = {
    connected:    chainBlock ? `#${chainBlock.toLocaleString()}` : 'Connected',
    connecting:   'Connecting…',
    error:        'Offline',
    disconnected: 'Not connected',
  }[chainStatus];

  return (
    <>
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 200,
        background: C.surface, backdropFilter: 'blur(18px)',
        borderBottom: `1px solid ${C.border}`,
      }}>
        <div style={{
          maxWidth: 1200, margin: '0 auto', padding: '0 1.5rem',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 64,
        }}>
          {/* Logo */}
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', textDecoration: 'none' }}>
            <div style={{
              width: 34, height: 34,
              background: 'rgba(240,165,0,0.08)', border: `1px solid rgba(240,165,0,0.35)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              clipPath: 'polygon(0 0, calc(100% - 7px) 0, 100% 7px, 100% 100%, 7px 100%, 0 calc(100% - 7px))',
            }}>
              <Cpu size={15} color={C.gold} />
            </div>
            <div>
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '1.45rem', letterSpacing: '0.1em', color: C.gold, lineHeight: 1 }}>AXIOM</div>
              <div style={{ fontFamily: "'Space Mono', monospace", fontSize: '0.52rem', letterSpacing: '0.14em', color: C.muted, textTransform: 'uppercase' }}>Robot Identity Layer</div>
            </div>
          </Link>

          {/* Desktop nav links */}
          <div className="hide-mobile" style={{ display: 'flex', alignItems: 'center', gap: '0.1rem' }}>
            {NAV_LINKS.map(l => (
              <Link key={l.href} href={l.href} style={{
                fontFamily: "'Space Mono', monospace",
                fontSize: '0.68rem', letterSpacing: '0.08em',
                textTransform: 'uppercase', textDecoration: 'none',
                padding: '0.45rem 0.8rem',
                color: pathname === l.href ? C.gold : C.muted,
                borderBottom: pathname === l.href ? `1px solid ${C.gold}` : '1px solid transparent',
                transition: 'color 0.2s',
              }}>
                {l.label}
              </Link>
            ))}
          </div>

          {/* Right side controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>

            {/* Chain status pill */}
            <div className="hide-mobile" style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: `${chainPillColor}10`, border: `1px solid ${chainPillColor}30`,
              borderRadius: 20, padding: '4px 10px',
              fontFamily: "'Space Mono', monospace", fontSize: '0.62rem', color: chainPillColor,
            }}>
              <div style={{
                width: 6, height: 6, borderRadius: '50%', background: chainPillColor,
                boxShadow: chainStatus === 'connected' ? `0 0 6px ${chainPillColor}` : 'none',
                animation: chainStatus === 'connecting' ? 'pulse 1.2s infinite' : 'none',
              }} />
              {chainPillText}
            </div>

            {/* Tx pending indicator */}
            {txPending && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 5,
                fontFamily: "'Space Mono', monospace", fontSize: '0.62rem', color: C.yellow,
              }}>
                <Zap size={12} style={{ animation: 'pulse 0.8s infinite' }} />
                Signing…
              </div>
            )}

            {/* Wallet button */}
            <button
              onClick={() => setWalletModal(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                background: walletState.connected
                  ? `${C.green}12`
                  : `rgba(240,165,0,0.08)`,
                border: `1px solid ${walletState.connected ? `${C.green}40` : 'rgba(240,165,0,0.3)'}`,
                borderRadius: 10, padding: '7px 14px',
                fontFamily: "'Space Mono', monospace", fontSize: '0.72rem',
                color: walletState.connected ? C.green : C.gold,
                cursor: 'pointer', transition: 'all 0.2s', whiteSpace: 'nowrap',
              }}
            >
              <Wallet size={13} />
              {walletState.connected ? shortAddr(walletState.address) : 'Connect Wallet'}
              <ChevronDown size={11} style={{ opacity: 0.6 }} />
            </button>

            {/* Hamburger */}
            <button
              className="show-mobile"
              onClick={() => setMobileOpen(!mobileOpen)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.gold, padding: '4px' }}
            >
              {mobileOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <div style={{
            background: '#0B0E1A', borderTop: `1px solid ${C.border}`,
            padding: '1rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '0.25rem',
          }}>
            {NAV_LINKS.map(l => (
              <Link key={l.href} href={l.href} onClick={() => setMobileOpen(false)} style={{
                fontFamily: "'Space Mono', monospace",
                fontSize: '0.72rem', letterSpacing: '0.08em',
                textTransform: 'uppercase', textDecoration: 'none',
                padding: '0.6rem 0',
                color: pathname === l.href ? C.gold : C.muted,
                borderBottom: `1px solid rgba(240,165,0,0.06)`,
              }}>
                {l.label}
              </Link>
            ))}
            {/* Mobile wallet row */}
            <button
              onClick={() => { setMobileOpen(false); setWalletModal(true); }}
              style={{
                marginTop: '0.5rem', padding: '0.65rem 0',
                background: 'none', border: 'none', cursor: 'pointer',
                fontFamily: "'Space Mono', monospace", fontSize: '0.72rem',
                color: walletState.connected ? C.green : C.gold,
                textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8,
              }}
            >
              <Wallet size={14} />
              {walletState.connected ? shortAddr(walletState.address) : 'Connect Wallet'}
            </button>
          </div>
        )}
      </nav>

      {/* ── Wallet Modal ────────────────────────────────────────────── */}
      {walletModal && (
        <div
          onClick={e => { if (e.target === e.currentTarget) setWalletModal(false); }}
          style={{
            position: 'fixed', inset: 0, zIndex: 500,
            background: 'rgba(4,8,15,0.82)', backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '1rem',
          }}
        >
          <div style={{
            background: C.card, border: `1px solid ${C.border}`,
            borderRadius: 16, padding: '1.5rem', width: '100%', maxWidth: 420,
            boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
          }}>
            {/* Modal header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '1.2rem', letterSpacing: '0.08em', color: C.gold }}>
                {walletState.connected ? 'Wallet Connected' : 'Connect Wallet'}
              </div>
              <button onClick={() => setWalletModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, fontSize: '1.1rem' }}>✕</button>
            </div>

            {/* ── NOT CONNECTED view ── */}
            {!walletState.connected && (
              <>
                <p style={{ fontFamily: "'Space Mono', monospace", fontSize: '0.72rem', color: C.muted, marginBottom: '1.25rem', lineHeight: 1.6 }}>
                  Connect your Substrate wallet to sign real transactions on Konnex Testnet.
                </p>

                {/* Auto-detect */}
                <button
                  onClick={() => handleConnect('auto')}
                  disabled={connecting}
                  style={{
                    width: '100%', padding: '0.75rem',
                    background: `linear-gradient(135deg, ${C.gold}, #D4920A)`,
                    border: 'none', borderRadius: 10,
                    fontFamily: "'Space Mono', monospace", fontSize: '0.78rem', fontWeight: 700,
                    color: '#000', cursor: connecting ? 'not-allowed' : 'pointer',
                    marginBottom: '1rem', opacity: connecting ? 0.7 : 1,
                    transition: 'opacity 0.2s',
                  }}
                >
                  {connecting ? '⟳ Connecting…' : '⛓ Auto-Detect Wallet (Recommended)'}
                </button>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                  <div style={{ flex: 1, height: 1, background: `rgba(240,165,0,0.12)` }} />
                  <span style={{ fontFamily: "'Space Mono', monospace", fontSize: '0.62rem', color: C.muted }}>or choose</span>
                  <div style={{ flex: 1, height: 1, background: `rgba(240,165,0,0.12)` }} />
                </div>

                {/* Wallet options */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {WALLETS.map(w => (
                    <button
                      key={w.key}
                      onClick={() => handleConnect(w.key)}
                      disabled={connecting}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '0.85rem',
                        background: 'rgba(240,165,0,0.04)', border: `1px solid ${C.border}`,
                        borderRadius: 10, padding: '0.75rem 0.9rem',
                        cursor: connecting ? 'not-allowed' : 'pointer',
                        transition: 'border-color 0.2s, background 0.2s',
                        textAlign: 'left', width: '100%',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = `${C.gold}60`; e.currentTarget.style.background = 'rgba(240,165,0,0.07)'; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.background = 'rgba(240,165,0,0.04)'; }}
                    >
                      <div style={{ fontSize: '1.3rem', flexShrink: 0 }}>{w.emoji}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontFamily: "'Space Mono', monospace", fontSize: '0.8rem', fontWeight: 700, color: C.text }}>{w.label}</div>
                        <div style={{ fontFamily: "'Space Mono', monospace", fontSize: '0.65rem', color: C.muted, marginTop: 2 }}>{w.desc}</div>
                      </div>
                      {w.badge && (
                        <span style={{
                          padding: '2px 8px', borderRadius: 6,
                          background: `${C.gold}20`, border: `1px solid ${C.gold}40`,
                          fontFamily: "'Space Mono', monospace", fontSize: '0.58rem', color: C.gold, fontWeight: 700,
                        }}>
                          {w.badge}
                        </span>
                      )}
                    </button>
                  ))}
                </div>

                {/* Error */}
                {error && (
                  <div style={{
                    marginTop: '1rem', padding: '0.75rem', borderRadius: 8,
                    background: 'rgba(255,77,77,0.08)', border: '1px solid rgba(255,77,77,0.25)',
                    fontFamily: "'Space Mono', monospace", fontSize: '0.68rem', color: C.red,
                    lineHeight: 1.5,
                  }}>
                    ⚠ {error}
                  </div>
                )}

                {/* Network info */}
                <div style={{
                  marginTop: '1rem', padding: '0.75rem', borderRadius: 8,
                  background: 'rgba(240,165,0,0.04)', border: `1px solid ${C.border}`,
                  fontFamily: "'Space Mono', monospace", fontSize: '0.65rem', color: C.muted,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span>Network</span><span style={{ color: C.text }}>Konnex Testnet</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span>RPC</span><span style={{ color: C.text, fontSize: '0.6rem' }}>testnet-rpc1.konnex.world</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Chain Status</span>
                    <span style={{ color: chainPillColor }}>{chainStatus}</span>
                  </div>
                </div>
              </>
            )}

            {/* ── CONNECTED view ── */}
            {walletState.connected && (
              <>
                <div style={{
                  padding: '0.9rem 1rem', borderRadius: 10,
                  background: `${C.green}08`, border: `1px solid ${C.green}25`,
                  fontFamily: "'Space Mono', monospace", fontSize: '0.7rem',
                  display: 'flex', flexDirection: 'column', gap: 8, marginBottom: '1rem',
                }}>
                  {[
                    ['Wallet',  walletState.name],
                    ['Address', walletState.address],
                    ['Network', 'Konnex Testnet'],
                    ['Balance', walletState.balance != null ? walletState.balance + ' testKNX' : 'Fetching…'],
                    ['Mode',    walletState.readOnly ? 'Read-Only' : 'Full Signer'],
                  ].map(([k, v]) => (
                    <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
                      <span style={{ color: C.muted }}>{k}</span>
                      <span style={{
                        color: k === 'Mode' ? (walletState.readOnly ? C.yellow : C.green) : C.text,
                        fontSize: k === 'Address' ? '0.6rem' : '0.7rem',
                        wordBreak: 'break-all', textAlign: 'right',
                      }}>
                        {v || '—'}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Explorer link */}
                {walletState.address && (
                  <a
                    href={`${EXPLORER}/address/${walletState.address}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      fontFamily: "'Space Mono', monospace", fontSize: '0.65rem',
                      color: C.gold, textDecoration: 'none', marginBottom: '0.75rem',
                    }}
                  >
                    <ExternalLink size={11} /> View on Explorer
                  </a>
                )}

                <button
                  onClick={handleDisconnect}
                  style={{
                    width: '100%', padding: '0.7rem',
                    background: 'rgba(255,77,77,0.07)', border: '1px solid rgba(255,77,77,0.25)',
                    borderRadius: 10, cursor: 'pointer',
                    fontFamily: "'Space Mono', monospace", fontSize: '0.72rem', color: C.red,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    transition: 'background 0.2s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,77,77,0.12)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,77,77,0.07)'; }}
                >
                  <LogOut size={13} /> Disconnect Wallet
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <style>{`
        .hide-mobile { display: flex !important; }
        .show-mobile { display: none  !important; }
        @media (max-width: 768px) {
          .hide-mobile { display: none  !important; }
          .show-mobile { display: flex  !important; }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: .4; transform: scale(.85); }
        }
      `}</style>
    </>
  );
}
