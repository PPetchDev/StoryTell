import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import { BottomNav } from '@/components/bottom-nav/bottom-nav';
import { ConnectionBoundary } from '@/components/connection';
import { LowCreditBanner } from '@/components/low-credit-banner';
import { ServiceWorkerRegistration } from '@/components/service-worker';
import { ThemeSync } from '@/components/theme-sync';
import { appName } from '@/lib/instance';
import { THEME_SCRIPT } from '@/lib/theme-script';
import './globals.css';

export const metadata: Metadata = {
    title: appName,
    description: 'Roleplay with AI-played Characters inside Stories you write.',
    appleWebApp: { capable: true, title: appName, statusBarStyle: 'black-translucent' },
    icons: { apple: '/icons/apple-touch-icon.png' },
};

// The theme colour and colour scheme are not set here: the head script below makes the theme-color
// meta for the theme in use before the first paint (Chat looks ticket 02).
export const viewport: Viewport = {};

export default function RootLayout({ children }: { children: ReactNode }) {
    return (
        // The head script sets data-theme before React hydrates, so <html> differs from the server's.
        <html lang="en" suppressHydrationWarning>
            <head>
                <meta name="color-scheme" content="dark light" />
                <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
            </head>
            <body>
                <ThemeSync />
                <ServiceWorkerRegistration />
                <ConnectionBoundary>
                    <LowCreditBanner />
                    {children}
                    <BottomNav />
                </ConnectionBoundary>
            </body>
        </html>
    );
}
