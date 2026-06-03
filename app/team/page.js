'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Cpu, Github, Twitter, Mail, Shield, Users, Zap, ExternalLink, ChevronRight } from 'lucide-react';

const TEAM = [
  {
    id: 'founder',
    role: 'FOUNDER & LEAD DEVELOPER',
    name: 'Salma Perveen',
    handle: '@betechfinder',
    initials: 'SP',
    bio: 'Visionary behind AXIOM — full-stack Web3 developer building the Robot Identity Layer on Konnex Substrate chain. Architect of the PoPW pipeline, on-chain integrations, and the AXIOM ecosystem.',
    skills: ['Next.js', 'Substrate', 'Firebase', 'Smart Contracts', 'Web3'],
    links: {
      email: 'salmakashif615@gmail.com',
      github: 'https://github.com/Evernode1/AXIOM-ROBOT-IDENTITY',
      twitter: 'https://x.com/betechfinder',
    },
    accent: '#F0A500',
    glow: 'rgba(240,165,0,0.12)',
  },
  {
    id: 'cofounder',
    role: 'CO-FOUNDER',
    name: 'Rai Muhammad Nawaz',
    handle: '@RMNawaz',
    initials: 'RN',
    bio: 'Co-architect of the AXIOM protocol. Drives the strategic direction of the Konnex chain integration, validator systems, and the decentralized robot registry infrastructure.',
    skills: ['Protocol Design', 'Blockchain', 'Validator Networks', 'System Architecture'],
    links: {},
    accent: '#00FFB2',
    glow: 'rgba(0,255,178,0.1)',
  },
  {
    id: 'member',
    role: 'TEAM MEMBER',
    name: 'Muhammad Yasin',
    handle: '@MYasin',
    initials: 'MY',
    bio: 'Core contributor to the AXIOM platform. Works across the full stack — from frontend components to on-chain transaction flows — ensuring the robot identity pipeline runs seamlessly.',
    skills: ['Frontend', 'React', 'API Integration', 'Testing', 'DevOps'],
    links: {},
    accent: '#4D9FFF',
    glow: 'rgba(77,159,255,0.1)',
  },
];

const C = {
  bg: '#06080F',
  bg2: '#0B0E1A',
  bg3: '#101525',
  gold: '#F0A500',
  green: '#00FFB2',
  blue: '#4D9FFF',
  txt: '#E2DDD6',
  txt2: '#7A7570',
  border: 'rgba(240,165,0,0.12)',
};

function Avatar({ member, size }) {
  const s = size || 88;
  return (
    <div style={{ width: s, height: s, flexShrink: 0, position: 'relative' }}>
      <div style={{
        width: '100%', height: '100%',
        background: member.glow,
        border: '1px solid ' + member.accent + '50',
        clipPath: 'polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 10px 100%, 0 calc(100% - 10px))',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', inset: 0,
          background: 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.06) 3px, rgba(0,0,0,0.06) 4px)',
          pointerEvents: 'none',
        }} />
        <span style={{
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: s * 0.28,
          color: member.accent,
          letterSpacing: '0.06em',
          position: 'relative', zIndex: 1,
          textShadow: '0 0 20px ' + member.accent,
        }}>
          {member.initials}
        </span>
      </div>
    </div>
  );
}

