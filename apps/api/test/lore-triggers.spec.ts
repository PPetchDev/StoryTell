import { chosenLore, LoreMessage, loreReplayWindow, LoreRoll, loreRoll, PromptLoreEntry, selectLoreAt } from '../src/manager/chat/lore/lore-select.js';
import { loreTriggerSummary } from '../src/manager/chat/lore/lore-summary.js';
import { startTestApp, TestApp } from './harness/test-app.js';

// .scratch/lore-triggers/spec.md: the trigger settings of a Lore entry, driven through the one
// selection entry point with plain Messages, then through the API and the fake gateway.

let nextId = 1;
function entry(fields: Partial<PromptLoreEntry> & { name: string }): PromptLoreEntry {
    return { id: nextId++, keywords: [], text: `About ${fields.name}.`, alwaysOn: false, ...fields };
}

const ai = (text: string): LoreMessage => ({ role: 'assistant', text });
const user = (text: string): LoreMessage => ({ role: 'user', text });

function chosenNames(entries: PromptLoreEntry[], messages: LoreMessage[], options?: Parameters<typeof selectLoreAt>[2]): string[] {
    return chosenLore(selectLoreAt(entries, messages, options)).map((chosen) => chosen.name);
}

describe('Lore triggers: second keywords (pure)', () => {
    it('"Also needs one of" lets an entry in only when one of them is there too', () => {
        const well = entry({ name: 'The Well', secondaryKeywords: ['night', 'storm'], secondaryMode: 'alsoNeeds' });
        expect(chosenNames([well], [ai('We reach the well at noon.')])).toEqual([]);
        expect(chosenNames([well], [ai('Night falls.'), user('I go to the well.')])).toEqual(['The Well']);
        expect(chosenNames([well], [ai('A STORM breaks over the Well.')])).toEqual(['The Well']);
    });

    it('"Unless one of" keeps an entry out when one of them is there', () => {
        const festival = entry({ name: 'Festival', secondaryKeywords: ['last year'], secondaryMode: 'unless' });
        expect(chosenNames([festival], [ai('The festival starts tonight.')])).toEqual(['Festival']);
        expect(chosenNames([festival], [ai('Last year, the festival was rained out.')])).toEqual([]);
    });

    it("finds a second keyword in the text of an entry already chosen, and follows the keyword rule", () => {
        const night = entry({ name: 'Night watch', text: 'At night the camp posts guards.', alwaysOn: true });
        const well = entry({ name: 'The Well', secondaryKeywords: ['night'] });
        expect(chosenNames([night, well], [ai('I go to the well.')])).toEqual(['Night watch', 'The Well']);
        // Latin second keywords start a word: "knight" is not "night".
        expect(chosenNames([well], [ai('A knight guards the well.')])).toEqual([]);
    });

    it('matches a Thai second keyword anywhere', () => {
        const well = entry({ name: 'บ่อน้ำ', secondaryKeywords: ['กลางคืน'] });
        expect(chosenNames([well], [ai('ตอนกลางคืนเราไปที่บ่อน้ำ')])).toEqual(['บ่อน้ำ']);
        expect(chosenNames([well], [ai('ตอนกลางวันเราไปที่บ่อน้ำ')])).toEqual([]);
    });

    it('never brings an entry up by its second keywords alone', () => {
        const well = entry({ name: 'The Well', secondaryKeywords: ['night'], secondaryMode: 'alsoNeeds' });
        const fair = entry({ name: 'Fair', secondaryKeywords: ['rain'], secondaryMode: 'unless' });
        expect(chosenNames([well, fair], [ai('It is night, and dry.')])).toEqual([]);
    });

    it('lists a failed condition as left out with its mode and keywords; Always include skips it', () => {
        const well = entry({ name: 'The Well', secondaryKeywords: ['night'] });
        const festival = entry({ name: 'Festival', secondaryKeywords: ['last year'], secondaryMode: 'unless' });
        const law = entry({ name: 'Law', alwaysOn: true, secondaryKeywords: ['never here'] });
        const selection = selectLoreAt([well, festival, law], [ai('Last year, at the well, during the festival.')]);
        expect(chosenLore(selection)).toEqual([law]);
        expect(selection.leftOut).toEqual([
            { entry: well, why: { kind: 'condition', mode: 'alsoNeeds', keywords: ['night'] } },
            { entry: festival, why: { kind: 'condition', mode: 'unless', keywords: ['last year'] } },
        ]);
    });
});

describe('Lore triggers: patterns (pure)', () => {
    it('brings an entry up by a pattern, ignoring case, with its source as the trigger', () => {
        const moon = entry({ name: 'The Moon', patterns: ['\\b(selene|luna|mond)s?\\b'] });
        const selection = selectLoreAt([moon], [ai('Two LUNAS rise.'), user('I look up.')]);
        expect(selection.chosen).toEqual([{ entry: moon, why: { kind: 'cameUp', trigger: '\\b(selene|luna|mond)s?\\b', messagesAgo: 1 } }]);
        expect(chosenNames([moon], [ai('The lunatic laughs.')])).toEqual([]);
    });

    it("matches ^ at a line start inside an AI Message's @Name: text, so ^@Mira: finds only Mira's lines", () => {
        const silver = entry({ name: 'Silver mine', patterns: ['^@Mira:.*silver'] });
        const reply = 'The camp is quiet.\n\n@Nara: Mira found silver.\n@Mira: I keep the silver.';
        expect(chosenNames([silver], [ai(reply)])).toEqual(['Silver mine']);
        expect(chosenNames([silver], [ai('@Nara: Mira found silver.\n@Mira: I keep it.')])).toEqual([]);
        expect(chosenNames([silver], [user('Mira: silver?')])).toEqual([]);
    });

    it('lets second keywords still filter an entry a pattern brought up; Thai patterns work too', () => {
        const well = entry({ name: 'The Well', patterns: ['บ่อ(น้ำ)?'], secondaryKeywords: ['night'] });
        expect(chosenNames([well], [ai('เราไปที่บ่อน้ำ')])).toEqual([]);
        expect(chosenNames([well], [ai('At night, เราไปที่บ่อน้ำ')])).toEqual(['The Well']);
    });
});

