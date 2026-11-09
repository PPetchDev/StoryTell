import { expect, test } from '@playwright/test';

import { backdropOf } from '../lib/backdrop';
import type { AiMessage, Message, MessagePart, UserMessage } from '../lib/chat';
import type { Emotion } from '../lib/expressions';
import { applyReplaceRules } from '../lib/replace-rules';
import { firstStepOf, novelSteps, NovelInput, openingStep, readingStep, stepIndex } from '../lib/novel-steps';
import type { Snapshot } from '../lib/snapshot';
import type { StoryCover } from '../lib/story';

// The pure helpers of .scratch/chat-looks/spec.md: novelSteps ("Visual novel view", "The steps") and
// backdropOf ("Backdrop", "Which picture"). The web has no unit-test runner, so these run in
// Playwright with no page.

const asStored = (text: string) => text;

function ai(id: number, parts: MessagePart[]): AiMessage {
    return { id, kind: 'ai', model: 'glm-5.3', parts, judge: null, memory: null, versions: null, createdAt: '', thaiReading: null };
}
function user(id: number, text: string): UserMessage {
    return { id, kind: 'user', text, identityName: 'Ash', personaId: null, createdAt: '', thaiReading: null };
}
const narration = (text: string): MessagePart => ({ kind: 'narration', text });
const speech = (speakerName: string, characterId: number | null, text: string, emotion: Emotion | null = null): MessagePart => ({
    kind: 'speech',
    characterId,
    speakerName,
    text,
    emotion,
});
function snapshot(id: number, messageId: number | null): Snapshot {
    return { id, storyId: 1, chatId: 1, messageId, imagePath: `snapshots/s${id}.png`, prompt: '', hint: '', imageModel: '', costUsd: 0, characters: [], createdAt: '' };
}

const OPENING = ai(1, [narration('The lamp went out.'), speech('Mira', 10, 'Boots off.')]);
const REPLY = ai(3, [narration('She turns.\n\nThe stairs groan.'), speech('Mira', 10, '*She points.* Up there.', 'joy'), speech('Kai', 11, 'Hush.')]);
const MESSAGES: Message[] = [OPENING, user(2, 'Where is the lamp room?'), REPLY];

function input(overrides: Partial<NovelInput> = {}): NovelInput {
    return { messages: MESSAGES, pending: null, replySoFar: null, replacing: null, snapshots: [], shown: asStored, ...overrides };
}

test('stored Messages step part by part: the user line, narration per paragraph, each speech line, then the Snapshots of a Message', () => {
    const steps = novelSteps(input({ snapshots: [snapshot(7, 1), snapshot(8, 3), snapshot(9, null)] }));

    expect(steps.map((step) => [step.kind, step.key, step.messageId])).toEqual([
        ['narration', 'm1:0:0', 1],
        ['speech', 'm1:1:0', 1],
        ['snapshot', 's7', 1],
        ['user', 'm2:u', 2],
        ['narration', 'm3:0:0', 3],
        ['narration', 'm3:0:1', 3],
        ['speech', 'm3:1:0', 3],
        ['speech', 'm3:2:0', 3],
        ['snapshot', 's8', 3],
    ]);
    expect(steps[3]).toMatchObject({ identityName: 'Ash', text: 'Where is the lamp room?' });
    expect(steps[5]).toMatchObject({ partIndex: 0, paragraph: 1, text: 'The stairs groan.' });
    // A speech step keeps its `*action*` for the box to italicise, and its emotion for the picture.
    expect(steps[6]).toMatchObject({ characterId: 10, speakerName: 'Mira', text: '*She points.* Up there.', emotion: 'joy' });
});

test("the Chat's On AI Messages rules run before the text is split: a rule that removes a paragraph removes its step; names stay", () => {
    const rules = [
        { find: 'The stairs groan.', replace: '', regex: false, ignoreCase: false },
        { find: 'Mira', replace: 'Someone', regex: false, ignoreCase: false },
        { find: 'Up there', replace: 'Upstairs', regex: false, ignoreCase: false },
    ];
    const steps = novelSteps(input({ shown: (text) => applyReplaceRules(text, rules) }));
    const reply = steps.filter((step) => step.messageId === 3);

    expect(reply.map((step) => step.key)).toEqual(['m3:0:0', 'm3:1:0', 'm3:2:0']);
    expect(reply[1]).toMatchObject({ speakerName: 'Mira', text: '*She points.* Upstairs.' });
    // The user's own line is shown as sent: AI-side rules never touch it.
    expect(steps.find((step) => step.kind === 'user')).toMatchObject({ text: 'Where is the lamp room?' });
    // A part the rules leave blank gives no step, and the paragraph numbers count the shown text's paragraphs.
    const blanked = novelSteps(input({ shown: (text) => applyReplaceRules(text, [{ find: 'She turns.', replace: '', regex: false, ignoreCase: false }]) }));
    expect(blanked.filter((step) => step.messageId === 3)[0]).toMatchObject({ key: 'm3:0:0', paragraph: 0, text: 'The stairs groan.' });
});

