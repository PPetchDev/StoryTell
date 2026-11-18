import path from 'node:path';

import { AppConfig, ConfigError, loadConfig } from '../src/config/app-config.js';
import { ChatManagerService } from '../src/manager/chat/chat.service.js';
import { ReachOutSchedulerService } from '../src/manager/reach-out/reach-out-scheduler.service.js';
import { AccountModelService } from '../src/model/account/account.service.js';
import { ReachOutModelService } from '../src/model/chat/reach-out.service.js';
import {
    awayInWords,
    buildReachOutPrompt,
    inQuietHours,
    localHour,
    reachOutAlertBody,
    reachOutCheck,
    ReachOutMessage,
    ReachOutPromptInput,
    reachOutSpeaker,
    readReachOut,
} from '../src/manager/chat/reach-out/reach-out.js';

/** Reach-outs (.scratch/reach-outs/spec.md) as pure logic: quiet hours, who speaks, the rules, the prompt and the answer. */

const HOUR = 60 * 60 * 1000;
/** 2026-11-18 at `hour`:00 in Bangkok (UTC+7). */
const bangkok = (hour: number, minute = 0) => new Date(Date.UTC(2026, 10, 18, hour - 7, minute));

describe('Reach-outs: quiet hours in Asia/Bangkok', () => {
    it('reads the hour in Bangkok, and keeps 22:00 to 08:00 quiet', () => {
        expect(localHour(new Date(Date.UTC(2026, 10, 18, 3, 0)))).toBe(10);
        expect(inQuietHours(bangkok(21, 59))).toBe(false);
        expect(inQuietHours(bangkok(22, 0))).toBe(true);
        expect(inQuietHours(bangkok(23, 30))).toBe(true);
        expect(inQuietHours(bangkok(2, 0))).toBe(true);
        expect(inQuietHours(bangkok(7, 59))).toBe(true);
        expect(inQuietHours(bangkok(8, 0))).toBe(false);
        expect(inQuietHours(bangkok(13, 0))).toBe(false);
    });
});

describe('Reach-outs: who speaks', () => {
    const levels = (trust: number, affection: number, desire: number, tension = 0) => ({ trust, affection, desire, tension });

    it('the warmest Bond toward the user, Tension aside; no Bond ranks below any', () => {
        const cast = [
            { id: 1, name: 'Mira', bondLevels: levels(1, 1, 0, 3), lastSpokeAt: 9 },
            { id: 2, name: 'Kai', bondLevels: levels(2, 2, 1), lastSpokeAt: 3 },
            { id: 3, name: 'Lio', lastSpokeAt: 10 },
        ];
        expect(reachOutSpeaker(cast, [])?.name).toBe('Kai');
        expect(reachOutSpeaker([cast[0], { ...cast[1], bondLevels: levels(-3, -3, -3) }, cast[2]], [])?.name).toBe('Mira');
        // A Bond without levels counts 0, still above none.
        expect(reachOutSpeaker([{ id: 3, name: 'Lio', lastSpokeAt: 10 }, { id: 4, name: 'Bo', bondLevels: null, lastSpokeAt: 1 }], [])?.name).toBe('Bo');
    });

    it('on a tie the last to speak, then cast order; never one sitting out; nobody when all are', () => {
        const cast = [
            { id: 1, name: 'Mira', lastSpokeAt: 2 },
            { id: 2, name: 'Kai', lastSpokeAt: 7 },
            { id: 3, name: 'Lio', lastSpokeAt: -1 },
        ];
        expect(reachOutSpeaker(cast, [])?.name).toBe('Kai');
        expect(reachOutSpeaker(cast, [2])?.name).toBe('Mira');
        expect(reachOutSpeaker(cast.map((member) => ({ ...member, lastSpokeAt: -1 })), [])?.name).toBe('Mira');
        expect(reachOutSpeaker(cast, [1, 2, 3])).toBeNull();
    });
});