describe('Lore triggers: entries brought in by other entries (pure)', () => {
    it('brings in an entry named in the text of a chosen one, after the ones that came up, naming the bringer', () => {
        const valley = entry({ name: 'The Valley', text: 'The valley is ruled by the Khan.' });
        const khan = entry({ name: 'Khan', text: 'The Khan is old.' });
        const salt = entry({ name: 'Salt' });
        const selection = selectLoreAt([khan, salt, valley], [ai('Salt for sale.'), ai('We ride into the valley.')]);
        expect(selection.chosen).toEqual([
            { entry: valley, why: { kind: 'cameUp', trigger: 'The Valley', messagesAgo: 0 } },
            { entry: salt, why: { kind: 'cameUp', trigger: 'Salt', messagesAgo: 1 } },
            { entry: khan, why: { kind: 'broughtIn', byName: 'The Valley' } },
        ]);
    });

    it('follows a chain three steps deep, but not a fourth', () => {
        const a = entry({ name: 'Alder', text: 'Alder borders Birch.' });
        const b = entry({ name: 'Birch', text: 'Birch trades with Cedar.' });
        const c = entry({ name: 'Cedar', text: 'Cedar fears Damson.' });
        const d = entry({ name: 'Damson', text: 'Damson worships Elm.' });
        const e = entry({ name: 'Elm', text: 'Elm is a god.' });
        expect(chosenNames([e, d, c, b, a], [ai('We reach Alder.')])).toEqual(['Alder', 'Birch', 'Cedar', 'Damson']);
    });

    it('orders brought-in entries by step, then position, and searches with keywords and patterns', () => {
        const hub = entry({ name: 'Hub', text: 'Roads lead to the mill and the ford.' });
        const ford = entry({ name: 'Ford', text: 'Shallow.' });
        const mill = entry({ name: 'Mill', text: 'Its miller is Oskar.' });
        const oskar = entry({ name: 'Oskar the miller', patterns: ['\\boskar\\b'], text: 'Grumpy.' });
        expect(chosenNames([oskar, mill, ford, hub], [ai('At the hub.')])).toEqual(['Hub', 'Mill', 'Ford', 'Oskar the miller']);
    });

    it('never brings in an entry whose "Brought in by other entries" is off; the scan still can', () => {
        const valley = entry({ name: 'The Valley', text: 'The valley is ruled by the Khan.' });
        const khan = entry({ name: 'Khan', recursable: false });
        expect(chosenNames([valley, khan], [ai('We ride into the valley.')])).toEqual(['The Valley']);
        expect(chosenNames([valley, khan], [ai('The Khan rides into the valley.')])).toEqual(['The Valley', 'Khan']);
    });

    it('names the first chosen entry whose text brought it in, and never adds a chosen entry twice', () => {
        const law = entry({ name: 'Law', alwaysOn: true, text: 'The river is sacred.' });
        const bridge = entry({ name: 'Bridge', text: 'It spans the river.' });
        const river = entry({ name: 'River', text: 'The bridge is old.' });
        const selection = selectLoreAt([law, bridge, river], [ai('We cross the bridge.')]);
        expect(selection.chosen.map(({ entry: chosen, why }) => [chosen.name, why])).toEqual([
            ['Law', { kind: 'always' }],
            ['Bridge', { kind: 'cameUp', trigger: 'Bridge', messagesAgo: 0 }],
            ['River', { kind: 'broughtIn', byName: 'Law' }],
        ]);
    });

    it('cuts brought-in entries by the cap before came-up ones, and still checks their second keywords', () => {
        const valley = entry({ name: 'The Valley', text: 'The valley is ruled by the Khan, at night only.' });
        const khan = entry({ name: 'Khan', text: 'x'.repeat(200) });
        const salt = entry({ name: 'Salt', text: 'Salt is dear.' });
        const selection = selectLoreAt([khan, valley, salt], [ai('Salt in the valley.')], { cap: 60 });
        expect(chosenLore(selection).map((e) => e.name)).toEqual(['The Valley', 'Salt']);
        expect(selection.leftOut).toEqual([{ entry: khan, why: { kind: 'noRoom' } }]);

        const guard = entry({ name: 'Guard', secondaryKeywords: ['night'], text: 'Guards.' });
        const gate = entry({ name: 'Gate', text: 'The guard stands here.' });
        // "night" is nowhere: the guard stays out; in the valley's text it is there.
        expect(chosenNames([gate, guard], [ai('At the gate.')])).toEqual(['Gate']);
        expect(chosenNames([gate, guard, valley], [ai('At the gate in the valley.')])).toEqual(['Gate', 'The Valley', 'Guard']);
    });
});

/** A Chat: the Opening, then the user's lines and the replies by turns; `user(i)` is Message 2i - 1. */
function chat(userLines: string[], reply = (i: number) => `@Nara: Reply ${i}.`): LoreMessage[] {
    return [ai('Dust rises over the market.'), ...userLines.flatMap((line, i) => [user(line), ai(reply(i))])];
}

/** The reasons at point `point` of `messages`, by entry name. */
function at(entries: PromptLoreEntry[], messages: LoreMessage[], point: number, options?: Parameters<typeof selectLoreAt>[2]) {
    const selection = selectLoreAt(entries, messages.slice(0, point), options);
    return {
        chosen: selection.chosen.map(({ entry: chosen, why }) => [chosen.name, why]),
        leftOut: selection.leftOut.map(({ entry: left, why }) => [left.name, why]),
    };
}

