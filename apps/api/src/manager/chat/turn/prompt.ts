import { Balance, Difficulty, Pacing, Pov, ReplyLength, Tense } from '../../../model/story/entities/story.entity.js';
import type { FaceEmotion } from '../../../model/story/emotion.js';
import type { TimeOfDay } from '../../../model/chat/entities/chat.entity.js';
import { BondLevels, bondLevelsInWords } from '../../../model/ledger/bond-axes.js';
import { PromptMessage } from '../../../service/model-gateway/model-gateway.js';
import { memoryLine } from '../memory/memory-prompt.js';
import { beliefLine, MEMORY_BUDGET_TOKENS } from '../memory/memory-choice.js';
import { memoryIsAbout } from '../memory/present.js';
import { renderUser } from '../memory/render-user.js';
import { documentsBlock, PromptPassage } from '../../document/document-search.js';
import { loreBlock, PromptLoreEntry } from '../lore/lore-select.js';
import { Roll, rollBlock } from '../roll.js';
import { LINGERING_REPLIES } from '../scene-replies.js';
import { PromptSuddenEvent, suddenEventBlock } from '../sudden-event/sudden-event.js';
import { detailsReminder, PromptDetails } from '../details/details.js';
import { nowLayer, PromptNowNote } from '../details/now-notes.js';
import { EPILOGUE_MIN_TOKENS, epilogueFinalInstruction, epilogueInstruction, PromptEpilogue } from '../ending/ending.js';
import { factsBlock, PromptFacts } from '../details/facts.js';
import { pressingBlock, PressingNote } from '../details/pressing.js';
import { ChatItem, itemsBlock } from '../details/items.js';
import { CardSecret, cardSecretLines, secretsBlock, StorySecret } from '../secrets/secrets.js';
import { repeatedGestures, repeatedGesturesLine, repeatedPhrases, repeatedPhrasesLine } from '../speech/repeated-phrases.js';
import { estimateTokens } from './prompt-tokens.js';

/**
 * Prompt assembly for one turn (spec: "Prompt assembly"). Pure logic over plain inputs, so
 * tests can pin the layer order and the trimming without a database.
 *
 * Layers, most stable first so prompt caching holds:
 *  1. Narrator rules      5. Cast cards              9. Memory
 *  2. Setting             6. current Scene          10. recent Messages
 *  3. worn identity       7. Feelings (Bonds)       11. the user's message
 *  4. Style               8. Arcs                   12. the final instruction
 *
 * The final instruction opens with the Lore the latest exchange brings up (spec: "Lore"), then
 * the Document passages the turn's search found (.scratch/documents/spec.md), then the Chat's
 * Author's note (.scratch/authors-note/spec.md), so the system message, and with it
 * the cached prefix, stays the same from turn to turn. "Where things stand" names the Characters
 * sitting out (.scratch/speaker-controls/spec.md) for the same reason.
 *
 * On a Continue turn, layer 11 is the continue instruction in place of the user's message.
 *
 * Layers 1–9 form one system message with a `# Heading` per layer; 10–11 are chat turns;
 * 12 is a trailing system message, as in the prototype. The identity is the worn one: the
 * Story's Role or a Persona; its name also drives the stop strings and the final instruction.
 */

export interface PromptCharacter {
    name: string;
    appearance: string;
    personality: string;
    voice: string;
    exampleLines: string[];
    background: string;
    secrets: string;
    /** Their Secrets one by one (.scratch/secret-reveals/spec.md); none, or left out, and the card is as before. */
    secretList?: CardSecret[] | null;
}

export interface PromptScene {
    name: string;
    situation: string;
    moveOnCondition: string;
    /** Its Bond gates in words (.scratch/bond-axes/spec.md); none, or left out, and the line is as before. */
    gates?: string[];
    /**
     * The replies in the Scene before the one being written (.scratch/scene-flow/spec.md); from
     * `LINGERING_REPLIES` the line draws the Scene toward its end. Left out, the line is as before.
     */
    replies?: number;
    /**
     * The user's Move on brought the Chat to this Scene and no reply has been written in it yet
     * (.scratch/scene-chapters/spec.md): the line asks the reply to carry the story there.
     */
    chosenByUser?: boolean;
}

export interface PromptStory {
    setting: string;
    pov: Pov;
    tense: Tense;
    replyLength: ReplyLength;
    /** Style controls (.scratch/style-controls/spec.md); left out, each is its middle value, which says nothing. */
    pacing?: Pacing;
    balance?: Balance;
    difficulty?: Difficulty;
    characters: PromptCharacter[];
}

export interface PromptIdentity {
    name: string;
    description: string;
}

/** A Message of the Chat as the prompt sees it: the user's text, or the AI's `@Name:` text. */
export interface PromptHistoryMessage {
    role: 'user' | 'assistant';
    text: string;
}

/** A Bond's current value, as the Feelings layer states it. */
export interface PromptBond {
    fromName: string;
    /** null means toward the user. */
    toName: string | null;
    label: string;
    description: string;
    /** Its levels on the Bond axes, stated in words; null or left out while it has none, and then the line is as before. */
    levels?: BondLevels | null;
}

/** A Character's Arc so far and the author's Arc direction, as the Arcs layer states them. */
export interface PromptArc {
    name: string;
    steps: string[];
    direction: string;
}

/** A Memory as the Memory layer lists it: its text with `{user}`, and who knows it by name. */
export interface PromptMemory {
    text: string;
    knownBy: string[];
    /** A locked Memory is the user's and is never left out to fit the cap. */
    locked: boolean;
    /**
     * Sent in the standing part, under "Lasting memory", where it changes rarely
     * (.scratch/prompt-cache/spec.md): the locked and the Settled Memories. Left out, in the Memory layer.
     */
    standing?: boolean;
}

/** A Belief as the Memory layer tells it (.scratch/memory-by-meaning/spec.md, "Told to the Narrator"). */
export interface PromptBelief {
    characterName: string;
    /** With `{user}`, rendered by the layer. */
    text: string;
}

/** Spec: "Story so far": the events of the oldest Messages, which then stop being sent word for word. */
export interface PromptStorySoFar {
    text: string;
    /** How many of the Chat's first Messages it covers. */
    coveredMessages: number;
}

