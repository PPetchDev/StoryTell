import type { NextConfig } from 'next';

// Where the NestJS API listens. The browser only ever talks to this Next.js server, which
// proxies /api/* to the API, so Tailscale serve fronts a single port. Read at `next dev`,
// and at `next build` for a production build, so set it for both.
const apiOrigin = process.env.API_ORIGIN ?? 'http://127.0.0.1:4001';

const nextConfig: NextConfig = {
    // Playwright sets its own, so E2E can run beside a running `npm run dev`.
    distDir: process.env.NEXT_DIST_DIR ?? '.next',
    poweredByHeader: false,
    async rewrites() {
        return [{ source: '/api/:path*', destination: `${apiOrigin}/api/:path*` }];
    },
    async headers() {
        return [
            {
                // A stale service worker would pin an old app shell, so always revalidate it.
                source: '/sw.js',
                headers: [{ key: 'Cache-Control', value: 'no-cache' }],
            },
        ];
    },
};

export default nextConfig;