describe('Lore triggers: Stays for, Rests for, Waits until (pure)', () => {
    it('keeps an entry in for exactly its Stays for Messages after it went in, mentioned or not', () => {
        const well = entry({ name: 'Well', sticky: 6 });
        // The well is named only in Message 1; the reply at point 2 brings it in.
        const messages = chat(['To the well.', 'a', 'b', 'c', 'd']);
        expect(at([well], messages, 2).chosen).toEqual([['Well', { kind: 'cameUp', trigger: 'Well', messagesAgo: 0 }]]);
        expect([3, 4, 5, 6, 7, 8].map((point) => at([well], messages, point).chosen)).toEqual(
            [6, 5, 4, 3, 2, 1].map((messagesLeft) => [['Well', { kind: 'staying', messagesLeft }]]),
        );
        expect(at([well], messages, 9)).toEqual({ chosen: [], leftOut: [] });
        // Without Stays for it is gone once the scan no longer reaches Message 1, at point 7.
        expect(at([entry({ name: 'Well' })], messages, 6).chosen).toHaveLength(1);
        expect(at([entry({ name: 'Well' })], messages, 7).chosen).toEqual([]);
    });

    it('does not extend a stay when the entry is mentioned again during it', () => {
        const well = entry({ name: 'Well', sticky: 4 });
        const messages = chat(['To the well.', 'a', 'The well again.', 'c', 'd']);
        // Mentioned in Message 5, inside its stay (points 3 to 6): the stay still ends at 6.
        expect(at([well], messages, 6).chosen).toEqual([['Well', { kind: 'staying', messagesLeft: 1 }]]);
        expect(at([well], messages, 7).chosen).toEqual([['Well', { kind: 'cameUp', trigger: 'Well', messagesAgo: 1 }]]);
    });

    it('starts no stay for a candidate that was left out for no room', () => {
        const law = entry({ name: 'Law', alwaysOn: true, text: 'x'.repeat(230) });
        const well = entry({ name: 'Well', sticky: 10 });
        const messages = chat(['To the well.', 'a', 'b', 'c']);
        expect(at([law, well], messages, 2, { cap: 60 }).leftOut).toEqual([['Well', { kind: 'noRoom' }]]);
        // Had it gone in at point 2, it would be staying at 7 and so a candidate again.
        expect(at([law, well], messages, 7, { cap: 60 })).toEqual({ chosen: [['Law', { kind: 'always' }]], leftOut: [] });
        expect(at([law, well], messages, 7).chosen).toEqual([
            ['Law', { kind: 'always' }],
            ['Well', { kind: 'staying', messagesLeft: 6 }],
        ]);
    });

    it('rests for its Rests for Messages after its stay, by any route, then can come in again', () => {
        const well = entry({ name: 'Well', sticky: 2, cooldown: 3 });
        const messages = chat(['The well.', 'The well.', 'The well.', 'The well.', 'The well.']);
        const reasons = [2, 3, 4, 5, 6, 7, 8].map((point) => {
            const { chosen, leftOut } = at([well], messages, point);
            return [...chosen, ...leftOut].map(([, why]) => (why as { kind: string }).kind + ('messagesLeft' in (why as object) ? ` ${(why as { messagesLeft: number }).messagesLeft}` : ''));
        });
        expect(reasons).toEqual([['cameUp'], ['staying 2'], ['staying 1'], ['resting 3'], ['resting 2'], ['resting 1'], ['cameUp']]);

        // Brought in by another entry while resting: still out.
        const square = entry({ name: 'Square', text: 'The well stands in the square.' });
        expect(at([well, square], chat(['The well.', 'The square.', 'The square.']), 5).leftOut).toEqual([['Well', { kind: 'resting', messagesLeft: 3 }]]);
    });

    it('rests after going in even with no Stays for, and an Always include entry rests too', () => {
        const well = entry({ name: 'Well', cooldown: 2 });
        const messages = chat(['The well.', 'The well.', 'The well.']);
        expect(at([well], messages, 3).leftOut).toEqual([['Well', { kind: 'resting', messagesLeft: 2 }]]);
        expect(at([well], messages, 4).leftOut).toEqual([['Well', { kind: 'resting', messagesLeft: 1 }]]);
        expect(at([well], messages, 5).chosen).toEqual([['Well', { kind: 'cameUp', trigger: 'Well', messagesAgo: 1 }]]);

        const law = entry({ name: 'Law', alwaysOn: true, sticky: 9, cooldown: 1 });
        const plain = chat(['a', 'b', 'c']);
        expect([2, 3, 4, 5].map((point) => at([law], plain, point).chosen.length)).toEqual([1, 0, 1, 0]);
    });

    it('waits until the Chat has its Waits until Messages, the boundary point included', () => {
        const twist = entry({ name: 'Twist', delay: 4, alwaysOn: true });
        const messages = chat(['a', 'b', 'c']);
        expect(at([twist], messages, 3).leftOut).toEqual([['Twist', { kind: 'waiting', messagesLeft: 1 }]]);
        expect(at([twist], messages, 4).chosen).toEqual([['Twist', { kind: 'always' }]]);
    });

    it('ranks staying entries right after Always include ones, newest stay first, and skips their condition', () => {
        const law = entry({ name: 'Law', alwaysOn: true });
        const well = entry({ name: 'Well', sticky: 6, secondaryKeywords: ['night'] });
        const tent = entry({ name: 'Tent', sticky: 6 });
        const salt = entry({ name: 'Salt' });
        const messages = chat(['At night, the well.', 'The tent.', 'Salt?']);
        expect(at([salt, tent, well, law], messages, 6).chosen.map(([name]) => name)).toEqual(['Law', 'Tent', 'Well', 'Salt']);
    });

    it('answers the same for a long Chat and for the Chat cut to the replay window', () => {
        const well = entry({ name: 'Well', sticky: 3, cooldown: 2 });
        const tent = entry({ name: 'Tent', sticky: 4 });
        const lines = ['The well.', ...Array.from({ length: 20 }, (_, i) => `Line ${i}.`), 'The tent and the well.', 'x'];
        const long = chat(lines);
        const window = 2 * (3 + 2);
        // The window, plus the Messages its first point's scan reads.
        const cut = long.slice(long.length - window - 5);
        expect(selectLoreAt([well, tent], cut)).toEqual(selectLoreAt([well, tent], long));
        expect(chosenNames([well, tent], long)).toEqual(['Well', 'Tent']);
    });

    it('replays over 2 × the longest Stays for + Rests for, at most 200, and not at all when none uses them', () => {
        expect(loreReplayWindow([entry({ name: 'A', delay: 9 }), entry({ name: 'B' })])).toBe(0);
        expect(loreReplayWindow([entry({ name: 'A', sticky: 4, cooldown: 6 }), entry({ name: 'B', sticky: 7 })])).toBe(20);
        expect(loreReplayWindow([entry({ name: 'A', sticky: 50, cooldown: 50 })])).toBe(200);
        // Sticky means nothing on an Always include entry, and a blank entry is never sent.
        expect(loreReplayWindow([entry({ name: 'A', sticky: 9, alwaysOn: true }), entry({ name: 'B', sticky: 9, text: ' ' })])).toBe(0);
    });

    it("sees at a Snapshot's point an entry staying from an earlier turn, over its own 6-Message scan", () => {
        const well = entry({ name: 'Well', sticky: 6 });
        const lantern = entry({ name: 'Lantern' });
        const messages = chat(['To the well.', 'a', 'b', 'c']);
        expect(at([well, lantern], messages, 8, { extraScan: 'a lantern glows', scanLength: 6 }).chosen).toEqual([
            ['Well', { kind: 'staying', messagesLeft: 1 }],
            ['Lantern', { kind: 'cameUp', trigger: 'Lantern', messagesAgo: 0 }],
        ]);
    });

    it('works out a Chat of 200 Messages with 50 Sticky entries well under 100 ms', () => {
        const entries = Array.from({ length: 50 }, (_, i) => entry({ name: `Place${i}`, keywords: [`spot${i}`], sticky: 50, cooldown: 50, text: `About place ${i}. `.repeat(5) }));
        const lines = Array.from({ length: 100 }, (_, i) => `We walk past place${i % 50} and spot${(i * 7) % 50}. ${'Long words of the story. '.repeat(30)}`);
        const messages = chat(lines, (i) => `@Nara: At spot${(i * 3) % 50}. ${'The reply goes on. '.repeat(40)}`);
        expect(messages).toHaveLength(201);
        selectLoreAt(entries, messages);
        const started = performance.now();
        const selection = selectLoreAt(entries, messages);
        expect(performance.now() - started).toBeLessThan(100);
        expect(selection.chosen.length).toBeGreaterThan(0);
    });
});

/** An injected roll source: answers from `rolls` by entry name (else 0), recording every call. */
function fakeRoll(entries: PromptLoreEntry[], rolls: Record<string, number | ((point: number) => number)>) {
    const calls: Array<{ name: string; point: number; textBefore: string }> = [];
    const roll: LoreRoll = (entryId, point, textBefore) => {
        const name = entries.find((candidate) => candidate.id === entryId)!.name;
        calls.push({ name, point, textBefore });
        const value = rolls[name] ?? 0;
        return typeof value === 'function' ? value(point) : value;
    };
    return { roll, calls };
}

