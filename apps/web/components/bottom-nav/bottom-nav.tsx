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

/**
 * The Chat screen is the one route without the bar on a phone: it gives the story the whole
 * screen. On a wide screen the side rail stays, since it takes no height from the story.
 */
const CHAT_SCREEN = /^\/stories\/[^/]+\/chats\/[^/]+\/?$/;

function isCurrent(href: string, pathname: string): boolean {
    if (href === '/') return pathname === '/' || pathname.startsWith('/stories');
    return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The main nav (spec story 46): Stories, Personas, Usage and Settings, each an icon and a
 * label. On a phone it is a fixed bottom bar, left off the Chat screen, and a spacer of its
 * height ends the page so nothing scrolls out of reach behind it. From 1024px wide it is a side
 * rail on the left of every page, the Chat included (spec: "Desktop layout").
 */
export function BottomNav() {
    const pathname = usePathname();
    const onChat = CHAT_SCREEN.test(pathname);

    return (
        <>
            {!onChat && <div className={styles.spacer} aria-hidden="true" />}
            <nav className={onChat ? `${styles.bar} ${styles.railOnly}` : styles.bar} aria-label="Main">
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
