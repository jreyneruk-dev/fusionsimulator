import path from "node:path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Pin the workspace root to this folder: the parent repo also has a
  // package-lock.json, which otherwise makes Next infer the wrong root.
  outputFileTracingRoot: path.resolve(import.meta.dirname),
};

export default nextConfig;
