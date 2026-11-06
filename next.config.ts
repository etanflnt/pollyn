import type { NextConfig } from "next";

// Teams loads the app inside an iframe, so allow framing by Teams/Office hosts.
const frameAncestors =
  "frame-ancestors 'self' https://teams.microsoft.com https://*.teams.microsoft.com https://*.office.com https://*.microsoft365.com https://*.cloud.microsoft https://*.skype.com";

const nextConfig: NextConfig = {
  // Loaded from node_modules at runtime instead of bundled (PGlite ships WASM + data files).
  serverExternalPackages: ["@electric-sql/pglite", "postgres"],
  // On Vercel the app always uses Postgres (DATABASE_URL), so keep the 26 MB PGlite out of every function.
  ...(process.env.VERCEL ? { outputFileTracingExcludes: { "**": ["node_modules/@electric-sql/pglite/**"] } } : {}),
  // Allow HTTPS dev tunnels (Teams needs https) to load dev assets.
  allowedDevOrigins: ["*.devtunnels.ms", "*.ngrok-free.app", "*.ngrok.app"],
  async headers() {
    return [{ source: "/:path*", headers: [{ key: "Content-Security-Policy", value: frameAncestors }] }];
  },
};
export default nextConfig;
