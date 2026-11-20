import { Injectable, Logger } from '@nestjs/common';

import { AppError } from '../../errors/app-error.js';
import { EXPRESSION_EMOTIONS, ExpressionEmotion } from '../../model/story/emotion.js';
import { CharacterResponse } from '../../model/story/entities/character.entity.js';
import { ExpressionManagerService } from './expression.service.js';

/** How a Character's Draw all run is going (.scratch/expression-drawing/spec.md). */
export interface ExpressionDrawing {
    running: boolean;
    /** What it draws, in the fixed order of the emotions. */
    emotions: ExpressionEmotion[];
    /** Drawn so far. */
    drawn: ExpressionEmotion[];
    /** Being drawn now. */
    current: ExpressionEmotion | null;
    /** Why it stopped early. */
    failed: { code: string; message: string } | null;
}

interface Run extends ExpressionDrawing {
    storyId: number;
}

const IDLE: ExpressionDrawing = { running: false, emotions: [], drawn: [], current: null, failed: null };

/** Code for a failure that is not one of the API's own errors (docs/error-codes.md: internal). */
const UNEXPECTED = '500.000.000';

/** The emotions a run draws: all of them to redraw, else those with no Expression or an outdated drawn one. */
export function emotionsToDraw(character: CharacterResponse, redraw: boolean): ExpressionEmotion[] {
    if (redraw) return [...EXPRESSION_EMOTIONS];
    const current = new Set(character.expressions.filter((one) => !one.outdated).map((one) => one.emotion));
    return EXPRESSION_EMOTIONS.filter((emotion) => !current.has(emotion));
}

/**
 * Draw all on the server (.scratch/expression-drawing/spec.md): a run draws a Character's
 * Expressions one after another by itself, so a page that goes away stops nothing. One run per
 * Character at a time; it and how the last one ended live in this process only.
 */
@Injectable()
export class ExpressionDrawingService {
    private readonly logger = new Logger(ExpressionDrawingService.name);
    private readonly runs = new Map<number, Run>();

    constructor(private readonly expressions: ExpressionManagerService) {}

    /** Starts a run, or answers the one going. Refused before it starts as a single drawing is. */
    async start(storyId: number, characterId: number, redraw: boolean): Promise<ExpressionDrawing> {
        const going = this.runs.get(characterId);
        if (going?.running && going.storyId === storyId) return view(going);
        const character = await this.expressions.drawable(storyId, characterId);
        const again = this.runs.get(characterId);
        if (again?.running) return view(again);
        const emotions = emotionsToDraw(character, redraw);
        if (emotions.length === 0) {
            this.runs.delete(characterId);
            return { ...IDLE };
        }
        const run: Run = { storyId, running: true, emotions, drawn: [], current: null, failed: null };
        this.runs.set(characterId, run);
        void this.draw(run, characterId);
        return view(run);
    }

    /** The running or last run of the Character, or an idle one. */
    async status(storyId: number, characterId: number): Promise<ExpressionDrawing> {
        await this.expressions.findCharacter(storyId, characterId);
        const run = this.runs.get(characterId);
        return run && run.storyId === storyId ? view(run) : { ...IDLE };
    }

    private async draw(run: Run, characterId: number): Promise<void> {
        try {
            for (const emotion of run.emotions) {
                run.current = emotion;
                await this.expressions.draw(run.storyId, characterId, emotion);
                run.drawn.push(emotion);
            }
        } catch (error) {
            run.failed = error instanceof AppError ? { code: error.code, message: error.message } : { code: UNEXPECTED, message: 'Something went wrong.' };
            if (!(error instanceof AppError)) this.logger.error(`Story ${run.storyId}, Character ${characterId}: Draw all stopped`, error instanceof Error ? error.stack : String(error));
        } finally {
            run.current = null;
            run.running = false;
        }
    }
}

function view({ running, emotions, drawn, current, failed }: Run): ExpressionDrawing {
    return { running, emotions: [...emotions], drawn: [...drawn], current, failed };
}
