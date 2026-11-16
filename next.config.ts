import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Gera .next/standalone: servidor Node autocontido, publicado no Azure App Service.
  output: "standalone",
  outputFileTracingIncludes: {
    "/*": ["./database/certificates/*.crt"],
  },
  // O endereço canônico não tem "www": o login confere a origem contra APP_ORIGIN,
  // então quem chega por www.<domínio> é levado para <domínio>.
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "www\\.(?<dominio>.+)" }],
        destination: "https://:dominio/:path*",
        permanent: true,
      },
    ];
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
