import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  async redirects() {
    return [
      {
        source: "/legacy",
        destination: "/?view=legacy",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
