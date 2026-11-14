'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ReactNode } from 'react';


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
        href: '/gallery',
        label: 'Gallery',
        icon: icon(
            <>
                <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
                <circle cx="9" cy="10" r="1.6" />
                <path d="M4 17.5l5-4.5 3.5 3 3-2.5 4.5 4" />
            </>,
        ),
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

/** The bar's height on a phone; the spacer at the end of the page matches it. */
const BAR = 'min-h-14';

const NAV =
    'fixed inset-x-0 bottom-0 z-nav border-t border-line bg-bg pb-[env(safe-area-inset-bottom)] lg:top-0 lg:right-auto lg:w-(--rail-width) lg:border-t-0 lg:border-r lg:px-2.5 lg:pt-[max(1.25rem,env(safe-area-inset-top))] lg:pb-5';

/**
 * Each tab: an icon over its label. Pressed, it darkens at once (audit M1); the current one is in
 * the text colour with an accent icon, and on the rail it sits on the accent tint.
 */
const LINK = [
    `flex flex-1 ${BAR} flex-col items-center justify-center gap-0.5 text-xs font-semibold text-muted no-underline`,
    '[-webkit-tap-highlight-color:transparent] focus-ring-inset rounded-md active:bg-surface-raised',
    'aria-[current=page]:text-text [&[aria-current=page]_svg]:text-accent',
    'lg:min-h-[4.25rem] lg:flex-none lg:gap-1 lg:rounded-xl lg:hover:bg-surface lg:hover:text-text lg:aria-[current=page]:bg-accent-soft',
].join(' ');

/**
 * The Chat screen is the one route without the bar on a phone: it gives the story the whole
 * screen. On a wide screen the side rail stays, since it takes no height from the story.
 */
const CHAT_SCREEN = /^\/stories\/[^/]+\/chats\/[^/]+\/?$/;

/** Whether `pathname` is a Chat screen, the route that gives the story the whole phone screen. */
export function isChatScreen(pathname: string): boolean {
    return CHAT_SCREEN.test(pathname);
}

/**
 * A Chat's Dashboard reads as part of its Chat, so it goes without the bar on a phone too, its
 * way back the button at its top (audit Low, Dashboard).
 */
const CHAT_DASHBOARD = /^\/stories\/[^/]+\/chats\/[^/]+\/dashboard\/?$/;

/** Whether the phone's bottom bar is left off `pathname`: the Chat screen and its Dashboard. */
export function hidesBottomNav(pathname: string): boolean {
    return CHAT_SCREEN.test(pathname) || CHAT_DASHBOARD.test(pathname);
}

/** A Story's own Gallery counts as the Gallery in the menu, not as Stories. */
const STORY_GALLERY = /^\/stories\/[^/]+\/gallery\/?$/;

function isCurrent(href: string, pathname: string): boolean {
    if (href === '/gallery') return pathname === '/gallery' || STORY_GALLERY.test(pathname);
    if (href === '/') return pathname === '/' || (pathname.startsWith('/stories') && !STORY_GALLERY.test(pathname));
    return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The main nav (spec story 46): Stories, Gallery, Personas, Usage and Settings, each an icon and a
 * label. On a phone it is a fixed bottom bar, left off the Chat screen, and a spacer of its
 * height ends the page so nothing scrolls out of reach behind it. From 1024px wide it is a side
 * rail on the left of every page, the Chat included (spec: "Desktop layout").
 */
export function BottomNav() {
    const pathname = usePathname();
    const onChat = hidesBottomNav(pathname);

    return (
        <>
            {!onChat && <div className="h-[calc(3.5rem+1px+env(safe-area-inset-bottom))] lg:hidden" aria-hidden="true" />}
            <nav className={onChat ? `${NAV} max-lg:hidden` : NAV} aria-label="Main">
                <div className="mx-auto flex max-w-[40rem] lg:max-w-none lg:flex-col lg:gap-1.5">
                    {LINKS.map((link) => (
                        <Link
                            key={link.href}
                            href={link.href}
                            className={LINK}
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
