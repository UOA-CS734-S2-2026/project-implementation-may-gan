import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The generated REST client is a TypeScript workspace package consumed from source.
  transpilePackages: ["@dayli/api-client"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
      },
    ],
  },
};

export default nextConfig;
