/** @type {import('next').NextConfig} */
const nextConfig = {
  // A production build must never share `.next` with a running `next dev`.
  // `NEXT_DIST_DIR=.next-build pnpm --filter @kito/web build` isolates it.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  reactStrictMode: true,
  poweredByHeader: false,
  devIndicators: false,
  // Shared workspace packages ship TypeScript sources and are transpiled here.
  transpilePackages: [
    "@kito/config",
    "@kito/media",
    "@kito/studio",
    "@kito/types",
    "@kito/ui",
    "@kito/validation",
    "@kito/analytics",
    "@kito/auth",
    "@kito/billing",
    "@kito/chronicles",
  ],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
