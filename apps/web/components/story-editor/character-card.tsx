'use client';

import { Character, characterRemovalWarning, RewriteRequest, Story } from '@/lib/story';
import { fieldDomId } from './editor-tabs';
import { ConfirmButton, OrderButtons, TextField, Toolbar } from './fields';
import { ReferenceImage } from './reference-image';
import { rewriteKey, RewriteStates } from './rewrite';
import styles from './story-editor.module.css';

type TextKey = 'name' | 'appearance' | 'personality' | 'voice' | 'background' | 'secrets' | 'arcDirections';

interface CharacterCardProps {
    storyId: number;
    character: Character;
    /** The Story's Image style, which the Reference image follows (ticket 30). */
    imageStyle: string;
    index: number;
    count: number;
    rewrites: RewriteStates;
    onRewrite(request: RewriteRequest): void;
    onText(field: TextKey, value: string): void;
    onExampleLines(lines: string[]): void;
    onMove(direction: -1 | 1): void;
    onRemove(): void;
    /** For the Reference image: send pending edits, and run a whole-Story write after them. */
    flush(): Promise<void>;
    commit(run: () => Promise<Story>, onError: (message: string) => void): Promise<Story | undefined>;
    /** Fields the assistant changed, by their rewrite key (ticket 23). */
    highlights?: ReadonlySet<string>;
}

/** One Character on the Characters tab. Their starting Bonds are on the Bonds tab. */
export function CharacterCard(props: CharacterCardProps) {
    const { character, index, count, rewrites } = props;
    const heading = character.name.trim() === '' ? `Character ${index + 1}` : character.name;

    /** The props a text field of this Character needs to offer ✨ and to be jumped to. */
    const ofCharacter = (field: TextKey) => {
        const request: RewriteRequest = { target: 'character', id: character.id, field };
        return {
            domId: fieldDomId(request),
            rewrite: rewrites[rewriteKey(request)],
            onRewrite: () => props.onRewrite(request),
            highlighted: props.highlights?.has(rewriteKey(request)),
        };
    };

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
        <section className={styles.card} aria-label={`Character ${index + 1}`}>
            <div className={styles.cardHeader}>
                <h3 className={styles.cardTitle}>{heading}</h3>
                <Toolbar>
                    <OrderButtons index={index} count={count} what={heading} onMove={props.onMove} />
                    <ConfirmButton
                        label="Remove"
                        question={`Remove ${heading}?`}
                        warning={characterRemovalWarning(heading)}
                        confirmLabel="Remove"
                        onConfirm={props.onRemove}
                    />
                </Toolbar>
            </div>
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

            <fieldset className="subsection">
                <legend>Example lines</legend>
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
        </section>
    );
}
