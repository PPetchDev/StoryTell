import { inflateRawSync } from 'node:zlib';

import {
    BOOK_CHAPTER_MAX_TOKENS,
    BookChapterInput,
    BookSourceMessage,
    bookChapterMessages,
    bookChapterPriceUsd,
    bookChapterRejection,
    parseBookChapter,
    sourceBlock,
    sourceHash,
    targetWords,
} from '../src/manager/chat/book/book.js';
import { crc32, epub, escapeXml, paragraphs, zip } from '../src/manager/chat/book/epub.js';

/** Turn a Chat into a novel (.scratch/chat-novel/spec.md): the pure parts. */

const MESSAGES: BookSourceMessage[] = [
    { kind: 'ai', parts: [{ kind: 'narration', text: 'Smoke curls from the fire.' }, { kind: 'speech', characterId: 1, speakerName: 'Nara', text: 'Drink, guest.' }] },
    { kind: 'user', name: 'Ash', text: 'I sip the milk. *It bites.*' },
    { kind: 'ai', parts: [{ kind: 'speech', characterId: 1, speakerName: 'Nara', text: '“Slowly.”' }] },
];

function input(overrides: Partial<BookChapterInput> = {}): BookChapterInput {
    return {
        storyTitle: 'The Steppe',
        setting: "A herders' camp on the steppe.",
        tense: 'past',
        identity: { name: 'Ash', description: 'A trader passing through.' },
        cast: [{ name: 'Nara', appearance: 'Tall, with a braid.' }],
        number: 2,
        sceneName: "Mare's milk",
        messages: MESSAGES,
        previousText: null,
        ...overrides,
    };
}

describe('Book chapter writer: its input', () => {
    it('reads a user Message under its name, and speech as Name: "…" without chat tags', () => {
        expect(sourceBlock(MESSAGES[1])).toBe('[Ash]\nI sip the milk. *It bites.*');
        expect(sourceBlock(MESSAGES[0])).toBe('[Story]\nSmoke curls from the fire.\n\nNara: "Drink, guest."');
        // Quotes already around a line are not doubled.
        expect(sourceBlock(MESSAGES[2])).toBe('[Story]\nNara: "Slowly."');
        expect(sourceBlock(MESSAGES[0])).not.toContain('@');
    });

    it('gives the rules, the frame and the Messages, and nothing a Character keeps hidden', () => {
        const [system, user] = bookChapterMessages(input());
        expect(system.role).toBe('system');
        expect(system.content).toContain('third person and the past tense');
        expect(system.content).toContain('call them Ash');
        expect(system.content).toContain('Never write "you"');
        expect(system.content).toContain('Never guess Ash');
        expect(system.content).toContain('Everyone in the story is an adult');
        expect(system.content).toContain('no "@"');
        expect(system.content).toContain('Title: ');
        expect(user.content).toContain("A herders' camp on the steppe.");
        expect(user.content).toContain('Ash: A trader passing through.');
        expect(user.content).toContain('- Nara: Tall, with a braid.');
        expect(user.content).toContain('chapter 2, played in the scene "Mare\'s milk"');
        expect(user.content).toContain('[Ash]\nI sip the milk.');
        // The cast reaches it by name and Appearance only: no Personality, Secrets or Scene goal can.
        expect(user.content).not.toMatch(/secret|personality|move-on|condition/i);
        expect(user.content).not.toContain('chapter before ended');
    });

    it('writes in the present tense for a Story told in it', () => {
        expect(bookChapterMessages(input({ tense: 'present' }))[0].content).toContain('the present tense');
    });

    it('gives only the tail of the chapter before, as context', () => {
        const previous = `${'Long ago. '.repeat(200)}Ash slept by the fire at last.`;
        const user = bookChapterMessages(input({ previousText: previous }))[1].content;
        expect(user).toContain("How the chapter before ended, for context only (don't repeat it):");
        expect(user).toContain('Ash slept by the fire at last.');
        expect(user.length).toBeLessThan(bookChapterMessages(input())[1].content.length + 800);
    });

    it('aims at the Chapter’s own length, between 400 and 2,000 words', () => {
        expect(targetWords(MESSAGES)).toBe(400);
        const long: BookSourceMessage[] = [{ kind: 'user', name: 'Ash', text: 'word '.repeat(1234) }];
        expect(targetWords(long)).toBe(1250);
        expect(targetWords([{ kind: 'user', name: 'Ash', text: 'word '.repeat(9000) }])).toBe(2000);
        expect(bookChapterMessages(input())[0].content).toContain('About 400 words.');
    });

    it('prices a write from the prompt and the target length, rounded up to a tenth of a cent', () => {
        const messages = [{ role: 'user' as const, content: 'x'.repeat(35_000) }];
        // 10,000 prompt tokens at $1/M and 1,000 words × 1.5 tokens at $2/M: $0.01 + $0.003.
        expect(bookChapterPriceUsd(messages, 1000, { input: 1, output: 2 })).toBe(0.013);
        expect(bookChapterPriceUsd([{ role: 'user', content: 'x' }], 400, { input: 0.5625, output: 2.5 })).toBe(0.002);
    });
});

