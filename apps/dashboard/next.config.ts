import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: fileURLToPath(new URL("../..", import.meta.url)),
  serverExternalPackages: ["postgres"],
  poweredByHeader: false,
  // Einstellungs-Import (JSON-Datei bis 2 MB)
  experimental: { serverActions: { bodySizeLimit: "3mb" } },
};

export default nextConfig;