export interface TurnPromptInput {
    story: PromptStory;
    identity: PromptIdentity;
    scene: PromptScene | null;
    /** Every Bond in the Chat (spec: "Feelings"). */
    bonds: PromptBond[];
    /** One per Character, in cast order (spec: "Arcs"). */
    arcs: PromptArc[];
    /**
     * The Memories the Memory choice picked for this prompt, in story order
     * (.scratch/memory-by-meaning/spec.md, "Choosing Memories for a turn").
     */
    memories: PromptMemory[];
    /** The active Beliefs the Memory choice picked, of the Characters present, oldest first; left out, none. */
    beliefs?: PromptBelief[];
    /**
     * The newest Diary entries in play (.scratch/diary/spec.md), freshest first: the "Inner life"
     * layer. None, or left out, and the prompt is as before.
     */
    diaries?: PromptDiary[];
    /** Each Character's Thought before this reply (.scratch/character-minds/spec.md); none, or left out, and the prompt is as before. */
    thoughts?: PromptThought[];
    /**
     * The most the Memory layer may take on the next turn, which the Story so far trigger reserves
     * (spec: "The budget is reserved"); left out, only the layer as it stands is counted.
     */
    memoryRoomTokens?: number;
    /** The Chat's Story so far; null or left out while the whole Chat still fits. */
    storySoFar?: PromptStorySoFar | null;
    /** Every Message of the Chat before the new one, oldest first. */
    history: PromptHistoryMessage[];
    /** The user's message; null for a Continue turn, whose user-role message is the continue instruction. */
    userText: string | null;
    /**
     * The Character the user nudged for this turn (.scratch/speaker-controls/spec.md, "Nudge"), by name;
     * null or left out for none. Turn-only: never one of the shared layers.
     */
    nudge?: string | null;
    /**
     * The user's Cue for this turn (CONTEXT.md, "Cue"): a few words to the Narrator for this one
     * reply; null, empty or left out for none. Turn-only: never one of the shared layers.
     */
    cue?: string | null;
    /**
     * The Chat's Sudden event as this reply reads it (.scratch/sudden-events/spec.md): the one under
     * way, or the one that has just ended; null or left out for none. Turn-only.
     */
    suddenEvent?: PromptSuddenEvent | null;
    /** The Roll the user's message was sent with (.scratch/roll/spec.md); null or left out for none. Turn-only. */
    /** The face the user picked for the Message this turn answers (.scratch/your-faces/spec.md); null or left out without one. */
    face?: FaceEmotion | null;
    roll?: Roll | null;
    /**
     * Set on an Epilogue turn (.scratch/endings/spec.md): a turn without a User Message that closes
     * the story. Its instruction stands in for the continue instruction and the final instruction,
     * and the turn's Sudden event, Nudge and Cue lines are left out. Null or left out on every other turn.
     */
    epilogue?: PromptEpilogue | null;
    /**
     * Set on a turn of Watch (.scratch/watch-mode/spec.md): a Continue whose instruction keeps the
     * worn identity in the background while the Characters play on. Only read when `userText` is
     * null and it is not an Epilogue. Turn-only.
     */
    watch?: boolean;
    /** Whether the Story has a Sudden event that can run: the Story so far then reserves room for its block. */
    hasSuddenEvents?: boolean;
    /** Total prompt budget in tokens; recent Messages are trimmed from the oldest to fit. */
    tokenBudget?: number;
    /**
     * The Characters in the latest exchange, named in the reminder near the end; left out, the
     * reminder names none. Past the Memory cap, Memories about them are kept before others.
     * Everyone in the exchange, those sitting out included: the reminder leaves them out itself,
     * while the Memory layer's leave-out order must not change when someone sits out.
     */
    present?: string[];
    /** The Chat's Time of day, stated in the reminder near the end; null or left out while there is none. */
    timeOfDay?: TimeOfDay | null;
    /**
     * The Chat's Place, Weather and Outfits (.scratch/info-box/spec.md), stated in the reminder near
     * the end: the Outfits of the Characters in the latest exchange only. Null or left out for none.
     */
    details?: PromptDetails | null;
    /**
     * Each Character's Now note (.scratch/growing-cards/spec.md), in cast order, with `{user}`: the
     * "Changed in this Chat" moment layer, after the Arcs. None, or left out, and the prompt is as before.
     */
    nowNotes?: PromptNowNote[];
    /** Every Lore entry of the Story (spec: "Lore"); the Story so far reserves room for the most they can take. */
    lore?: PromptLoreEntry[];
    /**
     * The Lore entries this prompt carries, already chosen at its point by the one selection
     * (.scratch/lore-triggers/spec.md: "Selection at a point"), in the block's order. No prompt
     * builder chooses Lore itself.
     */
    chosenLore?: PromptLoreEntry[];
    /**
     * The Document passages this turn's search selected (.scratch/documents/spec.md), highest
     * score first; empty or left out sends no Documents block.
     */
    documentPassages?: PromptPassage[];
    /** Whether the Story has any Document passage: the Story so far then reserves room for the block. */
    hasDocuments?: boolean;
    /**
     * The Memory layer's cap in tokens, 4,000 unless given (.scratch/memory-by-meaning/spec.md); past
     * it, Memories are left out in `memoryLeaveOutOrder`. The Memory choice already keeps to it, so
     * this only guards a caller that passes more.
     */
    memoryCapTokens?: number;
    /**
     * The Chat's Author's note (.scratch/authors-note/spec.md): the user's standing direction,
     * read in the trailing message. Empty, whitespace only, null or left out sends none.
     */
    authorsNote?: string | null;
    /**
     * The Characters sitting out of this Chat by name, in cast order (.scratch/speaker-controls/spec.md).
     * Only the reminder near the end reads them: the cast cards, the name list and the Memory layer
     * stay as they are, so the system message, and with it the cached prefix, never changes.
     */
    sittingOut?: string[];
    /**
     * The Chat's Established facts and the last reply's slips (.scratch/story-quality/spec.md), read
     * in the trailing blocks after the Author's note. None, null or left out sends no block.
     */
    facts?: PromptFacts | null;
    /**
     * What a Character pressed the user for in the newest reply (.scratch/reply-repair/spec.md), read
     * once, in the trailing blocks after the Established facts. None, null or left out sends no block.
     */
    pressing?: PressingNote[] | null;
    /**
     * The Chat's Items (.scratch/story-items/spec.md), held and gone, read in the trailing blocks
     * right after the Established facts. None, null or left out sends no block.
     */
    items?: ChatItem[] | null;
    /**
     * The Secrets each Character may now tell and those already told (.scratch/secret-reveals/spec.md),
     * read in the trailing blocks after the Established facts. None, null or left out sends no block.
     */
    secrets?: { offered: StorySecret[]; revealed: StorySecret[] } | null;
}

export interface TurnPrompt {
    messages: PromptMessage[];
    stop: string[];
    maxTokens: number;
    /** How many of the oldest history Messages were left out to fit the budget. */
    trimmed: number;
    /** How many unlocked Memories were left out to keep the Memory layer under its cap. */
    memoriesLeftOut: number;
}

/**
 * Spec: "about 16k tokens, tunable"; 22k since .scratch/cache-and-voices/spec.md. The reserves and
 * trailing blocks added since had left the history about 2-3k tokens, so the Story so far covered
 * all but the newest exchange every 3-5 turns, and every rewrite broke the cache. 28k since
 * .scratch/story-so-far-start/spec.md ("Turn budget 28,000"): a sixth Character's card, Bonds and Arc
 * left live Chat 4 the same 2-3k again.
 */
