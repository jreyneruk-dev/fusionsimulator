import path from "node:path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    // Explicit alias: some TS-loader combos skip tsconfig `paths` detection.
    config.resolve.alias["@" ] = path.resolve("./src");
    return config;
  },
};

export default nextConfig;
