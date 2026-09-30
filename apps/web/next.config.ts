import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  // The generated REST client is a TypeScript workspace package consumed from source.
  transpilePackages: ["@dayli/api-client"],
  images: {
    // Private post media (R2) is deliberately absent: the optimizer would fetch
    // and cache it on the server. It is rendered unoptimized instead; see
    // features/posts/shared/PrivateMedia.tsx.
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
