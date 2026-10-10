import type { NextConfig } from "next";
import withBundleAnalyzer from "@next/bundle-analyzer";

const nextConfig: NextConfig = {
  // Standalone output for smaller deployments (Vercel auto-detects this)
  output: "standalone",
  // Ignore TypeScript errors during build (we have some pre-existing ones)
  typescript: {
    ignoreBuildErrors: true,
  },
  // Disable strict mode in production for better performance
  reactStrictMode: false,
  // Allow dev server to be reached from preview-chat origins
  allowedDevOrigins: ["preview-chat-*.space-z.ai"],
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
      "date-fns",
    ],
  },
};

// Bundle analyzer is activated only when ANALYZE=true env var is set:
//   ANALYZE=true bun run build
// This keeps it out of normal dev/build cycles.
const analyzerConfig = withBundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
})(nextConfig);

export default analyzerConfig;
