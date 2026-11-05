import { ReplyPart } from './turn/reply-parser.js';

/**
 * A Chat as plain text (spec: "Download a Chat as text"). Pure logic over plain inputs: the
 * manager gathers them. The user's lines read "Name: …" under the identity worn when each was
 * sent; an AI Message reads as its narration, with each speech part as "Name: …".
 */
export type TranscriptMessage = { kind: 'user'; name: string; text: string } | { kind: 'ai'; parts: ReplyPart[] };

export function chatTranscript(input: { storyTitle: string; chatTitle: string; messages: TranscriptMessage[] }): string {
    const blocks = input.messages.flatMap((message) =>
        message.kind === 'user'
            ? [`${message.name}: ${message.text.trim()}`]
            : message.parts.map((part) => (part.kind === 'speech' ? `${part.speakerName}: ${part.text.trim()}` : part.text.trim())),
    );
    return [`${input.storyTitle.trim()} — ${input.chatTitle.trim()}`, ...blocks.filter((block) => block !== '')].join('\n\n') + '\n';
}

/**
 * What a download saves the transcript as: the titles themselves (sent as `filename*`), and
 * an ASCII slug of them for clients that read only `filename`, or `chat-<id>.txt` when the
 * titles have no Latin letters or digits to make one from.
 */
export function transcriptFileNames(storyTitle: string, chatTitle: string, chatId: number): { fileName: string; asciiFileName: string } {
    const titles = `${storyTitle.trim()} - ${chatTitle.trim()}`;
    const slug = titles
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80)
        .replace(/-+$/, '');
    const safe = titles.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').trim();
    return {
        fileName: `${safe === '' ? `chat-${chatId}` : safe}.txt`,
        asciiFileName: `${/[a-z]/.test(slug) ? slug : `chat-${chatId}`}.txt`,
    };
}
