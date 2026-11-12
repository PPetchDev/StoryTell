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
    // `next dev` refuses dev-only requests (the HMR socket among them) from any hostname but
    // localhost, and a page that can't open the socket sits on "Loading…". Dev is played from a
    // phone over the tailnet too: the PC's *.ts.net name (Tailscale serve) and its 100.x address.
    // Dev only; a production build ignores this.
    allowedDevOrigins: ['**.ts.net', '100.*.*.*'],
    experimental: {
        // E2E turns it off: a dev cache left by the previous run made the first page of the
        // next run reload in a loop ("HMR hash mismatch") until the cache was deleted.
        turbopackFileSystemCacheForDev: process.env.NEXT_DEV_FS_CACHE !== 'off',
        // The /api rewrite buffers each request body up to this size and cuts the rest (10 MB by
        // default). A Character card goes through as picked, up to the API's 15 MB, so the body
        // must pass whole; a bigger one must reach the API too, so it answers its own size error.
        proxyClientMaxBodySize: '20mb',
        // The /api rewrite gives up on an answer after 30 s by default ("socket hang up"), while
        // the API goes on and the provider still bills. Drawing an Expression or a Reference image,
        // a long Thai reading or Write for me can take longer, so wait as long as the slowest does.
        proxyTimeout: 180_000,
    },
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
