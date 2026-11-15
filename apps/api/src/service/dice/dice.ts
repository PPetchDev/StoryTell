import { Global, Injectable, Module } from '@nestjs/common';
import { randomInt } from 'node:crypto';

/**
 * The app's dice (.scratch/roll/spec.md): a Roll is thrown here, on the server, never by the
 * browser or a model. Tests script the next throws; nothing in play can.
 */
@Injectable()
export class Dice {
    private readonly scripted: number[] = [];

    /** One throw of a die with `sides` faces: 1 to `sides`, each as likely as the next. */
    roll(sides: number): number {
        const next = this.scripted.shift();
        return next !== undefined ? Math.min(sides, Math.max(1, Math.round(next))) : randomInt(1, sides + 1);
    }

    /** Tests only: the next throws, in order, before the dice are random again. */
    script(...values: number[]): void {
        this.scripted.push(...values);
    }

    /** Tests only: forgets scripted throws not used yet. */
    reset(): void {
        this.scripted.length = 0;
    }
}

@Global()
@Module({ providers: [Dice], exports: [Dice] })
export class DiceModule {}
