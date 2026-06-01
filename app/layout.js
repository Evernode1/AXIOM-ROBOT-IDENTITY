import './globals.css';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

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
      <body>
        <Navbar />
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  );
}