describe('Lore triggers: Chance (pure)', () => {
    it('lets an entry in when its roll is below its Chance, and lists it as left out with the chance otherwise', () => {
        const rumour = entry({ name: 'Rumour', chance: 40 });
        const messages = chat(['A rumour?']);
        const lucky = fakeRoll([rumour], { Rumour: 39.9 });
        expect(at([rumour], messages, 2, { roll: lucky.roll }).chosen).toEqual([['Rumour', { kind: 'cameUp', trigger: 'Rumour', messagesAgo: 0 }]]);
        const unlucky = fakeRoll([rumour], { Rumour: 40 });
        expect(at([rumour], messages, 2, { roll: unlucky.roll })).toEqual({ chosen: [], leftOut: [['Rumour', { kind: 'chance', chance: 40 }]] });
    });

    it('rolls on the entry, the point and the text of the Message just before it; 100 never rolls and 0 never goes in', () => {
        const rumour = entry({ name: 'Rumour', chance: 40 });
        const sure = entry({ name: 'Sure', chance: 100 });
        const never = entry({ name: 'Never', chance: 0, alwaysOn: true });
        const { roll, calls } = fakeRoll([rumour, sure, never], { Rumour: 10, Never: 0 });
        const selection = selectLoreAt([rumour, sure, never], chat(['A rumour, for sure.']), { roll });
        expect(chosenLore(selection).map((e) => e.name)).toEqual(['Rumour', 'Sure']);
        expect(selection.leftOut).toEqual([{ entry: never, why: { kind: 'chance', chance: 0 } }]);
        expect(calls).toEqual([
            { name: 'Never', point: 3, textBefore: '@Nara: Reply 0.' },
            { name: 'Rumour', point: 3, textBefore: '@Nara: Reply 0.' },
        ]);
    });

    it('does not roll a staying entry again; replayed points roll the same way, so a stay won on a lucky roll stays', () => {
        const well = entry({ name: 'Well', sticky: 6, chance: 50 });
        const messages = chat(['To the well.', 'a', 'b']);
        // Lucky only at point 2, where it went in.
        const { roll, calls } = fakeRoll([well], { Well: (point) => (point === 2 ? 0 : 99) });
        expect(at([well], messages, 7, { roll }).chosen).toEqual([['Well', { kind: 'staying', messagesLeft: 2 }]]);
        expect(calls.map((call) => call.point)).toEqual([2]);
        // Unlucky at point 2: no stay, and at point 4, where the scan still names it, unlucky again.
        const unlucky = fakeRoll([well], { Well: 99 });
        expect(at([well], messages, 4, { roll: unlucky.roll }).leftOut).toEqual([['Well', { kind: 'chance', chance: 50 }]]);
    });

    it('rolls the same for the same Messages every time, and again for a different text before the point', () => {
        const entries = Array.from({ length: 12 }, (_, i) => entry({ name: `Rumour${i}`, keywords: ['rumour'], chance: 50 }));
        const messages = chat(['A rumour.', 'Another rumour.']);
        const once = selectLoreAt(entries, messages);
        expect(selectLoreAt(entries, messages)).toEqual(once);
        expect(selectLoreAt(entries.map((e) => ({ ...e })), [...messages])).toEqual(once);
        const edited = selectLoreAt(entries, [...messages.slice(0, -1), ai('@Nara: An edited reply.')]);
        expect(chosenLore(edited).map((e) => e.name)).not.toEqual(chosenLore(once).map((e) => e.name));

        expect(loreRoll(7, 12, 'text')).toBe(loreRoll(7, 12, 'text'));
        expect(loreRoll(7, 12, 'text')).not.toBe(loreRoll(7, 12, 'text!'));
        expect(loreRoll(7, 12, 'text')).not.toBe(loreRoll(7, 13, 'text'));
        expect(loreRoll(7, 12, 'text')).not.toBe(loreRoll(8, 12, 'text'));
    });

    it('lets a 50% entry in roughly half the time over many points', () => {
        const rolls = Array.from({ length: 1000 }, (_, i) => loreRoll(42, i + 1, `@Nara: Reply ${i}.`));
        expect(rolls.every((roll) => roll >= 0 && roll < 100)).toBe(true);
        const passed = rolls.filter((roll) => roll < 50).length;
        expect(passed).toBeGreaterThan(400);
        expect(passed).toBeLessThan(600);
    });
});

describe('Lore triggers: groups (pure)', () => {
    it('lets in only the most recently mentioned member of a group, listing the other with the winner', () => {
        const dry = entry({ name: 'Dry season', keywords: ['dry'], group: 'weather' });
        const rain = entry({ name: 'Rains', keywords: ['rain'], group: 'Weather' });
        const selection = selectLoreAt([dry, rain], [ai('Last week was dry.'), ai('Now the rain comes.')]);
        expect(chosenLore(selection)).toEqual([rain]);
        expect(selection.leftOut).toEqual([{ entry: dry, why: { kind: 'group', group: 'weather', winner: 'Rains' } }]);
    });

    it('breaks equal recency by position, and compares group names ignoring case', () => {
        const dry = entry({ name: 'Dry season', keywords: ['dry'], group: 'WEATHER ' });
        const rain = entry({ name: 'Rains', keywords: ['rain'], group: 'weather' });
        const salt = entry({ name: 'Salt', group: 'trade' });
        expect(chosenNames([dry, rain, salt], [ai('Dry, then rain, then salt.')])).toEqual(['Dry season', 'Salt']);
        expect(chosenNames([rain, dry, salt], [ai('Dry, then rain, then salt.')])).toEqual(['Rains', 'Salt']);
    });

    it('keeps the group for a staying member over a newer mention, and gives it to an Always member over all', () => {
        const dry = entry({ name: 'Dry season', keywords: ['dry'], group: 'weather', sticky: 6 });
        const rain = entry({ name: 'Rains', keywords: ['rain'], group: 'weather' });
        const messages = chat(['It is dry.', 'a', 'The rain comes.']);
        expect(at([dry, rain], messages, 6)).toEqual({
            chosen: [['Dry season', { kind: 'staying', messagesLeft: 3 }]],
            leftOut: [['Rains', { kind: 'group', group: 'weather', winner: 'Dry season' }]],
        });
        const storm = entry({ name: 'Storm law', alwaysOn: true, group: 'weather' });
        expect(at([dry, rain, storm], messages, 6)).toEqual({
            chosen: [['Storm law', { kind: 'always' }]],
            leftOut: [
                // Dry season never went in at point 2, losing to the Always member, so it is not staying.
                ['Rains', { kind: 'group', group: 'weather', winner: 'Storm law' }],
                ['Dry season', { kind: 'group', group: 'weather', winner: 'Storm law' }],
            ],
        });
    });

    it('leaves the group empty when its winner does not fit', () => {
        const flood = entry({ name: 'Flood', group: 'weather', text: 'x'.repeat(400) });
        const rain = entry({ name: 'Rains', keywords: ['rain'], group: 'weather' });
        const selection = selectLoreAt([flood, rain], [ai('A flood after the rain.')], { cap: 60 });
        expect(selection.chosen).toEqual([]);
        expect(selection.leftOut).toEqual([
            { entry: flood, why: { kind: 'noRoom' } },
            { entry: rain, why: { kind: 'group', group: 'weather', winner: 'Flood' } },
        ]);
    });

    it('lets members brought in by other entries compete too, after the ones that came up', () => {
        const sky = entry({ name: 'Sky', text: 'The sky threatens rain.' });
        const rain = entry({ name: 'Rains', keywords: ['rain'], group: 'weather' });
        const dry = entry({ name: 'Dry season', keywords: ['dry'], group: 'weather' });
        expect(at([sky, rain, dry], [ai('The sky is grey and dry.')], 1)).toEqual({
            chosen: [
                ['Sky', { kind: 'cameUp', trigger: 'Sky', messagesAgo: 0 }],
                ['Dry season', { kind: 'cameUp', trigger: 'dry', messagesAgo: 0 }],
            ],
            leftOut: [['Rains', { kind: 'group', group: 'weather', winner: 'Dry season' }]],
        });
        expect(chosenNames([sky, rain, dry], [ai('The sky is grey.')])).toEqual(['Sky', 'Rains']);
    });
});

interface LoreEntry {
    id: number;
    name: string;
    keywords: string[];
    text: string;
    alwaysOn: boolean;
    secondaryKeywords: string[];
    secondaryMode: string;
    patterns: string[];
    recursable: boolean;
    sticky: number;
    cooldown: number;
    delay: number;
    chance: number;
    group: string;
}

interface Story {
    id: number;
    lore: LoreEntry[];
}