test('the line being sent and the reply being written are steps, and they settle into the stored Messages in place', () => {
    const live = novelSteps(
        input({
            messages: [OPENING],
            pending: { identityName: 'Ash', text: 'Hello?' },
            replySoFar: [narration('She turns.\n\nThe stairs groan.'), speech('Mira', 10, 'Up')],
        }),
    );
    expect(live.map((step) => step.key)).toEqual(['m1:0:0', 'm1:1:0', 'pending', 'live:0:0', 'live:0:1', 'live:1:0']);

    const settled = novelSteps(input());
    // Live part n is stored part n, and the sent line is the stored User Message.
    expect(settled[stepIndex(settled, 'live:0:1')].key).toBe('m3:0:1');
    expect(settled[stepIndex(settled, 'live:1:0')].key).toBe('m3:1:0');
    expect(settled[stepIndex(settled, 'pending')].key).toBe('m2:u');
    expect(stepIndex(settled, 'm9:0:0')).toBe(-1);
});

test('a reply being replaced by Again is left out, as the thread hides it', () => {
    const steps = novelSteps(input({ replacing: 3, replySoFar: [speech('Mira', 10, 'Again, then.')] }));
    expect(steps.map((step) => step.key)).toEqual(['m1:0:0', 'm1:1:0', 'm2:u', 'live:0:0']);
});

test("it opens on the newest reply's first step, or on the user's line when no reply follows it", () => {
    const steps = novelSteps(input({ snapshots: [snapshot(8, 3)] }));
    expect(steps[openingStep(steps)].key).toBe('m3:0:0');

    const waiting = novelSteps(input({ messages: [OPENING, user(2, 'Hello?')] }));
    expect(waiting[openingStep(waiting)].key).toBe('m2:u');
    expect(firstStepOf(steps, 2)).toBe(2);
    expect(openingStep([])).toBe(-1);
});

test("a Read aloud item finds its step by part, and narration by its paragraph among the shown text's", () => {
    const steps = novelSteps(input());
    expect(steps[readingStep(steps, 3, 0, 1)].key).toBe('m3:0:1');
    // Every item of a speech line (its action and its words) is that line's step.
    expect(steps[readingStep(steps, 3, 1, null)].key).toBe('m3:1:0');
    expect(readingStep(steps, 3, 5, null)).toBe(-1);

    // With a rule that removes the first paragraph, the API's paragraph 0 is the stairs.
    const shown = (text: string) => applyReplaceRules(text, [{ find: 'She turns.', replace: '', regex: false, ignoreCase: false }]);
    const replaced = novelSteps(input({ shown }));
    expect(replaced[readingStep(replaced, 3, 0, 0)]).toMatchObject({ text: 'The stairs groan.' });
});

test('backdropOf: none, the Cover at its focus, or the newest Snapshot still in the thread, else the Cover', () => {
    const cover: StoryCover = { source: 'upload', imagePath: 'covers/story-1/cover-a.jpg', focus: { x: 0.25, y: 0.75 }, snapshotId: null, characterId: null };
    const thread = [{ id: 1 }, { id: 3 }];
    const snaps = [snapshot(8, 3), snapshot(9, 1), snapshot(12, 99), snapshot(13, null)];

    expect(backdropOf({ backdrop: 'none', cover }, snaps, thread)).toBeNull();
    expect(backdropOf({ backdrop: 'cover', cover }, snaps, thread)).toEqual({ src: '/api/images/covers/story-1/cover-a.jpg', position: '25% 75%' });
    expect(backdropOf({ backdrop: 'cover', cover: null }, snaps, thread)).toBeNull();
    // The newest one whose Message is still in the thread: not one an edit took away, nor one with no Message.
    expect(backdropOf({ backdrop: 'snapshot', cover }, snaps, thread)).toEqual({ src: '/api/images/snapshots/s9.png', position: 'center' });
    expect(backdropOf({ backdrop: 'snapshot', cover }, [], thread)).toEqual({ src: '/api/images/covers/story-1/cover-a.jpg', position: '25% 75%' });
    expect(backdropOf({ backdrop: 'snapshot', cover: null }, [snapshot(12, 99)], thread)).toBeNull();
});
