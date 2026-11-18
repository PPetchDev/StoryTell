import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { judgeFactsSection } from '../src/manager/chat/details/facts.js';
import { buildJudgePrompt, parseJudgement, withSecretsShape } from '../src/manager/chat/judge/judge-prompt.js';
import {
    applySecretReveals,
    cardSecretLines,
    hasLevelledSecret,
    judgeSecretsSection,
    readJudgedSecrets,
    secretLevelProblem,
    secretsBlock,
    secretsState,
    SECRETS_EXTRA_TOKENS,
    storySecrets,
    StorySecret,
} from '../src/manager/chat/secrets/secrets.js';
import { buildTurnPrompt, TurnPromptInput } from '../src/manager/chat/turn/prompt.js';
import { JUDGE_FIXTURE_INPUTS } from './judge-prompt-inputs.js';

/**
 * Secret reveals (.scratch/secret-reveals/spec.md), pure: which Secrets are open and on offer, the
 * cast card, the Narrator's block, the Judge's section and shape, and reading and applying its answer.
 */

const levels = (trust: number) => ({ trust, affection: 0, desire: 0, tension: 0 });
const nara = {
    id: 1,
    name: 'Nara',
    secretList: [
        { id: 12, position: 1, text: 'She burned the old herd book.', axis: 'trust' as const, atLeast: 2 },
        { id: 11, position: 0, text: 'She was married once, to the bandit chief.', axis: 'trust' as const, atLeast: 1 },
        { id: 13, position: 2, text: 'She hums her mother’s song when afraid.', axis: null, atLeast: null },
        { id: 14, position: 3, text: '   ', axis: 'trust' as const, atLeast: 0 },
    ],
};
const kai = { id: 2, name: 'Kai', secretList: [{ id: 21, position: 0, text: 'He can’t read.', axis: 'affection' as const, atLeast: 1 }] };
const cast = [nara, kai];
const secrets = storySecrets(cast);
const byId = (id: number): StorySecret => secrets.find((secret) => secret.id === id)!;

