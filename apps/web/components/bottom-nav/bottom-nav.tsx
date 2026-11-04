'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ReactNode } from 'react';

import styles from './bottom-nav.module.css';

const icon = (children: ReactNode, fill = false) => (
    <svg
        viewBox="0 0 24 24"
        width="22"
        height="22"
        aria-hidden="true"
        fill={fill ? 'currentColor' : 'none'}
        stroke={fill ? 'none' : 'currentColor'}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        {children}
    </svg>
);

const LINKS = [
    {
        href: '/',
        label: 'Stories',
        icon: icon(<path d="M4 5c3-1.5 5.5-1.5 8 0v14c-2.5-1.5-5-1.5-8 0zM12 5c2.5-1.5 5-1.5 8 0v14c-3-1.5-5.5-1.5-8 0z" />),
    },
    {
        href: '/personas',
        label: 'Personas',
        icon: icon(
            <>
                <circle cx="12" cy="8" r="3.5" />
                <path d="M5 20c1-4 4-5.5 7-5.5s6 1.5 7 5.5" />
            </>,
        ),
    },
    { href: '/usage', label: 'Usage', icon: icon(<path d="M5 20V12M12 20V5M19 20v-5" />) },
    {
        href: '/settings',
        label: 'Settings',
        icon: icon(
            <>
                <circle cx="12" cy="12" r="3" />
                <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" />
            </>,
        ),
    },
];

/** The Chat screen is the one route without the bar: it gives the story the whole screen. */
const CHAT_SCREEN = /^\/stories\/[^/]+\/chats\/[^/]+\/?$/;

export function showsBottomNav(pathname: string): boolean {
    return !CHAT_SCREEN.test(pathname);
}

function isCurrent(href: string, pathname: string): boolean {
    if (href === '/') return pathname === '/' || pathname.startsWith('/stories');
    return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The fixed bottom bar (spec story 46): Stories, Personas, Usage and Settings, each an icon
 * and a label, at every width but the Chat screen. A spacer of its height ends the page, so
 * nothing scrolls out of reach behind it.
 */
export function BottomNav() {
    const pathname = usePathname();
    if (!showsBottomNav(pathname)) return null;

    return (
        <>
            <div className={styles.spacer} aria-hidden="true" />
            <nav className={styles.bar} aria-label="Main">
                <div className={styles.links}>
                    {LINKS.map((link) => (
                        <Link
                            key={link.href}
                            href={link.href}
                            className={styles.link}
                            aria-current={isCurrent(link.href, pathname) ? 'page' : undefined}
                        >
                            {link.icon}
                            <span>{link.label}</span>
                        </Link>
                    ))}
                </div>
            </nav>
        </>
    );
}