const OPENING = `Dust rises over the market.

@Nara: Welcome, traveller.`;
const NO_CHANGE = '{"bond_changes":[],"arc_steps":[],"scene":{"move_on":false,"reason":"nothing yet"}}';
const NO_OPS = '{"operations":[]}';

describe('Lore triggers: the API', () => {
    let t: TestApp;

    beforeAll(async () => {
        t = await startTestApp();
    });

    afterEach(() => {
        t.gateway.reset();
    });

    afterAll(async () => {
        await t.close();
    });

    async function playableStory(): Promise<number> {
        const created = await t.http.post('/api/stories').send({ title: 'The Market' }).expect(201);
        const storyId = created.body.id as number;
        await t.http.patch(`/api/stories/${storyId}`).send({ setting: 'A grassland market.', opening: OPENING }).expect(200);
        await t.http.patch(`/api/stories/${storyId}/role`).send({ name: 'Petch', description: 'A traveller.' }).expect(200);
        await t.http
            .post(`/api/stories/${storyId}/characters`)
            .send({ name: 'Nara', appearance: 'Tall.', personality: 'Calm.', voice: 'Measured.' })
            .expect(201);
        return storyId;
    }

    async function settle(storyId: number, chatId: number): Promise<void> {
        const deadline = Date.now() + 5_000;
        for (;;) {
            const { body } = await t.http.get(`/api/stories/${storyId}/chats/${chatId}`).expect(200);
            const last = body.messages.at(-1);
            if (last.judge?.status !== 'pending' && last.memory?.status !== 'pending') return;
            if (Date.now() > deadline) throw new Error('The background calls did not settle in time');
            await new Promise((resolve) => setTimeout(resolve, 20));
        }
    }

    /** One send through the fake gateway, settled; answers the turn's trailing system message. */
    async function turn(storyId: number, chatId: number, text: string, reply: string): Promise<string> {
        t.gateway.scriptText('turn', reply);
        t.gateway.scriptText('judge', NO_CHANGE);
        t.gateway.scriptText('memory_extraction', NO_OPS);
        await t.http.post(`/api/stories/${storyId}/chats/${chatId}/messages`).send({ text }).expect(201);
        await settle(storyId, chatId);
        return t.gateway.textCalls('turn').at(-1)!.messages.at(-1)!.content;
    }

    async function newChat(storyId: number): Promise<number> {
        return ((await t.http.post(`/api/stories/${storyId}/chats`).expect(201)).body as { id: number }).id;
    }

    it('carries second keywords and their mode through add, edit and Duplicate, cleaned like keywords', async () => {
        const storyId = await playableStory();
        const added = (
            await t.http
                .post(`/api/stories/${storyId}/lore`)
                .send({ name: 'The Well', text: 'One well.', secondaryKeywords: [' night ', '', 'NIGHT', 'กลางคืน'] })
                .expect(201)
        ).body as Story;
        expect(added.lore[0]).toMatchObject({ secondaryKeywords: ['night', 'กลางคืน'], secondaryMode: 'alsoNeeds' });

        const edited = (await t.http.patch(`/api/stories/${storyId}/lore/${added.lore[0].id}`).send({ secondaryMode: 'unless' }).expect(200)).body as Story;
        expect(edited.lore[0]).toMatchObject({ secondaryKeywords: ['night', 'กลางคืน'], secondaryMode: 'unless' });

        const plain = (await t.http.post(`/api/stories/${storyId}/lore`).send({ name: 'Plain' }).expect(201)).body as Story;
        expect(plain.lore[1]).toMatchObject({ secondaryKeywords: [], secondaryMode: 'alsoNeeds' });

        await t.http.patch(`/api/stories/${storyId}/lore/${added.lore[0].id}`).send({ secondaryMode: 'sometimes' }).expect(400);
        await t.http
            .patch(`/api/stories/${storyId}/lore/${added.lore[0].id}`)
            .send({ secondaryKeywords: Array.from({ length: 21 }, (_, i) => `k${i}`) })
            .expect(400);
        await t.http.patch(`/api/stories/${storyId}/lore/${added.lore[0].id}`).send({ secondaryKeywords: ['x'.repeat(101)] }).expect(400);

        const copy = (await t.http.post(`/api/stories/${storyId}/duplicate`).expect(201)).body as Story;
        expect(copy.lore[0]).toMatchObject({ name: 'The Well', secondaryKeywords: ['night', 'กลางคืน'], secondaryMode: 'unless' });
    });

    it('refuses a broken pattern with InvalidLorePatternError, saving nothing of that write; limits are validated', async () => {
        const storyId = await playableStory();
        const added = (await t.http.post(`/api/stories/${storyId}/lore`).send({ name: 'Moon', patterns: [' luna ', ''] }).expect(201)).body as Story;
        const id = added.lore[0].id;
        expect(added.lore[0].patterns).toEqual(['luna']);

        const refused = await t.http.patch(`/api/stories/${storyId}/lore/${id}`).send({ name: 'Renamed', patterns: ['selene', '(unclosed'] }).expect(422);
        expect(refused.body.error.code).toBe('422.003.014');
        expect(refused.body.error.message).toContain('"(unclosed"');
        expect(refused.body.error.message).toMatch(/Unterminated group/i);
        const after = (await t.http.get(`/api/stories/${storyId}`).expect(200)).body as Story;
        expect(after.lore[0]).toMatchObject({ name: 'Moon', patterns: ['luna'] });

        // A new entry with a broken pattern is not created either.
        await t.http.post(`/api/stories/${storyId}/lore`).send({ name: 'Bad', patterns: ['a{2,1}'] }).expect(422);
        expect(((await t.http.get(`/api/stories/${storyId}`).expect(200)).body as Story).lore).toHaveLength(1);

        await t.http.patch(`/api/stories/${storyId}/lore/${id}`).send({ patterns: Array.from({ length: 11 }, (_, i) => `p${i}`) }).expect(400);
        await t.http.patch(`/api/stories/${storyId}/lore/${id}`).send({ patterns: ['x'.repeat(201)] }).expect(400);
        await t.http.patch(`/api/stories/${storyId}/lore/${id}`).send({ patterns: ['x'.repeat(200)] }).expect(200);

        const copy = (await t.http.post(`/api/stories/${storyId}/duplicate`).expect(201)).body as Story;
        expect(copy.lore[0].patterns).toEqual(['x'.repeat(200)]);
    });

    it('carries in a turn an entry whose pattern the scan matches, with the pattern as its trigger', async () => {
        const storyId = await playableStory();
        await t.http.post(`/api/stories/${storyId}/lore`).send({ name: 'Silver mine', text: 'The mine gives poor silver.', patterns: ['^@Nara:.*silver'] }).expect(201);
        const chatId = await newChat(storyId);

        const first = await turn(storyId, chatId, 'Is there silver here?', '@Nara: Only in the hills, silver.');
        expect(first).not.toContain('The mine gives poor silver.');
        const second = await turn(storyId, chatId, 'Tell me more.', '@Nara: Ask the smith.');
        expect(second).toContain('The mine gives poor silver.');

        const inPlay = await t.http.get(`/api/stories/${storyId}/chats/${chatId}/lore`).expect(200);
        expect(inPlay.body.entries).toEqual([
            expect.objectContaining({ name: 'Silver mine', why: { kind: 'cameUp', trigger: '^@Nara:.*silver', messagesAgo: 2 } }),
        ]);
    });

    it('carries in a turn an entry named in the text of one that came up, after it; not with the opt-out off', async () => {
        const storyId = await playableStory();
        await t.http.post(`/api/stories/${storyId}/lore`).send({ name: 'Khan', text: 'The Khan is old and blind.' }).expect(201);
        await t.http.post(`/api/stories/${storyId}/lore`).send({ name: 'The Valley', text: 'The valley is ruled by the Khan.' }).expect(201);
        const chatId = await newChat(storyId);

        const trailing = await turn(storyId, chatId, 'We ride into the valley.', '@Nara: Quietly.');
        expect(trailing).toContain('## The Valley\nThe valley is ruled by the Khan.\n\n## Khan\nThe Khan is old and blind.');
        const inPlay = await t.http.get(`/api/stories/${storyId}/chats/${chatId}/lore`).expect(200);
        expect(inPlay.body.entries.map((e: { name: string; why: unknown }) => [e.name, e.why])).toEqual([
            ['The Valley', { kind: 'cameUp', trigger: 'The Valley', messagesAgo: 1 }],
            ['Khan', { kind: 'broughtIn', byName: 'The Valley' }],
        ]);

        const story = (await t.http.get(`/api/stories/${storyId}`).expect(200)).body as Story;
        const khan = story.lore.find((e) => e.name === 'Khan')!;
        const off = (await t.http.patch(`/api/stories/${storyId}/lore/${khan.id}`).send({ recursable: false }).expect(200)).body as Story;
        expect(off.lore.find((e) => e.name === 'Khan')!.recursable).toBe(false);
        const next = await turn(storyId, chatId, 'Deeper into the valley.', '@Nara: Yes.');
        expect(next).toContain('The valley is ruled by the Khan.');
        expect(next).not.toContain('The Khan is old and blind.');

        const copy = (await t.http.post(`/api/stories/${storyId}/duplicate`).expect(201)).body as Story;
        expect(copy.lore.map((e) => [e.name, e.recursable])).toEqual([
            ['Khan', false],
            ['The Valley', true],
        ]);
    });

    /** The Chat as the API answers it, settled. */
    async function chatBody(storyId: number, chatId: number): Promise<{ messages: Array<{ id: number; kind: string }> }> {
        await settle(storyId, chatId);
        return (await t.http.get(`/api/stories/${storyId}/chats/${chatId}`).expect(200)).body;
    }

    const lorePart = (trailing: string): string => (trailing.startsWith('# Lore') ? trailing.slice(0, trailing.indexOf('\n\nWhere things stand:')) : '');

    it('keeps a Sticky entry in the trailing message of the next turns and out after them, the system message unchanged', async () => {
        const storyId = await playableStory();
        await t.http.post(`/api/stories/${storyId}/lore`).send({ name: 'Well', text: 'The well is deep.', sticky: 6 }).expect(201);
        const chatId = await newChat(storyId);

        // The well is named only in the first line, which the turn window reads up to point 6.
        const lines = ['To the well.', 'I wait.', 'I wait more.', 'I sit.', 'I leave.'];
        const trailing: string[] = [];
        for (const line of lines) trailing.push(await turn(storyId, chatId, line, '@Nara: Hm.'));
        // In at point 2, staying through point 8, out at point 10.
        expect(trailing.map((text) => text.includes('The well is deep.'))).toEqual([true, true, true, true, false]);
        const systems = t.gateway.textCalls('turn').map((call) => call.messages[0].content);
        expect(new Set(systems).size).toBe(1);

        const story = (await t.http.get(`/api/stories/${storyId}`).expect(200)).body as Story;
        expect(story.lore[0]).toMatchObject({ sticky: 6, cooldown: 0, delay: 0 });
        const copy = (await t.http.post(`/api/stories/${storyId}/duplicate`).expect(201)).body as Story;
        expect(copy.lore[0]).toMatchObject({ sticky: 6, cooldown: 0, delay: 0 });
    });

    it('validates Stays for, Rests for and Waits until as whole numbers 0 to 50', async () => {
        const storyId = await playableStory();
        const added = (await t.http.post(`/api/stories/${storyId}/lore`).send({ name: 'Well', sticky: 50, cooldown: 0, delay: 7 }).expect(201)).body as Story;
        expect(added.lore[0]).toMatchObject({ sticky: 50, cooldown: 0, delay: 7 });
        const id = added.lore[0].id;
        for (const bad of [{ sticky: 51 }, { cooldown: -1 }, { delay: 2.5 }, { sticky: '3' }]) {
            await t.http.patch(`/api/stories/${storyId}/lore/${id}`).send(bad).expect(400);
        }
    });

    it('takes the stay back when the Message that brought the entry in is edited, and Reset starts with nothing staying', async () => {
        const storyId = await playableStory();
        await t.http.post(`/api/stories/${storyId}/lore`).send({ name: 'Well', text: 'The well is deep.', sticky: 6 }).expect(201);
        const chatId = await newChat(storyId);
        await turn(storyId, chatId, 'To the well.', '@Nara: Here.');
        expect(await turn(storyId, chatId, 'I wait.', '@Nara: Wait more.')).toContain('The well is deep.');

        const userMessage = (await chatBody(storyId, chatId)).messages[1];
        t.gateway.scriptText('turn', '@Nara: The market, then.');
        t.gateway.scriptText('judge', NO_CHANGE);
        t.gateway.scriptText('memory_extraction', NO_OPS);
        await t.http.patch(`/api/stories/${storyId}/chats/${chatId}/messages/${userMessage.id}`).send({ text: 'To the market.' }).expect(200);
        expect(t.gateway.textCalls('turn').at(-1)!.messages.at(-1)!.content).not.toContain('The well is deep.');
        expect(await turn(storyId, chatId, 'I wait.', '@Nara: Wait more.')).not.toContain('The well is deep.');

        // Back at the well, then a Reset: only the Opening is left, and nothing stays.
        await turn(storyId, chatId, 'To the well after all.', '@Nara: Here.');
        await settle(storyId, chatId);
        await t.http.post(`/api/stories/${storyId}/chats/${chatId}/reset`).expect(200);
        const inPlay = await t.http.get(`/api/stories/${storyId}/chats/${chatId}/lore`).expect(200);
        expect(inPlay.body).toEqual({ entries: [], leftOut: [] });
        expect(await turn(storyId, chatId, 'Hello.', '@Nara: Hello.')).not.toContain('The well is deep.');
    });

    it('gives Regenerate and a chosen Reply version the same Lore as the reply they replace', async () => {
        const storyId = await playableStory();
        await t.http.post(`/api/stories/${storyId}/lore`).send({ name: 'Well', text: 'The well is deep.', sticky: 2, cooldown: 3 }).expect(201);
        await t.http.post(`/api/stories/${storyId}/lore`).send({ name: 'Salt', text: 'Salt is money.' }).expect(201);
        const chatId = await newChat(storyId);
        await turn(storyId, chatId, 'To the well.', '@Nara: Here.');
        const original = await turn(storyId, chatId, 'Any salt?', '@Nara: Some salt.');
        expect(lorePart(original)).toContain('## Well');
        const inPlayBefore = (await t.http.get(`/api/stories/${storyId}/chats/${chatId}/lore`).expect(200)).body;

        const reply = (await chatBody(storyId, chatId)).messages.at(-1)!;
        t.gateway.scriptText('turn', '@Nara: No salt today.');
        t.gateway.scriptText('judge', NO_CHANGE);
        t.gateway.scriptText('memory_extraction', NO_OPS);
        await t.http.post(`/api/stories/${storyId}/chats/${chatId}/messages/${reply.id}/regenerate`).expect(200);
        const regenerated = t.gateway.textCalls('turn').at(-1)!.messages.at(-1)!.content;
        expect(lorePart(regenerated)).toBe(lorePart(original));

        await settle(storyId, chatId);
        t.gateway.scriptText('judge', NO_CHANGE);
        t.gateway.scriptText('memory_extraction', NO_OPS);
        await t.http.put(`/api/stories/${storyId}/chats/${chatId}/messages/${reply.id}/version`).send({ version: 1 }).expect(200);
        await settle(storyId, chatId);
        const inPlayAfter = (await t.http.get(`/api/stories/${storyId}/chats/${chatId}/lore`).expect(200)).body;
        expect(inPlayAfter).toEqual(inPlayBefore);
    });

    it('gives Regenerate the same Lore block for Chance entries; Lore in play shows the chance and the chance reason', async () => {
        const storyId = await playableStory();
        for (let i = 0; i < 8; i++) {
            await t.http.post(`/api/stories/${storyId}/lore`).send({ name: `Rumour ${i}`, keywords: ['rumour'], text: `Rumour number ${i}.`, chance: 50 }).expect(201);
        }
        await t.http.post(`/api/stories/${storyId}/lore`).send({ name: 'Ghost', text: 'Nobody sees the ghost.', chance: 0, alwaysOn: true }).expect(201);
        const chatId = await newChat(storyId);
        const original = lorePart(await turn(storyId, chatId, 'Any rumour?', '@Nara: Many.'));

        const reply = (await chatBody(storyId, chatId)).messages.at(-1)!;
        t.gateway.scriptText('turn', '@Nara: None at all.');
        t.gateway.scriptText('judge', NO_CHANGE);
        t.gateway.scriptText('memory_extraction', NO_OPS);
        await t.http.post(`/api/stories/${storyId}/chats/${chatId}/messages/${reply.id}/regenerate`).expect(200);
        expect(lorePart(t.gateway.textCalls('turn').at(-1)!.messages.at(-1)!.content)).toBe(original);

        // Lore in play rolls at the point after the newest Message, on that Message's text.
        const story = (await t.http.get(`/api/stories/${storyId}`).expect(200)).body as Story;
        const shown = (await chatBody(storyId, chatId)).messages;
        const newest = '@Nara: None at all.';
        const inPlay = (await t.http.get(`/api/stories/${storyId}/chats/${chatId}/lore`).expect(200)).body;
        const rumours = story.lore.filter((e) => e.name.startsWith('Rumour'));
        const lucky = rumours.filter((e) => loreRoll(e.id, shown.length, newest) < 50);
        expect(inPlay.entries).toEqual(lucky.map((e) => ({ id: e.id, name: e.name, alwaysOn: false, chance: 50, why: expect.objectContaining({ kind: 'cameUp' }) })));
        expect(inPlay.leftOut).toEqual([
            { id: expect.any(Number), name: 'Ghost', why: { kind: 'chance', chance: 0 } },
            ...rumours.filter((e) => !lucky.includes(e)).map((e) => ({ id: e.id, name: e.name, why: { kind: 'chance', chance: 50 } })),
        ]);

        const copy = (await t.http.post(`/api/stories/${storyId}/duplicate`).expect(201)).body as Story;
        expect(copy.lore.map((e) => e.chance)).toEqual([50, 50, 50, 50, 50, 50, 50, 50, 0]);
        await t.http.patch(`/api/stories/${storyId}/lore/${story.lore[0].id}`).send({ chance: 101 }).expect(400);
    });

    it('carries only the winner of a group in a turn, and Lore in play lists the other with the group', async () => {
        const storyId = await playableStory();
        await t.http.post(`/api/stories/${storyId}/lore`).send({ name: 'Dry season', keywords: ['dry'], text: 'Dust everywhere.', group: ' weather ' }).expect(201);
        await t.http.post(`/api/stories/${storyId}/lore`).send({ name: 'Rains', keywords: ['rain'], text: 'Mud everywhere.', group: 'Weather' }).expect(201);
        const chatId = await newChat(storyId);

        const trailing = await turn(storyId, chatId, 'It was dry, but now the rain comes.', '@Nara: Hm.');
        expect(trailing).toContain('Dust everywhere.');
        expect(trailing).not.toContain('Mud everywhere.');
        const inPlay = (await t.http.get(`/api/stories/${storyId}/chats/${chatId}/lore`).expect(200)).body;
        expect(inPlay.entries.map((e: { name: string }) => e.name)).toEqual(['Dry season']);
        expect(inPlay.leftOut).toEqual([{ id: expect.any(Number), name: 'Rains', why: { kind: 'group', group: 'Weather', winner: 'Dry season' } }]);

        const story = (await t.http.get(`/api/stories/${storyId}`).expect(200)).body as Story;
        expect(story.lore.map((e) => e.group)).toEqual(['weather', 'Weather']);
        await t.http.patch(`/api/stories/${storyId}/lore/${story.lore[0].id}`).send({ group: 'x'.repeat(61) }).expect(400);
        const copy = (await t.http.post(`/api/stories/${storyId}/duplicate`).expect(201)).body as Story;
        expect(copy.lore.map((e) => e.group)).toEqual(['weather', 'Weather']);
    });

    it('shows staying, resting and waiting entries in Lore in play', async () => {
        const storyId = await playableStory();
        await t.http.post(`/api/stories/${storyId}/lore`).send({ name: 'Well', text: 'The well is deep.', sticky: 2, cooldown: 2 }).expect(201);
        await t.http.post(`/api/stories/${storyId}/lore`).send({ name: 'Twist', text: 'Nara is the Khan.', alwaysOn: true, delay: 10 }).expect(201);
        const chatId = await newChat(storyId);
        const inPlay = async () => (await t.http.get(`/api/stories/${storyId}/chats/${chatId}/lore`).expect(200)).body;

        await turn(storyId, chatId, 'To the well.', '@Nara: Here.');
        expect(await inPlay()).toEqual({
            entries: [{ id: expect.any(Number), name: 'Well', alwaysOn: false, chance: 100, why: { kind: 'staying', messagesLeft: 2 } }],
            leftOut: [{ id: expect.any(Number), name: 'Twist', why: { kind: 'waiting', messagesLeft: 7 } }],
        });

        await turn(storyId, chatId, 'The well again.', '@Nara: Yes.');
        expect((await inPlay()).leftOut).toEqual([
            { id: expect.any(Number), name: 'Twist', why: { kind: 'waiting', messagesLeft: 5 } },
            { id: expect.any(Number), name: 'Well', why: { kind: 'resting', messagesLeft: 2 } },
        ]);
    });

    it('leaves out of a turn an entry whose condition fails, and Lore in play says so', async () => {
        const storyId = await playableStory();
        await t.http
            .post(`/api/stories/${storyId}/lore`)
            .send({ name: 'The Well', text: 'The well is cursed at night.', secondaryKeywords: ['night'] })
            .expect(201);
        await t.http
            .post(`/api/stories/${storyId}/lore`)
            .send({ name: 'Festival', text: 'The festival lasts three days.', secondaryKeywords: ['last year'], secondaryMode: 'unless' })
            .expect(201);
        const chatId = await newChat(storyId);

        const trailing = await turn(storyId, chatId, 'Tell me of the well and the festival, as it was last year.', '@Nara: Ask me at night.');
        expect(trailing).not.toContain('The festival lasts three days.');
        // "night" is in the reply, which a turn doesn't read yet; Lore in play does.
        expect(trailing).not.toContain('The well is cursed at night.');

        const inPlay = await t.http.get(`/api/stories/${storyId}/chats/${chatId}/lore`).expect(200);
        expect(inPlay.body.entries.map((e: { name: string }) => e.name)).toEqual(['The Well']);
        expect(inPlay.body.leftOut).toEqual([{ id: expect.any(Number), name: 'Festival', why: { kind: 'condition', mode: 'unless', keywords: ['last year'] } }]);

        const next = await turn(storyId, chatId, 'At night, then. The well?', '@Nara: Yes.');
        expect(next).toContain('The well is cursed at night.');
    });

    /** Every trigger setting off its default: the spec's all-settings example. */
    const ALL_SETTINGS = {
        secondaryKeywords: ['night'],
        secondaryMode: 'alsoNeeds',
        patterns: ['\\bwell\\b'],
        sticky: 4,
        cooldown: 6,
        delay: 10,
        chance: 50,
        group: 'weather',
        recursable: false,
    };

    const TRIGGER_DEFAULTS = {
        secondaryKeywords: [],
        secondaryMode: 'alsoNeeds',
        patterns: [],
        sticky: 0,
        cooldown: 0,
        delay: 0,
        chance: 100,
        group: '',
        recursable: true,
    };

    it("shows the Story assistant each entry's trigger settings in the fold's words, and a field rewrite none", async () => {
        const storyId = await playableStory();
        await t.http.post(`/api/stories/${storyId}/lore`).send({ name: 'The Well', text: 'A deep well.', ...ALL_SETTINGS }).expect(201);
        await t.http.post(`/api/stories/${storyId}/lore`).send({ name: 'Salt', text: 'Salt is money.' }).expect(201);

        t.gateway.scriptText('story_assistant', JSON.stringify({ reply: 'It fires rarely.', changes: [] }));
        await t.http.post(`/api/stories/${storyId}/assistant`).send({ instruction: 'Why does the well rarely show?' }).expect(200);
        const asked = t.gateway.textCalls('story_assistant')[0].messages.map((message) => message.content).join('\n');
        expect(asked).toContain(
            'Lore 1:\n  Name: The Well\n  Keywords: (none)\n  Text: A deep well.\n  Always include: no\n  More triggers: Also needs: night · 1 pattern · Stays 4 · Rests 6 · Waits 10 · 50% · Group: weather · Not from other entries\n\nLore 2:',
        );
        expect(asked).toContain('Lore 2:\n  Name: Salt\n  Keywords: (none)\n  Text: Salt is money.\n  Always include: no');
        expect(asked.match(/More triggers: /g)).toHaveLength(1);
        expect(asked).toContain('The author sets those in the editor');

        t.gateway.scriptText('field_rewrite', 'A grassland market at dawn.');
        await t.http.post(`/api/stories/${storyId}/rewrite`).send({ target: 'story', field: 'setting' }).expect(200);
        const rewrite = t.gateway.textCalls('field_rewrite')[0].messages.map((message) => message.content).join('\n');
        expect(rewrite).toContain('Lore 1:\n  Name: The Well\n  Keywords: (none)\n  Text: A deep well.\n  Always include: no\n\nLore 2:');
        expect(rewrite).not.toContain('More triggers');
    });

    it("keeps the trigger settings through the assistant's set, refuses a set of one, and gives its adds and a draft's entries the defaults", async () => {
        const storyId = await playableStory();
        await t.http.post(`/api/stories/${storyId}/lore`).send({ name: 'The Well', text: 'A deep well.', ...ALL_SETTINGS }).expect(201);
        t.gateway.scriptText(
            'story_assistant',
            JSON.stringify({
                reply: 'Done.',
                changes: [
                    { op: 'set', target: 'lore', name: 'The Well', field: 'keywords', value: ['spring'] },
                    { op: 'set', target: 'lore', name: 'The Well', field: 'text', value: 'A deep, cold well.' },
                    { op: 'add', target: 'lore', value: { name: 'Bucket', keywords: [], text: 'A leaky bucket.', alwaysOn: false } },
                ],
            }),
        );
        const result = await t.http.post(`/api/stories/${storyId}/assistant`).send({ instruction: 'Tidy the well.' }).expect(200);
        expect(result.body.story.lore).toEqual([
            { id: expect.any(Number), name: 'The Well', keywords: ['spring'], text: 'A deep, cold well.', alwaysOn: false, ...ALL_SETTINGS },
            { id: expect.any(Number), name: 'Bucket', keywords: [], text: 'A leaky bucket.', alwaysOn: false, ...TRIGGER_DEFAULTS },
        ]);

        t.gateway.scriptText('story_assistant', JSON.stringify({ reply: '', changes: [{ op: 'set', target: 'lore', name: 'The Well', field: 'sticky', value: 2 }] }));
        const refused = await t.http.post(`/api/stories/${storyId}/assistant`).send({ instruction: 'Make it stay.' }).expect(502);
        expect(refused.body.error.code).toBe('502.005.006');
        expect(((await t.http.get(`/api/stories/${storyId}`).expect(200)).body as Story).lore[0].sticky).toBe(4);

        t.gateway.scriptText(
            'story_draft',
            JSON.stringify({
                title: 'The Market',
                setting: 'A grassland market.',
                opening: OPENING,
                style: { pov: 'second', tense: 'present', replyLength: 'medium' },
                role: { name: 'Petch', description: 'A traveller.' },
                characters: [{ name: 'Nara', appearance: 'Tall.', personality: 'Calm.', voice: 'Measured.' }],
                lore: [{ name: 'Tents', keywords: ['yurt'], text: 'Round felt tents.', alwaysOn: false }],
            }),
        );
        const drafted = (await t.http.post('/api/stories/draft').send({ idea: 'A market.' }).expect(201)).body as Story;
        expect(drafted.lore).toEqual([{ id: expect.any(Number), name: 'Tents', keywords: ['yurt'], text: 'Round felt tents.', alwaysOn: false, ...TRIGGER_DEFAULTS }]);
    });
});

describe('Lore triggers: the summary (pure)', () => {
    it("words the spec's all-settings example exactly, and every default as None", () => {
        const all = {
            secondaryKeywords: ['night'],
            secondaryMode: 'alsoNeeds' as const,
            patterns: ['a'],
            sticky: 4,
            cooldown: 6,
            delay: 10,
            chance: 50,
            group: 'weather',
            recursable: false,
        };
        expect(loreTriggerSummary(all)).toBe('Also needs: night · 1 pattern · Stays 4 · Rests 6 · Waits 10 · 50% · Group: weather · Not from other entries');
        const none = { ...all, secondaryKeywords: [], patterns: [], sticky: 0, cooldown: 0, delay: 0, chance: 100, group: ' ', recursable: true };
        expect(loreTriggerSummary(none)).toBe('None');
        expect(loreTriggerSummary({ ...none, secondaryKeywords: ['last year', 'old'], secondaryMode: 'unless', patterns: ['a', 'b', 'c'] })).toBe('Unless: last year, old · 3 patterns');
    });
});
