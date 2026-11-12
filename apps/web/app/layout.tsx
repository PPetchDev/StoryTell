import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import { Announcer } from '@/components/announcer';
import { BottomNav } from '@/components/bottom-nav/bottom-nav';
import { ConnectionBoundary } from '@/components/connection';
import { LowCreditBanner } from '@/components/low-credit-banner';
import { ServiceWorkerRegistration } from '@/components/service-worker';
import { SignInGate } from '@/components/sign-in-gate';
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
// meta for the theme in use before the first paint (Chat looks ticket 02). viewport-fit=cover lets
// env(safe-area-inset-*) answer the notch and the home bar on an iPhone, and the page shrinks above
// an on-screen keyboard instead of being covered by it (audit M6).
export const viewport: Viewport = { viewportFit: 'cover', interactiveWidget: 'resizes-content' };

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
                <Announcer />
                {/* Outside the connection boundary: signed out, nothing of the app shows, the nav neither. */}
                <SignInGate>
                    <ConnectionBoundary>
                        {children}
                        {/* After the page, so it arrives below what is already there (audit M3). */}
                        <LowCreditBanner />
                        <BottomNav />
                    </ConnectionBoundary>
                </SignInGate>
            </body>
        </html>
    );
}
