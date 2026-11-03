import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import { ConnectionBoundary } from '@/components/connection';
import { ServiceWorkerRegistration } from '@/components/service-worker';
import { appName } from '@/lib/instance';
import './globals.css';

export const metadata: Metadata = {
    title: appName,
    description: 'Roleplay with AI-played Characters inside Stories you write.',
    appleWebApp: { capable: true, title: appName, statusBarStyle: 'black-translucent' },
    icons: { apple: '/icons/apple-touch-icon.png' },
};

export const viewport: Viewport = {
    themeColor: '#16131f',
    colorScheme: 'dark',
};

export default function RootLayout({ children }: { children: ReactNode }) {
    return (
        <html lang="en">
            <body>
                <ServiceWorkerRegistration />
                <ConnectionBoundary>{children}</ConnectionBoundary>
            </body>
        </html>
    );
}
