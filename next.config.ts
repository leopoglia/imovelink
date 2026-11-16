import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Gera .next/standalone: servidor Node autocontido, publicado no Azure App Service.
  output: "standalone",
  outputFileTracingIncludes: {
    "/*": ["./database/certificates/*.crt"],
  },
  experimental: {
    optimizePackageImports: ["iconoir-react"],
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "**.supabase.co",
      },
    ],
  },
};

export default nextConfig;