describe('Reach-outs: when one is due', () => {
    const t0 = bangkok(10);
    const at = (hours: number) => new Date(t0.getTime() + hours * HOUR);
    const message = (id: number, kind: 'user' | 'ai', hours: number, extra: Partial<ReachOutMessage> = {}): ReachOutMessage => ({
        id,
        position: id,
        kind,
        reachOut: false,
        epilogue: false,
        createdAt: at(hours),
        ...extra,
    });
    const played = [message(0, 'ai', -48), message(1, 'user', 0), message(2, 'ai', 0)];
    const setting = { afterHours: 6, setAt: at(-100) };

    it('is due once the time away is up, for the absence of the newest User Message', () => {
        expect(reachOutCheck(played, at(0), setting, at(5.9))).toEqual({ due: false, why: 'not away long enough' });
        expect(reachOutCheck(played, at(0), setting, at(6))).toEqual({ due: true, userMessageId: 1, hoursAway: 6 });
        expect(reachOutCheck(played, at(0), { afterHours: 24, setAt: at(-100) }, at(23))).toMatchObject({ due: false });
    });

    it('counts from the latest of the newest Message, the last play and the setting', () => {
        expect(reachOutCheck(played, at(3), setting, at(7))).toMatchObject({ due: false });
        expect(reachOutCheck(played, at(0), { afterHours: 6, setAt: at(4) }, at(7))).toMatchObject({ due: false });
        // Away is still counted from the user's last time here, not from the setting.
        expect(reachOutCheck(played, at(0), { afterHours: 6, setAt: at(4) }, at(10))).toEqual({ due: true, userMessageId: 1, hoursAway: 10 });
    });

    it('needs a Message of the user, none waiting for its reply, no Reach-out since and no Epilogue', () => {
        expect(reachOutCheck([message(0, 'ai', -48)], at(-48), setting, at(10))).toEqual({ due: false, why: 'the user has not written in it' });
        expect(reachOutCheck([message(0, 'ai', -48), message(1, 'user', 0)], at(0), setting, at(10))).toEqual({ due: false, why: 'a Message waits for its reply' });
        expect(reachOutCheck([...played, message(3, 'ai', 6, { reachOut: true })], at(0), setting, at(20))).toEqual({ due: false, why: 'it reached out already this absence' });
        expect(reachOutCheck([message(0, 'ai', -48), message(1, 'user', 0), message(2, 'ai', 0, { epilogue: true })], at(0), setting, at(10))).toEqual({
            due: false,
            why: 'the story has its Epilogue',
        });
        // Once the user writes again, a new absence begins.
        const answered = [...played, message(3, 'ai', 6, { reachOut: true }), message(4, 'user', 7), message(5, 'ai', 7)];
        expect(reachOutCheck(answered, at(7), setting, at(13))).toEqual({ due: true, userMessageId: 4, hoursAway: 6 });
    });

    it('says how long in words', () => {
        expect(awayInWords(6)).toBe('a few hours');
        expect(awayInWords(12)).toBe('half a day');
        expect(awayInWords(26)).toBe('about a day');
        expect(awayInWords(80)).toBe('a few days');
    });
});

const INPUT: ReachOutPromptInput = {
    character: { name: 'Nara', personality: 'Warm, teasing.', voice: 'Short sentences.', background: 'Runs the noodle stall.' },
    identityName: 'Petch',
    identityDescription: 'A night-shift nurse.',
    setting: 'Bangkok, a night market.',
    scene: { name: 'Closing time', situation: 'The stall shuts.' },
    timeOfDay: 'night',
    place: 'the stall',
    nowNote: 'Nara calls Petch "P\'Petch" now.',
    bond: { label: 'Smitten', description: 'She can not stop thinking about Petch.', levels: { trust: 2, affection: 2, desire: 1, tension: 1 } },
    innerLife: 'Nara wants Petch to come back tomorrow.',
    thought: 'I should not have let him leave so fast.',
    storySoFar: 'Petch came to the stall every night for a week.',
    story: ['Nara: Last bowl.', 'Petch: See you tomorrow.'],
    hoursAway: 12,
};

