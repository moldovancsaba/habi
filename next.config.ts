import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  async rewrites() {
    return [{ source: "/legacy", destination: "/legacy/index.html" }];
  },
};

export default nextConfig;
