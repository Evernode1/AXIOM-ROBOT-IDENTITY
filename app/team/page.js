'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Cpu, Github, Twitter, Mail, Shield, Users, Zap, ExternalLink, ChevronRight } from 'lucide-react';

const TEAM = [
  {
    id: 'founder',
    role: 'FOUNDER',
    name: 'Salma Perveen',
    handle: '@betechfinder',
    initials: 'SP',
    badge: 'FOUNDER',
    badgeColor: '#F0A500',
    bio: 'Visionary behind AXIOM — full-stack Web3 developer building the Robot Identity Layer on Konnex Substrate chain. Architect of the PoPW pipeline, on-chain integrations, and the AXIOM ecosystem.',
    skills: ['Next.js', 'Substrate', 'Firebase', 'Smart Contracts', 'Web3'],
    links: {
      email: 'salmakashif615@gmail.com',
      github: 'https://github.com/Evernode1/AXIOM-ROBOT-IDENTITY',
      twitter: 'https://x.com/betechfinder',
    },
    accent: '#F0A500',
    glow: 'rgba(240,165,0,0.15)',
    order: 1,
  },
  {
    id: 'cofounder',
    role: 'CO-FOUNDER',
    name: 'Rai Muhammad Nawaz',
    handle: '@RMNawaz',
    initials: 'RN',
    badge: 'CO-FOUNDER',
    badgeColor: '#00FFB2',
    bio: 'Co-architect of the AXIOM protocol. Drives the strategic direction of the Konnex chain integration, validator systems, and the decentralized robot registry infrastructure.',
    skills: ['Protocol Design', 'Blockchain', 'Validator Networks', 'System Architecture'],
    links: {},
    accent: '#00FFB2',
    glow: 'rgba(0,255,178,0.12)',
    order: 2,
  },
  {
    id: 'member',
    role: 'TEAM MEMBER',
    name: 'Muhammad Yasin',
    handle: '@MYasin',
    initials: 'MY',
    badge: 'ENGINEER',
    badgeColor: '#4D9FFF',
    bio: 'Core contributor to the AXIOM platform. Works across the full stack — from frontend components to on-chain transaction flows — ensuring the robot identity pipeline runs seamlessly.',
    skills: ['Frontend', 'React', 'API Integration', 'Testing', 'DevOps'],
    links: {},
    accent: '#4D9FFF',
    glow: 'rgba(77,159,255,0.12)',
    order: 3,
  },
];

const C = {
  bg:     '#06080F',
  bg2:    '#0B0E1A',
  bg3:    '#101525',
  gold:   '#F0A500',
  green:  '#00FFB2',
  blue:   '#4D9FFF',
  red:    '#FF4D6A',
  txt:    '#E2DDD6',
  txt2:   '#7A7570',
  txt3:   '#3A3835',
  border: 'rgba(240,165,0,0.12)',
};

function Avatar({ member, size = 96 }) {
  return (
    <div style={{
      width: size, height: size, flexShrink: 0, position: 'relative',
    }}>
      {/* Outer ring */}
      <div style={{
        position: 'absolute', inset: -3,
        border: `1px solid ${member.accent}40`,
        clipPath: 'polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px))',
        animation: 'rotateRing 8s linear infinite',
      }} />
      {/* Avatar body */}
      <div style={{
        width: '100%', height: '100%',
        background: `linear-gradient(135deg, ${member.glow}, rgba(0,0,0,0.6))`,
        border: `1px solid ${member.accent}50`,
        clipPath: 'polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 10px 100%, 0 calc(100% - 10px))',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Scan line effect */}
        <div style={{
          position: 'absolute', inset: 0,
          background: `repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.06) 3px, rgba(0,0,0,0.06) 4px)`,
          pointerEvents: 'none',
        }} />
        <span style={{
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: size * 0.3,
          color: member.accent,
          letterSpacing: '0.06em',
          position: 'relative', zIndex: 1,
          textShadow: `0 0 20px ${member.accent}`,
        }}>
          {member.initials}
        </span>
      </div>
    </div>
  );
}

function StatPill({ label, value, color }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      background: `${color}0A`, border: `1px solid ${color}20`,
      borderRadius: 6, padding: '5px 10px',
    }}>
      <div style={{ width: 5, height: 5, borderRadius: '50%', background: color, boxShadow: `0 0 6px ${color}` }} />
      <span style={{ fontFamily: "'Space Mono', monospace", fontSize: '0.6rem', color: C.txt2, letterSpacing: '0.08em' }}>{label}</span>
      <span style={{ fontFamily: "'Space Mono', monospace", fontSize: '0.6rem', color, letterSpacing: '0.06em' }}>{value}</span>
    </div>
  );
}

