import './globals.css';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import Script from 'next/script';

export const metadata = {
  title: 'AXIOM — Robot Identity & Memory on Konnex',
  description: 'Decentralized identity and permanent memory layer for physical-world AI. Built on Konnex Subnet.',
  openGraph: {
    title: 'AXIOM — Robot Identity & Memory',
    description: 'The identity layer for the machine economy, built on Konnex.',
    type: 'website',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        {/* Firebase SDK — loaded before page hydrates */}
        <Script
          src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"
          strategy="beforeInteractive"
        />
        <Script
          src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"
          strategy="beforeInteractive"
        />
      </head>
      <body>
        {/*
          @polkadot/api v16 ESM loader.
          MUST be type="module" — Next.js Script component doesn't support this,
          so we use dangerouslySetInnerHTML directly.
          Exposes: window.PolkadotApiPromise, window.PolkadotWsProvider, window.__polkadotApiLoaded
        */}
        <script
          type="module"
          dangerouslySetInnerHTML={{
            __html: `
              import { ApiPromise, WsProvider } from 'https://cdn.jsdelivr.net/npm/@polkadot/api@16.5.6/+esm';
              window.PolkadotApiPromise  = ApiPromise;
              window.PolkadotWsProvider  = WsProvider;
              window.__polkadotApiLoaded = true;
              console.log('[Axiom] @polkadot/api v16 loaded');
            `,
          }}
        />
        <Navbar />
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  );
}
