import { AUTHOR_MODEL } from '../../model/chat/entities/message.entity.js';
import type { ReplacedReplyCounts } from '../../model/reply-record/reply-record.service.js';
import { CountedPart, REPLIES_BEFORE, replyCounts, replyText } from '../chat/turn/reply-counts.js';

/**
 * The play-signals report (.scratch/reply-repair/spec.md, "5. The play-signals report"): what the
 * user's own Regenerates say. A reply the user replaced is the best evidence there is of a bad
 * reply, and the replaced Reply versions are kept. By play model and by week this counts the AI
 * Messages written, those with a replaced reply, and how often the kept and the replaced replies
 * have each fault code can see.
 *
 * It reads and never writes, and what it gives back holds counts only: no reply's words, no Story
 * or Chat title, no name. It takes its database as a function, so it is tested against a test
 * database and run on live by the entry point (src/play-signals.ts).
 *
 * Not counted: an edit of an AI Message, which rewrites the reply in place and leaves no trace; and
 * a line written as the user's character, which the reply parser cuts before a reply is stored.
 * Counted though it should not be: the Messages a Branch copied, again in the Branch; a line by a
 * Character deleted since, as an unknown speaker's; a reply the user edited, as the model's.
 *
 * A replaced reply itself is kept only while its Message is the newest of its Chat: the app drops
 * it when the next Message is sent. So what this reads of one is the record made when it was
 * replaced (`replaced_reply`: counts, and none of its words), which the app has kept since
 * 2026-11-24. A Regenerate before that left nothing to count.
 */

