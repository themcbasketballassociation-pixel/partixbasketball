import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "crafatar.com" },
    ],
  },
};

export default nextConfig;
