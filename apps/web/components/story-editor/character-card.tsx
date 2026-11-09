'use client';

import { CharacterPortrait } from '@/components/portrait/character-portrait';
import { Portrait } from '@/lib/character-colour';
import { Character, characterRemovalWarning, Story } from '@/lib/story';
import { VoiceList } from '@/lib/voices';
import { useFieldMarks } from './field-marks';
import { ExportCardButton } from './export-card';
import { ChangedMark, ConfirmButton, OrderButtons, TextField, Toolbar } from './fields';
import { FoldingCard } from './folding-card';
import { ReferenceImage } from './reference-image';
import { VoiceField } from './voice-field';
import { fieldDomId, FieldRewrites, rewritableField, rewriteKey } from './rewrite';
import styles from './story-editor.module.css';

type TextKey = 'name' | 'appearance' | 'personality' | 'voice' | 'background' | 'secrets' | 'arcDirections';

interface CharacterCardProps {
    storyId: number;
    character: Character;
    /** The Story's Image style, which the Reference image follows (ticket 30). */
    imageStyle: string;
    index: number;
    count: number;
    /** Their Character colour and Portrait, for the picture in the card's header. */
    colour: string;
    portrait?: Portrait;
    rewrites: FieldRewrites;
    onText(field: TextKey, value: string): void;
    /** Read aloud: the voice list (null while it loads), and the Story's Narration voice as it reads. */
    voices: VoiceList | null;
    narrationVoice: string;
    onSpeakingVoice(voice: string | null): void;
    /** The cost hint goes under the first sample button on the page: the first Character's. */
    sampleHint?: string;
    onExampleLines(lines: string[]): void;
    onMove(direction: -1 | 1): void;
    onRemove(): void;
    /** For the Reference image: send pending edits, and run a whole-Story write after them. */
    flush(): Promise<void>;
    commit(run: () => Promise<Story>, onError: (message: string) => void): Promise<Story | undefined>;
}

/** One Character on the Characters tab, folding. Their starting Bonds are on the Bonds tab. */
export function CharacterCard(props: CharacterCardProps) {
    const { character, index, count, rewrites } = props;
    const heading = character.name.trim() === '' ? `Character ${index + 1}` : character.name;

    const linesId = fieldDomId({ target: 'character', id: character.id, field: 'exampleLines' });
    const linesFlashed = useFieldMarks(linesId).flashed;
    const linesChanged = rewrites.highlights.has(rewriteKey({ target: 'character', id: character.id, field: 'exampleLines' }));
    const ofCharacter = (field: TextKey) => rewritableField({ target: 'character', id: character.id, field }, rewrites);

    const setLine = (lineIndex: number, value: string) => {
        const lines = [...character.exampleLines];
        lines[lineIndex] = value;
        props.onExampleLines(lines);
    };
    const moveLine = (lineIndex: number, direction: -1 | 1) => {
        const lines = [...character.exampleLines];
        const [line] = lines.splice(lineIndex, 1);
        lines.splice(lineIndex + direction, 0, line);
        props.onExampleLines(lines);
    };

    return (
        <FoldingCard
            foldKey={`character:${character.id}`}
            label={`Character ${index + 1}`}
            fieldPrefixes={[`field-character.${character.id}.`]}
            bodyClassName={styles.characterBody}
            title={
                <>
                    <CharacterPortrait name={heading} colour={props.colour} portrait={props.portrait} className={styles.cardPortrait} />
                    {heading}
                </>
            }
            tools={
                <Toolbar>
                    <OrderButtons index={index} count={count} what={heading} onMove={props.onMove} />
                    <ConfirmButton
                        label="Remove"
                        danger
                        question={`Remove ${heading}?`}
                        warning={characterRemovalWarning(heading)}
                        confirmLabel="Remove"
                        onConfirm={props.onRemove}
                    />
                </Toolbar>
            }
        >
            <TextField
                label="Name"
                value={character.name}
                hint="What everyone calls them."
                onChange={(v) => props.onText('name', v)}
                {...ofCharacter('name')}
            />
            <TextField
                label="Appearance"
                value={character.appearance}
                multiline
                hint="How they look. Snapshots and the Reference image are drawn from this."
                onChange={(v) => props.onText('appearance', v)}
                {...ofCharacter('appearance')}
            />
            <ReferenceImage
                storyId={props.storyId}
                character={character}
                imageStyle={props.imageStyle}
                flush={props.flush}
                commit={props.commit}
            />
            <TextField
                label="Personality"
                value={character.personality}
                multiline
                hint="How they think and act. The AI plays them from this."
                onChange={(v) => props.onText('personality', v)}
                {...ofCharacter('personality')}
            />
            <TextField
                label="Voice"
                value={character.voice}
                multiline
                hint="How they talk: rhythm, words they use, what they never say."
                onChange={(v) => props.onText('voice', v)}
                {...ofCharacter('voice')}
            />
            <VoiceField
                label="Speaking voice"
                value={character.speakingVoice}
                noneLabel="Same as narration"
                voices={props.voices}
                sampleVoice={character.speakingVoice ?? props.narrationVoice}
                onChange={props.onSpeakingVoice}
                hint={props.sampleHint ?? 'How their lines sound when read aloud.'}
            />

            <fieldset id={linesId} className={linesFlashed ? `subsection ${styles.linesFlash}` : 'subsection'}>
                <legend>Example lines {linesChanged && <ChangedMark />}</legend>
                <p className="hint">Optional. A few lines in their voice, in order.</p>
                <ol className="line-list">
                    {character.exampleLines.map((line, lineIndex) => (
                        <li key={lineIndex}>
                            <input
                                type="text"
                                aria-label={`Example line ${lineIndex + 1}`}
                                value={line}
                                onChange={(event) => setLine(lineIndex, event.target.value)}
                            />
                            <Toolbar>
                                <OrderButtons
                                    index={lineIndex}
                                    count={character.exampleLines.length}
                                    what={`example line ${lineIndex + 1}`}
                                    onMove={(direction) => moveLine(lineIndex, direction)}
                                />
                                <button
                                    type="button"
                                    className="button button-quiet"
                                    aria-label={`Remove example line ${lineIndex + 1}`}
                                    onClick={() =>
                                        props.onExampleLines(character.exampleLines.filter((_, i) => i !== lineIndex))
                                    }
                                >
                                    ×
                                </button>
                            </Toolbar>
                        </li>
                    ))}
                </ol>
                <button
                    type="button"
                    className="button button-quiet"
                    onClick={() => props.onExampleLines([...character.exampleLines, ''])}
                >
                    Add example line
                </button>
            </fieldset>

            <TextField
                label="Background"
                value={character.background}
                multiline
                hint="Optional. Their past, as far as it matters here."
                onChange={(v) => props.onText('background', v)}
                {...ofCharacter('background')}
            />
            <TextField
                label="Secrets"
                value={character.secrets}
                multiline
                hint="Optional. What only this Character knows."
                onChange={(v) => props.onText('secrets', v)}
                {...ofCharacter('secrets')}
            />
            <TextField
                label="Arc directions"
                value={character.arcDirections}
                multiline
                hint='Optional. How they might change, e.g. "if trusted, her coldness thaws".'
                onChange={(v) => props.onText('arcDirections', v)}
                {...ofCharacter('arcDirections')}
            />
            <ExportCardButton storyId={props.storyId} character={character} colour={props.colour} />
        </FoldingCard>
    );
}
