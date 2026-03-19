import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  turbopack: {
    root: __dirname,
    resolveAlias: {
      tailwindcss: require.resolve("tailwindcss"),
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "static.cupid.travel",
      },
      {
        protocol: "https",
        hostname: "*.cupid.travel",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-DNS-Prefetch-Control", value: "on" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://js.stripe.com https://api.mapbox.com",
              "style-src 'self' 'unsafe-inline' https://api.mapbox.com",
              "img-src 'self' data: blob: https: http:",
              "font-src 'self' data:",
              "connect-src 'self' https://*.supabase.co https://api.stripe.com https://api.mapbox.com https://events.mapbox.com https://api.liteapi.travel",
              "frame-src 'self' https://js.stripe.com https://hooks.stripe.com",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-ancestors 'self'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
