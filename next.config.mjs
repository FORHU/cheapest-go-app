import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import { withSentryConfig } from "@sentry/nextjs";
import createNextIntlPlugin from "next-intl/plugin";

const require = createRequire(import.meta.url);

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = process.env.NODE_ENV === 'development';

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  experimental: {
    nodeMiddleware: true,
  },
  turbopack: {
    root: __dirname,
    resolveAlias: {
      tailwindcss: require.resolve("tailwindcss"),
    },
  },
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [320, 480, 640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 64, 96, 128, 256, 320],
    localPatterns: [
      { pathname: '/api/**' },
      { pathname: '/_next/**' },
    ],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
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
            value: "camera=(self), microphone=(self), geolocation=(self)",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              // 'unsafe-inline' is still required because Next.js injects inline hydration scripts.
              // Removing it requires nonce-based CSP via middleware (tracked as future hardening).
              // 'unsafe-eval' is only included in development for React Fast Refresh (HMR).
              `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''} blob: https://js.stripe.com https://api.mapbox.com https://cdn.jsdelivr.net`,
              // 'unsafe-inline' is required for Tailwind/CSS-in-JS utility classes.
              "style-src 'self' 'unsafe-inline' https://api.mapbox.com",
              "img-src 'self' data: blob: https: http:",
              "font-src 'self' data:",
              `connect-src 'self' ${isDev ? '*' : ''} https://*.supabase.co wss://*.supabase.co https://api.stripe.com https://q.stripe.com https://m.stripe.com https://b.stripecdn.com https://r.stripe.com https://api.mapbox.com https://events.mapbox.com`,
              "frame-src 'self' https://js.stripe.com https://hooks.stripe.com https://q.stripe.com",
              "worker-src 'self' blob:",
              "child-src 'self' blob:",
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

export default withSentryConfig(withNextIntl(nextConfig), {
  // Suppress noisy Sentry CLI output during builds
  silent: !process.env.CI,
  // Upload source maps only in CI/production to avoid leaking them locally
  disableClientWebpackPlugin: !process.env.SENTRY_AUTH_TOKEN,
  disableServerWebpackPlugin: !process.env.SENTRY_AUTH_TOKEN,
  // Automatically tree-shake Sentry logger statements in production
  hideSourceMaps: true,
});