describe('Book chapter writer: its answer', () => {
    it('reads the title in each form, and falls back to the Scene name', () => {
        expect(parseBookChapter('Title: Mare’s Milk at Dusk\n\nThe fire smoked.', 'Scene')).toEqual({ title: 'Mare’s Milk at Dusk', text: 'The fire smoked.' });
        expect(parseBookChapter('# The Guest\n\nThe fire smoked.', 'Scene')!.title).toBe('The Guest');
        expect(parseBookChapter('**Title: "The Guest"**\n\nThe fire smoked.', 'Scene')!.title).toBe('The Guest');
        expect(parseBookChapter('**Chapter 2: The Guest**\n\nThe fire smoked.', 'Scene')!.title).toBe('The Guest');
        expect(parseBookChapter('The fire smoked.\n\n\n\nAsh drank.', 'Scene')).toEqual({ title: 'Scene', text: 'The fire smoked.\n\nAsh drank.' });
        expect(parseBookChapter('Title: Only a title', 'Scene')).toBeNull();
        expect(parseBookChapter('   ', 'Scene')).toBeNull();
    });

    it('refuses an answer cut off at the cap, or with chat leftovers', () => {
        expect(bookChapterRejection('Prose.', BOOK_CHAPTER_MAX_TOKENS, [])).toMatch(/length cap/);
        expect(bookChapterRejection('The fire smoked.\n\n@Nara: Drink.', 100, ['Nara'])).toMatch(/@Name:/);
        expect(bookChapterRejection('[Ash]\nI drink.', 100, ['Ash', 'Story'])).toMatch(/\[Name\]/);
        expect(bookChapterRejection('[Story]\nThe fire.', 100, [])).toMatch(/\[Name\]/);
        // An email-like @ or a bracketed aside that names no speaker is prose.
        expect(bookChapterRejection('She wrote to ash@camp: nothing.\n\n[a long pause] Then Nara spoke.', 100, ['Nara'])).toBeNull();
    });
});

describe('Book chapter: out of date', () => {
    it('changes with a Message of the Chapter, and with its Scene name, and not otherwise', () => {
        const hash = sourceHash("Mare's milk", MESSAGES);
        expect(sourceHash("Mare's milk", structuredClone(MESSAGES))).toBe(hash);
        const edited = structuredClone(MESSAGES);
        (edited[1] as { text: string }).text = 'I gulp the milk.';
        expect(sourceHash("Mare's milk", edited)).not.toBe(hash);
        expect(sourceHash('The guest tent', MESSAGES)).not.toBe(hash);
        expect(sourceHash("Mare's milk", [...MESSAGES, { kind: 'user', name: 'Ash', text: 'More.' }])).not.toBe(hash);
    });
});

