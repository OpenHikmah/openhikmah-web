import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  output: "standalone",
  // Pin the workspace root to this project. Without it, Turbopack finds a stray
  // lockfile higher up (e.g. C:\Users\User\package-lock.json) and warns that it
  // guessed the wrong root. The dev/build scripts always run from the project dir.
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