describe('Reach-outs: the prompt', () => {
    it('tells the writer who they are, how they feel and what they keep to themselves, the story, and what to write', () => {
        const prompt = buildReachOutPrompt(INPUT);
        const [system, user] = prompt.messages.map((message) => message.content);
        expect(prompt.messages.map((message) => message.role)).toEqual(['system', 'user']);
        expect(prompt.maxTokens).toBe(160);
        expect(system).toContain('Every character is an adult.');
        expect(system).toContain('The character is Nara.\nPersonality: Warm, teasing.\nVoice (how Nara talks): Short sentences.\nBackground: Runs the noodle stall.');
        expect(system).toContain('What has changed about Nara in this story (this holds over anything above): Nara calls Petch "P\'Petch" now.');
        expect(system).toContain('How Nara feels about Petch now: "Smitten" — She can not stop thinking about Petch. (Trust: trusts · Affection: close · Desire: drawn · Tension: uneasy)');
        expect(system).toContain('What Nara keeps to themselves lately: Nara wants Petch to come back tomorrow.');
        expect(system).toContain("Nara's last private thought: I should not have let him leave so fast.");
        expect(system).toContain('Petch is the person the user plays. Who Petch is: A night-shift nurse.');
        expect(user).toContain('<story_so_far>\nPetch came to the stall every night for a week.\n</story_so_far>');
        expect(user).toContain('Where things stood: Scene: Closing time (The stall shuts.). Time: night. Place: the stall.');
        expect(user).toContain('<story>\nNara: Last bowl.\n\nPetch: See you tomorrow.\n</story>');
        expect(user).toContain('Petch has been away for half a day. Nara reaches out to Petch first, on their own.');
        expect(user).toContain('a line that starts "@Nara: "');
        expect(user).toContain("Never write Petch's words, thoughts or actions");
        expect(user).toContain('no sexual act. Everyone in the story is an adult.');
        expect(user.endsWith('Answer with only the narration sentence and the line.')).toBe(true);
    });

    it('says nothing of what the writer does not have, and keeps the newest of a long story', () => {
        const bare = buildReachOutPrompt({ ...INPUT, nowNote: null, bond: null, innerLife: null, thought: null, storySoFar: null, scene: null, timeOfDay: null, place: null, identityDescription: '' });
        const [system, user] = bare.messages.map((message) => message.content);
        for (const missing of ['What has changed', 'feels about', 'keeps to themselves', 'private thought', 'Who Petch is']) expect(system).not.toContain(missing);
        expect(user).not.toContain('story_so_far');
        expect(user).not.toContain('Where things stood');
        const long = buildReachOutPrompt({ ...INPUT, story: [...Array.from({ length: 400 }, (_, i) => `Nara: line ${i} ${'word '.repeat(20)}`), 'Petch: The newest.'] });
        const told = long.messages[1].content;
        expect(told).toContain('Petch: The newest.');
        expect(told).not.toContain('line 0 ');
    });
});