function TeamCard({ member, featured = false }) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: C.bg3,
        border: `1px solid ${hovered ? member.accent + '60' : C.border}`,
        clipPath: 'polygon(0 0, calc(100% - 16px) 0, 100% 16px, 100% 100%, 16px 100%, 0 calc(100% - 16px))',
        padding: featured ? '2.2rem' : '1.75rem',
        transition: 'border-color 0.3s, box-shadow 0.3s',
        boxShadow: hovered ? `0 0 40px ${member.glow}` : '0 0 0 transparent',
        position: 'relative', overflow: 'hidden',
        gridColumn: featured ? 'span 2' : 'span 1',
      }}
    >
      {/* Corner accent */}
      <div style={{
        position: 'absolute', top: 0, right: 0,
        width: 40, height: 40,
        borderLeft: `1px solid ${member.accent}30`,
        borderBottom: `1px solid ${member.accent}30`,
        clipPath: 'polygon(100% 0, 100% 100%, 0 100%)',
        background: `${member.accent}08`,
      }} />

      {/* Ambient glow on hover */}
      <div style={{
        position: 'absolute', inset: 0,
        background: `radial-gradient(circle at 50% 0%, ${member.glow} 0%, transparent 70%)`,
        opacity: hovered ? 1 : 0,
        transition: 'opacity 0.4s',
        pointerEvents: 'none',
      }} />

      <div style={{ position: 'relative', zIndex: 1 }}>
        {/* Header row */}
        <div style={{ display: 'flex', alignItems: featured ? 'flex-start' : 'flex-start', gap: '1.25rem', marginBottom: '1.25rem' }}>
          <Avatar member={member} size={featured ? 96 : 72} />

          <div style={{ flex: 1 }}>
            {/* Role badge */}
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              background: `${member.accent}12`, border: `1px solid ${member.accent}30`,
              borderRadius: 4, padding: '3px 8px', marginBottom: '0.5rem',
            }}>
              <Zap size={10} color={member.accent} />
              <span style={{
                fontFamily: "'Space Mono', monospace",
                fontSize: '0.58rem', letterSpacing: '0.14em',
                color: member.accent, textTransform: 'uppercase', fontWeight: 700,
              }}>
                {member.role}
              </span>
            </div>

            {/* Name */}
            <div style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: featured ? '1.8rem' : '1.45rem',
              letterSpacing: '0.06em', color: C.txt,
              lineHeight: 1, marginBottom: '0.25rem',
              textShadow: hovered ? `0 0 30px ${member.accent}40` : 'none',
              transition: 'text-shadow 0.3s',
            }}>
              {member.name}
            </div>

            {/* Handle */}
            <div style={{
              fontFamily: "'Space Mono', monospace",
              fontSize: '0.68rem', color: C.txt2, marginBottom: '0.75rem',
            }}>
              {member.handle}
            </div>

            {/* Social links */}
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {member.links.email && (
                <a href={`mailto:${member.links.email}`} style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  background: 'rgba(240,165,0,0.06)', border: `1px solid ${C.border}`,
                  borderRadius: 6, padding: '4px 9px',
                  fontFamily: "'Space Mono', monospace", fontSize: '0.58rem',
                  color: C.txt2, textDecoration: 'none', transition: 'all 0.2s',
                }}
                onMouseEnter={e => { e.currentTarget.style.color = C.gold; e.currentTarget.style.borderColor = 'rgba(240,165,0,0.4)'; }}
                onMouseLeave={e => { e.currentTarget.style.color = C.txt2; e.currentTarget.style.borderColor = C.border; }}
                >
                  <Mail size={10} /> Email
                </a>
              )}
              {member.links.github && (
                <a href={member.links.github} target="_blank" rel="noreferrer" style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  background: 'rgba(240,165,0,0.06)', border: `1px solid ${C.border}`,
                  borderRadius: 6, padding: '4px 9px',
                  fontFamily: "'Space Mono', monospace", fontSize: '0.58rem',
                  color: C.txt2, textDecoration: 'none', transition: 'all 0.2s',
                }}
                onMouseEnter={e => { e.currentTarget.style.color = C.gold; e.currentTarget.style.borderColor = 'rgba(240,165,0,0.4)'; }}
                onMouseLeave={e => { e.currentTarget.style.color = C.txt2; e.currentTarget.style.borderColor = C.border; }}
                >
                  <Github size={10} /> GitHub
                </a>
              )}
              {member.links.twitter && (
                <a href={member.links.twitter} target="_blank" rel="noreferrer" style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  background: 'rgba(240,165,0,0.06)', border: `1px solid ${C.border}`,
                  borderRadius: 6, padding: '4px 9px',
                  fontFamily: "'Space Mono', monospace", fontSize: '0.58rem',
                  color: C.txt2, textDecoration: 'none', transition: 'all 0.2s',
                }}
                onMouseEnter={e => { e.currentTarget.style.color = C.gold; e.currentTarget.style.borderColor = 'rgba(240,165,0,0.4)'; }}
                onMouseLeave={e => { e.currentTarget.style.color = C.txt2; e.currentTarget.style.borderColor = C.border; }}
                >
                  <Twitter size={10} /> X/Twitter
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Bio */}
        <p style={{
          fontFamily: "'DM Sans', sans-serif",
          fontSize: '0.82rem', color: C.txt2, lineHeight: 1.7,
          marginBottom: '1.1rem',
          borderLeft: `2px solid ${member.accent}30`,
          paddingLeft: '0.75rem',
        }}>
          {member.bio}
        </p>

        {/* Skills */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
          {member.skills.map(skill => (
            <span key={skill} style={{
              fontFamily: "'Space Mono', monospace",
              fontSize: '0.6rem', letterSpacing: '0.06em',
              background: `${member.accent}08`, border: `1px solid ${member.accent}20`,
              color: member.accent, borderRadius: 4, padding: '3px 8px',
            }}>
              {skill}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function TeamPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const founder = TEAM.find(m => m.id === 'founder');
  const rest = TEAM.filter(m => m.id !== 'founder');

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Space+Mono:wght@400;700&family=DM+Sans:wght@300;400;500;600&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        html { scroll-behavior: smooth; }
        body {
          background: #06080F;
          color: #E2DDD6;
          font-family: 'DM Sans', sans-serif;
          min-height: 100vh;
          overflow-x: hidden;
        }
        body::after {
          content: '';
          position: fixed; inset: 0;
          background: repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.04) 3px, rgba(0,0,0,0.04) 4px);
          pointer-events: none;
          z-index: 9998;
        }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: #0B0E1A; }
        ::-webkit-scrollbar-thumb { background: #F0A500; border-radius: 2px; }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes rotateRing {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes scanline {
          0%   { transform: translateY(-100%); }
          100% { transform: translateY(100vh); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        .fade-in { animation: fadeUp 0.6s ease both; }
        .fade-in-1 { animation: fadeUp 0.6s ease 0.1s both; }
        .fade-in-2 { animation: fadeUp 0.6s ease 0.2s both; }
        .fade-in-3 { animation: fadeUp 0.6s ease 0.35s both; }
        .fade-in-4 { animation: fadeUp 0.6s ease 0.5s both; }
        @media (max-width: 768px) {
          .team-grid { grid-template-columns: 1fr !important; }
          .team-grid > div { grid-column: span 1 !important; }
          .hero-stats { flex-direction: column; gap: 0.75rem !important; }
        }
      `}</style>

      {/* Grid background */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 0,
        backgroundImage: `linear-gradient(rgba(240,165,0,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(240,165,0,0.04) 1px, transparent 1px)`,
        backgroundSize: '44px 44px',
        pointerEvents: 'none',
      }} />

      {/* Scanline sweep */}
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, height: 2,
        background: 'linear-gradient(90deg, transparent, rgba(240,165,0,0.3), transparent)',
        animation: 'scanline 6s linear infinite',
        zIndex: 1, pointerEvents: 'none',
      }} />

      <div style={{ position: 'relative', zIndex: 2, paddingTop: 80 }}>

        {/* ── HERO SECTION ── */}
        <div style={{
          maxWidth: 1100, margin: '0 auto', padding: '3rem 1.5rem 2rem',
          textAlign: 'center',
        }}>
          <div className="fade-in" style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            background: 'rgba(240,165,0,0.06)', border: '1px solid rgba(240,165,0,0.2)',
            borderRadius: 6, padding: '5px 14px', marginBottom: '1.25rem',
          }}>
            <Users size={12} color={C.gold} />
            <span style={{ fontFamily: "'Space Mono', monospace", fontSize: '0.65rem', color: C.gold, letterSpacing: '0.14em' }}>
              CORE TEAM
            </span>
          </div>

          <h1 className="fade-in-1" style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 'clamp(2.8rem, 6vw, 5rem)',
            letterSpacing: '0.06em', color: C.txt, lineHeight: 1,
            marginBottom: '0.75rem',
          }}>
            THE{' '}
            <span style={{ color: C.gold, textShadow: '0 0 40px rgba(240,165,0,0.4)' }}>
              AXIOM
            </span>{' '}
            TEAM
          </h1>

          <p className="fade-in-2" style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: '0.95rem', color: C.txt2, maxWidth: 540, margin: '0 auto 2rem',
            lineHeight: 1.7,
          }}>
            Building the decentralized Robot Identity Layer on Konnex Substrate chain — one block at a time.
          </p>

          {/* Stats row */}
          <div className="fade-in-3 hero-stats" style={{
            display: 'flex', justifyContent: 'center', gap: '1.5rem', flexWrap: 'wrap',
            marginBottom: '0.5rem',
          }}>
            <StatPill label="CHAIN" value="Konnex Testnet" color={C.gold} />
            <StatPill label="MEMBERS" value="3 Core" color={C.green} />
            <StatPill label="STATUS" value="Building" color={C.blue} />
            <StatPill label="NETWORK" value="Substrate" color={C.gold} />
          </div>
        </div>

        {/* ── DIVIDER ── */}
        <div style={{
          maxWidth: 1100, margin: '0 auto', padding: '0 1.5rem',
          display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2.5rem',
        }}>
          <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, transparent, rgba(240,165,0,0.2))' }} />
          <Cpu size={16} color="rgba(240,165,0,0.4)" />
          <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, rgba(240,165,0,0.2), transparent)' }} />
        </div>

        {/* ── TEAM GRID ── */}
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 1.5rem 4rem' }}>

          {/* Founder — full width featured card */}
          <div className="fade-in-3" style={{ marginBottom: '1.5rem' }}>
            <div
              style={{
                background: C.bg3,
                border: `1px solid rgba(240,165,0,0.25)`,
                clipPath: 'polygon(0 0, calc(100% - 20px) 0, 100% 20px, 100% 100%, 20px 100%, 0 calc(100% - 20px))',
                padding: '2.5rem',
                position: 'relative', overflow: 'hidden',
                boxShadow: '0 0 60px rgba(240,165,0,0.06)',
              }}
            >
              {/* Ambient top glow */}
              <div style={{
                position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
                width: '60%', height: '1px',
                background: 'linear-gradient(90deg, transparent, rgba(240,165,0,0.6), transparent)',
              }} />

              {/* Corner deco */}
              <div style={{
                position: 'absolute', top: 0, right: 0,
                width: 60, height: 60,
                borderLeft: '1px solid rgba(240,165,0,0.2)',
                borderBottom: '1px solid rgba(240,165,0,0.2)',
                clipPath: 'polygon(100% 0, 100% 100%, 0 100%)',
                background: 'rgba(240,165,0,0.04)',
              }} />

              <div style={{
                display: 'flex', gap: '2rem', flexWrap: 'wrap', alignItems: 'flex-start',
                position: 'relative', zIndex: 1,
              }}>
                <Avatar member={founder} size={110} />

                <div style={{ flex: 1, minWidth: 260 }}>
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    background: 'rgba(240,165,0,0.1)', border: '1px solid rgba(240,165,0,0.35)',
                    borderRadius: 4, padding: '4px 10px', marginBottom: '0.6rem',
                  }}>
                    <Shield size={11} color={C.gold} />
                    <span style={{ fontFamily: "'Space Mono', monospace", fontSize: '0.6rem', letterSpacing: '0.16em', color: C.gold, fontWeight: 700 }}>
                      FOUNDER & LEAD DEVELOPER
                    </span>
                  </div>

                  <div style={{
                    fontFamily: "'Bebas Neue', sans-serif",
                    fontSize: 'clamp(2rem, 4vw, 2.8rem)',
                    letterSpacing: '0.06em', color: C.txt,
                    lineHeight: 1, marginBottom: '0.3rem',
                    textShadow: '0 0 40px rgba(240,165,0,0.2)',
                  }}>
                    {founder.name}
                  </div>

                  <div style={{
                    fontFamily: "'Space Mono', monospace",
                    fontSize: '0.72rem', color: C.txt2, marginBottom: '1rem',
                  }}>
                    {founder.handle}
                  </div>

                  <p style={{
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: '0.88rem', color: C.txt2, lineHeight: 1.75,
                    marginBottom: '1.25rem', maxWidth: 580,
                    bo
