# AXIOM — Robot Identity & Memory Layer
### Built for Konnex Subnet Builder Program

> Decentralized identity and permanent memory layer for physical-world AI — built on Konnex Subnet.

---

## 🏗️ Architecture

```
axiom/
├── app/                    # Next.js 14 App Router
│   ├── layout.js           # Root layout (Navbar + Footer)
│   ├── globals.css         # Design system (colors, fonts, utilities)
│   ├── page.js             # Landing page (hero, features, grant tiers)
│   ├── registry/page.js    # Robot identity minting + registry list
│   ├── memory/page.js      # Immutable task memory vault
│   ├── fleet/page.js       # Fleet analytics dashboard (Recharts)
│   └── popw/page.js        # PoPW submission + live hash generation
├── components/
│   ├── Navbar.js           # Fixed nav with live block indicator
│   └── Footer.js           # Links, status, network info
└── lib/
    ├── data.js             # Mock robots, memories, network metrics
    └── utils.js            # Hash generation, formatting, scoring
```

## 🎨 Design System

| Token         | Value                |
|--------------|----------------------|
| Background   | `#06080F`            |
| Surface      | `#101525`            |
| Gold Accent  | `#F0A500`            |
| Live Green   | `#00FFB2`            |
| Text Primary | `#E2DDD6`            |
| Font Display | Bebas Neue           |
| Font Data    | Space Mono           |
| Font Body    | DM Sans              |

## 🚀 Features

| Feature | Description |
|---|---|
| **Robot Identity Minting** | Generate unique `AXM-XXXX-YYYY` IDs from operator + type + wallet |
| **Reputation Score** | 0–100 score from tasks completed, success rate, and network age |
| **Memory Vault** | Searchable, filterable log of all task submissions |
| **PoPW Hash Generator** | Cryptographic proof computed live with animated stages |
| **Fleet Dashboard** | Area charts, bar charts, donut charts via Recharts |
| **Persistent Storage** | localStorage for user-registered robots and tasks |

---

## ⚡ Local Development

```bash
# 1. Install dependencies
npm install

# 2. Start dev server
npm run dev

# 3. Open http://localhost:3000
```

## 🌐 Deploy to Vercel

### Option A — Vercel CLI (fastest)
```bash
npm install -g vercel
vercel --prod
```

### Option B — GitHub + Vercel Dashboard
1. Push this repo to GitHub
2. Go to [vercel.com](https://vercel.com) → New Project
3. Import your GitHub repo
4. Framework: **Next.js** (auto-detected)
5. Click **Deploy**

> ⚠️ Note: `next.config.js` uses `output: 'export'` for static export.
> If you want server-side features later, remove that line.

---

## 🔑 Grant Application Notes (Konnex)

This project targets the **Robot Identity & Memory** category with:

- **Working prototype**: Live registration, memory vault, fleet analytics, PoPW submission
- **PoPW native**: Every task generates a cryptographic hash (demonstrating Konnex's core mechanic)
- **Subnet-ready**: Architecture designed to connect to Konnex testnet RPC when live
- **Open source**: Fully client-side, no hidden dependencies

**Target tier**: LAUNCH ($75,000) — working demo on Konnex testnet

---

## 🛣️ Roadmap (Post-Grant)

- [ ] Connect to Konnex testnet RPC (wagmi + viem)
- [ ] Deploy AXIOM Identity smart contract
- [ ] On-chain PoPW memory contract
- [ ] Cross-robot knowledge graph API
- [ ] KNX staking for robot operators
- [ ] Mainnet deployment

---

Built with ❤️ for the Konnex Builder Program · [subnets.testnet.konnex.world/builders](https://subnets.testnet.konnex.world/builders)
