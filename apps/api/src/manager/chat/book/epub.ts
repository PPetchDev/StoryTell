import { deflateRawSync } from 'node:zlib';

/**
 * The Book as an EPUB (.scratch/chat-novel/spec.md, "EPUB"): EPUB 3 with an EPUB 2 `toc.ncx` too, in a
 * ZIP written here over `node:zlib`, so no dependency is needed. `zlib.crc32` needs Node 22.2, so the
 * CRC-32 has its own table.
 */

export interface ZipEntry {
    name: string;
    data: Buffer;
    /** Stored as is; the EPUB's `mimetype` must be. */
    store?: boolean;
}

const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        table[n] = c >>> 0;
    }
    return table;
})();

export function crc32(data: Buffer): number {
    let crc = 0xffffffff;
    for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
}

/** DOS date and time, as a ZIP header stores them. */
function dosDateTime(date: Date): { time: number; date: number } {
    return {
        time: (date.getUTCHours() << 11) | (date.getUTCMinutes() << 5) | Math.floor(date.getUTCSeconds() / 2),
        date: ((Math.max(1980, date.getUTCFullYear()) - 1980) << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate(),
    };
}

/** A ZIP of the entries, in order: stored or deflated, with UTF-8 names. */
export function zip(entries: readonly ZipEntry[], now = new Date()): Buffer {
    const { time, date } = dosDateTime(now);
    const locals: Buffer[] = [];
    const centrals: Buffer[] = [];
    let offset = 0;
    for (const entry of entries) {
        const name = Buffer.from(entry.name, 'utf8');
        const crc = crc32(entry.data);
        const body = entry.store ? entry.data : deflateRawSync(entry.data);
        const method = entry.store ? 0 : 8;
        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0);
        local.writeUInt16LE(20, 4); // version needed
        local.writeUInt16LE(0x0800, 6); // UTF-8 names
        local.writeUInt16LE(method, 8);
        local.writeUInt16LE(time, 10);
        local.writeUInt16LE(date, 12);
        local.writeUInt32LE(crc, 14);
        local.writeUInt32LE(body.length, 18);
        local.writeUInt32LE(entry.data.length, 22);
        local.writeUInt16LE(name.length, 26);
        local.writeUInt16LE(0, 28);
        locals.push(local, name, body);

        const central = Buffer.alloc(46);
        central.writeUInt32LE(0x02014b50, 0);
        central.writeUInt16LE(20, 4); // made by
        central.writeUInt16LE(20, 6); // version needed
        central.writeUInt16LE(0x0800, 8);
        central.writeUInt16LE(method, 10);
        central.writeUInt16LE(time, 12);
        central.writeUInt16LE(date, 14);
        central.writeUInt32LE(crc, 16);
        central.writeUInt32LE(body.length, 20);
        central.writeUInt32LE(entry.data.length, 24);
        central.writeUInt16LE(name.length, 28);
        central.writeUInt32LE(offset, 42);
        centrals.push(central, name);
        offset += local.length + name.length + body.length;
    }
    const directory = Buffer.concat(centrals);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(entries.length, 8);
    end.writeUInt16LE(entries.length, 10);
    end.writeUInt32LE(directory.length, 12);
    end.writeUInt32LE(offset, 16);
    return Buffer.concat([...locals, directory, end]);
}