/** Runs one read-only SQL statement and answers its rows. */
export type SignalQuery = (sql: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;

/** The faults counted over some replies. */
export interface Tally {
    replies: number;
    noSpeechLine: number;
    unknownSpeaker: number;
    stageDirectionInSpeech: number;
    /** Replies that reuse a phrase of the three replies before them in their Chat. */
    sharedPhrase: number;
    /** The words of the replies, and the overused words and phrases found in them. */
    words: number;
    overused: number;
}

export interface SignalGroup {
    /** The Monday the week began, UTC. */
    week: string;
    /** The play model that wrote the replies. */
    model: string;
    /** The AI Messages a play model wrote (never the Opening, which is the author's, nor a Reach-out). */
    aiMessages: number;
    /** Of those, the ones with at least one replaced Reply version. */
    regenerated: number;
    /** The replies shown now. */
    kept: Tally;
    /** The replies Regenerate replaced. */
    replaced: Tally;
}

/** Below this many replies a rate says nothing, and none is printed. */
export const FEWEST_FOR_A_RATE = 20;
const emptyTally = (): Tally => ({ replies: 0, noSpeechLine: 0, unknownSpeaker: 0, stageDirectionInSpeech: 0, sharedPhrase: 0, words: 0, overused: 0 });

function count(tally: Tally, counts: ReplacedReplyCounts): void {
    tally.replies++;
    if (counts.noSpeechLine) tally.noSpeechLine++;
    if (counts.unknownSpeaker) tally.unknownSpeaker++;
    if (counts.stageDirection) tally.stageDirectionInSpeech++;
    if (counts.sharedPhrase) tally.sharedPhrase++;
    tally.words += counts.words;
    tally.overused += counts.overused;
}

/** A stored `jsonb` or `json_agg` value, which a driver may hand back parsed or as text. */
function partsOf(value: unknown): CountedPart[] {
    const parsed = typeof value === 'string' ? (JSON.parse(value) as unknown) : value;
    return Array.isArray(parsed) ? (parsed as CountedPart[]) : [];
}

const weekOf = `to_char(date_trunc('week', %s AT TIME ZONE 'UTC'), 'YYYY-MM-DD')`;

/**
 * The groups, newest week first and then by model. `userId` names one account; left out, every
 * account's replies are counted together.
 */
export async function playSignals(query: SignalQuery, options: { userId?: number } = {}): Promise<SignalGroup[]> {
    const owner = options.userId === undefined ? '' : 'AND s."user_id" = $2';
    const params = options.userId === undefined ? [AUTHOR_MODEL] : [AUTHOR_MODEL, options.userId];
    const messages = await query(
        `SELECT m."id", m."chat_id" AS "chatId", c."story_id" AS "storyId", m."model", ${weekOf.replace('%s', 'm."created_at"')} AS "week",
                (SELECT json_agg(json_build_object('kind', p."kind", 'characterId', p."character_id", 'speakerName', p."speaker_name", 'text', p."text") ORDER BY p."position")
                   FROM "message_part" p WHERE p."message_id" = m."id") AS "parts"
           FROM "message" m JOIN "chat" c ON c."id" = m."chat_id" JOIN "story" s ON s."id" = c."story_id"
          WHERE m."kind" = 'ai' AND m."model" IS NOT NULL AND m."model" <> $1 AND NOT m."reach_out" AND NOT m."epilogue" ${owner}
          ORDER BY m."chat_id", m."position"`,
        params,
    );
    // The Story's own people, whose names are no fault in a reply and no repeated phrase.
    const people = await query(
        `SELECT s."id" AS "storyId", (SELECT r."name" FROM "role" r WHERE r."story_id" = s."id") AS "roleName", (SELECT json_agg(ch."name") FROM "character" ch WHERE ch."story_id" = s."id") AS "names" FROM "story" s`,
    );
    const namesOf = new Map(people.map((row) => [Number(row.storyId), [...((typeof row.names === 'string' ? JSON.parse(row.names) : row.names) ?? []), row.roleName].filter((name): name is string => typeof name === 'string' && name !== '')]));
    // What was recorded of each reply a Regenerate replaced: the reply itself is dropped when the next Message is sent.
    const replacedRows = await query(
        `SELECT r."message_id" AS "messageId", r."model", r."no_speech_line" AS "noSpeechLine", r."unknown_speaker" AS "unknownSpeaker", r."stage_direction" AS "stageDirection",
                r."shared_phrase" AS "sharedPhrase", r."words", r."overused"
           FROM "replaced_reply" r JOIN "message" m ON m."id" = r."message_id" JOIN "chat" c ON c."id" = m."chat_id" JOIN "story" s ON s."id" = c."story_id"
          WHERE m."kind" = 'ai' AND m."model" IS NOT NULL AND m."model" <> $1 AND NOT m."reach_out" AND NOT m."epilogue" ${owner}
          ORDER BY r."message_id", r."id"`,
        params,
    );

    const groups = new Map<string, SignalGroup>();
    const groupOf = (week: string, model: string): SignalGroup => {
        const key = `${week}\n${model}`;
        if (!groups.has(key)) groups.set(key, { week, model, aiMessages: 0, regenerated: 0, kept: emptyTally(), replaced: emptyTally() });
        return groups.get(key)!;
    };
    const replacedOf = new Map<number, typeof replacedRows>();
    for (const row of replacedRows) replacedOf.set(Number(row.messageId), [...(replacedOf.get(Number(row.messageId)) ?? []), row]);

    // The replies before each one in its Chat, as shown now: what a new reply had to avoid repeating.
    let chat: unknown = null;
    let before: string[] = [];
    for (const message of messages) {
        if (message.chatId !== chat) {
            chat = message.chatId;
            before = [];
        }
        const parts = partsOf(message.parts);
        const group = groupOf(String(message.week), String(message.model));
        const replaced = replacedOf.get(Number(message.id)) ?? [];
        group.aiMessages++;
        if (replaced.length > 0) group.regenerated++;
        const names = namesOf.get(Number(message.storyId)) ?? [];
        count(group.kept, replyCounts(parts, before, names));
        // A replaced reply is counted under the model that wrote it, in its Message's week: a Regenerate keeps the Message's time.
        for (const row of replaced) {
            count(groupOf(String(message.week), String(row.model)).replaced, {
                noSpeechLine: row.noSpeechLine === true,
                unknownSpeaker: row.unknownSpeaker === true,
                stageDirection: row.stageDirection === true,
                sharedPhrase: row.sharedPhrase === true,
                words: Number(row.words),
                overused: Number(row.overused),
            });
        }
        before = [...before, replyText(parts)].slice(-REPLIES_BEFORE);
    }
    return [...groups.values()].sort((a, b) => b.week.localeCompare(a.week) || a.model.localeCompare(b.model));
}

const share = (count: number, of: number, minimum: number): string => (of < minimum ? `too few (${of})` : `${Math.round((count / of) * 100)}% (${count} of ${of})`);
const perThousand = (tally: Tally, minimum: number): string => (tally.replies < minimum ? `too few (${tally.replies})` : tally.words === 0 ? '0.0' : ((tally.overused / tally.words) * 1000).toFixed(1));

/** The report as lines to print: counts and rates only. Below `minimum` replies a rate is not given. */
export function formatPlaySignals(groups: readonly SignalGroup[], options: { minimum?: number } = {}): string {
    const minimum = options.minimum ?? FEWEST_FOR_A_RATE;
    const lines = ['# Play signals', '', 'By play model and by week (the Monday it began, UTC). "Kept" is the reply shown now; "replaced" is one a Regenerate replaced.'];
    if (groups.length === 0) lines.push('', 'No AI Messages by a play model.');
    for (const group of groups) {
        const faults: [string, keyof Tally][] = [
            ['no speech line', 'noSpeechLine'],
            ['a line by an unknown speaker', 'unknownSpeaker'],
            ['a stage direction in a speech line', 'stageDirectionInSpeech'],
            [`a phrase shared with the ${REPLIES_BEFORE} replies before it`, 'sharedPhrase'],
        ];
        lines.push(
            '',
            `## Week of ${group.week}, ${group.model}`,
            `AI Messages ${group.aiMessages}, Regenerated ${group.regenerated}${group.aiMessages > 0 ? ` (${Math.round((group.regenerated / group.aiMessages) * 100)}%)` : ''}`,
            ...faults.map(([name, key]) => `- ${name}: kept ${share(group.kept[key], group.kept.replies, minimum)}, replaced ${share(group.replaced[key], group.replaced.replies, minimum)}`),
            `- overused words a thousand: kept ${perThousand(group.kept, minimum)}, replaced ${perThousand(group.replaced, minimum)}`,
        );
    }
    lines.push(
        '',
        'A replaced reply is counted from 2026-11-24, when the app began to record one: a Regenerate before that left nothing to count.',
        'An edit of an AI Message is not counted: the app keeps no trace of one.',
        'A line written as the user is not counted: the reply parser cuts it before a reply is stored.',
        'A line by a Character deleted since reads as an unknown speaker’s.',
        'The Messages a Branch copied are counted again in the Branch.',
        'A reply the user edited counts as its model’s.',
        `A rate is given from ${minimum} replies up.`,
    );
    return lines.join('\n');
}
