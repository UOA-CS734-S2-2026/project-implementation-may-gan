import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The generated REST client is a TypeScript workspace package consumed from source.
  transpilePackages: ["@dayli/api-client"],
};

export default nextConfig;
