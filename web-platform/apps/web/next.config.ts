import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@health-platform/protocol"],

  // Pinned so Turbopack doesn't infer the root by walking up to the git
  // repository root (esp32-health-device/), which sits one level above the npm
  // workspace that actually holds package-lock.json and node_modules.
  turbopack: {
    root: path.join(__dirname, "..", ".."),
  },
};

export default nextConfig;