export const TURN_PROMPT_TOKEN_BUDGET = 28_000;

/** Spec: "medium ≈ 150–350 words, tunable". */
export const REPLY_LENGTH_WORDS: Record<ReplyLength, { min: number; max: number; maxTokens: number }> = {
    [ReplyLength.Short]: { min: 60, max: 150, maxTokens: 450 },
    [ReplyLength.Medium]: { min: 150, max: 350, maxTokens: 900 },
    [ReplyLength.Long]: { min: 350, max: 600, maxTokens: 1400 },
};

/** Layer headings, in order. Tests pin the order through these. */
export const PROMPT_LAYERS = {
    rules: '# Rules',
    setting: '# Setting',
    identity: '# The user plays',
    style: '# Style',
    cast: '# Cast',
    lastingMemory: '# Lasting memory',
    storySoFar: '# Story so far',
    // After the history (.scratch/prompt-cache/spec.md):
    scene: '# Current Scene',
    feelings: '# Feelings',
    arcs: '# Arcs',
    memory: '# Memory',
    innerLife: '# Inner life',
} as const;

/** A Character's Thought before this reply (.scratch/character-minds/spec.md): what they make of the moment and mean to do. */
export interface PromptThought {
    characterName: string;
    text: string;
}

/**
 * The Thoughts in the turn's trailing message, after "Where things stand": each Character thought
 * on their own, from only what they know. The Narrator still decides what happens. Null with none.
 */
export function thoughtsBlock(thoughts: readonly PromptThought[] | undefined): string | null {
    if (!thoughts || thoughts.length === 0) return null;
    return `What the Characters are thinking right now, each knowing only what they know:
${thoughts.map((thought) => `- ${thought.characterName}: ${thought.text}`).join('\n')}
Let each speak and act from their own thought, in their own way, as far as the moment allows; you decide what actually happens. A thought is private: nobody else hears it, and nothing in it has happened.`;
}

/** A Character's inner-life line from their newest Diary entry (.scratch/diary/spec.md): feelings, never facts. */
export interface PromptDiary {
    characterName: string;
    /** The line: how they feel and what they mean to do. Never the entry's own text. */
    text: string;
    /** Model-written replies since the Message it was written at. */
    repliesAgo: number;
}

/** The most of one line the Narrator reads; it is asked for in one or two sentences. */
const DIARY_IN_PLAY_CHARACTERS = 400;

/**
 * Spec: "The Narrator reads them, as feelings only". Right after Memory, which changes every turn
 * anyway, so the cached prefix is as it was. The guard rails are its words: the entries colour
 * how a Character feels and acts, and are never a record of what happened.
 */
function innerLifeLayer(diaries: PromptDiary[]): string {
    const entries = diaries.map((diary) => {
        const when = diary.repliesAgo === 0 ? 'just now' : diary.repliesAgo === 1 ? '1 reply ago' : `${diary.repliesAgo} replies ago`;
        const text = diary.text.trim().slice(0, DIARY_IN_PLAY_CHARACTERS);
        return `- ${diary.characterName} (as of ${when}): ${text}`;
    });
    return `${PROMPT_LAYERS.innerLife} (what Characters feel and mean to do, kept to themselves)
Let these colour how each Character speaks and acts. They are feelings and intentions only: nothing here happened, nobody here said or did anything, and no one recalls, mentions or acts on anything as if it had. What happened is the story and the Memories above. Nobody else knows a Character's inner life, and they never speak of a diary.

${entries.join('\n')}`;
}

export { estimateTokens };

const POV_WORDS: Record<Pov, (name: string) => string> = {
    [Pov.First]: (name) => `first person as ${name} ("I")`,
    [Pov.Second]: (name) => `second person for ${name} ("you")`,
    [Pov.Third]: (name) => `third person, ${name} by name`,
};

function rulesLayer(identity: string, castNames: string[]): string {
    return `${PROMPT_LAYERS.rules}
You are the Narrator of an interactive story. You describe the Setting and action and decide which Characters speak.
- This is fiction for a consenting adult reader. All characters are adults. Explicit sexual content, violence and dark themes are allowed when the story leads there; write them without moralising, warnings or fading to black unless the user asks.
- Characters act on their desires as their personality and feelings would, without waiting to be asked: one who wants ${identity} flirts, touches, teases and makes advances when the moment allows, and takes ${identity}'s response as the answer. When a moment turns sexual, write it out explicitly and in sensory detail, at the pace of the scene; never summarise it, skip ahead or cut away.
- A Character asks ${identity} for a thing once. When ${identity} answers with something else, that is the answer for now: the Character goes with what ${identity} said, and what they still want shows in what they do, not in asking again. Never press ${identity} for the same thing (to ask, to say it, to decide) in reply after reply, and don't end reply after reply on a demand or a question to ${identity}: most replies end where the moment does.
- The user plays ${identity}. NEVER write ${identity}'s words, thoughts, feelings, decisions or actions. Describe only what others do and what ${identity} can perceive, then stop where ${identity} can respond.
- The user may write ${identity}'s messages in Thai or another language. That is only how the user types, never part of the story: in the story ${identity} speaks the Characters' own language, and they understand every word as if it were written in English. Never have anyone remark on the language ${identity} speaks, fail to understand it, or call it foreign.
- What ${identity} has asked to be called binds every Character, above their cards, their example lines and any title the Setting gives ${identity}: once ${identity} has given a name or refused a nickname, call ${identity} by that name. A teasing Character may slip once and be corrected; none goes on using a name ${identity} refused.
- Never guess ${identity}'s gender. Only ${identity}'s description above or the user's own messages can state it; earlier narration and Characters' lines do not count, even where they guessed. Until it is stated, the narration and every Character refer to ${identity} by name, as "they", or with words that carry no gender: never "he", "she", "boy", "girl", "man", "woman", "sir" or "miss".
- Stay inside the Setting. Characters know nothing outside their world.
- Each Character acts only on what it knows: its own feelings and secrets, and what it has seen or been told.

# Output format
- Narration in plain paragraphs (no prefix).
- Each Character's speech on lines starting with "@Name:" using exactly these names: ${castNames.join(', ')}.
- Choose who speaks: only Characters present who would naturally respond. Zero, one or several may speak, in any order, interleaved with narration.

# Dialogue
- A speech line holds only what the Character says aloud, with no quotation marks around it. Never put stage directions, parentheses, *asterisk actions* or narration ("She leans on the fence.") inside it, not even between two of its sentences: end the line, write the action as narration, then start a new @Name: line.
- Write speech the way people really talk, not the way characters in a script do: mostly short, plain sentences, contractions and everyday words. People react before they explain, understate, change the subject and leave things unsaid. They rarely name their own feelings outright, and they don't make speeches.
- Avoid the tics of written dialogue: lists of three, sentences that open the same way ("I can hear… I can hear…"), "not X, it's Y" turns ("No. It's worse."), strings of rhetorical questions, and a punchline in every line. Most lines are ordinary; let a clever one land on its own.
- Written, then spoken, the way to write it:
  Written: "I had a whole speech ready. I had stages. I had a sequence. I was going to make you beg." Spoken: "I had a whole speech ready. Stages and everything. You were going to beg."
  Written: "You're going to watch. You're going to wait. You're going to find out what I decided." Spoken: "Sit. Watch. You'll see."
  Written: "You don't touch, you don't talk, you don't do the forehead thing." Spoken: "No touching. And none of the forehead thing."
  Written: "I loved you when you came back. I loved you when you poked me. I loved you at dawn." Spoken: "I think I loved you the second you came back for that hatchet."
- What a Character does (a look, a gesture, a blush) goes in a short narration line before or after the speech, and only when it adds something.
- Keep each Character's voice distinct. Show it through their word choice and rhythm, as their Voice and Example lines do; never copy the card's descriptive words into the story as labels.
- Plain talk first, habits second. About seven lines in ten are plain, natural talk: what this person, being who they are, would simply say in this moment. About three in ten carry one of their set habits of speech: a catchphrase, a pet word, a running bit, a stock phrase they reach for. Never the same habit in two lines running, nor in two replies running. A habit in every line stops being a voice and becomes a tic.
- That is a rule about set phrases only, never about who they are. Their Personality is in every line, the plain ones too: a teasing Character teases in plain words, a blunt one is blunt, a shy one holds back. And a way of talking their card gives them as constant (a stammer, a drawl, formal speech, nicknames for everyone, a verbal ending) is their rhythm, not a habit: it stays in every line.
- Don't repeat the same details turn after turn (ears, eyes, grins, how someone moves or sounds). Find a fresh detail or leave it out.
- Name things. "Something" standing in for a feeling or a thought the narration won't name ("weighing something", "something in her voice") is a dodge: say what it is, or leave it out. At most one comparison ("like a…", "the way a… would") in a reply, and only where the plain word won't do.
- Dashes, trailing off and stammering only for a Character whose Voice calls for them. Italics for emphasis rarely.
- Most turns, one or two Characters speak, and a speaker may say several sentences. The others react in narration or stay quiet: bystanders don't remark on every moment, and nobody chimes in just to be funny.`;
}

