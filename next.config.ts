import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  experimental: {
    agentUpgrade: "latest",
    instantInsights: {
      validationLevel: "manual-warning"
    }
  }
};

export default nextConfig;
