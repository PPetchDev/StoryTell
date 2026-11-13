import { InvalidPageAddressError } from '../../errors/story.errors.js';
import type { FetchLike } from '../../service/model-gateway/real/http.js';

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

/** An IPv4 address in a range that is never a public web page: private, shared, link-local, loopback, multicast or reserved. */
function privateIpv4(address: string): boolean {
    const parts = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(address);
    if (!parts) return false;
    const [a, b] = [Number(parts[1]), Number(parts[2])];
    return (
        a === 0 || // "this network", and 0.0.0.0, which reaches the machine itself
        a === 10 ||
        a === 127 ||
        (a === 100 && b >= 64 && b <= 127) || // shared address space; Tailscale's 100.x
        (a === 169 && b === 254) || // link-local, the cloud metadata address among them
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168) ||
        (a === 198 && (b === 18 || b === 19)) || // benchmarking
        a >= 224 // multicast and reserved
    );
}

/**
 * Whether an address, as the URL parser writes a host (`[...]` around IPv6) or as DNS answers it,
 * is on a private, local or otherwise non-public network (.scratch/accounts/spec.md: Members may
 * fetch pages too, so nothing on the server's own networks).
 */
export function isPrivateAddress(host: string): boolean {
    const address = host.toLowerCase().replace(/^\[|\]$/g, '');
    if (privateIpv4(address)) return true;
    if (!address.includes(':')) return false;
    if (address === '::' || address === '::1') return true;
    const first = address.split(':')[0];
    if (/^f[cd][0-9a-f]{0,2}$/.test(first) && first.length === 4) return true; // fc00::/7
    if (/^fe[89ab][0-9a-f]$/.test(first)) return true; // fe80::/10
    if (/^ff[0-9a-f]{2}$/.test(first)) return true; // multicast
    // IPv4-mapped: the IPv4 address in the last 32 bits.
    const dotted = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(address);
    if (dotted) return privateIpv4(dotted[1]);
    const mapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(address);
    if (mapped) {
        const high = parseInt(mapped[1], 16);
        const low = parseInt(mapped[2], 16);
        return privateIpv4(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`);
    }
    return false;
}

/** What a DNS lookup of a host answers: every address it resolves to. */
export type LookupAll = (host: string) => Promise<Array<{ address: string; family: number }>>;

/**
 * The real page fetcher with the address rule carried past DNS: a name that resolves to any
 * private address is refused before anything is sent, so a public name pointing inward can't
 * reach the server's own networks. The redirect loop calls it for every hop.
 */
export function guardedPageFetch(fetchImpl: FetchLike, lookup: LookupAll): FetchLike {
    return async (address, init) => {
        const url = new URL(address);
        if (!isPrivateAddress(url.hostname) && !/^\[|^\d+\.\d+\.\d+\.\d+$/.test(url.hostname)) {
            const answers = await lookup(url.hostname);
            if (answers.some((answer) => isPrivateAddress(answer.address))) {
                throw new InvalidPageAddressError(`That address names a private network address.`);
            }
        }
        return fetchImpl(address, init);
    };
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
    if (isPrivateAddress(url.hostname)) {
        throw new InvalidPageAddressError(`${what} names a private network address.`);
    }
    return url;
}
