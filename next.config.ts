import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  // Allow local-device WebView origin during iOS real-device development.
  // Update this IP when your Mac's LAN IP changes.
  allowedDevOrigins: ["127.0.0.1", "localhost", "172.30.1.96"],
};

export default nextConfig;
