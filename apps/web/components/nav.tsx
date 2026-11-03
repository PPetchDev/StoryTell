'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
    { href: '/', label: 'Stories' },
    { href: '/usage', label: 'Usage' },
    { href: '/settings', label: 'Settings' },
];

export function Nav() {
    const pathname = usePathname();

    return (
        <nav className="nav" aria-label="Main">
            {LINKS.map((link) => {
                const current = link.href === '/' ? pathname === '/' : pathname.startsWith(link.href);
                return (
                    <Link key={link.href} href={link.href} aria-current={current ? 'page' : undefined}>
                        {link.label}
                    </Link>
                );
            })}
        </nav>
    );
}
