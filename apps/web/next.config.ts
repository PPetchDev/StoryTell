import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { NextConfig } from 'next';

// This checkout's root. Worktrees live under .claude/worktrees/ inside the main checkout,
// and Next would otherwise pick the outermost lockfile as the root and watch every
// worktree, reloading the page whenever another session builds.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// Where the NestJS API listens. The browser only ever talks to this Next.js server, which
// proxies /api/* to the API, so Tailscale serve fronts a single port. Read at `next dev`,
// and at `next build` for a production build, so set it for both.
const apiOrigin = process.env.API_ORIGIN ?? 'http://127.0.0.1:4001';

const nextConfig: NextConfig = {
    // Playwright sets its own, so E2E can run beside a running `npm run dev`.
    distDir: process.env.NEXT_DIST_DIR ?? '.next',
    turbopack: { root: repoRoot },
    poweredByHeader: false,
    // The dev-only route badge sits in a bottom corner, over the bottom nav's first tab.
    // Compile and runtime errors still show without it.
    devIndicators: false,
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
