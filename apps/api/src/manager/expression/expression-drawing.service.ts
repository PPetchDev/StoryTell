import { Injectable, Logger } from '@nestjs/common';

import { AppError } from '../../errors/app-error.js';
import { EXPRESSION_EMOTIONS, ExpressionEmotion, FaceEmotion } from '../../model/story/emotion.js';
import { CharacterResponse } from '../../model/story/entities/character.entity.js';
import { ExpressionManagerService } from './expression.service.js';

/** How a Character's Draw all run is going (.scratch/expression-drawing/spec.md). */
export interface ExpressionDrawing<E extends FaceEmotion = FaceEmotion> {
    running: boolean;
    /** What it draws, in the fixed order of the emotions. */
    emotions: E[];
    /** Drawn so far. */
    drawn: E[];
    /** Being drawn now. */
    current: E | null;
    /** Why it stopped early. */
    failed: { code: string; message: string } | null;
    /** Stop was asked (docs/ui-audit-2026-11-21.md, M4): it ends after the drawing under way, which is paid for already. */
    stopped: boolean;
}

interface Run extends ExpressionDrawing<ExpressionEmotion> {
    storyId: number;
}

const IDLE: ExpressionDrawing<ExpressionEmotion> = { running: false, emotions: [], drawn: [], current: null, failed: null, stopped: false };

/** Code for a failure that is not one of the API's own errors (docs/error-codes.md: internal). */
const UNEXPECTED = '500.000.000';

/**
 * The emotions a run draws: all of them to redraw, else those with no Expression or an outdated
 * drawn one. A Character's thirteen, or your faces' list (.scratch/more-faces/spec.md).
 */
export function emotionsToDraw<E extends FaceEmotion = ExpressionEmotion>(
    owner: Pick<CharacterResponse, 'expressions'>,
    redraw: boolean,
    all: readonly E[] = EXPRESSION_EMOTIONS as readonly ExpressionEmotion[] as readonly E[],
): E[] {
    if (redraw) return [...all];
    const current = new Set<FaceEmotion>(owner.expressions.filter((one) => !one.outdated).map((one) => one.emotion));
    return all.filter((emotion) => !current.has(emotion));
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
        const run: Run = { storyId, running: true, emotions, drawn: [], current: null, failed: null, stopped: false };
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

    /** Asks the running run to stop after the drawing under way; the last or no run is answered as it is. */
    async stop(storyId: number, characterId: number): Promise<ExpressionDrawing> {
        await this.expressions.findCharacter(storyId, characterId);
        const run = this.runs.get(characterId);
        if (!run || run.storyId !== storyId) return { ...IDLE };
        if (run.running) run.stopped = true;
        return view(run);
    }

    private async draw(run: Run, characterId: number): Promise<void> {
        try {
            for (const emotion of run.emotions) {
                if (run.stopped) break;
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

function view({ running, emotions, drawn, current, failed, stopped }: Run): ExpressionDrawing {
    return { running, emotions: [...emotions], drawn: [...drawn], current, failed, stopped };
}
