/** Elements dropped with everything in them: page furniture, not the page's text. */
const DROPPED = ['script', 'style', 'noscript', 'template', 'svg', 'nav', 'header', 'footer', 'aside', 'form'];
/** Blocks that end a paragraph: a blank line before and after. */
const PARAGRAPHS = ['p', 'blockquote', 'section', 'article', 'main', 'table', 'pre', 'ul', 'ol', 'dl'];
/** Blocks that end a line. */
const LINES = ['div', 'tr', 'dt', 'dd', 'figure', 'figcaption'];

/** The named entities a page's text commonly carries; the rest are left as written. */
const NAMED_ENTITIES: Record<string, string> = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
    ensp: ' ',
    emsp: ' ',
    thinsp: ' ',
    ndash: '–',
    mdash: '—',
    hellip: '…',
    lsquo: '‘',
    rsquo: '’',
    sbquo: '‚',
    ldquo: '“',
    rdquo: '”',
    bdquo: '„',
    laquo: '«',
    raquo: '»',
    middot: '·',
    bull: '•',
    copy: '©',
    reg: '®',
    trade: '™',
    deg: '°',
    times: '×',
    divide: '÷',
    para: '¶',
    sect: '§',
    euro: '€',
    pound: '£',
    yen: '¥',
    cent: '¢',
    iexcl: '¡',
    iquest: '¿',
    shy: '',
    zwj: '‍',
    zwnj: '‌',
    aacute: 'á',
    agrave: 'à',
    acirc: 'â',
    auml: 'ä',
    atilde: 'ã',
    aring: 'å',
    aelig: 'æ',
    ccedil: 'ç',
    eacute: 'é',
    egrave: 'è',
    ecirc: 'ê',
    euml: 'ë',
    iacute: 'í',
    igrave: 'ì',
    icirc: 'î',
    iuml: 'ï',
    ntilde: 'ñ',
    oacute: 'ó',
    ograve: 'ò',
    ocirc: 'ô',
    ouml: 'ö',
    otilde: 'õ',
    oslash: 'ø',
    szlig: 'ß',
    uacute: 'ú',
    ugrave: 'ù',
    ucirc: 'û',
    uuml: 'ü',
    yacute: 'ý',
    yuml: 'ÿ',
    Eacute: 'É',
    Aacute: 'Á',
    Ouml: 'Ö',
    Uuml: 'Ü',
    Auml: 'Ä',
};

/** Named and numeric character references, decoded. */
export function decodeEntities(text: string): string {
    return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (whole, name: string) => {
        if (name.startsWith('#')) {
            const code = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
            return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
        }
        return NAMED_ENTITIES[name] ?? NAMED_ENTITIES[name.toLowerCase()] ?? whole;
    });
}

/** The inside of the first `<tag>…</tag>`, or null when there is none. */
function inside(html: string, tag: string): string | null {
    const open = new RegExp(`<${tag}\\b[^>]*>`, 'i').exec(html);
    if (!open) return null;
    const rest = html.slice(open.index + open[0].length);
    const close = new RegExp(`</${tag}\\s*>`, 'i').exec(rest);
    return close ? rest.slice(0, close.index) : rest;
}

/** Removes every `<tag>…</tag>` with its content, innermost first, so nested ones go too. */
function dropElements(html: string, tags: string[]): string {
    const pattern = new RegExp(`<(${tags.join('|')})\\b[^>]*>(?:(?!<\\1\\b)[\\s\\S])*?</\\1\\s*>`, 'gi');
    let previous: string;
    let current = html;
    do {
        previous = current;
        current = current.replace(pattern, ' ');
    } while (current !== previous);
    // An element never closed runs to the end.
    return current.replace(new RegExp(`<(${tags.join('|')})\\b[^>]*>[\\s\\S]*$`, 'i'), ' ');
}

/** A page's title: its `<title>`, trimmed of a trailing " - Site name" (or " | ", " – ", " — "). */
export function pageTitle(html: string): string {
    const raw = inside(html, 'title');
    if (raw === null) return '';
    const title = decodeEntities(raw.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
    const cut = title.match(/^(.+?)\s+[-|–—]\s+[^-|–—]+$/);
    return (cut ? cut[1] : title).trim();
}

/**
 * A web page as plain text (.scratch/documents/spec.md: "HTML to text"). Pure, with no
 * dependency: the `<article>`, else the `<main>`, else the `<body>`; page furniture dropped;
 * blocks become line breaks, headings keep a leading `#` and list items a `-`; the other tags
 * stripped, entities decoded and whitespace collapsed.
 */
export function htmlToText(html: string): { title: string; text: string } {
    const withoutComments = html.replace(/<!--[\s\S]*?-->/g, ' ');
    const title = pageTitle(withoutComments);
    // Furniture first, so an <article> inside a dropped <aside> is never the one taken.
    const cleaned = dropElements(
        withoutComments.replace(/<head\b[\s\S]*?<\/head\s*>/i, ' ').replace(/<title\b[\s\S]*?<\/title\s*>/gi, ' '),
        DROPPED,
    );
    const content = inside(cleaned, 'article') ?? inside(cleaned, 'main') ?? inside(cleaned, 'body') ?? cleaned;

    // The page's own line breaks are only spaces in HTML; the tags say where lines end. Breaks
    // are marked first and settled after, so neighbouring blocks make one break, not several.
    const LINE = '\u0001';
    const PARAGRAPH = '\u0002';
    const marked = content
        .replace(/\s+/g, ' ')
        .replace(/<h([1-6])\b[^>]*>/gi, (_, level: string) => `${PARAGRAPH}${'#'.repeat(Number(level))} `)
        .replace(/<\/h[1-6]\s*>/gi, PARAGRAPH)
        .replace(/<li\b[^>]*>/gi, `${LINE}- `)
        .replace(/<\/li\s*>/gi, LINE)
        .replace(/<br\s*\/?>/gi, LINE)
        .replace(new RegExp(`</?(${PARAGRAPHS.join('|')})\\b[^>]*>`, 'gi'), PARAGRAPH)
        .replace(new RegExp(`</?(${LINES.join('|')})\\b[^>]*>`, 'gi'), LINE)
        .replace(/<\/?(td|th)\b[^>]*>/gi, ' ')
        .replace(/<[^>]*>/g, '');

    const text = decodeEntities(marked)
        .replace(/[ \t\f\v ]+/g, ' ')
        .replace(/[ \u0001\u0002]*[\u0001\u0002][ \u0001\u0002]*/g, (run) => (run.includes(PARAGRAPH) ? '\n\n' : '\n'))
        .split('\n')
        .map((line) => line.trim())
        // A heading or item marker left with nothing after it.
        .filter((line) => !/^(#{1,6}|-)$/.test(line))
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    return { title, text };
}