export function escapeXml(text: string): string {
    return text
        .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/** Prose split on blank lines, each paragraph's single line breaks kept. */
export function paragraphs(text: string): string[] {
    return text
        .replace(/\r\n?/g, '\n')
        .split(/\n\s*\n/)
        .map((paragraph) => paragraph.trim())
        .filter((paragraph) => paragraph !== '');
}

export interface EpubChapter {
    number: number;
    title: string;
    text: string;
}

export interface EpubBook {
    /** A stable id for the book, e.g. `storytell-chat-12`. */
    id: string;
    title: string;
    subtitle: string;
    chapters: EpubChapter[];
    modified: Date;
}

const STYLE = `body { font-family: serif; line-height: 1.6; margin: 0 5%; }
h1 { font-size: 1.4em; margin: 2em 0 0.25em; text-align: center; }
p.chapter-number { text-align: center; font-variant: small-caps; letter-spacing: 0.05em; margin: 3em 0 0; }
p { margin: 0; text-indent: 1.5em; }
h1 + p, p.first { text-indent: 0; margin-top: 1.5em; }
.title-page { text-align: center; margin-top: 30%; }
.title-page h1 { font-size: 2em; }
.title-page p { text-indent: 0; margin-top: 1em; font-style: italic; }
`;

function xhtml(title: string, body: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="en" lang="en">
<head><meta charset="UTF-8"/><title>${escapeXml(title)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head>
<body>
${body}
</body>
</html>
`;
}

function chapterFile(chapter: EpubChapter): string {
    return `chapter-${chapter.number}.xhtml`;
}

function chapterBody(chapter: EpubChapter): string {
    const prose = paragraphs(chapter.text)
        .map((paragraph, index) => `<p${index === 0 ? ' class="first"' : ''}>${escapeXml(paragraph).replace(/\n/g, '<br/>')}</p>`)
        .join('\n');
    return `<section epub:type="chapter">
<p class="chapter-number">Chapter ${chapter.number}</p>
<h1>${escapeXml(chapter.title)}</h1>
${prose}
</section>`;
}

/** The whole Book as an EPUB file. */
export function epub(book: EpubBook): Buffer {
    const modified = book.modified.toISOString().replace(/\.\d{3}Z$/, 'Z');
    const files = book.chapters.map((chapter) => ({ chapter, file: chapterFile(chapter), id: `chapter-${chapter.number}` }));
    const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id" xml:lang="en">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="book-id">${escapeXml(book.id)}</dc:identifier>
<dc:title>${escapeXml(book.title)}</dc:title>
<dc:language>en</dc:language>
<dc:creator>Storytell</dc:creator>
<meta property="dcterms:modified">${modified}</meta>
</metadata>
<manifest>
<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
<item id="style" href="style.css" media-type="text/css"/>
<item id="title-page" href="title.xhtml" media-type="application/xhtml+xml"/>
${files.map(({ file, id }) => `<item id="${id}" href="${file}" media-type="application/xhtml+xml"/>`).join('\n')}
</manifest>
<spine toc="ncx">
<itemref idref="title-page"/>
${files.map(({ id }) => `<itemref idref="${id}"/>`).join('\n')}
</spine>
</package>
`;
    const tocTitle = (chapter: EpubChapter) => `${chapter.number}. ${chapter.title}`;
    const nav = xhtml(
        'Contents',
        `<nav epub:type="toc" id="toc">
<h1>Contents</h1>
<ol>
${files.map(({ chapter, file }) => `<li><a href="${file}">${escapeXml(tocTitle(chapter))}</a></li>`).join('\n')}
</ol>
</nav>`,
    );
    const ncx = `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
<head><meta name="dtb:uid" content="${escapeXml(book.id)}"/></head>
<docTitle><text>${escapeXml(book.title)}</text></docTitle>
<navMap>
${files.map(({ chapter, file, id }, index) => `<navPoint id="${id}" playOrder="${index + 1}"><navLabel><text>${escapeXml(tocTitle(chapter))}</text></navLabel><content src="${file}"/></navPoint>`).join('\n')}
</navMap>
</ncx>
`;
    const titlePage = xhtml(book.title, `<div class="title-page"><h1>${escapeXml(book.title)}</h1><p>${escapeXml(book.subtitle)}</p></div>`);
    const container = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>
`;
    const text = (value: string) => Buffer.from(value, 'utf8');
    return zip(
        [
            { name: 'mimetype', data: text('application/epub+zip'), store: true },
            { name: 'META-INF/container.xml', data: text(container) },
            { name: 'OEBPS/content.opf', data: text(opf) },
            { name: 'OEBPS/nav.xhtml', data: text(nav) },
            { name: 'OEBPS/toc.ncx', data: text(ncx) },
            { name: 'OEBPS/style.css', data: text(STYLE) },
            { name: 'OEBPS/title.xhtml', data: text(titlePage) },
            ...files.map(({ chapter, file }) => ({ name: `OEBPS/${file}`, data: text(xhtml(chapter.title, chapterBody(chapter))) })),
        ],
        book.modified,
    );
}