/** The entries of a ZIP, read back from its central directory, checking each local header and CRC. */
function unzip(file: Buffer): Array<{ name: string; method: number; data: Buffer }> {
    const end = file.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    expect(end).toBeGreaterThan(0);
    const count = file.readUInt16LE(end + 10);
    let at = file.readUInt32LE(end + 16);
    const entries = [];
    for (let i = 0; i < count; i++) {
        expect(file.readUInt32LE(at)).toBe(0x02014b50);
        const method = file.readUInt16LE(at + 10);
        const crc = file.readUInt32LE(at + 16);
        const compressed = file.readUInt32LE(at + 20);
        const size = file.readUInt32LE(at + 24);
        const nameLength = file.readUInt16LE(at + 28);
        const offset = file.readUInt32LE(at + 42);
        const name = file.subarray(at + 46, at + 46 + nameLength).toString('utf8');
        expect(file.readUInt32LE(offset)).toBe(0x04034b50);
        const localName = file.readUInt16LE(offset + 26);
        const body = file.subarray(offset + 30 + localName, offset + 30 + localName + compressed);
        const data = method === 0 ? body : inflateRawSync(body);
        expect(data.length).toBe(size);
        expect(crc32(data)).toBe(crc);
        entries.push({ name, method, data });
        at += 46 + nameLength;
    }
    return entries;
}

describe('EPUB', () => {
    it('computes the standard CRC-32', () => {
        expect(crc32(Buffer.from('123456789'))).toBe(0xcbf43926);
        expect(crc32(Buffer.alloc(0))).toBe(0);
    });

    it('writes a ZIP that reads back, stored or deflated', () => {
        const entries = unzip(zip([{ name: 'a.txt', data: Buffer.from('plain'), store: true }, { name: 'ข.txt', data: Buffer.from('ก'.repeat(500)) }]));
        expect(entries.map((entry) => [entry.name, entry.method])).toEqual([['a.txt', 0], ['ข.txt', 8]]);
        expect(entries[1].data.toString('utf8')).toBe('ก'.repeat(500));
    });

    it('escapes text for XML and splits prose on blank lines', () => {
        expect(escapeXml('Ash & Nara <"camp">\u0001')).toBe('Ash &amp; Nara &lt;&quot;camp&quot;&gt;');
        expect(paragraphs('One.\r\n\r\nTwo,\nstill two.\n\n\n  \nThree.')).toEqual(['One.', 'Two,\nstill two.', 'Three.']);
    });

    it('is an EPUB: the mimetype stored first, the container, the package, the contents and one file per chapter', () => {
        const file = epub({
            id: 'storytell-chat-7',
            title: 'The Steppe & the Sky',
            subtitle: 'Chat 2',
            chapters: [
                { number: 1, title: "Mare's Milk", text: 'The fire smoked.\n\n"Drink," Nara said.' },
                { number: 3, title: 'The <Lord>', text: 'He came at dusk.' },
            ],
            modified: new Date('2026-11-18T10:00:00.123Z'),
        });
        const entries = unzip(file);
        expect(entries[0]).toMatchObject({ name: 'mimetype', method: 0 });
        expect(entries[0].data.toString()).toBe('application/epub+zip');
        // The mimetype is the very first bytes after its header, as readers check.
        expect(file.subarray(30, 38).toString()).toBe('mimetype');
        const names = entries.map((entry) => entry.name);
        expect(names).toEqual([
            'mimetype',
            'META-INF/container.xml',
            'OEBPS/content.opf',
            'OEBPS/nav.xhtml',
            'OEBPS/toc.ncx',
            'OEBPS/style.css',
            'OEBPS/title.xhtml',
            'OEBPS/chapter-1.xhtml',
            'OEBPS/chapter-3.xhtml',
        ]);
        const read = (name: string) => entries.find((entry) => entry.name === name)!.data.toString('utf8');
        expect(read('META-INF/container.xml')).toContain('full-path="OEBPS/content.opf"');
        const opf = read('OEBPS/content.opf');
        expect(opf).toContain('<dc:title>The Steppe &amp; the Sky</dc:title>');
        expect(opf).toContain('<meta property="dcterms:modified">2026-11-18T10:00:00Z</meta>');
        expect(opf).toContain('<itemref idref="chapter-3"/>');
        expect(read('OEBPS/nav.xhtml')).toContain('<a href="chapter-3.xhtml">3. The &lt;Lord&gt;</a>');
        expect(read('OEBPS/toc.ncx')).toContain('playOrder="2"');
        const chapter = read('OEBPS/chapter-1.xhtml');
        expect(chapter).toContain('<h1>Mare\'s Milk</h1>');
        expect(chapter).toContain('<p class="first">The fire smoked.</p>');
        expect(chapter).toContain('<p>&quot;Drink,&quot; Nara said.</p>');
        expect(read('OEBPS/title.xhtml')).toContain('<p>Chat 2</p>');
    });
});
