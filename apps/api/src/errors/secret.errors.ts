import { AppError } from './app-error.js';

/** No Secret with that id on that Character (.scratch/secret-reveals/spec.md). */
export class SecretNotFoundError extends AppError {
    constructor() {
        super('404.003.150', 'Secret not found on this Character.');
    }
}

/** A Secret that can't be saved as sent: the message says why. */
export class InvalidSecretError extends AppError {
    constructor(reason: string) {
        super('422.003.151', `That Secret can't be saved: ${reason}`);
    }
}

/** A Character already has the most Secrets it can hold. */
export class SecretLimitError extends AppError {
    constructor(max: number) {
        super('422.003.152', `A Character can have at most ${max} Secrets.`);
    }
}
