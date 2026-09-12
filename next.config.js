/**
 * `withBundleAnalyzer` only wraps the config with something that matters when
 * ANALYZE=true is set (npm run analyze) — it opens two static treemap reports
 * (client + server bundles) in the browser after `next build` instead of
 * changing anything about a normal `npm run build`/`npm start`. This is the
 * P2 "advanced bundle analysis" item: it doesn't shrink the bundle by itself,
 * it's the tool that shows *where* the First Load JS (103 kB shared, see
 * PERFORMANCE.md) actually goes, so a real regression (e.g. someone
 * accidentally importing a heavy library) would show up as a visibly large
 * rectangle instead of a silent creep in the numbers.
 */
const withBundleAnalyzer = require("@next/bundle-analyzer")({
  enabled: process.env.ANALYZE === "true",
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
};

module.exports = withBundleAnalyzer(nextConfig);