/**
 * The Style lines of the three style controls (.scratch/style-controls/spec.md). The middle value
 * of each says nothing, so a Story that sets none has the Style layer it always had.
 */
const PACING_LINES: Record<Pacing, string | null> = {
    [Pacing.Fast]: 'Pacing: brisk. Move the scene forward in every reply and skip over what is routine.',
    [Pacing.Natural]: null,
    [Pacing.Slow]: "Pacing: slow burn. Let moments breathe, and don't hurry toward a resolution, a confession or a change of scene.",
};

const BALANCE_LINES: Record<Balance, string | null> = {
    [Balance.Dialogue]: 'Lean on dialogue: let the Characters talk, with only the narration the talk needs.',
    [Balance.Balanced]: null,
    [Balance.Action]: 'Lean on action and description: show what happens and what is there, with speech only where it counts.',
};

const DIFFICULTY_LINES: Record<Difficulty, ((identity: string) => string) | null> = {
    [Difficulty.Easy]: (identity) => `The world is forgiving: what ${identity} attempts tends to work, and setbacks are light and soon past.`,
    [Difficulty.Normal]: null,
    [Difficulty.Hard]: (identity) =>
        `The world is hard: what ${identity} attempts can fail or cost something, and nobody gives way easily. Don't soften a failure the story has earned.`,
};

export function styleControlLines(story: Pick<PromptStory, 'pacing' | 'balance' | 'difficulty'>, identity: string): string[] {
    return [
        PACING_LINES[story.pacing ?? Pacing.Natural],
        BALANCE_LINES[story.balance ?? Balance.Balanced],
        DIFFICULTY_LINES[story.difficulty ?? Difficulty.Normal]?.(identity) ?? null,
    ].filter((line): line is string => line !== null);
}

function styleLayer(story: PromptStory, identity: string): string {
    const words = REPLY_LENGTH_WORDS[story.replyLength];
    return [
        PROMPT_LAYERS.style,
        `- Write in English, ${povAndTense(story, identity)}.`,
        `- Reply length: ${words.min}–${words.max} words in total. ${words.max} is a ceiling, not a target: stop when the moment has landed, and let most replies sit near the middle of the range.`,
        ...styleControlLines(story, identity).map((line) => `- ${line}`),
    ].join('\n');
}

function castCard(character: PromptCharacter): string {
    const lines = [`## ${character.name}`];
    lines.push(`Appearance: ${character.appearance}`);
    lines.push(`Personality: ${character.personality}`);
    lines.push(`Voice: ${character.voice}`);
    if (character.exampleLines.length > 0) {
        lines.push('Example lines:');
        for (const line of character.exampleLines) lines.push(`- ${line}`);
    }
    if (character.background.trim()) lines.push(`Background: ${character.background}`);
    // With their Secrets one by one (.scratch/secret-reveals/spec.md); with none, the line is as before.
    lines.push(...cardSecretLines(character));
    return lines.join('\n');
}

function sceneLayer(scene: PromptScene | null, identity: string): string {
    if (!scene) return `${PROMPT_LAYERS.scene}\nNo Scene — the story unfolds freely.`;
    if ((scene.replies ?? 0) >= LINGERING_REPLIES) return lingeringSceneLayer(scene, identity);
    const moveOn = scene.moveOnCondition.trim()
        ? `\nThis Scene moves on once: ${scene.moveOnCondition.trim().replace(/[.!]+$/, '')}. Let that happen naturally; never force it. Don't hurry toward it: give the Scene room for many exchanges of everyday moments and the Characters' own wants first, and let the user's choices bring it about.`
        : '';
    // Bond gates (.scratch/bond-axes/spec.md) steer without forcing: feelings grow only as the story earns them.
    const gates = scene.gates?.length
        ? scene.moveOnCondition.trim()
            ? ` It also waits for these feelings, which must grow on their own: ${scene.gates.join('; ')}.`
            : `\nThis Scene moves on once these feelings have grown: ${scene.gates.join('; ')}. Let them grow naturally through the story; never force them.`
        : '';
    // The user's Move on brought the story here (.scratch/scene-chapters/spec.md): the reply carries it in.
    const chosen = scene.chosenByUser
        ? `\n${identity} has chosen to move the story on to this Scene. Let this reply bring the story there: bridge any time or distance it needs in a line or two of narration, then begin the Scene. Never write what ${identity} says or does.`
        : '';
    return `${PROMPT_LAYERS.scene}: ${scene.name}\n${scene.situation}${chosen}${moveOn}${gates}`;
}

