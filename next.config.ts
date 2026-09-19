import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Keep Turbopack rooted on this app (avoids picking up a parent lockfile)
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
