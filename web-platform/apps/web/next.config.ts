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

  // Market-release baseline: clickjacking / sniffing / referrer hardening.
  // Deliberately no custom CSP here — a strict CSP breaks Next.js inline
  // scripts and the Socket.IO live feed; add it only with nonce support.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