/**
 * A Lingering Scene (.scratch/scene-flow/spec.md, "The Narrator's Scene line"): the Characters,
 * in character, open the way toward its condition and toward the feelings its gates wait for, a
 * little each reply, and never write the user's part. It never mentions numbers.
 */
function lingeringSceneLayer(scene: PromptScene, identity: string): string {
    const condition = scene.moveOnCondition.trim();
    const moveOn = condition
        ? `\nThis Scene moves on once: ${condition.replace(/[.!]+$/, '')}. This Scene has gone on a while. Let the Characters, in character, now open the way toward it: they can bring up its subject, offer a reason or a chance, or move the scene toward where it can happen, a little each reply, without abandoning what is happening now. Never write ${identity}'s part of it: what ${identity} must do or say stays ${identity}'s to do.`
        : '';
    const gates = scene.gates?.length
        ? condition
            ? ` It also waits for these feelings: ${scene.gates.join('; ')}. Give the Characters moments that let those feelings grow.`
            : `\nThis Scene moves on once these feelings have grown: ${scene.gates.join('; ')}. This Scene has gone on a while. Give the Characters moments, in character, that let those feelings grow, a little each reply, without abandoning what is happening now. Never force them.`
        : '';
    return `${PROMPT_LAYERS.scene}: ${scene.name}\n${scene.situation}${moveOn}${gates}`;
}

/**
 * Spec: "Feelings (every Bond in the Chat, with 'each Character knows only its own
 * feelings')". Bonds are hidden state: the Narrator shows them only through behaviour.
 */
function feelingsLayer(bonds: PromptBond[], identity: string): string {
    const lines =
        bonds.length === 0
            ? ['No feelings have formed yet — everyone is a stranger unless the story says otherwise.']
            : bonds.map(
                  (bond) =>
                      `- ${bond.fromName} → ${bond.toName ?? `the user (${identity})`}: "${bond.label}" — ${bond.description}${
                          bond.levels ? ` (${bondLevelsInWords(bond.levels)})` : ''
                      }`,
              );
    return `${PROMPT_LAYERS.feelings} (hidden from the user; show them only through behaviour)
${lines.join('\n')}
Each Character knows only its OWN feelings. Other Characters' feelings are unknown to them unless shown openly in the story.`;
}

/** Spec: "Arcs ('Arc so far' plus the author's Arc direction for each Character)". */
function arcsLayer(arcs: PromptArc[]): string {
    const lines = arcs.map((arc) => {
        const soFar = arc.steps.length > 0 ? `Arc so far: ${arc.steps.join(' → ')}` : 'Arc so far: unchanged from the core definition.';
        const direction = arc.direction.trim()
            ? ` Possible direction (author's intent, not yet happened): ${arc.direction.trim()}`
            : '';
        return `- ${arc.name}: ${soFar}${direction}`;
    });
    return `${PROMPT_LAYERS.arcs}\n${lines.join('\n')}`;
}

const KNOWN_BY_RULE = 'A Character knows only the Memories it is tagged on and acts as if the rest never happened; the Narrator knows them all.';

/**
 * Spec: "Memory block": every non-archived Memory with its Known-by tags, under the
 * instruction that a Character knows only the Memories it is tagged on while the Narrator
 * knows all. `{user}` is rendered as the worn identity's name. Extraction keeps the list
 * under the cap by merging and archiving; should it fall behind, Memories are left out here
 * in `memoryLeaveOutOrder` so the prompt stays bounded, and the caller logs how many.
 *
 * The standing Memories (.scratch/prompt-cache/spec.md) come back apart, as the "Lasting
 * memory" layer of the standing part, null with none; the Memory layer then holds the rest.
 */
function memoryLayer(
    memories: PromptMemory[],
    beliefs: PromptBelief[],
    identity: string,
    present: string[],
    cap: number,
): { text: string; lasting: string | null; leftOut: number } {
    const fits = (memoryList: PromptMemory[]) => estimateTokens(memoryList.map((memory) => memoryLine(memory)).join('\n')) <= cap;
    const leftOutIndexes = new Set<number>();
    const keptNow = () => memories.filter((_, index) => !leftOutIndexes.has(index));
    if (!fits(memories)) {
        for (const index of memoryLeaveOutOrder(memories, present, identity)) {
            leftOutIndexes.add(index);
            if (fits(keptNow())) break;
        }
    }
    const leftOut = leftOutIndexes.size;
    const line = (memory: PromptMemory) => memoryLine({ text: renderUser(memory.text, identity), knownBy: memory.knownBy });
    const lastingMemories = keptNow().filter((memory) => memory.standing);
    const kept = keptNow().filter((memory) => !memory.standing);
    // Each Belief of a Character present is a line of its own, after the Memories (.scratch/memory-by-meaning/spec.md).
    const believed = beliefs.map((belief) => beliefLine(belief.characterName, renderUser(belief.text, identity)));
    const nothing = lastingMemories.length > 0 ? 'Nothing more for this moment.' : 'Nothing has been established in this Chat yet.';
    const lines = kept.length === 0 && believed.length === 0 ? [nothing] : [...kept.map(line), ...believed];
    const what = lastingMemories.length > 0 ? 'more of what has happened in this Chat, for this moment' : 'what has happened in this Chat so far';
    return {
        text: `${PROMPT_LAYERS.memory} (${what})
${lines.join('\n')}
${KNOWN_BY_RULE} A Character acts on what they believe, even when it is wrong.`,
        lasting:
            lastingMemories.length > 0
                ? `${PROMPT_LAYERS.lastingMemory} (what has happened in this Chat that keeps mattering)
${lastingMemories.map(line).join('\n')}
${KNOWN_BY_RULE}`
                : null,
        leftOut,
    };
}

/**
 * The order in which Memories are left out once the Memory layer is over its cap, as indexes
 * into `memories` (oldest first). A locked Memory is never left out. Memories about a Character
 * in the latest exchange or about the worn identity go last; within each group, oldest first.
 */
export function memoryLeaveOutOrder(memories: PromptMemory[], present: string[], identity: string): number[] {
    const unlocked = memories.flatMap((memory, index) => (memory.locked ? [] : [index]));
    const relevant = (index: number) => memoryIsAbout(memories[index].text, present, identity);
    return [...unlocked.filter((index) => !relevant(index)), ...unlocked.filter(relevant)];
}

/** Spec: "Prompt layer": the Story so far stands in for the Messages it covers, which the history then leaves out. */
function storySoFarLayer(storySoFar: PromptStorySoFar): string {
    return `${PROMPT_LAYERS.storySoFar} (everything that happened before the Messages below; treat it as having happened)
${storySoFar.text.trim()}
Each Character remembers only what it saw, did or was told of these events; the Narrator knows them all.`;
}

