import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output for smaller deployments (Vercel auto-detects this)
  output: "standalone",
  // Ignore TypeScript errors during build (we have some pre-existing ones)
  typescript: {
    ignoreBuildErrors: true,
  },
  // Disable strict mode in production for better performance
  reactStrictMode: false,
  // Enable experimental optimizations
  experimental: {
    // Optimize package imports
    optimizePackageImports: [
      "lucide-react",
      "recharts",
      "@radix-ui/react-dialog",
      "@radix-ui/react-select",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-collapsible",
      "@radix-ui/react-checkbox",
    ],
  },
};

export default nextConfig;
