import type { MetadataRoute } from 'next';

import { appName, shortName } from '@/lib/instance';

export default function manifest(): MetadataRoute.Manifest {
    return {
        id: '/',
        name: appName,
        short_name: shortName,
        description: 'Roleplay with AI-played Characters inside Stories you write.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        // PWA metadata stays literal and dark in both themes: it only colours the splash screen.
        background_color: '#16131f',
        theme_color: '#16131f',
        icons: [
            { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            {
                src: '/icons/icon-512.png',
                sizes: '512x512',
                type: 'image/png',
                purpose: 'maskable',
            },
        ],
    };
}