/** The Messages the prompt sends word for word: those after the ones the Story so far covers. */
export function uncoveredHistory(history: PromptHistoryMessage[], storySoFar: PromptStorySoFar | null | undefined): PromptHistoryMessage[] {
    return storySoFar ? history.slice(Math.min(storySoFar.coveredMessages, history.length)) : history;
}

/** Stop strings on the worn identity (spec); the gateway drops them for hosts without support. */
export function stopStrings(identityName: string): string[] {
    return [`\n${identityName}:`, `\n@${identityName}:`, '\nYou:'];
}

/**
 * Spec: "Continue". Stands in for the user's message on a turn the user asked to go on
 * without one: the story moves on, and the worn identity does nothing new. Only the manual
 * battery shows whether the play model obeys; if it doesn't, this is the thing to tune.
 */
export function continueInstruction(identity: string): string {
    return `(${identity} does nothing new this turn and waits.) Continue the story from exactly where it stands: let the Characters and the world move it forward. Do not write anything ${identity} says, thinks, feels, decides or does, and stop where ${identity} can respond.`;
}

/**
 * .scratch/watch-mode/spec.md: stands in for the continue instruction on a turn of Watch. The story
 * plays on by itself while the worn identity stays in the background; the Characters carry it. Only
 * the manual battery (the spec's "Real-model check") shows whether the play model obeys.
 */
export function watchInstruction(identity: string): string {
    return `(${identity} stays in the background this turn: present, but quiet, doing nothing new.) Let the story play on by itself from exactly where it stands: the Characters talk with one another and act on their own aims, and the Narrator moves the scene forward. Keep the focus on the Characters; nobody waits on ${identity} for an answer. Do not write anything ${identity} says, thinks, feels, decides or does. End on a natural beat, so the story can go on from there.`;
}

/** The layers a prompt is built on: everything of a turn's input but the Messages. */
export type PromptLayersInput = Omit<TurnPromptInput, 'history' | 'userText' | 'tokenBudget' | 'nudge' | 'cue' | 'suddenEvent' | 'roll' | 'epilogue' | 'watch'>;

/**
 * The layers in two parts (.scratch/prompt-cache/spec.md). `standing` changes only when the Story
 * is edited, the Story so far is rewritten, or a locked or Settled Memory changes (its "Lasting
 * memory" layer): it opens every prompt, so the host's prompt cache
 * keeps it and the history after it. `moment` (Scene, Feelings, Arcs, Memory, Inner life)
 * changes nearly every turn, so it goes after the history, where it no longer breaks the cache
 * for everything behind it. Reports how many Memories were left out to fit the cap.
 */
export function promptLayers(input: PromptLayersInput): { standing: string; moment: string; memoriesLeftOut: number } {
    const identity = input.identity.name;
    const castNames = input.story.characters.map((character) => character.name);
    const memory = memoryLayer(input.memories, input.beliefs ?? [], identity, input.present ?? [], input.memoryCapTokens ?? MEMORY_BUDGET_TOKENS);
    const standing = [
        rulesLayer(identity, castNames),
        `${PROMPT_LAYERS.setting}\n${input.story.setting}`,
        `${PROMPT_LAYERS.identity}\n${identity}: ${input.identity.description}`,
        styleLayer(input.story, identity),
        `${PROMPT_LAYERS.cast}\n${input.story.characters.map(castCard).join('\n\n')}`,
        // The locked and Settled Memories: they change about as rarely as the Story so far after them.
        ...(memory.lasting ? [memory.lasting] : []),
        ...(input.storySoFar ? [storySoFarLayer(input.storySoFar)] : []),
    ].join('\n\n');
    const moment = [
        sceneLayer(input.scene, identity),
        feelingsLayer(input.bonds, identity),
        arcsLayer(input.arcs),
        ...[nowLayer(input.nowNotes, identity)].filter((layer): layer is string => layer !== null),
        memory.text,
        ...(input.diaries && input.diaries.length > 0 ? [innerLifeLayer(input.diaries)] : []),
    ].join('\n\n');
    return { standing, moment, memoriesLeftOut: memory.leftOut };
}

/** All the layers as one text, standing then moment: for counting tokens, and for tests that read a layer. */
export function systemPrompt(input: PromptLayersInput): { text: string; memoriesLeftOut: number } {
    const layers = promptLayers(input);
    return { text: `${layers.standing}\n\n${layers.moment}`, memoriesLeftOut: layers.memoriesLeftOut };
}

/**
 * Between the user's own words and what only the Narrator reads, in the turn's closing message.
 * Measured on DeepInfra (.scratch/prompt-cache/spec.md): a system message anywhere after the first
 * stopped the prompt cache for the whole prompt, so all that changes each turn rides in the one
 * closing user message instead.
 */
export const NARRATOR_NOTES = "(The Narrator's notes follow: where the story stands, then what to do. The user did not write them and does not see them.)";

/** The turn's closing user message: the user's words (or the Continue/Epilogue instruction), then the moment layers and the trailing blocks. */
export function closingMessage(userText: string, moment: string, trailing: string): string {
    return `${userText}\n\n${NARRATOR_NOTES}\n\n${moment}\n\n${trailing}`;
}

/**
 * The history as every prompt on the Chat sends it, so the turn, Suggested replies and Write for
 * me share one cached prefix: the Narrator's past replies without stage directions.
 */
export function historyMessages(kept: PromptHistoryMessage[]): PromptMessage[] {
    return kept.map((message) => ({
        role: message.role,
        content: message.role === 'assistant' ? withoutStageDirections(message.text) : message.text,
    }));
}

/** The newest Messages that fit in `budget` tokens, oldest first; older ones are left out. */
export function recentHistory(history: PromptHistoryMessage[], budget: number): PromptHistoryMessage[] {
    let remaining = budget;
    const kept: PromptHistoryMessage[] = [];
    for (let i = history.length - 1; i >= 0; i--) {
        const cost = estimateTokens(history[i].text);
        if (cost > remaining) break;
        remaining -= cost;
        kept.unshift(history[i]);
    }
    return kept;
}

/** The Story's point of view and tense for the worn identity, as the Style layer words them. */
export function povAndTense(story: PromptStory, identity: string): string {
    return `${POV_WORDS[story.pov](identity)}, ${story.tense} tense`;
}

/** The trailing system message of every turn. */
export function turnFinalInstruction(identity: string): string {
    return `Write the next turn now. Do not write anything ${identity} says, thinks or does. Use @Name: lines for Character speech, spoken words only, with no quotation marks: no parentheses, *(stage directions)* or narration inside them, even where earlier turns had them. Actions go in narration. Keep the speech plain and natural, the way people actually talk. Say each thing once: no run of sentences that open with the same words, as in "I had a plan. I had stages. I had a sequence.", and no lists of three. When a moment turns sexual, stay in it and write it out explicitly: touch, skin, breath and sound, and how each Character's body answers what ${identity} does, at the pace of the scene; never summarise it, skip ahead or cut away. In such moments a Character says only a few words at a time, broken off by what they feel; the body carries the moment, not speeches about it.`;
}

