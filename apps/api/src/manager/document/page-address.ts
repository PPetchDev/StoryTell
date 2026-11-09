import { InvalidPageAddressError } from '../../errors/story.errors.js';

/**
 * Whether a host names this PC itself: `localhost`, a name ending in `.localhost`, or a loopback
 * address (`127.0.0.0/8`, `::1`, `::ffff:127.x.x.x`). The host is as the WHATWG URL parser leaves
 * it, which already turns `127.1`, `2130706433` and `0x7f.1` into `127.0.0.1`, and writes
 * `::ffff:127.0.0.1` as `[::ffff:7f00:1]`.
 */
export function isThisPc(hostname: string): boolean {
    const host = hostname.toLowerCase().replace(/\.$/, '');
    if (host === 'localhost' || host.endsWith('.localhost')) return true;
    if (/^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
    if (host.startsWith('[') && host.endsWith(']')) {
        const ipv6 = host.slice(1, -1);
        if (ipv6 === '::1') return true;
        // An IPv4-mapped address: its last 32 bits are the IPv4 one, whose first byte 127 is 0x7f.
        const mapped = /^::ffff:([0-9a-f]{1,4}):[0-9a-f]{1,4}$/.exec(ipv6);
        if (mapped && mapped[1].padStart(4, '0').startsWith('7f')) return true;
        const dotted = /^::ffff:(\d{1,3})\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.exec(ipv6);
        if (dotted && dotted[1] === '127') return true;
    }
    return false;
}

/**
 * The address rule (.scratch/documents/spec.md: "Files and web pages"), for the address given
 * and for every redirect: only `http:` and `https:`, no credentials, and never this PC itself,
 * so a page can't turn the API on the PC. `base` resolves a redirect's relative `Location`.
 * Throws `InvalidPageAddressError` saying which.
 */
export function checkPageAddress(address: string, base?: URL): URL {
    let url: URL;
    try {
        url = new URL(address.trim(), base);
    } catch {
        throw new InvalidPageAddressError(`"${address}" is not a web address.`);
    }
    const what = base ? `The page redirects to ${url.href}, which` : 'That address';
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new InvalidPageAddressError(`${what} is not an http or https address.`);
    }
    if (url.username !== '' || url.password !== '') {
        throw new InvalidPageAddressError(`${what} carries a user name or password.`);
    }
    if (isThisPc(url.hostname)) {
        throw new InvalidPageAddressError(`${what} names this PC itself.`);
    }
    return url;
}
