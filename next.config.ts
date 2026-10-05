import type { NextConfig } from "next";
const config: NextConfig = {
  output: "standalone",
  devIndicators: false,
  serverExternalPackages: ["@prisma/client", "pdf-parse", "mammoth"],
  experimental: { proxyClientMaxBodySize: "16mb" },
};
export default config;
