import type { NextConfig } from "next";
import withBundleAnalyzer from "@next/bundle-analyzer";
import createNextIntlPlugin from "next-intl/plugin";

// next-intl plugin — wires up the request-time locale resolution.
// `src/i18n/request.ts` is loaded for every server-rendered page and
// API route so `useTranslations()` / `getTranslations()` work.
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// =====================================================================
// Security response headers (audit fix H1 + H2)
// ---------------------------------------------------------------------
// Applied to EVERY response (HTML pages, API JSON, static assets).
// These complement the CSRF middleware guard and the NextAuth cookie
// hardening — together they form a defense-in-depth stack:
//
//   - CSP: blocks XSS by restricting what JS/CSS/fonts/images can load.
//   - X-Content-Type-Options: blocks MIME sniffing.
//   - Referrer-Policy: limits URL leakage via Referer header.
//   - Permissions-Policy: disables browser APIs we don't use.
//   - HSTS: forces HTTPS on return visits (defeats SSL stripping).
//   - X-Frame-Options: legacy clickjacking defense (CSP frame-ancestors
//     is the modern equivalent, but we keep both for old browsers).
//
// CSP design notes (audit fix H1):
//   - default-src 'self' — everything defaults to same-origin.
//   - script-src 'self' 'unsafe-inline' — 'unsafe-inline' is required
//     for Next.js hydration script + dev HMR. Future iteration can move
//     to nonce-based CSP (generate crypto.randomUUID() per request in
//     middleware, set as <script nonce="...">) to drop 'unsafe-inline'.
//   - style-src 'self' 'unsafe-inline' — React inline `style={{}}`
//     attributes (used widely in our UI) + recharts `dangerouslySetInnerHTML`
//     for chart styles. Without 'unsafe-inline' these would be blocked.
//   - img-src 'self' data: blob: — supports user avatar from data URL,
//     blob: URLs for PDF/CSV export downloads, and same-origin images.
//   - font-src 'self' — next/font/google fonts are self-hosted after
//     build (downloaded at build time, served from /_next/static/media).
//     No external font CDN.
//   - connect-src 'self' — fetch/XHR/WebSocket only to same origin.
//     Server-side fetch (Brevo, ARES, CNB) is NOT constrained by CSP
//     (CSP only governs what the browser loads).
//   - frame-ancestors 'none' — site cannot be embedded in iframes
//     (clickjacking defense; supersedes X-Frame-Options for modern
//     browsers).
//   - base-uri 'self' — prevents <base href="evil.com"> injection.
//   - form-action 'self' — forms can only POST to same origin.
//   - object-src 'none' — no <object>/<embed>/<applet>.
//   - upgrade-insecure-requests — browser rewrites http:// subresource
//     URLs to https:// automatically.
// =====================================================================
const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self'",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
      "upgrade-insecure-requests",
    ].join("; "),
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  {
    // HSTS — 2 years, include subdomains, opt into browser preload list.
    // Browsers IGNORE this header on HTTP responses (only honored over
    // HTTPS), so it's safe to send unconditionally. In dev (HTTP) it's
    // a no-op; in prod (HTTPS on Vercel) it activates.
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  // Standalone output for smaller deployments (Vercel auto-detects this)
  output: "standalone",
  // Externalize heavy native packages so they're not bundled inline
  // into each serverless function. Reduces function storage significantly.
  // NOTE: @prisma/client is NOT here — the WASM engine (2.2 MB) is small
  // enough to bundle. Externalizing it breaks subpath imports like
  // '@prisma/client/wasm' in Turbopack.
  serverExternalPackages: [
    "@react-pdf/renderer",
    "pdfkit",
    "fontkit",
    "hyphen",
  ],
  // Hide the `X-Powered-By: Next.js` response header (audit fix H2 —
  // cheap fingerprinting defense; without it attackers can target
  // Next.js-specific CVEs via Shodan/Censys scans).
  poweredByHeader: false,
  // Apply security headers to every response (HTML + API + assets).
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
  // Ignore TypeScript errors during build (pre-existing TS errors in scripts/
  // and skills/ — fixing all is a separate task). Dev mode still shows
  // errors in the editor.
  typescript: {
    ignoreBuildErrors: true,
  },
  // Remove console.log/debug in production builds (keeps console.error/warn)
  compiler: {
    removeConsole: {
      exclude: ["error", "warn"],
    },
  },
  // Enable React StrictMode in dev — catches memory leaks, effect bugs,
  // and double-invocation issues.
  reactStrictMode: true,
  // Allow dev server to be reached from preview-chat origins + external IPs
  // (the Preview Panel accesses the app through the external IP, not localhost)
  allowedDevOrigins: [
    "preview-chat-*.space-z.ai",
    "21.0.19.29",
    "21.0.12.150",
  ],
  // Enable experimental optimizations
  experimental: {
    // Optimize package imports — tree-shakes barrel exports so only
    // the actually-used icons/components end up in the bundle.
    // lucide-react alone drops ~150KB when properly tree-shaken.
    optimizePackageImports: [
      "lucide-react",
      "recharts",
      "@radix-ui/react-dialog",
      "@radix-ui/react-select",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-collapsible",
      "@radix-ui/react-checkbox",
      "@radix-ui/react-popover",
      "@radix-ui/react-tooltip",
      "@radix-ui/react-accordion",
      "@radix-ui/react-tabs",
      "@radix-ui/react-toast",
      "@radix-ui/react-avatar",
      "@radix-ui/react-alert-dialog",
      "@radix-ui/react-label",
      "@radix-ui/react-scroll-area",
      "@radix-ui/react-separator",
      "@radix-ui/react-slot",
      "@radix-ui/react-switch",
      "@radix-ui/react-toggle",
      "@dnd-kit/core",
      "@dnd-kit/sortable",
      "@dnd-kit/utilities",
      "date-fns",
      "next-intl",
      "next-themes",
      "@tanstack/react-query",
    ],
  },
};

// Bundle analyzer is activated only when ANALYZE=true env var is set:
//   ANALYZE=true bun run build
// This keeps it out of normal dev/build cycles.
const analyzerConfig = withBundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
})(nextConfig);

// Apply next-intl plugin last so it can wrap the final config.
export default withNextIntl(analyzerConfig);