describe('Secret reveals (pure)', () => {
    it('lists the Secrets with text in cast and author order, and knows when a Story has a level', () => {
        expect(secrets.map((secret) => secret.id)).toEqual([11, 12, 13, 21]);
        expect(hasLevelledSecret(cast)).toBe(true);
        expect(hasLevelledSecret([{ id: 1, name: 'Nara', secretList: [{ id: 13, text: 'x', axis: null, atLeast: null }] }])).toBe(false);
        expect(hasLevelledSecret([{ id: 1, name: 'Nara' }])).toBe(false);
    });

    it('offers one open Secret per Character, by their Bond toward the user, never one revealed or of a Character sitting out', () => {
        const bonds = [
            { fromCharacterId: 1, toCharacterId: null, levels: levels(2) },
            // Toward another Character: never counts.
            { fromCharacterId: 2, toCharacterId: 1, levels: { trust: 0, affection: 3, desire: 0, tension: 0 } },
        ];
        const state = secretsState({ secrets, bonds, reveals: [] });
        // Both of Nara's are open; only the first in her order is on offer. Kai's Bond toward the user has not formed.
        expect(state.offered.map((secret) => secret.id)).toEqual([11]);
        expect(state.revealed).toEqual([]);

        const after = secretsState({ secrets, bonds, reveals: [{ secretId: 11, messageId: 70 }] });
        expect(after.offered.map((secret) => secret.id)).toEqual([12]);
        expect(after.revealed).toEqual([{ ...byId(11), messageId: 70 }]);

        // Trust one step lower: the second is not open yet.
        expect(secretsState({ secrets, bonds: [{ fromCharacterId: 1, toCharacterId: null, levels: levels(1) }], reveals: [{ secretId: 11, messageId: 70 }] }).offered).toEqual([]);
        // A Bond with no levels yet opens nothing.
        expect(secretsState({ secrets, bonds: [{ fromCharacterId: 1, toCharacterId: null, levels: null }], reveals: [] }).offered).toEqual([]);
        // Sitting out: nothing on offer from them, though what they told stays told.
        const out = secretsState({ secrets, bonds, reveals: [{ secretId: 11, messageId: 70 }], sittingOut: [1] });
        expect(out.offered).toEqual([]);
        expect(out.revealed).toHaveLength(1);
        // Two Characters each offer theirs.
        const both = secretsState({ secrets, bonds: [...bonds, { fromCharacterId: 2, toCharacterId: null, levels: { trust: 0, affection: 1, desire: 0, tension: 0 } }], reveals: [] });
        expect(both.offered.map((secret) => secret.id)).toEqual([11, 21]);
        // A reveal of a Secret since removed is left out.
        expect(secretsState({ secrets, bonds, reveals: [{ secretId: 99, messageId: 70 }] }).revealed).toEqual([]);
    });

    it('writes the card as before without a list, and adds the Secrets without a level and those kept for now', () => {
        const before = 'Secrets (known only to Nara; no one else knows these unless Nara reveals them): She owes the river witch.';
        expect(cardSecretLines({ name: 'Nara', secrets: 'She owes the river witch.' })).toEqual([before]);
        expect(cardSecretLines({ name: 'Nara', secrets: 'She owes the river witch.', secretList: [] })).toEqual([before]);
        expect(cardSecretLines({ name: 'Nara', secrets: '  ' })).toEqual([]);

        const lines = cardSecretLines({ name: 'Nara', secrets: 'She owes the river witch.', secretList: nara.secretList });
        expect(lines).toEqual([
            `${before}\n- She hums her mother’s song when afraid.`,
            "Secrets Nara keeps for now (Nara does not tell them, or hint at them outright, until the Narrator's notes say Nara may):\n- She was married once, to the bandit chief.\n- She burned the old herd book.",
        ]);
        // No Secrets text: the head alone, then the items.
        expect(cardSecretLines({ name: 'Nara', secrets: '', secretList: [nara.secretList[2]] })).toEqual([
            'Secrets (known only to Nara; no one else knows these unless Nara reveals them):\n- She hums her mother’s song when afraid.',
        ]);
    });

    it('tells the Narrator what may come out and what is told, and nothing when neither', () => {
        expect(secretsBlock(null, 'Ash')).toBeNull();
        expect(secretsBlock({ offered: [], revealed: [] }, 'Ash')).toBeNull();
        const block = secretsBlock({ offered: [byId(12)], revealed: [byId(11)] }, 'Ash')!;
        expect(block).toBe(
            [
                '# Secrets',
                '- Nara may now tell Ash this, if and when the moment truly fits; never force it or steer toward it: She burned the old herd book.',
                'Tell at most one secret in a reply, and none at all when the moment is wrong for it.',
                'Already told to Ash, so never told again as news: Nara: She was married once, to the bandit chief.',
            ].join('\n'),
        );
        expect(secretsBlock({ offered: [], revealed: [byId(11)] }, 'Ash')).not.toContain('at most one');
    });

    it('puts the card in the standing system message and the block in the closing message, after the facts', () => {
        const input: TurnPromptInput = {
            story: {
                setting: 'The steppe.',
                characters: [{ name: 'Nara', appearance: 'Tall.', personality: 'Proud.', voice: 'Dry.', exampleLines: [], background: '', secrets: 'She owes the river witch.', secretList: nara.secretList }],
                pov: 'second',
                tense: 'present',
                replyLength: 'medium',
            } as TurnPromptInput['story'],
            identity: { name: 'Ash', description: 'A rider.' },
            scene: null,
            bonds: [],
            arcs: [],
            memories: [],
            history: [],
            userText: 'I sit by the fire.',
            facts: { facts: [{ topic: "Nara's age", fact: 'twenty-six' }], slips: [] },
            secrets: { offered: [byId(11)], revealed: [] },
        };
        const prompt = buildTurnPrompt(input);
        const system = prompt.messages[0].content;
        expect(system).toContain("Secrets Nara keeps for now (Nara does not tell them, or hint at them outright, until the Narrator's notes say Nara may):\n- She was married once");
        expect(system).not.toContain('# Secrets\n');
        const closing = prompt.messages.at(-1)!.content;
        expect(closing.indexOf('# Secrets\n')).toBeGreaterThan(closing.indexOf('# Established facts'));
        expect(closing).toContain('- Nara may now tell Ash this');
        // The card never changes with what is on offer or told.
        expect(buildTurnPrompt({ ...input, secrets: { offered: [], revealed: [byId(11)] } }).messages[0].content).toBe(system);
        expect(buildTurnPrompt({ ...input, secrets: null }).messages.at(-1)!.content).not.toContain('# Secrets');
    });

    it('names the field in the Judge’s reply shape only for a Story with a levelled Secret, and asks only when one is on offer', () => {
        // The golden fixture: a Story without one sends what it sent before.
        const recorded = JSON.parse(readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/judge/prompts-before-expressions.json'), 'utf8'));
        expect(JUDGE_FIXTURE_INPUTS.map((input) => buildJudgePrompt({ ...input, secretsShape: false, secretsSection: judgeSecretsSection([byId(11)]) }))).toEqual(recorded);

        const input = { ...JUDGE_FIXTURE_INPUTS[0], factsSection: judgeFactsSection([]) };
        const plain = buildJudgePrompt(input);
        const shaped = buildJudgePrompt({ ...input, secretsShape: true, secretsSection: null });
        const asking = buildJudgePrompt({ ...input, secretsShape: true, secretsSection: judgeSecretsSection([byId(11), byId(21)]) });
        expect(shaped.messages[0].content).toContain(',\n "secrets_revealed":[]}\nEmpty arrays when nothing changed.');
        expect(shaped.messages[0].content).toContain('"roll_offer":null,\n "secrets_revealed":[]}');
        // The system message is the same whether or not a Secret is on offer.
        expect(asking.messages[0].content).toBe(shaped.messages[0].content);
        expect(shaped.messages[1].content).toBe(plain.messages[1].content);
        expect(shaped.maxTokens).toBe(plain.maxTokens);
        expect(asking.messages[1].content).toBe(
            `${plain.messages[1].content}\n\n# Secrets that may come out\n[1] Nara: She was married once, to the bandit chief.\n[2] Kai: He can’t read.\n${judgeSecretsSection([byId(11)])!.split('\n').at(-1)}`,
        );
        expect(asking.maxTokens).toBe(plain.maxTokens + SECRETS_EXTRA_TOKENS);
        expect(judgeSecretsSection([])).toBeNull();
        // With the Roll offer's section too, the Secrets come last; with Expressions the shape still ends right.
        const both = buildJudgePrompt({ ...input, rollOfferSection: '# Roll offer', secretsShape: true, secretsSection: judgeSecretsSection([byId(11)]) });
        expect(both.messages[1].content.indexOf('# Secrets that may come out')).toBeGreaterThan(both.messages[1].content.indexOf('# Roll offer'));
        const tagged = { ...input, expressionParts: [{ kind: 'speech' as const, characterId: 1, speakerName: 'Mira', text: 'Better.' }], secretsShape: true };
        expect(buildJudgePrompt(tagged).messages[0].content).toContain('"expressions":[{"line":1,"emotion":"joy"}]');
        expect(buildJudgePrompt(tagged).messages[0].content).toContain('"secrets_revealed":[]}');
        expect(() => withSecretsShape('no shape here')).toThrow();
    });

    it('reads the Judge’s numbers loosely and takes only those it offered, once', () => {
        const base = '{"bond_changes":[],"arc_steps":[],"scene":{"move_on":false,"reason":"no"}';
        expect(parseJudgement(`${base},"secrets_revealed":[1,"2","[3]",1.5,"x",null,{"number":4}]}`).secretsRevealed).toEqual([1, 2, 3, 4]);
        expect(parseJudgement(`${base},"secrets_revealed":[]}`)).not.toHaveProperty('secretsRevealed');
        expect(parseJudgement(`${base}}`)).not.toHaveProperty('secretsRevealed');
        expect(readJudgedSecrets('1')).toEqual([]);

        const offered = [byId(11), byId(21)];
        expect(applySecretReveals(offered, [2])).toEqual({ reveals: [21], rejected: [] });
        const applied = applySecretReveals(offered, [1, 1, 3, 0]);
        expect(applied.reveals).toEqual([11]);
        expect(applied.rejected).toHaveLength(3);
        expect(applySecretReveals([], [1]).reveals).toEqual([]);
    });

    it('checks a Secret’s level', () => {
        expect(secretLevelProblem(null, null)).toBeNull();
        expect(secretLevelProblem('trust', 3)).toBeNull();
        expect(secretLevelProblem('tension', -1)).toContain('scale');
        expect(secretLevelProblem('trust', null)).toContain('both');
        expect(secretLevelProblem(null, 1)).toContain('both');
    });
});