describe('Reach-outs: reading the answer', () => {
    const cast = [
        { id: 1, name: 'Nara' },
        { id: 2, name: 'Kai' },
    ];

    it('keeps the narration before the line and the writer\'s one line, nothing of anyone else\'s', () => {
        const parts = readReachOut('Your phone buzzes.\n\n@Nara: The stall\'s closed. I keep thinking about last night.\n\n@Kai: Me too!\n\nShe waits.', { id: 1, name: 'Nara' }, cast, 'Petch', []);
        expect(parts).toEqual([
            { kind: 'narration', text: 'Your phone buzzes.' },
            { kind: 'speech', characterId: 1, speakerName: 'Nara', text: "The stall's closed. I keep thinking about last night." },
        ]);
        expect(reachOutAlertBody(parts!)).toBe("Nara: The stall's closed. I keep thinking about last night.");
    });

    it("cuts at a line written as the user, reads a fenced answer, and fails without the writer's own line", () => {
        expect(readReachOut('```\n@Nara: Come back.\n```', { id: 1, name: 'Nara' }, cast, 'Petch', [])).toEqual([{ kind: 'speech', characterId: 1, speakerName: 'Nara', text: 'Come back.' }]);
        expect(readReachOut('A knock.\n\n@Nara: Open up.\n\nPetch: Coming!', { id: 1, name: 'Nara' }, cast, 'Petch', [])).toHaveLength(2);
        expect(readReachOut('A knock at the door.', { id: 1, name: 'Nara' }, cast, 'Petch', [])).toBeNull();
        expect(readReachOut('@Kai: Hey.', { id: 1, name: 'Nara' }, cast, 'Petch', [])).toBeNull();
        expect(readReachOut('', { id: 1, name: 'Nara' }, cast, 'Petch', [])).toBeNull();
    });

    it('cuts a long alert to 120 characters', () => {
        const body = reachOutAlertBody([{ kind: 'speech', characterId: 1, speakerName: 'Nara', text: 'word '.repeat(60) }])!;
        expect(body.length).toBe(120);
        expect(body.endsWith('…')).toBe(true);
        expect(reachOutAlertBody([{ kind: 'narration', text: 'Quiet.' }])).toBeNull();
    });
});

describe('Reach-outs: the scheduler', () => {
    const base = { PORT: '4001', DATABASE_URL: 'postgres://localhost/test', IMAGE_DIR: path.resolve('/data/storytell/images') };

    it('ticks every five minutes by default; REACH_OUT_TICK_MS sets it, 0 turns it off, anything else stops start-up', () => {
        expect(loadConfig(base).reachOutTickMs).toBe(300_000);
        expect(loadConfig({ ...base, REACH_OUT_TICK_MS: '60000' }).reachOutTickMs).toBe(60_000);
        expect(loadConfig({ ...base, REACH_OUT_TICK_MS: '0' }).reachOutTickMs).toBe(0);
        expect(() => loadConfig({ ...base, REACH_OUT_TICK_MS: 'soon' })).toThrow(ConfigError);
        expect(() => loadConfig({ ...base, REACH_OUT_TICK_MS: '-5' })).toThrow(/REACH_OUT_TICK_MS/);
    });

    it('starts its timer at boot only when the tick is set, stops it on shutdown, and never overlaps two ticks', async () => {
        const due = vi.fn(async () => {
            await new Promise((resolve) => setTimeout(resolve, 20));
            return [];
        });
        const make = (reachOutTickMs: number | undefined) =>
            new ReachOutSchedulerService({ reachOutTickMs } as AppConfig, { due } as unknown as ReachOutModelService, {} as AccountModelService, {} as ChatManagerService);

        const off = make(undefined);
        const offTick = vi.spyOn(off, 'tick');
        off.onApplicationBootstrap();
        await new Promise((resolve) => setTimeout(resolve, 40));
        expect(offTick).not.toHaveBeenCalled();

        const on = make(10);
        const onTick = vi.spyOn(on, 'tick');
        on.onApplicationBootstrap();
        await new Promise((resolve) => setTimeout(resolve, 45));
        on.onModuleDestroy();
        const ticks = onTick.mock.calls.length;
        expect(ticks).toBeGreaterThan(0);
        await new Promise((resolve) => setTimeout(resolve, 40));
        expect(onTick.mock.calls.length).toBe(ticks);

        // Two ticks asked for at once run one after the other.
        due.mockClear();
        const daytime = bangkok(10);
        let running = 0;
        let most = 0;
        due.mockImplementation(async () => {
            running += 1;
            most = Math.max(most, running);
            await new Promise((resolve) => setTimeout(resolve, 10));
            running -= 1;
            return [];
        });
        await Promise.all([on.tick(daytime), on.tick(daytime)]);
        expect(due).toHaveBeenCalledTimes(2);
        expect(most).toBe(1);
        // At night it looks at nothing.
        await on.tick(bangkok(23));
        expect(due).toHaveBeenCalledTimes(2);
    });
});