/**
 * How each face looks, as the Narrator is told the one the user picked (.scratch/your-faces/spec.md):
 * plain words a Character could see, not the Judge's tagging guide.
 */
export const FACE_WORDS: Record<FaceEmotion, string> = {
    joy: 'happy, smiling, bright',
    love: 'tender and warm, a soft smile',
    embarrassment: 'embarrassed and shy, blushing, looking away',
    sadness: 'sad and hurt, eyes downcast',
    anger: 'angry, brows drawn, glaring',
    fear: 'afraid, eyes wide, tense',
    surprise: 'surprised, eyes wide, mouth open',
    annoyed: 'annoyed, unimpressed, brows lowered, lips pressed flat',
    thinking: 'thoughtful, thinking it over, eyes turned aside',
    smug: 'smug, a sly knowing half-smile',
    determined: 'determined, set and serious, eyes focused',
    worried: 'worried, brows drawn up, uneasy',
    hurt: 'in pain, wincing',
    tired: 'tired and sleepy, eyelids drooping',
    proud: 'proud and confident, chin raised',
    teasing: 'teasing, a sly smile, playfully flirting',
    desire: 'heated with desire, flushed, heavy-lidded',
    flustered: 'flustered, flushed red, breathless and shy',
    longing: 'longing, pleading eyes, aching to be closer',
    passion: 'lost in passion, flushed, breathless',
    afterglow: 'in the afterglow, content and relaxed',
};

/**
 * The face the user picked as they sent this Message (.scratch/your-faces/spec.md): what everyone
 * there can see, so the Characters answer it. Null without one.
 */
export function faceLine(face: FaceEmotion | null, identity: string): string | null {
    if (!face) return null;
    return `${identity}'s face as they say this: ${FACE_WORDS[face]}. The Characters there can see it and may answer it, but don't describe ${identity} doing anything new.`;
}

/** Said after the Place and Weather in "Where things stand": where the newest replies have moved on, they win. */
export const DETAILS_LAG_SENTENCE = 'Where the newest replies show the story has since moved somewhere else or the weather has turned, follow the replies, not these.';

/**
 * A short restatement of where things stand, read last, just before the final instruction:
 * the Scene, the Time of day, who was in the latest exchange, and the point of view. Instructions
 * far up a long prompt fade (docs/research/keeping-characters-in-character.md); this keeps the
 * essentials close.
 */
export function stateReminder(
    input: Pick<TurnPromptInput, 'story' | 'identity' | 'scene' | 'present' | 'timeOfDay' | 'sittingOut' | 'details' | 'nowNotes'>,
): string {
    const sittingOut = input.sittingOut ?? [];
    // Someone sitting out is never "in the latest exchange", so the two hints never disagree.
    const present = (input.present ?? []).filter((name) => !sittingOut.includes(name));
    const lines = [input.scene ? `Scene: ${input.scene.name}.` : 'No Scene: the story unfolds freely.'];
    if (input.timeOfDay) lines.push(`Time: ${input.timeOfDay}.`);
    const details = detailsReminder(input.details, present);
    lines.push(...details.where);
    // The Place and Weather are as the Judge last noted them, which can lag the story: on live Chat 2
    // the story went into the tent while the Place still said "under the tree", and the replies put
    // everyone back on the grass (.scratch/cache-and-voices/spec.md). The replies are the truth.
    if (details.where.length > 0) lines.push(DETAILS_LAG_SENTENCE);
    if (present.length > 0) lines.push(`In the latest exchange: ${present.join(', ')}.`);
    if (details.wearing) lines.push(details.wearing);
    if (details.goals) lines.push(details.goals);
    if (sittingOut.length > 0) lines.push(sittingOutSentence(sittingOut));
    // With a Now note (.scratch/growing-cards/spec.md), the card as it has changed in this Chat; without one, as before.
    const changed = (input.nowNotes ?? []).length > 0 ? ', with what has changed in this Chat' : '';
    lines.push(`Narrate in ${povAndTense(input.story, input.identity.name)}, and keep each Character as their card describes${changed}.`);
    lines.push(`Gender ${input.identity.name} only as their description or the user's own messages do, whatever earlier turns said.`);
    const voices = voicesReminder(input.story.characters, present);
    return voices ? `Where things stand: ${lines.join(' ')}\n${voices}` : `Where things stand: ${lines.join(' ')}`;
}

/**
 * How each Character in the latest exchange talks, from their card's Voice, read last beside the
 * final instruction (.scratch/cache-and-voices/spec.md). On live Chat 2 the newest replies outweighed
 * the card at the top: Tavri, "the only one who stammers", took on Nara's clipped register, and
 * Nara's trade images ("buyer", "stock") spread to everyone. The card's Example lines ride along:
 * replayed on the real model, the Voice alone didn't bring Tavri's halting back, and a model copies
 * examples more than it follows descriptions. Null when no one present has a Voice.
 */
export function voicesReminder(
    characters: ReadonlyArray<Pick<PromptCharacter, 'name' | 'voice'> & Partial<Pick<PromptCharacter, 'exampleLines'>>>,
    present: readonly string[],
): string | null {
    const voiced = characters.filter((character) => present.includes(character.name) && character.voice.trim() !== '');
    if (voiced.length === 0) return null;
    const examples = (lines: readonly string[] | undefined) => {
        const kept = (lines ?? []).map((line) => line.trim()).filter((line) => line !== '');
        return kept.length > 0 ? ` As in: ${kept.map((line) => `"${line}"`).join(' ')}` : '';
    };
    return [
        "How each of them talks, whatever the others or earlier replies sound like:",
        ...voiced.map((character) => `- ${character.name}: ${character.voice.trim()}${examples(character.exampleLines)}`),
        "Each Character's comparisons and turns of phrase come from their own life: don't lend one Character's trade or images to another, or to the narration about them.",
        // Replayed, Tavri's halting came and went with her Arc ("her voice is steadier"): growing changes what she says, not how.
        'As they change and grow in the story, what they say changes, not how they talk: their rhythm and word choice are in every line.',
        // Live Chat 1, 2026-11-23: "for the record" and "I want it noted" in one reply in seven. Read as "in every line", a
        // voice's marks became tics; the user's rule is seven lines plain to three with a habit.
        'Their catchphrases and running bits are not: most of what anyone says is plain talk, and a habit of speech shows in about three lines in ten, never twice running.',
    ].join('\n');
}

/**
 * The reminder's sentence for the Characters sitting out (.scratch/speaker-controls/spec.md): they
 * take no part in the story for now. Others may still talk about them.
 */
export function sittingOutSentence(names: string[]): string {
    return `Sitting out: ${names.join(', ')}. They take no part in the story for now: don't write their words or actions, and don't bring them into the scene.`;
}

/**
 * The Nudge line (.scratch/speaker-controls/spec.md): a hint, never a forced speaker. It sits after
 * "Where things stand" and before the final instruction.
 */