function SmallCard({ member }) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: C.bg3,
        border: '1px solid ' + (hov ? member.accent + '55' : C.border),
        clipPath: 'polygon(0 0, calc(100% - 14px) 0, 100% 14px, 100% 100%, 14px 100%, 0 calc(100% - 14px))',
        padding: '1.75rem',
        transition: 'border-color 0.3s, box-shadow 0.3s',
        boxShadow: hov ? '0 0 36px ' + member.glow : 'none',
        position: 'relative', overflow: 'hidden',
      }}
    >
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(circle at 50% 0%, ' + member.glow + ' 0%, transparent 70%)',
        opacity: hov ? 1 : 0,
        transition: 'opacity 0.4s',
        pointerEvents: 'none',
      }} />
      <div style={{ position: 'relative', zIndex: 1 }}>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', marginBottom: '1rem' }}>
          <Avatar member={member} size={72} />
          <div style={{ flex: 1 }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              background: member.accent + '12', border: '1px solid ' + member.accent + '30',
              borderRadius: 4, padding: '3px 8px', marginBottom: '0.5rem',
            }}>
              <Zap size={10} color={member.accent} />
              <span style={{
                fontFamily: "'Space Mono', monospace",
                fontSize: '0.56rem', letterSpacing: '0.14em',
                color: member.accent, textTransform: 'uppercase', fontWeight: 700,
              }}>{member.role}</span>
            </div>
            <div style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: '1.4rem', letterSpacing: '0.06em',
              color: C.txt, lineHeight: 1, marginBottom: '0.2rem',
            }}>{member.name}</div>
            <div style={{
              fontFamily: "'Space Mono', monospace",
              fontSize: '0.65rem', color: C.txt2,
            }}>{member.handle}</div>
          </div>
        </div>
        <p style={{
          fontFamily: "'DM Sans', sans-serif",
          fontSize: '0.8rem', color: C.txt2, lineHeight: 1.7,
          marginBottom: '1rem',
          borderLeft: '2px solid ' + member.accent + '30',
          paddingLeft: '0.75rem',
        }}>{member.bio}</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
          {member.skills.map(function(skill) {
            return (
              <span key={skill} style={{
                fontFamily: "'Space Mono', monospace",
                fontSize: '0.58rem', letterSpacing: '0.06em',
                background: member.accent + '08', border: '1px solid ' + member.accent + '20',
                color: member.accent, borderRadius: 4, padding: '3px 8px',
              }}>{skill}</span>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function TeamPage() {
  const founder = TEAM[0];
  const rest = TEAM.slice(1);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Space+Mono:wght@400;700&family=DM+Sans:wght@300;400;500;600&display=swap');
        @keyframes fadeUp { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
        @keyframes scanPulse { 0%,100%{opacity:1;} 50%{opacity:0.4;} }
        .ax-fade0 { animation: fadeUp 0.55s ease 0.05s both; }
        .ax-fade1 { animation: fadeUp 0.55s ease 0.15s both; }
        .ax-fade2 { animation: fadeUp 0.55s ease 0.25s both; }
        .ax-fade3 { animation: fadeUp 0.55s ease 0.4s both; }
        .ax-fade4 { animation: fadeUp 0.55s ease 0.55s both; }
        .ax-link {
          display: inline-flex; align-items: center; gap: 6px;
          background: rgba(240,165,0,0.06); border: 1px solid rgba(240,165,0,0.2);
          border-radius: 8px; padding: 7px 14px;
          font-family: 'Space Mono', monospace; font-size: 0.63rem;
          color: #7A7570; text-decoration: none; transition: all 0.2s;
        }
        .ax-link:hover { color: #F0A500; border-color: rgba(240,165,0,0.45); background: rgba(240,165,0,0.1); }
        .ax-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 1.25rem; }
        @media (max-width: 720px) {
          .ax-grid { grid-template-columns: 1fr; }
          .ax-founder-inner { flex-direction: column !important; }
          .ax-stats { flex-direction: column; align-items: flex-start !important; }
        }
      `}</style>

      {/* Grid bg */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 0,
        backgroundImage: 'linear-gradient(rgba(240,165,0,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(240,165,0,0.04) 1px, transparent 1px)',
        backgroundSize: '44px 44px', pointerEvents: 'none',
      }} />

      <div style={{ position: 'relative', zIndex: 2, paddingTop: 80 }}>

        {/* ── HERO ── */}
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '3rem 1.5rem 1.5rem', textAlign: 'center' }}>

          <div className="ax-fade0" style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            background: 'rgba(240,165,0,0.06)', border: '1px solid rgba(240,165,0,0.2)',
            borderRadius: 6, padding: '5px 14px', marginBottom: '1.25rem',
          }}>
            <Users size={12} color={C.gold} />
            <span style={{ fontFamily: "'Space Mono', monospace", fontSize: '0.63rem', color: C.gold, letterSpacing: '0.14em' }}>CORE TEAM</span>
          </div>

          <h1 className="ax-fade1" style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 'clamp(2.6rem, 6vw, 5rem)',
            letterSpacing: '0.06em', color: C.txt, lineHeight: 1, marginBottom: '0.75rem',
          }}>
            THE{' '}
            <span style={{ color: C.gold, textShadow: '0 0 40px rgba(240,165,0,0.4)' }}>AXIOM</span>
            {' '}TEAM
          </h1>

          <p className="ax-fade2" style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: '0.95rem', color: C.txt2,
            maxWidth: 520, margin: '0 auto 2rem', lineHeight: 1.7,
          }}>
            Building the decentralized Robot Identity Layer on Konnex Substrate chain — one block at a time.
          </p>

          {/* Stats */}
          <div className="ax-fade2 ax-stats" style={{ display: 'flex', justifyContent: 'center', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
            {[
              { label: 'CHAIN', val: 'Konnex Testnet', color: C.gold },
              { label: 'MEMBERS', val: '3 Core', color: C.green },
              { label: 'STATUS', val: 'Building', color: C.blue },
            ].map(function(s) {
              return (
                <div key={s.label} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  background: s.color + '0A', border: '1px solid ' + s.color + '20',
                  borderRadius: 6, padding: '5px 12px',
                }}>
                  <div style={{ width: 5, height: 5, borderRadius: '50%', background: s.color, boxShadow: '0 0 6px ' + s.color }} />
                  <span style={{ fontFamily: "'Space Mono', monospace", fontSize: '0.6rem', color: C.txt2, letterSpacing: '0.08em' }}>{s.label}</span>
                  <span style={{ fontFamily: "'Space Mono', monospace", fontSize: '0.6rem', color: s.color }}>{s.val}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── DIVIDER ── */}
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 1.5rem', display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
          <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, transparent, rgba(240,165,0,0.2))' }} />
          <Cpu size={15} color="rgba(240,165,0,0.35)" />
          <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, rgba(240,165,0,0.2), transparent)' }} />
        </div>

        {/* ── CARDS ── */}
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 1.5rem 4rem' }}>

          {/* Founder — full width */}
          <div className="ax-fade3" style={{ marginBottom: '1.25rem' }}>
            <div style={{
              background: C.bg3,
              border: '1px solid rgba(240,165,0,0.22)',
              clipPath: 'polygon(0 0, calc(100% - 20px) 0, 100% 20px, 100% 100%, 20px 100%, 0 calc(100% - 20px))',
              padding: '2.25rem',
              position: 'relative', overflow: 'hidden',
              boxShadow: '0 0 50px rgba(240,165,0,0.05)',
            }}>
              {/* Top glow line */}
              <div style={{
                position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
                width: '55%', height: '1px',
                background: 'linear-gradient(90deg, transparent, rgba(240,165,0,0.55), transparent)',
              }} />
              {/* Corner */}
              <div style={{
                position: 'absolute', top: 0, right: 0, width: 56, height: 56,
                borderLeft: '1px solid rgba(240,165,0,0.18)',
                borderBottom: '1px solid rgba(240,165,0,0.18)',
                clipPath: 'polygon(100% 0, 100% 100%, 0 100%)',
                background: 'rgba(240,165,0,0.03)',
              }} />

              <div className="ax-founder-inner" style={{ display: 'flex', gap: '2rem', alignItems: 'flex-start', position: 'relative', zIndex: 1 }}>
                <Avatar member={founder} size={108} />
                <div style={{ flex: 1 }}>
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    background: 'rgba(240,165,0,0.1)', border: '1px solid rgba(240,165,0,0.32)',
                    borderRadius: 4, padding: '4px 10px', marginBottom: '0.55rem',
                  }}>
                    <Shield size={11} color={C.gold} />
                    <span style={{ fontFamily: "'Space Mono', monospace", fontSize: '0.58rem', letterSpacing: '0.14em', color: C.gold, fontWeight: 700 }}>
                      {founder.role}
                    </span>
                  </div>

                  <div style={{
                    fontFamily: "'Bebas Neue', sans-serif",
                    fontSize: 'clamp(1.9rem, 4vw, 2.7rem)',
                    letterSpacing: '0.06em', color: C.txt,
                    lineHeight: 1, marginBottom: '0.25rem',
                    textShadow: '0 0 35px rgba(240,165,0,0.2)',
                  }}>{founder.name}</div>

                  <div style={{ fontFamily: "'Space Mono', monospace", fontSize: '0.7rem', color: C.txt2, marginBottom: '0.9rem' }}>
                    {founder.handle}
                  </div>

                  <p style={{
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: '0.85rem', color: C.txt2, lineHeight: 1.75,
                    marginBottom: '1.1rem', maxWidth: 580,
                    borderLeft: '2px solid rgba(240,165,0,0.22)',
                    paddingLeft: '0.8rem',
                  }}>{founder.bio}</p>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '1.1rem' }}>
                    {founder.skills.map(function(skill) {
                      return (
                        <span key={skill} style={{
                          fontFamily: "'Space Mono', monospace",
                          fontSize: '0.6rem', letterSpacing: '0.06em',
                          background: 'rgba(240,165,0,0.07)', border: '1px solid rgba(240,165,0,0.2)',
                          color: C.gold, borderRadius: 4, padding: '3px 9px',
                        }}>{skill}</span>
                      );
                    })}
                  </div>

                  <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                    <a href={'mailto:' + founder.links.email} className="ax-link">
                      <Mail size={12} /> {founder.links.email}
                    </a>
                    <a href={founder.links.github} target="_blank" rel="noreferrer" className="ax-link">
                      <Github size={12} /> GitHub <ExternalLink size={10} />
                    </a>
                    <a href={founder.links.twitter} target="_blank" rel="noreferrer" className="ax-link">
                      <Twitter size={12} /> X / Twitter <ExternalLink size={10} />
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Co-founder + Member */}
          <div className="ax-fade4 ax-grid">
            {rest.map(function(member) {
              return <SmallCard key={member.id} member={member} />;
            })}
          </div>

          {/* Bottom CTA */}
          <div style={{
            marginTop: '2.5rem',
            background: C.bg3,
            border: '1px solid ' + C.border,
            clipPath: 'polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px))',
            padding: '1.5rem 2rem',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem',
          }}>
            <div>
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '1.25rem', letterSpacing: '0.06em', color: C.txt, marginBottom: '0.2rem' }}>
                EXPLORE THE PROTOCOL
              </div>
              <div style={{ fontFamily: "'Space Mono', monospace", fontSize: '0.63rem', color: C.txt2 }}>
                Register robots, submit PoPW, and join the validator network.
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
              <Link href="/registry" style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                background: 'rgba(240,165,0,0.07)', border: '1px solid rgba(240,165,0,0.28)',
                borderRadius: 8, padding: '8px 16px',
                fontFamily: "'Space Mono', monospace", fontSize: '0.66rem',
                color: C.gold, textDecoration: 'none', letterSpacing: '0.08em',
              }}>Registry <ChevronRight size={12} /></Link>
              <Link href="/popw" style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                background: 'linear-gradient(135deg, #F0A500, #D4920A)',
                border: 'none', borderRadius: 8, padding: '8px 18px',
                fontFamily: "'Space Mono', monospace", fontSize: '0.66rem',
                color: '#000', fontWeight: 700, textDecoration: 'none', letterSpacing: '0.08em',
              }}>PoPW Submit <ChevronRight size={12} /></Link>
            </div>
          </div>

        </div>
      </div>
    </>
  );
}

