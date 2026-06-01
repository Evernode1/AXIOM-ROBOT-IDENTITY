/** @type {import('next').NextConfig} */
const nextConfig = {
  // Dynamic mode — required for API routes + Vercel KV
  images: { unoptimized: true },
};

module.exports = nextConfig;