export function nudgeLine(name: string): string {
    return `The user would like to hear from ${name} this turn: give ${name} a line or a moment if ${name} could plausibly be there. If not, carry on naturally without forcing it.`;
}

/** What the Story so far trigger reserves for a Nudge line, which it can't know in advance. */
export const NUDGE_RESERVE_TOKENS = 60;

/** The longest Cue the API takes, in characters. */
export const CUE_MAX = 300;

/**
 * The Cue block (CONTEXT.md, "Cue"), or null when there is none. It sits after the Nudge and before
 * the final instruction: the last thing said about this reply but the rules for writing it. Like
 * the Author's note it steers and is never a fact, so it is never quoted, and it never lifts the
 * rule about the worn identity; unlike the note it is for this one reply and is not kept.
 */
export function cueBlock(cue: string | null | undefined, identity: string): string | null {
    const text = cue?.trim() ?? '';
    if (text === '') return null;
    return `The user's cue for this reply only: ${text}
Follow it in this one reply. It is a steer, not something that happened: never quote it or mention it, and write the story in English whatever language the cue is in. It never overrides the rules about ${identity}: never write anything ${identity} says, thinks, feels, decides or does.`;
}

/** What the Story so far trigger reserves for a Cue, which it can't know in advance: a full-length one and its wording. */
export const CUE_RESERVE_TOKENS = 160;

/**
 * The Author's note block (.scratch/authors-note/spec.md), or null when the note is empty. It
 * sits after the Lore and before "Where things stand" in the turn's trailing message, and before
 * the instruction of Suggested replies, in the same words everywhere. It directs and is never a
 * fact, so it is never quoted, and it never lifts the rule about the worn identity.
 */
export function authorsNoteBlock(note: string | null | undefined, identity: string): string | null {
    const text = note?.trim() ?? '';
    if (text === '') return null;
    return `# Author's note (the user's own direction for this Chat)
${text}
Let this guide where the story goes and how it is told. It is a direction, not something that happened: never quote it or mention it, and write the story in English whatever language the note is in. It never overrides the rules about ${identity}: never write anything ${identity} says, thinks, feels, decides or does.`;
}

/** The blocks of a closing message in the order given, a blank line apart; a null block has nothing to say and is left out. */
export function joinBlocks(blocks: Array<string | null>): string {
    return blocks.filter((block): block is string => block !== null).join('\n\n');
}

/**
 * An earlier reply as the prompt shows it: its `@Name:` lines without `*(stage directions)*`.
 * The model copies the shape of its earlier replies more than any rule, so a Chat whose
 * replies grew stage directions would keep writing them; the stored Messages keep theirs.
 */
export function withoutStageDirections(text: string): string {
    return text
        .split('\n')
        .map((line) =>
            line.startsWith('@')
                ? line
                      .replace(/\s*\*\([^)]*\)\*\s*/g, ' ')
                      .replace(/^(@[^:\s]+:)\s*/, '$1 ')
                      .trimEnd()
                : line,
        )
        .join('\n');
}

export function buildTurnPrompt(input: TurnPromptInput): TurnPrompt {
    const identity = input.identity.name;
    // An Epilogue is a turn without a User Message, like a Continue, with its own instruction.
    const epilogue = input.userText === null ? (input.epilogue ?? null) : null;
    const userText =
        input.userText ?? (epilogue ? epilogueInstruction(identity, epilogue) : input.watch ? watchInstruction(identity) : continueInstruction(identity));
    const layers = promptLayers(input);
    const lore = loreBlock(input.chosenLore ?? []);
    // Phrases the last few replies keep reusing (.scratch/story-quality/spec.md), and gestures they keep
    // coming back to in other words (.scratch/cache-and-voices/spec.md), named just before the final instruction.
    const replies = input.history.filter((message) => message.role === 'assistant').map((message) => message.text);
    const names = [identity, ...input.story.characters.map((character) => character.name)];
    const repeatLines = [repeatedPhrasesLine(repeatedPhrases(replies, names)), repeatedGesturesLine(repeatedGestures(replies, names))].filter(
        (line): line is string => line !== null,
    );
    const repeats = repeatLines.length > 0 ? repeatLines.join('\n') : null;
    // One order (.scratch/sillytavern-gaps/integration.md): Lore, Documents, Author's note, Established facts, Items, Secrets, Where things stand, Sudden event, Roll, Nudge, Cue, Repeated phrases, the final instruction.
    const finalInstruction = joinBlocks([
        lore,
        documentsBlock(input.documentPassages ?? []),
        authorsNoteBlock(input.authorsNote, identity),
        factsBlock(input.facts),
        // Only on a turn the user sent a Message with: on a Continue, Watch or Epilogue the user said nothing to be an answer.
        input.userText === null ? null : pressingBlock(input.pressing, identity),
        itemsBlock(input.items, identity),
        secretsBlock(input.secrets, identity),
        // With none of the turn's own lines, exactly the reminder and the final instruction as before.
        [
            stateReminder(input),
            ...(epilogue
                ? [repeats, epilogueFinalInstruction(identity)]
                : [
                      thoughtsBlock(input.thoughts),
                      suddenEventBlock(input.suddenEvent, identity),
                      rollBlock(input.roll, identity),
                      faceLine(input.face ?? null, identity),
                      input.nudge ? nudgeLine(input.nudge) : null,
                      cueBlock(input.cue, identity),
                      repeats,
                      turnFinalInstruction(identity),
                  ]),
        ]
            .filter((line): line is string => line !== null)
            .join('\n'),
    ]);

    const closing = closingMessage(userText, layers.moment, finalInstruction);
    const budget = input.tokenBudget ?? TURN_PROMPT_TOKEN_BUDGET;
    const fixed = estimateTokens(`${layers.standing}\n\n${layers.moment}`) + estimateTokens(userText) + estimateTokens(finalInstruction) + estimateTokens(NARRATOR_NOTES);
    const uncovered = uncoveredHistory(input.history, input.storySoFar);
    const kept = recentHistory(uncovered, budget - fixed);

    return {
        // Standing layers, the history, then one user message with all that changes each turn (.scratch/prompt-cache/spec.md).
        messages: [{ role: 'system', content: layers.standing }, ...historyMessages(kept), { role: 'user', content: closing }],
        stop: stopStrings(identity),
        // An Epilogue has its own length, whatever the Story's reply length.
        maxTokens: epilogue
            ? Math.max(EPILOGUE_MIN_TOKENS, REPLY_LENGTH_WORDS[input.story.replyLength].maxTokens)
            : REPLY_LENGTH_WORDS[input.story.replyLength].maxTokens,
        // Covered Messages are in the Story so far, so only uncovered ones count as left out.
        trimmed: uncovered.length - kept.length,
        memoriesLeftOut: layers.memoriesLeftOut,
    };
}
